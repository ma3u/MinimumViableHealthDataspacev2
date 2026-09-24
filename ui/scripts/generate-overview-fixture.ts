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

const MOCK = join(__dirname, "..", "public", "mock");
const read = (name: string) =>
  JSON.parse(readFileSync(join(MOCK, `${name}.json`), "utf-8"));

const ALPHA = "did:web:alpha-klinik.de:participant";
const audit = read("admin_audit");
const accessLog: AccessLogEntry[] = (audit.accesslogs ?? [])
  .filter((l: { providerDid?: string }) => l.providerDid === ALPHA)
  .map((l: Record<string, unknown>) => ({
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
  }));

const view = buildPatientView({
  asOf: "2026-09-23",
  profile: read("patient_profile_patient1"),
  insights: read("patient_insights"),
  research: read("patient_research"),
  observations: read("patient_observations"),
  accessLog,
  holder: { did: ALPHA, name: "AlphaKlinik Berlin" },
});

const out = join(MOCK, "overview_patient.json");
writeFileSync(out, JSON.stringify(view, null, 2) + "\n");
// eslint-disable-next-line no-console
console.log(
  `wrote ${out}: ${view.nodes.length} nodes, ${view.links.length} links, ${view.signals.length} signals`,
);
