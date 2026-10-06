/**
 * PUT /api/patient/profile/interests: a patient names their own health
 * interests from the suggested list, on their own record only (EHDS Art. 3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";

vi.unmock("@/lib/auth-guard");

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import { PUT } from "@/app/api/patient/profile/interests/route";
import { validInterests, interestLabel } from "@/lib/patient/interests";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const patient1 = {
  user: { id: "patient1", name: "Maria Schmidt", email: "patient1@x" },
  roles: ["PATIENT"],
  preferredUsername: "patient1",
} as unknown as Session;
const researcher = {
  user: { id: "researcher", name: "R", email: "r@x" },
  roles: ["DATA_USER"],
  preferredUsername: "researcher",
} as unknown as Session;

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/patient/profile/interests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mockRunQuery.mockReset();
  vi.mocked(getServerSession).mockResolvedValue(patient1);
});

describe("the suggested list", () => {
  it("keeps known ids in the list's order, once", () => {
    expect(validInterests(["sleep", "cardiology", "sleep"])).toEqual([
      "cardiology",
      "sleep",
    ]);
    expect(validInterests([])).toEqual([]);
  });

  it("refuses free text and anything that is not a list", () => {
    expect(validInterests(["cardiology", "<script>"])).toBeNull();
    expect(validInterests("cardiology")).toBeNull();
    expect(validInterests(undefined)).toBeNull();
  });

  it("labels an id, and shows an unknown one as it is", () => {
    expect(interestLabel("cardiology")).toBe("Heart and circulation");
    expect(interestLabel("legacy-id")).toBe("legacy-id");
  });
});

describe("PUT /api/patient/profile/interests", () => {
  it("stores the patient's choice on their own record", async () => {
    mockRunQuery.mockResolvedValue([{ interests: ["cardiology", "sleep"] }]);
    const res = await put({
      patientId: "P1",
      interests: ["sleep", "cardiology"],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      patientId: "P1",
      interests: ["cardiology", "sleep"],
    });
    const [query, params] = mockRunQuery.mock.calls[0];
    expect(String(query)).toMatch(/SET p\.interests = \$interests/);
    expect(params).toEqual({
      patientId: "P1",
      interests: ["cardiology", "sleep"],
    });
  });

  it("refuses another patient's record (403) and writes nothing", async () => {
    const res = await put({ patientId: "P2", interests: ["sleep"] });
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses an id that is not on the suggested list (400)", async () => {
    const res = await put({ patientId: "P1", interests: ["astrology"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/suggested list/);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("is for patients only: a researcher gets 403", async () => {
    vi.mocked(getServerSession).mockResolvedValue(researcher);
    const res = await put({ patientId: "P1", interests: ["sleep"] });
    expect(res.status).toBe(403);
  });

  it("answers 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await put({ patientId: "P1", interests: ["sleep"] });
    expect(res.status).toBe(401);
  });
});
