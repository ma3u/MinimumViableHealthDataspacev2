/**
 * Build ui/public/mock/overview_patient.json from the other mock fixtures,
 * the way GET /api/overview?persona=patient builds it from the graph
 * (issue #271). Run from ui/:
 *
 *   npx --yes tsx scripts/generate-overview-fixture.ts
 *
 * scripts/refresh-mocks.sh overwrites the file from a live server; this is
 * for a machine without one. Fictional data only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPatientView } from "../src/lib/overview/patient";
import type { AccessLogEntry } from "../src/lib/overview/patient";
import { buildHdabView } from "../src/lib/overview/hdab";
import { buildHospitalView } from "../src/lib/overview/hospital";
import { buildResearcherView } from "../src/lib/overview/researcher";

const MOCK = join(__dirname, "..", "public", "mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const ALPHA = "did:web:alpha-klinik.de:participant";
const audit = read("admin_audit");
const allEvents: AccessLogEntry[] = (audit.accesslogs ?? []).map(
  (l: Record<string, unknown>) => ({
    id: l.id as string,
    accessedAt: l.accessedAt as string,
    consumerDid: l.consumerDid as string,
    consumerName: (l.consumerName as string) ?? null,
    providerDid: l.providerDid as string,
    datasetId: (l.assetId as string) ?? null,
    statusCode: (l.statusCode as number) ?? 200,
    permitId: (l.permitId as string) ?? null,
    contractId: (l.contractId as string) ?? null,
    responseBytes: (l.bytesAccessed as number) ?? null,
    providerName: (l.providerName as string) ?? null,
    assetTitle: (l.assetTitle as string) ?? null,
  }),
);
const accessLog = allEvents.filter((l) => l.providerDid === ALPHA);

const view = buildPatientView({
  asOf: "2026-09-23",
  profile: read("patient_profile_patient1"),
  insights: read("patient_insights"),
  research: read("patient_research"),
  observations: read("patient_observations"),
  accessLog,
  holder: { did: ALPHA, name: "AlphaKlinik Berlin" },
});

const compliance = read("compliance");
const hdab = buildHdabView({
  asOf: "2026-09-23",
  me: { did: "did:web:medreg.de:hdab", name: "MedReg DE" },
  consumers: compliance.consumers,
  datasets: compliance.datasets,
  matrix: compliance.matrix,
  register: read("permits").entries,
  credentials: read("credentials").credentials,
  contracts: [],
  events: allEvents,
});

// The assessor's quarterly scores behind AlphaKlinik's label, as the seed has them
const labelSeries = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "public",
      "poc",
      "persona-3d",
      "data",
      "hospital-series.json",
    ),
    "utf-8",
  ),
).items.find((i: { match: string }) => i.match.startsWith("vc:")).series as {
  date: string;
  value: number;
}[];
const hospital = buildHospitalView({
  asOf: "2026-09-23",
  me: { did: ALPHA, name: "AlphaKlinik Berlin" },
  consumers: compliance.consumers,
  datasets: compliance.datasets,
  matrix: compliance.matrix,
  register: read("permits").entries,
  credentials: read("credentials").credentials,
  contracts: [],
  events: accessLog,
  assessments: labelSeries.map((p) => ({
    credentialId: "vc:data-quality-label:clinic-alphaklinik",
    date: p.date,
    conformance: p.value,
  })),
});

// The researcher: PharmaCo, its studies from the programme fixture with the
// enrolment series of the prototype, the catalogue for descriptions.
const PHARMACO = "did:web:pharmaco.de:research";
const researcherSeries = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "public",
      "poc",
      "persona-3d",
      "data",
      "researcher-series.json",
    ),
    "utf-8",
  ),
).items as { match: string; series: { date: string; value: number }[] }[];
const catalog = read("catalog") as {
  id: string;
  title: string;
  description?: string;
  publisher?: string;
  theme?: string;
  recordCount?: number;
}[];
const catalogByKey = new Map<string, (typeof catalog)[number]>();
for (const c of catalog) {
  catalogByKey.set(c.id, c);
  catalogByKey.set(c.title, c);
}
const researcher = buildResearcherView({
  asOf: "2026-09-23",
  me: { did: PHARMACO, name: "PharmaCo Research AG" },
  consumers: compliance.consumers,
  datasets: compliance.datasets.map((d: { id: string; title: string }) => {
    const c = catalogByKey.get(d.id) ?? catalogByKey.get(d.title);
    return {
      id: d.id,
      title: d.title,
      description: c?.description ?? null,
      publisher: c?.publisher ?? null,
      theme: c?.theme ?? null,
      recordCount: c?.recordCount ?? null,
    };
  }),
  matrix: compliance.matrix,
  register: read("permits").entries,
  credentials: read("credentials").credentials,
  contracts: [],
  events: allEvents.filter((e) => e.consumerDid === PHARMACO),
  studies: read("patient_research").programs.map(
    (p: {
      studyId: string;
      studyName: string;
      institution: string;
      status: string;
      dataNeeded: string;
      description: string;
      countries: string[];
      participantCount: number;
    }) => ({
      studyId: p.studyId,
      studyName: p.studyName,
      institution: p.institution,
      institutionDid:
        (compliance.consumers as { id: string; name: string }[]).find(
          (c) => c.name === p.institution,
        )?.id ?? null,
      status: p.status,
      dataNeeded: p.dataNeeded,
      description: p.description,
      countries: p.countries,
      participantCount: p.participantCount,
      enrolment:
        researcherSeries.find((i) => i.match === `study:${p.studyId}`)
          ?.series ?? null,
    }),
  ),
});

for (const [name, v] of [
  ["overview_patient", view],
  ["overview_hdab", hdab],
  ["overview_hospital", hospital],
  ["overview_researcher", researcher],
] as const) {
  const out = join(MOCK, `${name}.json`);
  writeFileSync(out, JSON.stringify(v, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${out}: ${v.nodes.length} nodes, ${v.links.length} links, ${v.signals.length} signals`,
  );
}
