/**
 * The two reads of the contract journey that failed the `contracts` load
 * test's API threshold on Azure (#1086, docs/developer/edc-sizing-under-load.md):
 *
 * - GET /api/transfers and GET /api/negotiations read one page, 50 rows
 *   unless asked, and only the first page carries the demo and mock rows.
 * - The catalogue request finds the provider's context in the kept list
 *   rather than listing every context each time, tries once more on a fresh
 *   list when a kept id fails, and shares one DSP request between callers
 *   that ask for the same catalogue at the same moment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockManagement = vi.fn();
vi.mock("@/lib/edc", async (importOriginal) => ({
  edcClient: { management: (...a: unknown[]) => mockManagement(...a) },
  EDC_CONTEXT: "https://w3id.org/edc/connector/management/v2",
  newestFirstQuery: (await importOriginal<typeof import("@/lib/edc")>())
    .newestFirstQuery,
}));

const mockReadFile = vi.fn();
vi.mock("fs", () => ({
  default: { promises: { readFile: (...a: unknown[]) => mockReadFile(...a) } },
  promises: { readFile: (...a: unknown[]) => mockReadFile(...a) },
}));

import { GET as negotiations } from "@/app/api/negotiations/route";
import { GET as transfers } from "@/app/api/transfers/route";
import { __resetCacheForTests } from "@/lib/server-cache";
import { __resetDemoRecordsForTests } from "@/lib/demo-records";

const get = (path: string) => new NextRequest(`http://localhost:3000${path}`);

const MOCK_ROWS = [{ "@id": "mock-1" }, { "@id": "mock-2" }];
const CONTEXTS = [
  { "@id": "pharma-ctx", identity: "did:web:h:pharmaco" },
  { "@id": "alpha-ctx", identity: "did:web:h:alpha-klinik" },
];
const CATALOG = { "@type": "dcat:Catalog", dataset: [{ "@id": "asset-1" }] };

beforeEach(() => {
  mockManagement.mockReset();
  mockReadFile.mockReset();
  mockReadFile.mockResolvedValue(JSON.stringify(MOCK_ROWS));
  __resetCacheForTests();
  __resetDemoRecordsForTests();
});

describe.each([
  ["transfers", transfers, "transferprocesses"],
  ["negotiations", negotiations, "contractnegotiations"],
] as const)("GET /api/%s, one page", (name, GET, edcList) => {
  const listPath = `/v5/participants/ctx-1/${edcList}/request`;

  it("asks the control plane for 50 rows unless told otherwise", async () => {
    mockManagement.mockResolvedValue([{ "@id": "real-1" }]);
    const res = await GET(get(`/api/${name}?participantId=ctx-1`));
    expect(res.status).toBe(200);
    expect(mockManagement).toHaveBeenCalledWith(
      listPath,
      "POST",
      expect.objectContaining({ limit: 50, offset: 0, sortOrder: "DESC" }),
    );
    // The first page carries the mock rows after the connector's.
    const ids = (await res.json()).map((r: { "@id": string }) => r["@id"]);
    expect(ids).toEqual(["real-1", "mock-1", "mock-2"]);
  });

  it("passes the page asked for, and lowers a limit over 200", async () => {
    mockManagement.mockResolvedValue([]);
    await GET(get(`/api/${name}?participantId=ctx-1&limit=20&offset=0`));
    await GET(get(`/api/${name}?participantId=ctx-1&limit=900`));
    expect(mockManagement.mock.calls[0][2]).toMatchObject({
      limit: 20,
      offset: 0,
    });
    expect(mockManagement.mock.calls[1][2]).toMatchObject({ limit: 200 });
  });

  it("leaves the mock rows off a later page", async () => {
    mockManagement.mockResolvedValue([{ "@id": "real-51" }]);
    const res = await GET(
      get(`/api/${name}?participantId=ctx-1&limit=50&offset=50`),
    );
    expect(mockManagement.mock.calls[0][2]).toMatchObject({ offset: 50 });
    const rows = await res.json();
    expect(rows.map((r: { "@id": string }) => r["@id"])).toEqual(["real-51"]);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it.each(["limit=0", "limit=abc", "offset=-1"])(
    "answers 400 with an error for %s, without asking the connector",
    async (q) => {
      const res = await GET(get(`/api/${name}?participantId=ctx-1&${q}`));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/limit|offset/);
      expect(mockManagement).not.toHaveBeenCalled();
    },
  );
});

describe("GET /api/negotiations?catalog=true", () => {
  const catalog = () =>
    negotiations(
      get(
        "/api/negotiations?participantId=pharma-ctx&catalog=true&providerDid=" +
          encodeURIComponent("did:web:h:alpha-klinik"),
      ),
    );
  const catalogRequests = () =>
    mockManagement.mock.calls.filter((c) =>
      String(c[0]).endsWith("/catalog/request"),
    );
  const contextLists = () =>
    mockManagement.mock.calls.filter((c) => c[0] === "/v5/participants");

  it("lists the participant contexts once for many catalogue requests", async () => {
    mockManagement.mockImplementation(async (path: string) =>
      path === "/v5/participants" ? CONTEXTS : CATALOG,
    );
    for (let i = 0; i < 3; i += 1) {
      const res = await catalog();
      expect(await res.json()).toEqual(CATALOG);
    }
    expect(contextLists()).toHaveLength(1);
    expect(catalogRequests()).toHaveLength(3);
    expect(catalogRequests()[0][2]).toMatchObject({
      counterPartyAddress:
        "http://controlplane:8082/api/dsp/alpha-ctx/http-dsp-profile-2025-1",
      counterPartyId: "did:web:h:alpha-klinik",
    });
  });

  it("reads the contexts afresh and tries once more when a kept id fails", async () => {
    mockManagement
      .mockResolvedValueOnce(CONTEXTS)
      .mockResolvedValueOnce(CATALOG);
    await catalog();

    // The stack was reset: AlphaKlinik has a new context id.
    const reset = [{ "@id": "alpha-new", identity: "did:web:h:alpha-klinik" }];
    mockManagement.mockImplementation(async (path: string, _m, body) => {
      if (path === "/v5/participants") return reset;
      const address = (body as { counterPartyAddress: string })
        .counterPartyAddress;
      if (address.includes("/alpha-ctx/")) throw new Error("404 Not Found");
      return CATALOG;
    });
    const res = await catalog();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CATALOG);
    expect(String(catalogRequests().at(-1)?.[2].counterPartyAddress)).toContain(
      "/alpha-new/",
    );
  });

  it("does not retry when the id came fresh from the control plane", async () => {
    mockManagement.mockImplementation(async (path: string) => {
      if (path === "/v5/participants") return CONTEXTS;
      throw new Error("DSP unreachable");
    });
    const res = await catalog();
    // The demo catalogue fallback answers; what matters is one attempt.
    expect(res.status).toBeLessThan(600);
    expect(catalogRequests()).toHaveLength(1);
  });

  it("shares one DSP request between callers that ask at the same moment", async () => {
    let answer!: (v: unknown) => void;
    mockManagement.mockImplementation((path: string) =>
      path === "/v5/participants"
        ? Promise.resolve(CONTEXTS)
        : new Promise((r) => (answer = r)),
    );
    const pending = [catalog(), catalog(), catalog()];
    await vi.waitFor(() => expect(catalogRequests()).toHaveLength(1));
    answer(CATALOG);
    const bodies = await Promise.all(
      pending.map(async (p) => (await p).json()),
    );
    expect(bodies).toEqual([CATALOG, CATALOG, CATALOG]);
    expect(catalogRequests()).toHaveLength(1);

    // Nothing is kept: the next request asks the connector again.
    mockManagement.mockImplementation(async (path: string) =>
      path === "/v5/participants" ? CONTEXTS : CATALOG,
    );
    await catalog();
    expect(catalogRequests()).toHaveLength(2);
  });
});
