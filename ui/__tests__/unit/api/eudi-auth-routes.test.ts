import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/eudi-verifier", () => ({
  startPresentation: vi.fn(),
  getPresentationResult: vi.fn(),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") },
}));

import { POST } from "@/app/api/auth/eudi/start/route";
import { GET } from "@/app/api/auth/eudi/status/route";
import { startPresentation, getPresentationResult } from "@/lib/eudi-verifier";
import { getTransaction } from "@/lib/eudi-store";

const started = {
  transactionId: "tx",
  clientId: "c",
  requestUri: "https://v/r",
  walletLink: "openid4vp://?x",
};

async function startSid(txId: string): Promise<string> {
  vi.mocked(startPresentation).mockResolvedValue({
    ...started,
    transactionId: txId,
  });
  const json = await (await POST()).json();
  return json.sid as string;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/eudi/start", () => {
  it("returns sid + qrDataUri + walletLink and stores the transaction", async () => {
    vi.mocked(startPresentation).mockResolvedValue(started);
    const res = await POST();
    const json = await res.json();
    expect(json.sid).toBeTruthy();
    expect(json.qrDataUri).toContain("data:image/png");
    expect(json.walletLink).toBe("openid4vp://?x");
    expect(getTransaction(json.sid)?.transactionId).toBe("tx");
  });

  it("returns 502 when the verifier fails", async () => {
    vi.mocked(startPresentation).mockRejectedValue(new Error("down"));
    const res = await POST();
    expect(res.status).toBe(502);
  });
});

describe("GET /api/auth/eudi/status", () => {
  it("404 for an unknown sid", async () => {
    const res = await GET(
      new Request("http://x/api/auth/eudi/status?sid=nope"),
    );
    expect(res.status).toBe(404);
  });

  it("pending while the wallet has not responded", async () => {
    const sid = await startSid("tx2");
    vi.mocked(getPresentationResult).mockResolvedValue({ status: "pending" });
    const res = await GET(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect((await res.json()).status).toBe("pending");
  });

  it("completed maps to a patient and pins it to the sid", async () => {
    const sid = await startSid("tx3");
    vi.mocked(getPresentationResult).mockResolvedValue({
      status: "completed",
      pid: { givenName: "Erika", familyName: "Mustermann" },
    });
    const res = await GET(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect((await res.json()).status).toBe("completed");
    expect(getTransaction(sid)?.verifiedPatient?.username).toBe("patient1");
  });

  it("short-circuits to completed once already completed", async () => {
    const sid = await startSid("tx4");
    vi.mocked(getPresentationResult).mockResolvedValue({
      status: "completed",
      pid: {},
    });
    await GET(new Request(`http://x/api/auth/eudi/status?sid=${sid}`));
    const res2 = await GET(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect((await res2.json()).status).toBe("completed");
  });

  it("keeps polling (pending) when the verifier throws", async () => {
    const sid = await startSid("tx5");
    vi.mocked(getPresentationResult).mockRejectedValue(new Error("hiccup"));
    const res = await GET(
      new Request(`http://x/api/auth/eudi/status?sid=${sid}`),
    );
    expect((await res.json()).status).toBe("pending");
  });
});
