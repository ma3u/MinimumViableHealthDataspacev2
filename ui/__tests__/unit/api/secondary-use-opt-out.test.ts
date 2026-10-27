/**
 * Art. 71 (ADR-062): the UI's own research reads leave out the persons who
 * opted out of secondary use; care reads (operator, data holder) do not.
 *
 * The real requireAuth() runs against a mocked session per role.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";

vi.unmock("@/lib/auth-guard");

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));
// The permit gate is pinned elsewhere; here it lets the data user through.
vi.mock("@/lib/permit-gate", () => ({
  gateSecondaryUse: vi.fn().mockResolvedValue({ allowed: true, check: null }),
}));

import { GET as analytics } from "@/app/api/analytics/route";
import { GET as patients } from "@/app/api/patient/route";
import { __resetCacheForTests } from "@/lib/server-cache";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const as = (roles: string[], username = "someone") =>
  ({
    user: { id: username, name: username, email: `${username}@test.example` },
    roles,
    preferredUsername: username,
  }) as unknown as Session;

const ran = () => mockRunQuery.mock.calls.map((c) => String(c[0]));
const personQueries = () =>
  ran().filter((q) => /:\s*\(?\s*(Patient|OMOP)/.test(q));

beforeEach(() => {
  mockRunQuery.mockReset();
  mockRunQuery.mockResolvedValue([]);
  __resetCacheForTests();
});

describe("the OMOP analytics", () => {
  it("leave out the persons who opted out for a data user", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      as(["EDC_USER_PARTICIPANT", "DATA_USER"], "researcher"),
    );
    await analytics();
    expect(personQueries().length).toBeGreaterThan(3);
    for (const q of personQueries()) expect(q).toContain("&!OptedOut");
  });

  it("are the holder's own figures for the data holder", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      as(["EDC_USER_PARTICIPANT", "DATA_HOLDER"], "clinic"),
    );
    await analytics();
    for (const q of ran()) expect(q).not.toContain("OptedOut");
  });
});

describe("the patient list", () => {
  it("leaves out the persons who opted out for an access body", async () => {
    vi.mocked(getServerSession).mockResolvedValue(
      as(["EDC_USER_PARTICIPANT", "HDAB_AUTHORITY"], "regulator"),
    );
    await patients(new Request("http://localhost/api/patient"));
    const list = ran().filter((q) => q.includes("Patient"));
    expect(list.length).toBeGreaterThan(0);
    for (const q of list) expect(q).toContain("(p:(Patient)&!OptedOut)");
  });

  it("is the full list for the operator", async () => {
    vi.mocked(getServerSession).mockResolvedValue(as(["EDC_ADMIN"], "admin"));
    await patients(new Request("http://localhost/api/patient"));
    for (const q of ran()) expect(q).not.toContain("OptedOut");
  });
});
