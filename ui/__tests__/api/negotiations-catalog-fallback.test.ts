/**
 * The catalog request falls back to the demo catalogue when the connector has
 * no participant context for the id it was given.
 *
 * That is not a hypothetical: /api/participants serves public/mock/participants.json
 * whenever the connector reports no ACTIVATED contexts, so the negotiate page
 * offers demo context ids and then asks the live connector about them. The
 * connector answers 404, correctly, because the id was never real. Before this
 * fallback the page showed the raw EDC error and the demo stopped dead.
 *
 * Its own file rather than a case in negotiations.test.ts, because that file
 * mocks fs to reject for every read and these tests need it to succeed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/edc", () => ({
  edcClient: { management: vi.fn() },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

const readFile = vi.fn();
vi.mock("fs", () => ({
  default: { promises: { readFile: (...a: unknown[]) => readFile(...a) } },
  promises: { readFile: (...a: unknown[]) => readFile(...a) },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { name: "test" } }),
  isAuthError: () => false,
}));

import { edcClient } from "@/lib/edc";
import { __resetDemoRecordsForTests } from "@/lib/demo-records";
import { GET, POST } from "@/app/api/negotiations/route";

const mockManagement = vi.mocked(edcClient.management);

const ASSETS = JSON.stringify([
  {
    participantId: "24be78bf13fc4873b503844d908fcbd2",
    identity: "did:web:identityhub%3A7083:alpha-klinik",
    assets: [
      {
        "@id": "fhir-patient-search",
        properties: {
          name: "FHIR Patient Search",
          description: "Search FHIR R4 patients",
          contenttype: "application/fhir+json",
        },
      },
    ],
  },
  {
    participantId: "09f8face6982493d82c9c997079c2b4e",
    identity: "did:web:identityhub%3A7083:irs",
    assets: [],
  },
]);

function catalogRequest(did: string) {
  return new NextRequest(
    "http://localhost:3000/api/negotiations?participantId=24be78bf13fc4873b503844d908fcbd2" +
      `&catalog=true&providerDid=${encodeURIComponent(did)}`,
  );
}

describe("/api/negotiations catalog fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFile.mockResolvedValue(ASSETS);
  });

  it("serves the demo catalogue when the connector 404s on the context", async () => {
    mockManagement.mockRejectedValue(
      new Error("EDC API error [management] POST /v1alpha/... 404 Not Found"),
    );

    const res = await GET(
      catalogRequest("did:web:identityhub%3A7083:alpha-klinik"),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.demoReason).toContain("demonstrator");
    expect(body.upstreamError).toContain("404");
    expect(body.dataset).toHaveLength(1);
    expect(body.dataset[0]["@id"]).toBe("fhir-patient-search");
    expect(body.dataset[0].hasPolicy[0]["@id"]).toBe(
      "demo-offer:fhir-patient-search",
    );
    expect(body.dataset[0].hasPolicy[0].assigner).toBe(
      "did:web:identityhub%3A7083:alpha-klinik",
    );
  });

  it("never labels a live catalogue as demo data", async () => {
    mockManagement.mockResolvedValue({
      "@type": "dcat:Catalog",
      dataset: [{ "@id": "real-asset", hasPolicy: [{ "@id": "real-offer" }] }],
    });

    const res = await GET(
      catalogRequest("did:web:identityhub%3A7083:alpha-klinik"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.demo).toBeUndefined();
    expect(body.dataset[0]["@id"]).toBe("real-asset");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("still fails when the provider has no demo assets either", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));

    const res = await GET(catalogRequest("did:web:identityhub%3A7083:irs"));
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.error).toContain("Failed to fetch provider catalog");
    expect(body.demo).toBeUndefined();
  });

  it("matches a provider by participant id as well as by DID", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));

    const res = await GET(catalogRequest("24be78bf13fc4873b503844d908fcbd2"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.demo).toBe(true);
  });
});

describe("/api/negotiations demo offers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDemoRecordsForTests();
    readFile.mockResolvedValue(ASSETS);
  });

  function negotiate(offerId: string) {
    return new NextRequest("http://localhost:3000/api/negotiations", {
      method: "POST",
      body: JSON.stringify({
        participantId: "24be78bf13fc4873b503844d908fcbd2",
        counterPartyAddress: "http://controlplane:8082/api/dsp",
        counterPartyId: "772f6576b2a6472cb2e373dabc928517",
        providerDid: "did:web:identityhub%3A7083:alpha-klinik",
        assetId: "fhir-patient-search",
        offerId,
      }),
    });
  }

  it("records a demo negotiation when the offer came from the demo catalogue", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));

    const res = await POST(negotiate("demo-offer:fhir-patient-search"));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body["@id"]).toBe("demo-negotiation:fhir-patient-search");
    expect(body.demoReason).toContain("demonstrator");
    expect(body.upstreamError).toContain("404");
  });

  // The transfer page builds its agreement list from finalized negotiations that
  // carry an agreement id. A demo negotiation without one is a dead end: nothing
  // exists that could ever advance it, so the walkthrough stops one click later.
  it("finalizes the demo negotiation and gives it an agreement to transfer under", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));

    const body = await (
      await POST(negotiate("demo-offer:fhir-patient-search"))
    ).json();

    expect(body.state).toBe("FINALIZED");
    expect(body.contractAgreementId).toBe("demo-agreement:fhir-patient-search");
    // The prefix is what stops a later step treating it as connector-issued.
    expect(body.contractAgreementId.startsWith("demo-agreement:")).toBe(true);
  });

  it("says plainly that no agreement was signed with anyone", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));

    const body = await (
      await POST(negotiate("demo-offer:fhir-patient-search"))
    ).json();

    expect(body.demoReason).toMatch(/no dsp agreement was signed/i);
  });

  it("returns the recorded demo negotiation on the next list read", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));
    await POST(negotiate("demo-offer:fhir-patient-search"));

    readFile.mockResolvedValue("[]"); // no bundled negotiations
    const list = await (
      await GET(
        new NextRequest(
          "http://localhost:3000/api/negotiations?participantId=24be78bf13fc4873b503844d908fcbd2",
        ),
      )
    ).json();

    // Nothing reached the connector, so this read is the only way the transfer
    // page can ever see it.
    expect(list).toHaveLength(1);
    expect(list[0]["@id"]).toBe("demo-negotiation:fhir-patient-search");
    expect(list[0].demo).toBe(true);
  });

  it("does not leak one participant's demo negotiation into another's list", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));
    await POST(negotiate("demo-offer:fhir-patient-search"));

    readFile.mockResolvedValue("[]");
    const list = await (
      await GET(
        new NextRequest(
          "http://localhost:3000/api/negotiations?participantId=someone-else",
        ),
      )
    ).json();

    expect(list).toHaveLength(0);
  });

  it("records a demo negotiation once, however often the offer is negotiated", async () => {
    mockManagement.mockRejectedValue(new Error("404 Not Found"));
    await POST(negotiate("demo-offer:fhir-patient-search"));
    await POST(negotiate("demo-offer:fhir-patient-search"));

    readFile.mockResolvedValue("[]");
    const list = await (
      await GET(
        new NextRequest(
          "http://localhost:3000/api/negotiations?participantId=24be78bf13fc4873b503844d908fcbd2",
        ),
      )
    ).json();

    expect(list).toHaveLength(1);
  });

  it("does not invent a negotiation for a real offer that fails", async () => {
    mockManagement.mockRejectedValue(new Error("500 Internal Server Error"));

    const res = await POST(negotiate("urn:uuid:a-real-offer"));
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.demo).toBeUndefined();
    expect(body.error).toContain("Failed to initiate contract negotiation");
  });

  it("never labels a real negotiation as demo", async () => {
    mockManagement.mockResolvedValue({
      "@id": "real-negotiation-id",
      state: "REQUESTED",
    });

    const res = await POST(negotiate("demo-offer:fhir-patient-search"));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body["@id"]).toBe("real-negotiation-id");
    expect(body.demo).toBeUndefined();
  });
});
