/**
 * The audit client resolves only when the proxy committed the record (201),
 * so a route can fail closed on anything else (ADR-045, #418).
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.unmock("@/lib/dsp-audit");
const { recordDspEvent, recordDspEventAfter, AuditUnavailableError } =
  await import("@/lib/dsp-audit");

const RECORD = {
  process: "transfer-process" as const,
  event: "requested",
  outcome: "success" as const,
  agreementId: "agr-456",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("recordDspEvent", () => {
  it("posts a hub record to the proxy and resolves on 201", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));
    await expect(recordDspEvent(RECORD)).resolves.toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/audit\/dsp$/);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      source: "hub-ui",
      event: "requested",
      agreementId: "agr-456",
    });
  });

  it("rejects when the proxy did not commit the record", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 503 }),
    );
    await expect(recordDspEvent(RECORD)).rejects.toBeInstanceOf(
      AuditUnavailableError,
    );
  });

  it("rejects when the proxy cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(recordDspEvent(RECORD)).rejects.toThrow(/unreachable/);
  });

  it("names a load test run as X-Load-Test, so the proxy stamps it on the record (#571)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));
    await recordDspEvent({ ...RECORD, loadTest: "20261006-1300-load-aca" });
    const init = fetchSpy.mock.calls[0][1];
    expect(init?.headers).toMatchObject({
      "X-Load-Test": "20261006-1300-load-aca",
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("loadTest");
  });

  it("sends no run for a request that is not part of one", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));
    await recordDspEvent(RECORD);
    expect(fetchSpy.mock.calls[0][1]?.headers).not.toHaveProperty(
      "X-Load-Test",
    );
  });

  it("sends the shared token when one is configured", async () => {
    vi.stubEnv("AUDIT_CALLBACK_TOKEN", "t0ken");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));
    await recordDspEvent(RECORD);
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      "x-audit-token": "t0ken",
    });
  });
});

describe("recordDspEventAfter", () => {
  it("logs a failure instead of throwing, since the action already happened", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordDspEventAfter(RECORD)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
