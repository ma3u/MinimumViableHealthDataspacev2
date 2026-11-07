/**
 * GET /api/agreements/[id] and the period it reports (#876): when the
 * contract was signed and until when its policy allows use.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: { management: (...a: unknown[]) => mockManagement(...a) },
}));

import { GET } from "@/app/api/agreements/[id]/route";
import { agreementValidUntil } from "@/lib/agreement";

const SIGNED_S = 1793887000; // 2026-11-05, seconds as EDC gives them

function get(id = "agr-1", participantId = "ctx-1") {
  return GET(
    new NextRequest(
      `http://localhost/api/agreements/${id}?participantId=${participantId}`,
    ),
    { params: Promise.resolve({ id }) },
  );
}

const policy = (right: string) => ({
  permission: [
    {
      action: "use",
      constraint: [
        { leftOperand: "inForceDate", operator: "lteq", rightOperand: right },
      ],
    },
  ],
});

beforeEach(() => {
  mockManagement.mockReset();
});

describe("GET /api/agreements/[id]", () => {
  it("answers when it was signed, until when, and the agreed policy", async () => {
    mockManagement.mockResolvedValue({
      "@id": "agr-1",
      assetId: "fhir-patient-search",
      providerId: "did:web:mvhd-identityhub%3A7083:alpha-klinik",
      consumerId: "did:web:mvhd-identityhub%3A7083:pharmaco",
      contractSigningDate: SIGNED_S,
      policy: policy("contractAgreement+365d"),
    });

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockManagement).toHaveBeenCalledWith(
      "/v5/participants/ctx-1/contractagreements/agr-1",
    );
    expect(body).toMatchObject({
      agreementId: "agr-1",
      assetId: "fhir-patient-search",
      signedAt: new Date(SIGNED_S * 1000).toISOString(),
      validUntil: new Date((SIGNED_S + 365 * 86400) * 1000).toISOString(),
    });
    expect(body.policy.permission[0].action).toBe("use");
  });

  it("says no end date when the policy sets none", async () => {
    mockManagement.mockResolvedValue({
      "@id": "agr-2",
      contractSigningDate: SIGNED_S,
      policy: { permission: [{ action: "use" }] },
    });

    const body = await (await get("agr-2")).json();

    expect(body.validUntil).toBe("");
  });

  it("answers 404 when the connector has no such agreement", async () => {
    mockManagement.mockRejectedValue(new Error("404"));

    const res = await get();

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  it("refuses an id the connector path would not take", async () => {
    const res = await get("../x");

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
    expect(mockManagement).not.toHaveBeenCalled();
  });
});

describe("agreementValidUntil", () => {
  const signed = Date.UTC(2026, 10, 5);

  it("counts a period from the signing", () => {
    expect(agreementValidUntil(policy("contractAgreement+90d"), signed)).toBe(
      new Date(signed + 90 * 86_400_000).toISOString(),
    );
  });

  it("takes a fixed date as it is, with prefixed operands", () => {
    const p = {
      "odrl:permission": {
        "odrl:constraint": {
          "odrl:leftOperand": { "@id": "odrl:dateTime" },
          "odrl:operator": { "@id": "odrl:lteq" },
          "odrl:rightOperand": { "@value": "2028-12-31" },
        },
      },
    };
    expect(agreementValidUntil(p, signed)).toBe("2028-12-31T00:00:00.000Z");
  });

  it("ignores a lower bound", () => {
    const p = {
      permission: [
        {
          constraint: [
            {
              leftOperand: "dateTime",
              operator: "gteq",
              rightOperand: "2026-01-01",
            },
          ],
        },
      ],
    };
    expect(agreementValidUntil(p, signed)).toBe("");
  });
});
