/**
 * API route tests for GET /api/participants/me
 *
 * The control plane's contexts in the tenant shape the onboarding page reads
 * (ADR-078); the states themselves are in participants.test.ts and
 * lib/edc-participants.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/edc", () => ({
  edcClient: {
    management: vi.fn(),
    identity: vi.fn(),
  },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
}));

import { edcClient } from "@/lib/edc";
import { GET } from "@/app/api/participants/me/route";

const mockManagement = vi.mocked(edcClient.management);
const mockIdentity = vi.mocked(edcClient.identity);

describe("GET /api/participants/me", () => {
  beforeEach(() => {
    mockManagement.mockReset();
    mockIdentity.mockReset();
  });

  it("returns every context with its participant profile", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-a",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "CREATED",
      },
      {
        "@id": "ctx-b",
        identity: "did:web:identityhub%3A7083:pharmaco",
        state: "CREATED",
      },
    ]);
    mockIdentity.mockResolvedValue([{ id: "vc" }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].participantProfiles).toHaveLength(1);
    expect(
      data.map(
        (t: { properties: { displayName: string } }) =>
          t.properties.displayName,
      ),
    ).toEqual(["AlphaKlinik Berlin", "PharmaCo Research AG"]);
    expect(mockManagement).toHaveBeenCalledWith("/v5/participants");
  });

  it("treats a credential lookup that fails as not yet delivered", async () => {
    mockManagement.mockResolvedValue([
      {
        "@id": "ctx-a",
        identity: "did:web:identityhub%3A7083:alpha-klinik",
        state: "CREATED",
      },
    ]);
    mockIdentity.mockRejectedValue(new Error("Not found"));

    const data = await (await GET()).json();

    expect(data).toHaveLength(1);
    expect(data[0].provisioningComplete).toBe(false);
  });

  // Issue #203: the onboarding page renders a non-ok answer as an empty list
  // and says nothing at all, so a 502 here cost information and gained none.
  it("lists what it has instead of 502ing when the control plane is down", async () => {
    mockManagement.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
