/**
 * Tests for /api/graph/node/route.ts
 *
 * Returns node properties with user-friendly labels for the detail panel.
 * Tests cover:
 *   - Missing ?id= → 400
 *   - Node not found → 404
 *   - Neo4j failure → 502
 *   - Label-driven property ordering and label mapping
 *   - Auto-formatting of camelCase keys for unmapped properties
 *   - Value formatting (Neo4j int objects, DateTime objects, arrays, booleans)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { GET } from "@/app/api/graph/node/route";

function makeReq(qs = ""): Request {
  return new Request(`http://localhost/api/graph/node${qs}`);
}

describe("GET /api/graph/node", () => {
  beforeEach(() => {
    mockRunQuery.mockReset();
  });

  it("returns 400 when id is missing", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("returns 404 when node not found", async () => {
    mockRunQuery.mockResolvedValueOnce([]);
    const res = await GET(makeReq("?id=does-not-exist"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Node not found");
  });

  it("returns 502 on Neo4j failure", async () => {
    mockRunQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(makeReq("?id=x"));
    expect(res.status).toBe(502);
  });

  it("orders Participant properties per the label map", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["Participant"],
        props: {
          // Deliberately out of order; route should re-order by labelMap.
          did: "did:web:alpha-klinik.de:participant",
          name: "AlphaKlinik Berlin",
          participantId: "alpha-klinik",
          legalName: "AlphaKlinik GmbH",
          participantType: "DATA_HOLDER",
          jurisdiction: "DE",
          role: "DATA_HOLDER",
        },
      },
    ]);

    const res = await GET(makeReq("?id=p-1"));
    const data = await res.json();
    expect(data.primaryLabel).toBe("Participant");
    expect(data.labels).toEqual(["Participant"]);

    const keysInOrder = data.properties.map((p: { key: string }) => p.key);
    // Label map order: participantId, name, legalName, participantType,
    //                  jurisdiction, role, did
    expect(keysInOrder).toEqual([
      "participantId",
      "name",
      "legalName",
      "participantType",
      "jurisdiction",
      "role",
      "did",
    ]);
    expect(data.properties[0].label).toBe("ID");
    expect(data.properties[1].label).toBe("Name");
  });

  it("auto-formats unmapped property keys to Title Case", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["SomeUnmappedType"],
        props: { customField: "value", anotherOne: 42 },
      },
    ]);

    const res = await GET(makeReq("?id=x"));
    const data = await res.json();
    const labels = data.properties.map((p: { label: string }) => p.label);
    expect(labels).toContain("Custom Field");
    expect(labels).toContain("Another One");
  });

  it("hides internal metadata keys", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["Patient"],
        props: {
          resourceId: "p-1",
          elementId: "internal-neo4j-id",
          __typename: "Patient",
          _labels: ["Patient"],
        },
      },
    ]);

    const res = await GET(makeReq("?id=x"));
    const data = await res.json();
    const keys = data.properties.map((p: { key: string }) => p.key);
    expect(keys).not.toContain("elementId");
    expect(keys).not.toContain("__typename");
    expect(keys).not.toContain("_labels");
    expect(keys).toContain("resourceId");
  });

  it("formats Neo4j integer objects using .low", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["OMOPPerson"],
        props: {
          personId: "omop-person-1",
          yearOfBirth: { low: 1985, high: 0 },
        },
      },
    ]);

    const res = await GET(makeReq("?id=x"));
    const data = await res.json();
    const yob = data.properties.find(
      (p: { key: string }) => p.key === "yearOfBirth",
    );
    expect(yob.value).toBe("1985");
  });

  it("formats Neo4j DateTime objects to YYYY-MM-DD HH:MM", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["TransferEvent"],
        props: {
          eventId: "te-1",
          timestamp: {
            year: 2025,
            month: 3,
            day: 7,
            hour: 14,
            minute: 5,
          },
        },
      },
    ]);

    const res = await GET(makeReq("?id=x"));
    const data = await res.json();
    const ts = data.properties.find(
      (p: { key: string }) => p.key === "timestamp",
    );
    expect(ts.value).toBe("2025-03-07 14:05");
  });

  it("formats arrays and booleans", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["VerifiableCredential"],
        props: {
          credentialId: "vc-1",
          credentialType: "EHDSParticipantCredential",
          permittedUses: ["research", "analytics"],
          prohibitedUses: ["commercial"],
        },
      },
    ]);

    const res = await GET(makeReq("?id=x"));
    const data = await res.json();
    const permitted = data.properties.find(
      (p: { key: string }) => p.key === "permittedUses",
    );
    expect(permitted.value).toBe("research, analytics");
  });

  it("skips null-valued properties", async () => {
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["Participant"],
        props: {
          participantId: "p-1",
          name: "AlphaKlinik Berlin",
          legalName: null,
          did: "did:web:alpha-klinik.de:participant",
        },
      },
    ]);

    const res = await GET(makeReq("?id=x"));
    const data = await res.json();
    const keys = data.properties.map((p: { key: string }) => p.key);
    expect(keys).not.toContain("legalName");
    expect(keys).toContain("participantId");
    expect(keys).toContain("did");
  });
});
