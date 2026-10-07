/**
 * #475, first part: a researcher sees a pseudonym, never a patient's name or
 * birth date; a patient sees and changes their own record only.
 *
 * The real requireAuth() runs against a mocked session per role, so each case
 * is decided the way it is on the live hub.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerSession } from "next-auth/next";
import { readdirSync, readFileSync } from "fs";
import path from "path";

vi.unmock("@/lib/auth-guard");

const mockRunQuery = vi.fn();
vi.mock("@/lib/neo4j", () => ({
  runQuery: (...args: unknown[]) => mockRunQuery(...args),
}));

import {
  birthYear,
  patientPseudonym,
  redactPatientProperties,
  seesPatientIdentity,
  patientAge,
  ownRecordView,
} from "@/lib/patient-identity";
import { __resetCacheForTests } from "@/lib/server-cache";

type Session = Awaited<ReturnType<typeof getServerSession>>;
const as = (roles: string[], username = "someone") =>
  ({
    user: { id: username, name: username, email: `${username}@test.example` },
    roles,
    preferredUsername: username,
  }) as unknown as Session;

const researcher = as(["EDC_USER_PARTICIPANT", "DATA_USER"], "researcher");
const admin = as(["EDC_ADMIN"], "edcadmin");
const patient1 = as(["PATIENT"], "patient1");

beforeEach(() => {
  mockRunQuery.mockReset();
  __resetCacheForTests();
});

describe("the rule", () => {
  it("lets the operator and the data holder see identity, nobody else", () => {
    expect(seesPatientIdentity(["EDC_ADMIN"])).toBe(true);
    expect(seesPatientIdentity(["EDC_USER_PARTICIPANT", "DATA_HOLDER"])).toBe(
      true,
    );
    for (const r of [
      "DATA_USER",
      "HDAB_AUTHORITY",
      "TRUST_CENTER_OPERATOR",
      "PATIENT",
    ]) {
      expect(seesPatientIdentity(["EDC_USER_PARTICIPANT", r])).toBe(false);
    }
  });

  it("gives one record the same pseudonym every time, and two records different ones", () => {
    expect(patientPseudonym("P1")).toBe(patientPseudonym("P1"));
    expect(patientPseudonym("P1")).not.toBe(patientPseudonym("P2"));
    expect(patientPseudonym("P1")).toMatch(/^Patient [0-9a-f]{8}$/);
  });

  it("gives a patient their own record as a pseudonym with an age, no birth date", () => {
    const asOf = new Date("2026-10-07T12:00:00Z");
    expect(patientAge("1979-03-15", asOf)).toBe(47);
    expect(patientAge("1979-10-08", asOf)).toBe(46);
    expect(patientAge({ year: 1965, month: 7, day: 22 }, asOf)).toBe(61);
    expect(patientAge("1965", asOf)).toBe(61);
    expect(patientAge("", asOf)).toBeNull();
    const own = ownRecordView({
      id: "P1",
      name: "Maria Schmidt",
      gender: "female",
      birthDate: "1979-03-15",
    });
    expect(own.name).toBe(patientPseudonym("P1"));
    expect(own.birthDate).toBe("");
    expect(own.age).toBeGreaterThanOrEqual(47);
    expect(own.gender).toBe("female");
  });

  it("keeps the birth year and drops every identifying property", () => {
    const out = redactPatientProperties(
      {
        name: "Maria Schmidt",
        birthDate: "1979-03-15",
        city: "Berlin",
        id: "P1",
        resourceId: "r-1",
        gender: "female",
        country: "DE",
      },
      "P1",
    );
    expect(out).toEqual({
      pseudonym: patientPseudonym("P1"),
      birthYear: "1979",
      gender: "female",
      country: "DE",
    });
    expect(birthYear({ year: 1965, month: 4, day: 12 })).toBe("1965");
    expect(birthYear(undefined)).toBeNull();
  });
});

describe("GET /api/patient (the cohort list)", () => {
  const rows = [
    {
      id: "P1",
      name: "Maria Schmidt",
      gender: "female",
      birthDate: "1979-03-15",
    },
    { id: "P2", name: "Jan de Vries", gender: "male", birthDate: "1965-07-22" },
  ];
  const cohort = () => {
    mockRunQuery
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([{ patients: 2 }]);
  };

  it("shows a researcher pseudonyms and birth years", async () => {
    vi.mocked(getServerSession).mockResolvedValue(researcher);
    cohort();
    const { GET } = await import("@/app/api/patient/route");
    const body = await (
      await GET(new Request("http://localhost/api/patient"))
    ).json();
    const text = JSON.stringify(body.patients);
    expect(text).not.toContain("Maria Schmidt");
    expect(text).not.toContain("1979-03-15");
    expect(body.patients[0]).toMatchObject({
      name: patientPseudonym("P1"),
      birthDate: "1979",
    });
  });

  it("shows the operator the names", async () => {
    vi.mocked(getServerSession).mockResolvedValue(admin);
    cohort();
    const { GET } = await import("@/app/api/patient/route");
    const body = await (
      await GET(new Request("http://localhost/api/patient"))
    ).json();
    expect(body.patients[0].name).toBe("Maria Schmidt");
  });
});

describe("GET /api/graph", () => {
  // The default view: twenty patients, a condition between them.
  function graph(own = "P1") {
    mockRunQuery.mockImplementation(async (q: string) => {
      if (q.includes("WITH p, count(*) AS cnt ORDER BY cnt DESC LIMIT 20")) {
        return [
          { id: "el-1", labels: ["Patient"], name: "Maria Schmidt" },
          { id: "el-2", labels: ["Patient"], name: "Jan de Vries" },
        ];
      }
      if (q.includes("coalesce(p.id, p.resourceId, elementId(p)) AS key")) {
        return [
          { id: "el-1", key: own },
          { id: "el-2", key: "P2" },
        ];
      }
      if (q.includes("MATCH (a)-[r]->(b)")) {
        return [{ source: "el-1", target: "el-2", type: "SAME_COHORT" }];
      }
      return [];
    });
  }

  it("never names a patient to a researcher, whatever persona is asked for", async () => {
    vi.mocked(getServerSession).mockResolvedValue(researcher);
    graph();
    const { GET } = await import("@/app/api/graph/route");
    for (const persona of ["default", "patient"]) {
      const body = await (
        await GET(new Request(`http://localhost/api/graph?persona=${persona}`))
      ).json();
      const text = JSON.stringify(body.nodes);
      expect(text).not.toContain("Maria Schmidt");
      expect(text).not.toContain("Jan de Vries");
    }
  });

  it("an admin who fills the graph cache does not name patients to the researcher after them", async () => {
    // The cached graph holds names (#540); who sees them is decided per
    // request, so the cache cannot carry an admin's view to a researcher.
    graph();
    const { GET } = await import("@/app/api/graph/route");

    vi.mocked(getServerSession).mockResolvedValue(admin);
    const forAdmin = await (
      await GET(new Request("http://localhost/api/graph"))
    ).json();
    expect(JSON.stringify(forAdmin.nodes)).toContain("Maria Schmidt");
    const queries = mockRunQuery.mock.calls.length;

    vi.mocked(getServerSession).mockResolvedValue(researcher);
    const forResearcher = await (
      await GET(new Request("http://localhost/api/graph"))
    ).json();
    expect(mockRunQuery.mock.calls.length).toBe(queries);
    const text = JSON.stringify(forResearcher.nodes);
    expect(text).not.toContain("Maria Schmidt");
    expect(text).toContain(patientPseudonym("P1"));

    // And the admin's next answer still has the names: pseudonymising did
    // not overwrite the cached nodes.
    vi.mocked(getServerSession).mockResolvedValue(admin);
    const again = await (
      await GET(new Request("http://localhost/api/graph"))
    ).json();
    expect(JSON.stringify(again.nodes)).toContain("Maria Schmidt");
  });

  it("shows a patient their own node under its pseudonym too, never a name", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);
    graph("P1");
    const { GET } = await import("@/app/api/graph/route");
    const body = await (
      await GET(new Request("http://localhost/api/graph"))
    ).json();
    const names = body.nodes.map((n: { name: string }) => n.name);
    expect(names).not.toContain("Maria Schmidt");
    expect(names).not.toContain("Jan de Vries");
    expect(names).toContain(patientPseudonym("P1"));
    expect(names).toContain(patientPseudonym("P2"));
  });
});

describe("OMOP persons", () => {
  it("are labelled with their patient's pseudonym, not the name an old transform copied", async () => {
    vi.mocked(getServerSession).mockResolvedValue(researcher);
    mockRunQuery.mockImplementation(async (q: string) => {
      if (q.includes("WITH p, count(*) AS cnt ORDER BY cnt DESC LIMIT 20")) {
        return [{ id: "el-1", labels: ["Patient"], name: "Maria Schmidt" }];
      }
      if (q.includes("OMOPPerson") && q.includes("AS key")) {
        return [
          { id: "el-1", key: "P1" },
          { id: "op-1", key: "P1" },
        ];
      }
      if (q.includes("MATCH (a)-[r]->(b)")) return [];
      return [];
    });
    const { GET } = await import("@/app/api/graph/route");
    const body = await (
      await GET(new Request("http://localhost/api/graph"))
    ).json();
    expect(body.nodes.map((n: { name: string }) => n.name)).toEqual([
      patientPseudonym("P1"),
    ]);
  });

  it("lose their name property in the node view for a researcher", async () => {
    vi.mocked(getServerSession).mockResolvedValue(researcher);
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["OMOPPerson"],
        props: { name: "Maria Schmidt", yearOfBirth: 1979 },
      },
    ]);
    const { GET } = await import("@/app/api/graph/node/route");
    const body = await (
      await GET(new Request("http://localhost/api/graph/node?id=op-1"))
    ).json();
    expect(JSON.stringify(body.properties)).not.toContain("Maria Schmidt");
    expect(JSON.stringify(body.properties)).toContain("1979");
  });
});

describe("the public static site", () => {
  // GitHub Pages has no sign-in, so every visitor reads it without identity.
  // Synthea names carry digits ("Anisha16 Grayce293 Kuvalis369").
  it("carries no patient names in the graph and cohort fixtures", () => {
    const dir = path.resolve(__dirname, "../../../public/mock");
    const files = readdirSync(dir).filter((f) =>
      /^graph.*\.json$|^patient\.json$|^patient_profile.*\.json$|^overview_patient\.json$/.test(
        f,
      ),
    );
    expect(files.length).toBeGreaterThan(3);
    const synthea = /[A-Z][a-z]+\d{2,3} [A-Z][a-z]+\d{2,3}/;
    const offenders = files.filter((f) =>
      synthea.test(readFileSync(path.join(dir, f), "utf8")),
    );
    expect(offenders).toEqual([]);
    // The patient's own fixtures carry the pseudonym and an age, no name and
    // no birth date (2026-10-07).
    for (const f of [
      "patient_profile_patient1",
      "patient_profile_list",
      "overview_patient",
    ]) {
      const text = readFileSync(path.join(dir, `${f}.json`), "utf8");
      expect(text).not.toMatch(
        /Maria Schmidt|Jan de Vries|1979-03-15|1965-07-22/,
      );
    }
  });
});

describe("GET /api/graph/node", () => {
  it("withholds a patient's name, birth date and record ids from a researcher", async () => {
    vi.mocked(getServerSession).mockResolvedValue(researcher);
    mockRunQuery.mockResolvedValueOnce([
      {
        labels: ["Patient"],
        props: {
          id: "P1",
          name: "Maria Schmidt",
          birthDate: "1979-03-15",
          gender: "female",
        },
      },
    ]);
    const { GET } = await import("@/app/api/graph/node/route");
    const body = await (
      await GET(new Request("http://localhost/api/graph/node?id=el-1"))
    ).json();
    const text = JSON.stringify(body.properties);
    expect(text).not.toContain("Maria Schmidt");
    expect(text).not.toContain("1979-03-15");
    expect(text).not.toContain('"P1"');
    expect(body.properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pseudonym",
          value: patientPseudonym("P1"),
        }),
        expect.objectContaining({ key: "birthYear", value: "1979" }),
      ]),
    );
  });
});

describe("a patient's own record only", () => {
  it("refuses another patient's consents (insights)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);
    const { GET } = await import("@/app/api/patient/insights/route");
    const res = await GET(
      new Request("http://localhost/api/patient/insights?patientId=P2"),
    );
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses consenting in another patient's name (research POST)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);
    const { POST } = await import("@/app/api/patient/research/route");
    const res = await POST(
      new Request("http://localhost/api/patient/research", {
        method: "POST",
        body: JSON.stringify({ patientId: "P2", studyId: "s-1" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it("refuses withdrawing another patient's consent (research DELETE)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(patient1);
    const { DELETE } = await import("@/app/api/patient/research/route");
    const res = await DELETE(
      new Request(
        "http://localhost/api/patient/research?consentId=c-1&patientId=P2",
        {
          method: "DELETE",
        },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("still lets the operator act on any record", async () => {
    vi.mocked(getServerSession).mockResolvedValue(admin);
    mockRunQuery.mockResolvedValue([]);
    const { GET } = await import("@/app/api/patient/insights/route");
    const res = await GET(
      new Request("http://localhost/api/patient/insights?patientId=P2"),
    );
    expect(res.status).toBe(200);
  });
});
