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

for (const [name, v] of [
  ["overview_patient", view],
  ["overview_hdab", hdab],
] as const) {
  const out = join(MOCK, `${name}.json`);
  writeFileSync(out, JSON.stringify(v, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${out}: ${v.nodes.length} nodes, ${v.links.length} links, ${v.signals.length} signals`,
  );
}
