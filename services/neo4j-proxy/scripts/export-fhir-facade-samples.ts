/**
 * Write the sample of what the FHIR facade serves (#1144): read a few seeded
 * patients from a running graph, keep their rows in
 * scripts/eehrxf/samples/facade/graph-rows.json, and write the resources the
 * mapper makes of them to scripts/eehrxf/samples/facade-sample.json. Run from
 * services/neo4j-proxy with Neo4j up (docker compose up -d):
 *
 *   npx tsx scripts/export-fhir-facade-samples.ts
 *
 * Then run python3 scripts/eehrxf/validate.py and python3 scripts/eehrxf/build.py.
 *
 * Read-only: every query runs in a READ session inside executeRead, so Neo4j
 * refuses a write. Fictional and synthetic patients only; a person who opted
 * out is refused, as the facade would refuse them.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";
import {
  facadeSample,
  sampleText,
  type GraphRows,
} from "./fhir-facade-sample.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "..", "scripts", "eehrxf", "samples");

/** Seeded demo personas and generated patients, each shape of record once. */
const PATIENTS = [
  "P1",
  "P2",
  "fhir-pat-1002",
  "patient-2000",
  "patient-2008",
  "pv-pat-001",
];
/**
 * At most this many records of a type per patient: per category for an
 * Observation, and one per code for an Observation without a category (the
 * generated seed writes vital signs without category or unit).
 */
const PER_TYPE = 2;

/**
 * Where each type hangs off a patient, as GET /fhir/Patient/:id/$everything
 * collects it. Fixed text: the patient id is a parameter.
 */
const VIA_ENCOUNTER = "(p)-[:HAS_ENCOUNTER]->(:Encounter)";
const RECORD_PATTERNS: Record<string, string[]> = {
  Encounter: ["(p)-[:HAS_ENCOUNTER]->(n:Encounter)"],
  Condition: [
    "(p)-[:HAS_CONDITION]->(n:Condition)",
    `${VIA_ENCOUNTER}-[:HAS_CONDITION]->(n:Condition)`,
  ],
  Observation: [
    "(p)-[:HAS_OBSERVATION]->(n:Observation)",
    `${VIA_ENCOUNTER}-[:HAS_OBSERVATION]->(n:Observation)`,
  ],
  Procedure: [
    "(p)-[:HAS_PROCEDURE]->(n:Procedure)",
    `${VIA_ENCOUNTER}-[:HAS_PROCEDURE]->(n:Procedure)`,
  ],
  MedicationRequest: [
    "(p)-[:HAS_MEDICATION_REQUEST|HAS_MEDICATION]->(n:MedicationRequest)",
    `${VIA_ENCOUNTER}-[:HAS_MEDICATION_REQUEST]->(n:MedicationRequest)`,
  ],
  DiagnosticReport: ["(p)-[:HAS_DIAGNOSTIC_REPORT]->(n:DiagnosticReport)"],
  Immunization: ["(p)-[:HAS_IMMUNIZATION]->(n:Immunization)"],
  MedicationStatement: [
    "(p)-[:HAS_MEDICATION_STATEMENT]->(n:MedicationStatement)",
  ],
};

const PATIENT_WHERE =
  "WHERE p.fhirId = $id OR p.id = $id OR p.resourceId = $id";

/**
 * A patient in the shape scripts/load_fhir_neo4j.py writes from a Synthea
 * bundle (`system`, the value as a string, `performedStart`), which the local
 * seeds do not hold. Fictional, written here.
 */
const LOADER_SHAPED: GraphRows["patients"][number] = {
  patient: {
    id: "loader-pat-0001",
    name: "Lena Hoffmann",
    birthDate: "1984-07-21",
    gender: "female",
    deceased: false,
    city: "Potsdam",
    state: "Brandenburg",
  },
  records: [
    {
      type: "Encounter",
      properties: {
        id: "loader-enc-0001",
        name: "Encounter 2019-04-02",
        date: "2019-04-02T10:00:00+02:00",
        class: "AMB",
        type: "General examination of patient (procedure)",
        status: "finished",
      },
    },
    {
      type: "Condition",
      properties: {
        id: "loader-cond-0001",
        name: "Acute viral pharyngitis (disorder)",
        onsetDate: "2019-04-02T10:00:00+02:00",
        code: "195662009",
        display: "Acute viral pharyngitis (disorder)",
        system: "http://snomed.info/sct",
        status: "resolved",
      },
    },
    {
      type: "Observation",
      properties: {
        id: "loader-obs-0001",
        name: "Body Weight",
        dateTime: "2019-04-02T10:00:00+02:00",
        code: "29463-7",
        display: "Body Weight",
        system: "http://loinc.org",
        value: "61.4",
        unit: "kg",
        category: "vital-signs",
      },
    },
    {
      type: "Observation",
      properties: {
        id: "loader-obs-0002",
        name: "Hemoglobin [Mass/volume] in Blood",
        dateTime: "2019-04-02T10:00:00+02:00",
        code: "718-7",
        display: "Hemoglobin [Mass/volume] in Blood",
        system: "http://loinc.org",
        value: "13.6",
        unit: "g/dL",
        category: "laboratory",
      },
    },
    {
      type: "MedicationRequest",
      properties: {
        id: "loader-med-0001",
        name: "Amoxicillin 250 MG Oral Capsule",
        date: "2019-04-02T10:00:00+02:00",
        code: "308182",
        display: "Amoxicillin 250 MG Oral Capsule",
        system: "http://www.nlm.nih.gov/research/umls/rxnorm",
        status: "stopped",
        intent: "order",
      },
    },
    {
      type: "Procedure",
      properties: {
        id: "loader-proc-0001",
        name: "Throat culture (procedure)",
        performedStart: "2019-04-02T10:00:00+02:00",
        performedEnd: "2019-04-02T10:15:00+02:00",
        code: "117015009",
        display: "Throat culture (procedure)",
        system: "http://snomed.info/sct",
        status: "completed",
      },
    },
  ],
};

/**
 * A record with as little as a node can hold: no name, no dates, no units,
 * no prescriber, status words outside the R4 value sets. The mapper fills a
 * required element with a data-absent reason, never a guess, and this is the
 * row that shows those resources validate too. Written here.
 */
const SPARSE: GraphRows["patients"][number] = {
  patient: { id: "sparse-pat-0001" },
  records: [
    {
      type: "Encounter",
      properties: { id: "sparse-enc-0001", status: "done", class: "phone" },
    },
    { type: "Condition", properties: { id: "sparse-cond-0001" } },
    {
      type: "Observation",
      properties: {
        id: "sparse-obs-0001",
        code: "2345-7",
        category: "laboratory",
        value: 98,
      },
    },
    {
      type: "Observation",
      properties: { id: "sparse-obs-0002", code: "39156-5", value: 27.1 },
    },
    {
      type: "Observation",
      properties: { id: "sparse-obs-0003", code: "55284-4" },
    },
    {
      type: "MedicationRequest",
      properties: { id: "sparse-med-0001", display: "Ibuprofen 400 mg" },
    },
    {
      type: "Procedure",
      properties: { id: "sparse-proc-0001", display: "Wound dressing" },
    },
    { type: "DiagnosticReport", properties: { id: "sparse-dr-0001" } },
    {
      type: "Immunization",
      properties: {
        id: "sparse-imm-0001",
        vaccineCode: "208",
        codeSystem: "http://hl7.org/fhir/sid/cvx",
      },
    },
    {
      type: "MedicationStatement",
      properties: { id: "sparse-ms-0001", display: "Colecalciferol" },
    },
  ],
};

/** A driver value as JSON: integers as numbers, temporals as ISO 8601. */
function plain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(plain);
  if (neo4j.isInt(v)) return (v as { toNumber(): number }).toNumber();
  if (v && typeof v === "object" && v.toString !== Object.prototype.toString) {
    return String(v);
  }
  return v;
}

function plainProps(props: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(props)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, plain(v)]),
  );
}

const idOf = (p: Record<string, unknown>) =>
  String(p.fhirId ?? p.id ?? p.resourceId ?? "");

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI ?? "bolt://localhost:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "healthdataspace",
    ),
  );
  const session = driver.session({
    database: "neo4j",
    defaultAccessMode: neo4j.session.READ,
  });
  const rows: GraphRows = {
    $comment:
      "Graph rows of fictional and synthetic patients, read by services/neo4j-proxy/scripts/export-fhir-facade-samples.ts; facade-sample.json is what the facade's mapper makes of them. The last two patients are written by hand: one in the shape scripts/load_fhir_neo4j.py writes, one as sparse as a node can be.",
    patients: [],
  };
  try {
    for (const id of PATIENTS) {
      const found = await session.executeRead((tx) =>
        tx.run(`MATCH (p:Patient) ${PATIENT_WHERE} RETURN p LIMIT 1`, { id }),
      );
      const node = found.records[0]?.get("p");
      if (!node) throw new Error(`patient ${id} is not in the graph`);
      if ((node.labels as string[]).includes("OptedOut")) {
        throw new Error(`patient ${id} opted out; the facade never serves it`);
      }
      const records: GraphRows["patients"][number]["records"] = [];
      for (const [type, patterns] of Object.entries(RECORD_PATTERNS)) {
        const byId = new Map<string, Record<string, unknown>>();
        for (const pattern of patterns) {
          const result = await session.executeRead((tx) =>
            tx.run(
              `MATCH (p:Patient) ${PATIENT_WHERE} MATCH ${pattern} RETURN n`,
              { id },
            ),
          );
          for (const r of result.records) {
            const n = r.get("n");
            if ((n.labels as string[]).includes("OptedOut")) continue;
            const props = plainProps(n.properties);
            byId.set(idOf(props), props);
          }
        }
        const nodes = [...byId.values()].sort((a, b) =>
          idOf(a).localeCompare(idOf(b)),
        );
        const kept = new Map<string, number>();
        for (const props of nodes) {
          const byCode = type === "Observation" && props.category == null;
          const group =
            type !== "Observation"
              ? ""
              : byCode
                ? `code:${String(props.code)}`
                : String(props.category);
          const n = kept.get(group) ?? 0;
          if (n >= (byCode ? 1 : PER_TYPE)) continue;
          kept.set(group, n + 1);
          records.push({ type, properties: props });
        }
      }
      rows.patients.push({ patient: plainProps(node.properties), records });
    }
  } finally {
    await session.close();
    await driver.close();
  }
  rows.patients.push(LOADER_SHAPED, SPARSE);

  writeFileSync(
    join(OUT, "facade", "graph-rows.json"),
    sampleText(rows),
    "utf8",
  );
  writeFileSync(
    join(OUT, "facade-sample.json"),
    sampleText(facadeSample(rows)),
    "utf8",
  );
  const n = rows.patients.reduce((s, p) => s + 1 + p.records.length, 0);
  console.log(`wrote ${n} resources of ${rows.patients.length} patients`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
