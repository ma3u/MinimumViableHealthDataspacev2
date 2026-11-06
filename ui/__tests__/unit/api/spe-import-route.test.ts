/**
 * POST /api/transfers/[id]/import and GET /api/spe-imports/[id]/graph: a
 * transfer ends in an SPE workspace, SPE-1 unless the user picks another,
 * pseudonymised for roles without identity, and the graph viewer can draw it
 * (#876, #475).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockManagement = vi.fn();
vi.mock("@/lib/edc", () => ({
  edcClient: { management: (...a: unknown[]) => mockManagement(...a) },
}));

// On Azure the workspaces start on demand (ADR-072); off it, nothing to gate.
const coldStartGate = vi.fn();
const powerAvailable = vi.fn();
vi.mock("@/lib/spe-power", () => ({
  speColdStartGate: (...a: unknown[]) => coldStartGate(...a),
  spePowerAvailable: () => powerAvailable(),
}));

import { requireAuth } from "@/lib/auth-guard";
import { POST } from "@/app/api/transfers/[id]/import/route";
import { GET } from "@/app/api/spe-imports/[id]/graph/route";
import { GET as LIST } from "@/app/api/spe-imports/route";

const CTX = "3386f049-185a-4b5c-a24a-e5719df88412";
const TP = "824277d3-90cf-4b96-8ad1-ea489ba34775";

const BUNDLE = {
  resourceType: "Bundle",
  type: "searchset",
  entry: [
    {
      resource: {
        resourceType: "Patient",
        id: "P1",
        name: [{ family: "Musterfrau", given: ["Erika"] }],
        birthDate: "1965-04-12",
        gender: "female",
      },
    },
  ],
};

function post(body: Record<string, unknown>, id = TP) {
  return POST(
    new NextRequest(`http://localhost/api/transfers/${id}/import`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function asRoles(roles: string[]) {
  vi.mocked(requireAuth).mockResolvedValueOnce({
    session: {
      user: { id: "u1", name: "researcher" },
      roles,
      accessToken: "t",
    },
  } as never);
}

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  mockManagement.mockReset();
  fetchMock.mockReset();
  coldStartGate.mockReset();
  coldStartGate.mockResolvedValue(null);
  powerAvailable.mockReset();
  powerAvailable.mockReturnValue(false);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/transfers/[id]/import", () => {
  it("pulls the data and has the proxy write it into SPE-1 by default", async () => {
    asRoles(["DATA_USER"]);
    mockManagement.mockResolvedValue({
      state: "STARTED",
      assetId: "fhir-patient-search",
      contractId: "agr-1",
      counterPartyId: "did:web:alpha",
    });
    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(
        json({
          datasetId: TP,
          speId: "SPE-1",
          records: 1,
          relationships: 0,
          byType: { Patient: 1 },
          importedAt: "2026-11-05T19:00:00.000Z",
        }),
      );

    const res = await post({ participantId: CTX });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[2][0]).toBe(
      "http://localhost:9090/spe/SPE-1/import",
    );
    const sent = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(sent).toMatchObject({
      datasetId: TP,
      agreementId: "agr-1",
      assetId: "fhir-patient-search",
      provider: "did:web:alpha",
      consumer: CTX,
      pseudonymised: true,
    });
    expect(JSON.stringify(sent.bundle)).not.toContain("Musterfrau");
    expect(sent).not.toHaveProperty("token");
    expect(body).toMatchObject({
      speId: "SPE-1",
      records: 1,
      pseudonymised: true,
      untilStopped: false,
      graphUrl: `/overview?import=${TP}&spe=SPE-1`,
    });
  });

  it("on Azure, starts a stopped workspace and answers 503 before pulling", async () => {
    asRoles(["DATA_USER"]);
    coldStartGate.mockResolvedValueOnce(
      NextResponse.json(
        {
          error: "SPE-2 is starting",
          spe: { id: "SPE-2", state: "starting", etaSeconds: 240 },
          started: true,
        },
        { status: 503 },
      ),
    );

    const res = await post({ participantId: CTX, speId: "SPE-2" });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.spe).toMatchObject({ state: "starting", etaSeconds: 240 });
    // Only the chosen workspace is asked about, and nothing is pulled.
    expect(coldStartGate).toHaveBeenCalledWith(
      ["DATA_USER"],
      expect.any(Number),
      ["SPE-2"],
    );
    expect(mockManagement).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("on Azure, says the import lasts until the workspace stops", async () => {
    powerAvailable.mockReturnValue(true);
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(json({ datasetId: TP, records: 1 }));

    const res = await post({ participantId: CTX });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ untilStopped: true });
  });

  it("imports into the SPE the user picked, identified for a data holder", async () => {
    asRoles(["DATA_HOLDER"]);
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(json({ datasetId: TP, records: 1 }));

    const res = await post({ participantId: CTX, speId: "SPE-2" });

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[2][0]).toBe(
      "http://localhost:9090/spe/SPE-2/import",
    );
    const sent = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(sent.pseudonymised).toBe(false);
    expect(JSON.stringify(sent.bundle)).toContain("Musterfrau");
  });

  it("takes the provider from the agreement when the transfer names none", async () => {
    asRoles(["DATA_USER"]);
    mockManagement
      .mockResolvedValueOnce({ state: "STARTED", contractId: "agr-2" })
      .mockResolvedValueOnce({ providerId: "did:web:alpha-from-agreement" });
    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(json({ datasetId: TP, records: 1 }));

    const res = await post({ participantId: CTX });

    expect(res.status).toBe(200);
    expect(mockManagement.mock.calls[1][0]).toBe(
      `/v5alpha/participants/${CTX}/contractagreements/agr-2`,
    );
    const sent = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(sent.provider).toBe("did:web:alpha-from-agreement");
  });

  it("refuses an SPE that does not exist, before reading anything", async () => {
    const res = await post({ participantId: CTX, speId: "SPE-9" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown SPE/);
    expect(mockManagement).not.toHaveBeenCalled();
  });

  it("answers 409 for a transfer that is not STARTED", async () => {
    mockManagement.mockResolvedValue({ state: "COMPLETED" });

    const res = await post({ participantId: CTX });

    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe("COMPLETED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes overwrite on, and the import an SPE holds already as 409", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    const existing = {
      datasetId: TP,
      speId: "SPE-1",
      records: 100,
      importedAt: "2026-11-05T20:12:36.622Z",
    };
    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(json({ error: "SPE-1 holds it", existing }, 409));

    const res = await post({ participantId: CTX });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.existing).toEqual(existing);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).overwrite).toBe(false);

    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(json({ datasetId: TP, records: 1 }));
    const again = await post({ participantId: CTX, overwrite: true });

    expect(again.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[5][1].body).overwrite).toBe(true);
  });

  it("passes on a stopped SPE as 503 with the proxy's reason", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock
      .mockResolvedValueOnce(json({ token: "tok" }))
      .mockResolvedValueOnce(json(BUNDLE))
      .mockResolvedValueOnce(
        json({ error: "SPE-2 is not connected to the hub" }, 503),
      );

    const res = await post({ participantId: CTX, speId: "SPE-2" });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ step: "import" });
    expect(body.error).toMatch(/not connected/);
  });

  it("says which step failed when the data cannot be pulled", async () => {
    mockManagement.mockResolvedValue({ state: "STARTED" });
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));

    const res = await post({ participantId: CTX });

    expect(res.status).toBe(502);
    expect((await res.json()).step).toBe("token");
  });
});

describe("GET /api/spe-imports/[id]/graph", () => {
  const get = (spe = "SPE-1") =>
    GET(
      new NextRequest(
        `http://localhost/api/spe-imports/${TP}/graph?spe=${spe}`,
      ),
      { params: Promise.resolve({ id: TP }) },
    );

  it("gives the proxy's nodes a layer and a colour for the viewer", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        dataset: { datasetId: TP },
        nodes: [
          { id: `import:${TP}`, label: "ImportedDataset", name: "Transfer" },
          { id: "spe:SPE-1", label: "SpeWorkspace", name: "SPE-1" },
        ],
        links: [
          { source: `import:${TP}`, target: "spe:SPE-1", type: "LOADED_INTO" },
        ],
        truncated: false,
      }),
    );

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `http://localhost:9090/spe/SPE-1/import/${TP}/graph`,
    );
    expect(body.nodes[0]).toMatchObject({ label: "ImportedDataset", layer: 2 });
    expect(body.nodes[0].color).toMatch(/^#/);
    expect(body.links).toHaveLength(1);
  });

  it("answers 404 for a dataset the SPE does not hold", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Not found" }, 404));

    const res = await get();

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Not found");
  });

  it("refuses an unknown SPE", async () => {
    const res = await get("SPE-7");

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/spe-imports", () => {
  it("asks the proxy which SPE holds which transfer", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        imports: [
          {
            datasetId: TP,
            speId: "SPE-2",
            records: 7,
            importedAt: "2026-11-05",
          },
        ],
        unreachable: ["SPE-1"],
      }),
    );

    const res = await LIST(
      new NextRequest(`http://localhost/api/spe-imports?ids=${TP},bad id`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `http://localhost:9090/spe/imports?datasetIds=${TP}`,
    );
    expect(body.imports[0]).toMatchObject({ speId: "SPE-2", records: 7 });
    expect(body.unreachable).toEqual(["SPE-1"]);
  });

  it("needs at least one transfer id", async () => {
    const res = await LIST(new NextRequest("http://localhost/api/spe-imports"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ids is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
