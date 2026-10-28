// @vitest-environment node
/**
 * The link between a PID and a sandbox account (ADR-067): one Keycloak
 * attribute, found, written and removed through the account service.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeKeycloak } from "../../fixtures/fake-keycloak";
import {
  clearFingerprint,
  findUsernameByFingerprint,
  hasFingerprint,
  PID_ATTRIBUTE,
  pidAccountsAvailable,
  sandboxPatient,
  setFingerprint,
} from "@/lib/pid-link";
import { AccountError } from "@/lib/app-accounts";
import { patientPseudonym } from "@/lib/patient-identity";

const FP = `k1:${"a".repeat(64)}`;
const OTHER_FP = `k1:${"b".repeat(64)}`;
const KEY = Buffer.alloc(32, 7).toString("base64");

const linked = {
  id: "u-9",
  username: "kb-ab3dk7mn",
  firstName: "Klarbefund",
  lastName: "Sandbox",
  email: "kb-ab3dk7mn@klarbefund.invalid",
  attributes: { [PID_ATTRIBUTE]: [FP], locale: ["de"] },
};
const plain = {
  id: "u-8",
  username: "kb-pq7rs2tv",
  firstName: "Klarbefund",
  lastName: "Sandbox",
  email: "kb-pq7rs2tv@klarbefund.invalid",
  attributes: { locale: ["en"] },
};

beforeEach(() => {
  vi.stubEnv("KEYCLOAK_ACCOUNT_SERVICE_SECRET", "svc-secret");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pidAccountsAvailable", () => {
  it("needs the hash key and the account service", () => {
    vi.stubEnv("PID_FINGERPRINT_KEY", "");
    expect(pidAccountsAvailable()).toBe(false);
    vi.stubEnv("PID_FINGERPRINT_KEY", KEY);
    expect(pidAccountsAvailable()).toBe(true);
    vi.stubEnv("KEYCLOAK_ACCOUNT_SERVICE_SECRET", "");
    expect(pidAccountsAvailable()).toBe(false);
  });
});

describe("findUsernameByFingerprint", () => {
  it("asks Keycloak for the attribute, exactly, and answers the username", async () => {
    const kc = fakeKeycloak([linked, plain]);
    expect(await findUsernameByFingerprint(FP)).toBe("kb-ab3dk7mn");
    const search = kc.calls.find((c) => c.url.includes("/users?"))!;
    const params = new URL(search.url).searchParams;
    expect(params.get("q")).toBe(`pid_fingerprint:${FP}`);
    expect(params.get("exact")).toBe("true");
  });

  it("answers null when no account holds it", async () => {
    fakeKeycloak([linked, plain]);
    expect(await findUsernameByFingerprint(OTHER_FP)).toBeNull();
  });

  it("does not ask Keycloak for something that is not a fingerprint", async () => {
    const kc = fakeKeycloak([linked]);
    expect(await findUsernameByFingerprint("pid_fingerprint:*")).toBeNull();
    expect(kc.calls).toEqual([]);
  });

  it("refuses to guess when two accounts hold one fingerprint", async () => {
    fakeKeycloak([linked, { ...plain, attributes: { [PID_ATTRIBUTE]: [FP] } }]);
    await expect(findUsernameByFingerprint(FP)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("checks the attribute again where Keycloak returns more than it should", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/token")
          ? Response.json({ access_token: "svc" })
          : Response.json([plain]),
      ),
    );
    expect(await findUsernameByFingerprint(FP)).toBeNull();
  });

  it("throws when Keycloak refuses the search", async () => {
    const kc = fakeKeycloak([linked]);
    kc.fail.search = 403;
    await expect(findUsernameByFingerprint(FP)).rejects.toBeInstanceOf(
      AccountError,
    );
  });
});

describe("setFingerprint and clearFingerprint", () => {
  it("writes the attribute and keeps every other attribute and field", async () => {
    const kc = fakeKeycloak([plain]);
    expect(await setFingerprint("kb-pq7rs2tv", FP)).toBe(true);
    const put = kc.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toMatch(/\/admin\/realms\/edcv\/users\/u-8$/);
    const user = kc.byUsername("kb-pq7rs2tv")!;
    expect(user.attributes).toEqual({ locale: ["en"], [PID_ATTRIBUTE]: [FP] });
    expect(user).toMatchObject({
      firstName: "Klarbefund",
      email: "kb-pq7rs2tv@klarbefund.invalid",
    });
    expect(await hasFingerprint("kb-pq7rs2tv")).toBe(true);
  });

  it("removes the attribute and nothing else", async () => {
    const kc = fakeKeycloak([linked]);
    expect(await clearFingerprint("kb-ab3dk7mn")).toBe(true);
    const put = JSON.parse(kc.calls.find((c) => c.method === "PUT")!.body!);
    expect(put.attributes[PID_ATTRIBUTE]).toEqual([]);
    expect(kc.byUsername("kb-ab3dk7mn")!.attributes).toEqual({
      locale: ["de"],
    });
    expect(await hasFingerprint("kb-ab3dk7mn")).toBe(false);
  });

  it("answers false for an account that does not exist", async () => {
    fakeKeycloak([]);
    expect(await setFingerprint("kb-zzzzzzzz", FP)).toBe(false);
    expect(await clearFingerprint("kb-zzzzzzzz")).toBe(false);
  });

  it("never touches a demo persona", async () => {
    const kc = fakeKeycloak([{ id: "p1", username: "patient1" }]);
    await expect(setFingerprint("patient1", FP)).rejects.toMatchObject({
      status: 403,
    });
    await expect(clearFingerprint("patient1")).rejects.toMatchObject({
      status: 403,
    });
    expect(await hasFingerprint("patient1")).toBe(false);
    expect(kc.calls).toEqual([]);
  });

  it("refuses a value that is not a fingerprint", async () => {
    fakeKeycloak([plain]);
    await expect(setFingerprint("kb-pq7rs2tv", "Erika")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws when Keycloak refuses the change", async () => {
    const kc = fakeKeycloak([plain]);
    kc.fail.put = 400;
    await expect(setFingerprint("kb-pq7rs2tv", FP)).rejects.toBeInstanceOf(
      AccountError,
    );
  });

  it("logs no fingerprint", async () => {
    const logged: unknown[] = [];
    for (const m of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, m).mockImplementation((...a) => {
        logged.push(...a);
      });
    }
    const kc = fakeKeycloak([linked, plain]);
    kc.fail.put = 500;
    await findUsernameByFingerprint(FP);
    await setFingerprint("kb-pq7rs2tv", OTHER_FP).catch(() => undefined);
    expect(JSON.stringify(logged)).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe("sandboxPatient", () => {
  it("opens the account as a patient at level high, under the record's pseudonym", () => {
    expect(sandboxPatient("kb-ab3dk7mn")).toEqual({
      username: "kb-ab3dk7mn",
      displayName: patientPseudonym("KB-AB3DK7MN"),
      roles: ["PATIENT"],
      assurance: "high",
    });
  });
});
