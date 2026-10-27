/**
 * GET /api/catalog/jsonld: the proxy's HealthDCAT-AP Release 8 JSON-LD,
 * passed through (#700).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/catalog/jsonld/route";

const fetchMock = vi.fn();

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/catalog/jsonld${qs}`);
}

describe("GET /api/catalog/jsonld", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the proxy for one dataset and passes its JSON-LD on", async () => {
    const doc = {
      "@context": {},
      "@type": "dcat:Dataset",
      "dct:identifier": "dataset:x",
    };
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(doc), { status: 200 }),
    );
    const res = await GET(req("?id=dataset:x"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/ld+json");
    expect(await res.json()).toEqual(doc);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/catalog\/datasets\/dataset%3Ax$/,
    );
  });

  it("asks for the whole catalogue without an id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ "@type": "dcat:Catalog" }), {
        status: 200,
      }),
    );
    await GET(req());
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/catalog\/datasets$/);
  });

  it("answers 404 for an unknown dataset and 502 when the proxy fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    expect((await GET(req("?id=nope"))).status).toBe(404);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    const res = await GET(req("?id=x"));
    expect(res.status).toBe(502);
    expect(await res.json()).toHaveProperty("error");
  });
});
