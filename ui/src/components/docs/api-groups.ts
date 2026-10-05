/** What each /api/<group> is for, shown beside the generated route list in
 *  the developer guide. A test fails when a group has no entry here, so a new
 *  route area cannot reach the docs undescribed. */
export const API_GROUP_DESCRIPTIONS: Record<string, string> = {
  "activity-report":
    "The access body's activity report, Regulation (EU) 2025/327 Art. 59, generated from the graph",
  admin:
    "Operator tools: components and their health, tenants, participants, ODRL policies, audit log and retention. EDC_ADMIN; policies and audit also HDAB_AUTHORITY",
  analytics: "OMOP cohort analytics",
  "app-accounts":
    "The Klarbefund app creates a sandbox account for itself, without a session but only with an Apple App Attest attestation (ADR-054)",
  assets: "EDC asset registry",
  auth: "Sign-in: NextAuth with Keycloak, and the EUDI Wallet start and status calls. No session needed",
  catalog: "HealthDCAT-AP dataset catalogue: list, publish, remove",
  compliance:
    "Access body workflows: permit applications and their clock, statistical requests, permits and revocation, findings, information requests, results, and the DSP TCK results",
  credentials:
    "Verifiable credentials: list, request, revoke, and the issuer's definitions",
  debug: "Read-only check of the federated discovery plumbing. EDC_ADMIN",
  eehrxf: "EEHRxF profile alignment",
  federated: "Federated query across the participants' graphs",
  graph: "Knowledge graph: nodes, expansion, schema validation",
  health: "Liveness and readiness probe. No session needed",
  information:
    "What the access body tells the public about secondary use, Art. 58(1)",
  "keycloak-config":
    "Where Keycloak is, for the sign-in banner. No session needed",
  "mock-dsp":
    "Demo DSP catalogue endpoint the catalog crawler polls. A session or the crawler's token (ADR-020)",
  negotiations: "DSP contract negotiations",
  nlq: "Natural language queries through the proxy, and which NLP backend answers them",
  odrl: "The caller's effective ODRL scope: permissions, prohibitions, datasets, time limits",
  overview:
    "The data behind the persona overview: layers, nodes, links and signals",
  participants: "Participant registry, profiles and their credentials",
  patient:
    "The patient's record, profile, insights, research consent, EHR sync, and the Klarbefund app pairing and devices",
  permits: "The access body's register of applications and permits, Art. 57",
  tasks:
    "Negotiations and transfers across all participant contexts, as one task list",
  transfers: "Data transfers",
  "trust-center": "Trust centers with their governance chain and statistics",
};

export interface ApiRoute {
  path: string;
  methods: string[];
}

/** Routes grouped by their first segment after /api, in path order. */
export function groupApiRoutes(routes: ApiRoute[]): [string, ApiRoute[]][] {
  const groups = new Map<string, ApiRoute[]>();
  for (const r of routes) {
    const group = r.path.split("/")[2] ?? "";
    groups.set(group, [...(groups.get(group) ?? []), r]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}
