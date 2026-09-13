import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLabReport } from "../src/parse-lab.js";
import { codeValues } from "../src/code-values.js";
import {
  EXT_OCR_CONFIDENCE,
  EXT_SOURCE_KIND,
  EXT_SOURCE_LINE,
  buildBundle,
  statusForSource,
} from "../src/to-fhir.js";
import type { TextSource } from "../src/types.js";

const FIXTURE = readFileSync(
  join(__dirname, "fixtures/lab-report-de.txt"),
  "utf8",
);
const NOW = "2026-09-12T00:00:00.000Z";

const digitalSource: TextSource = {
  kind: "lab-issued-digital",
  sourceDocument: "befund.pdf",
  extractor: "pdf-text-layer",
};
const ocrSource: TextSource = {
  kind: "ocr-transcribed",
  sourceDocument: "scan-1.png",
  extractor: "tesseract",
  ocrConfidence: 0.87,
};

function build(source: TextSource) {
  const { coded } = codeValues(parseLabReport(FIXTURE).values);
  return buildBundle(coded, {
    meta: {
      patientId: "self",
      effectiveDateTime: "2026-08-14",
      performer: "FS-CPC",
      title: "Kardiovaskulaeres Risikoprofil",
    },
    source,
    now: NOW,
  });
}

type Resource = Record<string, unknown> & { resourceType: string; id: string };
const resources = (bundle: ReturnType<typeof build>): Resource[] =>
  bundle.entry.map((e) => e.resource as Resource);
const ofType = (bundle: ReturnType<typeof build>, type: string) =>
  resources(bundle).filter((r) => r.resourceType === type);

describe("statusForSource", () => {
  it("only calls a value final when the lab's own characters carried it", () => {
    expect(statusForSource("lab-issued-digital")).toBe("final");
    expect(statusForSource("ocr-transcribed")).toBe("preliminary");
    expect(statusForSource("self-tracked")).toBe("preliminary");
  });
});

describe("buildBundle", () => {
  const bundle = build(digitalSource);

  it("emits a collection bundle with patient, document, report, observations and provenance", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(ofType(bundle, "Patient")).toHaveLength(1);
    expect(ofType(bundle, "DocumentReference")).toHaveLength(1);
    expect(ofType(bundle, "DiagnosticReport")).toHaveLength(1);
    expect(ofType(bundle, "Provenance")).toHaveLength(1);
    expect(ofType(bundle, "Observation").length).toBeGreaterThan(10);
  });

  it("carries no identifying data about the patient", () => {
    const [patient] = ofType(bundle, "Patient");
    expect(patient.name).toBeUndefined();
    expect(patient.birthDate).toBeUndefined();
    expect(patient.identifier).toBeUndefined();
  });

  it("codes an observation with LOINC and UCUM and keeps the printed label", () => {
    const ldl = ofType(bundle, "Observation").find(
      (o) => (o.code as { text?: string }).text === "LDL-Cholesterin",
    );
    expect(ldl).toBeDefined();
    expect(ldl?.code).toMatchObject({
      coding: [{ system: "http://loinc.org", code: "2089-1" }],
    });
    expect(ldl?.valueQuantity).toMatchObject({
      value: 141,
      system: "http://unitsofmeasure.org",
      code: "mg/dL",
    });
    expect(ldl?.referenceRange).toMatchObject([{ high: { value: 116 } }]);
  });

  it("carries a comparator onto the quantity", () => {
    const ferritin = ofType(bundle, "Observation").find(
      (o) => (o.code as { text?: string }).text === "Ferritin",
    );
    expect(ferritin?.valueQuantity).toMatchObject({
      comparator: "<",
      value: 10,
    });
  });

  it("stamps provenance and the source line on every observation", () => {
    for (const obs of ofType(bundle, "Observation")) {
      const ext = obs.extension as {
        url: string;
        valueCode?: string;
        valueString?: string;
      }[];
      const kind = ext.find((e) => e.url === EXT_SOURCE_KIND);
      const line = ext.find((e) => e.url === EXT_SOURCE_LINE);
      expect(kind?.valueCode).toBe("lab-issued-digital");
      expect(line?.valueString).toBeTruthy();
    }
  });

  it("points the provenance entity at the source document", () => {
    const [prov] = ofType(bundle, "Provenance");
    expect(prov.entity).toMatchObject([
      {
        role: "source",
        what: { reference: "DocumentReference/source-document" },
      },
    ]);
    expect((prov.target as { reference: string }[]).length).toBe(
      ofType(bundle, "Observation").length + 1,
    );
  });

  it("links every observation from the report", () => {
    const [report] = ofType(bundle, "DiagnosticReport");
    const results = report.result as { reference: string }[];
    expect(results).toHaveLength(ofType(bundle, "Observation").length);
  });

  it("is deterministic for a fixed timestamp", () => {
    expect(JSON.stringify(build(digitalSource))).toBe(JSON.stringify(bundle));
  });
});

describe("buildBundle with OCR provenance", () => {
  const bundle = build(ocrSource);

  it("marks every observation preliminary, not final", () => {
    const statuses = new Set(
      ofType(bundle, "Observation").map((o) => o.status),
    );
    expect([...statuses]).toEqual(["preliminary"]);
    expect(ofType(bundle, "DiagnosticReport")[0].status).toBe("preliminary");
  });

  it("records the OCR confidence on each observation", () => {
    const [obs] = ofType(bundle, "Observation");
    const ext = obs.extension as { url: string; valueDecimal?: number }[];
    expect(ext.find((e) => e.url === EXT_OCR_CONFIDENCE)?.valueDecimal).toBe(
      0.87,
    );
  });

  it("says in the provenance that a machine read the pixels", () => {
    const [prov] = ofType(bundle, "Provenance");
    expect((prov.activity as { text: string }).text).toMatch(/OCR/i);
  });
});
