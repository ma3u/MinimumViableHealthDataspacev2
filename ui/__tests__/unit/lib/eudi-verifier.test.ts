import { describe, it, expect, vi, afterEach } from "vitest";
import { startPresentation, getPresentationResult } from "@/lib/eudi-verifier";

afterEach(() => vi.unstubAllGlobals());

describe("startPresentation", () => {
  it("posts a DCQL PID request and builds the wallet deep link", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        transaction_id: "tx1",
        client_id: "x509_san_dns:verifier.eudiw.dev",
        request_uri: "https://verifier.eudiw.dev/req/abc",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await startPresentation("nonce123");

    expect(r.transactionId).toBe("tx1");
    expect(r.walletLink).toContain("openid4vp://?");
    expect(r.walletLink).toContain("client_id=");
    expect(r.walletLink).toContain(
      encodeURIComponent("https://verifier.eudiw.dev/req/abc"),
    );

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/ui/presentations");
    const body = JSON.parse(opts.body as string);
    expect(body.dcql_query.credentials[0].meta.doctype_value).toBe(
      "eu.europa.ec.eudi.pid.1",
    );
    expect(body.nonce).toBe("nonce123");
    expect(body.response_mode).toBe("direct_post");
  });

  it("falls back to presentation_id when transaction_id is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          presentation_id: "p1",
          request_uri: "https://v/r",
        }),
      })),
    );
    const r = await startPresentation("n");
    expect(r.transactionId).toBe("p1");
  });

  it("throws when the verifier returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })),
    );
    await expect(startPresentation("n")).rejects.toThrow(
      /verifier init failed: 500/,
    );
  });

  it("throws when transaction_id or request_uri is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ client_id: "x" }) })),
    );
    await expect(startPresentation("n")).rejects.toThrow(
      /missing transaction_id/,
    );
  });
});

describe("getPresentationResult", () => {
  it("returns pending on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 404, ok: false })),
    );
    expect(await getPresentationResult("tx")).toEqual({ status: "pending" });
  });

  it("returns pending when vp_token is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) })),
    );
    expect(await getPresentationResult("tx")).toEqual({ status: "pending" });
  });

  it("returns completed when vp_token is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ vp_token: "xyz" }),
      })),
    );
    expect(await getPresentationResult("tx")).toEqual({
      status: "completed",
      pid: {},
    });
  });

  it("throws on a non-404 error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 500, ok: false })),
    );
    await expect(getPresentationResult("tx")).rejects.toThrow(
      /verifier poll failed: 500/,
    );
  });
});
