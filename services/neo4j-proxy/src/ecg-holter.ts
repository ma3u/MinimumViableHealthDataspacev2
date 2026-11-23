// ---------------------------------------------------------------------------
// A synthetic long-term ECG (Holter) as a paged FHIR dataset (ADR-095)
// ---------------------------------------------------------------------------
//
// Streaming wants streaming data: one 24 hour, two-lead recording of a
// fictional patient, served window by window so a data plane can read it
// from /dataspace/push-source and forward it chunk by chunk. Nothing here is
// measured from a person. The signal is computed: each beat is a sum of
// Gaussians for P, Q, R, S and T, the heart rate follows the time of day
// (about 55/min at 03:00, 95/min at 15:00), and each beat varies a little,
// from a PRNG seeded by the strip's index, so a strip is the same bytes on
// every request and no database is read.
//
// Codes, after the HL7 FHIR R4 example "observation-example-sample-data"
// (an ECG with valueSampledData), which codes waveforms in ISO/IEEE 11073-10101
// (MDC, urn:oid:2.16.840.1.113883.6.24):
//   - Observation.code: MDC 131328 MDC_ECG_ELEC_POTL, the electric potential
//     of an ECG lead, which is what the strip holds. LOINC 8601-7 "EKG
//     impression" was not used: it codes a narrative interpretation, not a
//     waveform, and nothing here is interpreted.
//   - component.code: MDC 131330 MDC_ECG_ELEC_POTL_II (lead II) and
//     131335 MDC_ECG_ELEC_POTL_V5 (lead V5), 131328 plus the lead's number in
//     MDC's ECG lead table (II = 2, V5 = 7): the two classic Holter leads.
//   - category: observation-category "procedure", as in that example.
//   - meta.tag: v3-ActReason HTEST "test health data": the record is synthetic.

/**
 * Not under /fhir: the FHIR facade is narrow by decision (#1169, #1174) and
 * its CapabilityStatement lists only what is served from the graph. This is
 * computed test data with its own paging parameters, not a FHIR search; it
 * answers FHIR R4 resources, but is not part of the FHIR API.
 */
export const ECG_DATASET_PATH = "/synthetic/ecg-holter";
export const ECG_PATIENT_ID = "holter-demo-1";
/**
 * A strip's id is its own, never derived from the Patient's: an Observation
 * id that carries the Patient's id would carry it past the pseudonymisation
 * of a push, which rewrites the Patient's id and references to it only.
 */
export const STRIP_ID_PREFIX = "holter-strip-";
/** The recording starts here; a strip's period is this plus its offset. */
export const RECORDING_START_MS = Date.parse("2026-11-01T08:00:00Z");
export const SAMPLE_RATE_HZ = 250;
/** Milliseconds between samples (valueSampledData.period). */
export const PERIOD_MS = 1000 / SAMPLE_RATE_HZ;
/** One stored integer is this many mV (valueSampledData.factor). */
export const FACTOR_MV = 0.005;

const MDC = "urn:oid:2.16.840.1.113883.6.24";
const UCUM = "http://unitsofmeasure.org";
const SYNTHETIC_TAG = {
  tag: [
    {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActReason",
      code: "HTEST",
      display: "test health data",
    },
  ],
};

export const LIMITS = {
  seconds: { min: 1, max: 600, fallback: 60 },
  durationSeconds: { min: 1, max: 86_400, fallback: 86_400 },
  stripSeconds: { min: 10, max: 60, fallback: 30 },
};

export interface HolterQuery {
  offsetSeconds: number;
  seconds: number;
  durationSeconds: number;
  stripSeconds: number;
}

/** The query, or the reason it is refused (a 400). */
export function parseHolterQuery(
  q: Record<string, unknown>,
): HolterQuery | { error: string } {
  const read = (name: string, fallback: number): number | null => {
    const v = q[name];
    if (v === undefined || v === "") return fallback;
    return typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : null;
  };
  const out: Record<string, number> = {};
  for (const [name, fallback] of [
    ["offsetSeconds", 0],
    ["seconds", LIMITS.seconds.fallback],
    ["durationSeconds", LIMITS.durationSeconds.fallback],
    ["stripSeconds", LIMITS.stripSeconds.fallback],
  ] as const) {
    const v = read(name, fallback);
    if (v === null)
      return { error: `${name} must be a whole number of seconds` };
    out[name] = v;
  }
  const query = out as unknown as HolterQuery;
  for (const name of ["seconds", "durationSeconds", "stripSeconds"] as const) {
    const { min, max } = LIMITS[name];
    if (query[name] < min || query[name] > max) {
      return { error: `${name} must be between ${min} and ${max}` };
    }
  }
  if (query.seconds < query.stripSeconds) {
    return { error: "seconds must be at least stripSeconds" };
  }
  if (query.offsetSeconds >= query.durationSeconds) {
    return { error: "offsetSeconds is past the end of the recording" };
  }
  return query;
}

/** mulberry32: small, fast and the same on every platform. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Beats per minute at `t` seconds into the recording: low at night, high in the afternoon. */
export function heartRate(t: number): number {
  const hour = (8 + t / 3600) % 24;
  return 75 + 20 * Math.cos((2 * Math.PI * (hour - 15)) / 24);
}

/** One wave of a beat: where it sits from the R peak (s), its width (s), its height in II and V5 (mV). */
const WAVES: Array<{ at: number; width: number; ii: number; v5: number }> = [
  { at: -0.2, width: 0.025, ii: 0.12, v5: 0.08 }, // P
  { at: -0.03, width: 0.01, ii: -0.1, v5: -0.08 }, // Q
  { at: 0, width: 0.012, ii: 1.1, v5: 1.6 }, // R
  { at: 0.03, width: 0.01, ii: -0.25, v5: -0.15 }, // S
  { at: 0.3, width: 0.06, ii: 0.3, v5: 0.4 }, // T
];

/**
 * The two leads of one strip as stored integers (value = integer x FACTOR_MV
 * mV). `startS` is the strip's start in the recording, `lengthS` its length.
 */
export function stripSamples(
  index: number,
  startS: number,
  lengthS: number,
): { ii: number[]; v5: number[] } {
  const rng = prng(Math.imul(index + 1, 0x9e3779b1) ^ 0x5eed1);
  const n = Math.round(lengthS * SAMPLE_RATE_HZ);
  const ii = new Float64Array(n);
  const v5 = new Float64Array(n);
  // Beats from a second before the strip, so its first samples carry the end
  // of a beat that began before it.
  let t = -1 + rng() * (60 / heartRate(startS));
  while (t < lengthS + 0.6) {
    const scale = 0.9 + 0.2 * rng();
    for (const w of WAVES) {
      const centre = t + w.at;
      const from = Math.max(
        0,
        Math.floor((centre - 4 * w.width) * SAMPLE_RATE_HZ),
      );
      const to = Math.min(
        n - 1,
        Math.ceil((centre + 4 * w.width) * SAMPLE_RATE_HZ),
      );
      for (let i = from; i <= to; i++) {
        const d = i / SAMPLE_RATE_HZ - centre;
        const g = Math.exp(-(d * d) / (2 * w.width * w.width));
        ii[i] += scale * w.ii * g;
        v5[i] += scale * w.v5 * g;
      }
    }
    const rr =
      (60 / heartRate(startS + Math.max(t, 0))) * (1 + 0.06 * (rng() - 0.5));
    t += rr;
  }
  const outII: number[] = new Array(n);
  const outV5: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Baseline wander over the whole recording, and a little noise.
    const wander =
      0.04 * Math.sin(2 * Math.PI * 0.2 * (startS + i / SAMPLE_RATE_HZ));
    outII[i] = Math.round((ii[i] + wander + (rng() - 0.5) * 0.02) / FACTOR_MV);
    outV5[i] = Math.round((v5[i] + wander + (rng() - 0.5) * 0.02) / FACTOR_MV);
  }
  return { ii: outII, v5: outV5 };
}

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

function sampled(data: number[]) {
  return {
    origin: { value: 0, unit: "mV", system: UCUM, code: "mV" },
    period: PERIOD_MS,
    factor: FACTOR_MV,
    dimensions: 1,
    data: data.join(" "),
  };
}

/** One strip as a FHIR R4 Observation. */
export function stripObservation(
  index: number,
  q: Pick<HolterQuery, "durationSeconds" | "stripSeconds">,
): Record<string, unknown> {
  const start = index * q.stripSeconds;
  const end = Math.min(start + q.stripSeconds, q.durationSeconds);
  const { ii, v5 } = stripSamples(index, start, end - start);
  const lead = (code: string, display: string, data: number[]) => ({
    code: { coding: [{ system: MDC, code, display }] },
    valueSampledData: sampled(data),
  });
  return {
    resourceType: "Observation",
    id: `${STRIP_ID_PREFIX}${index}`,
    meta: SYNTHETIC_TAG,
    status: "final",
    category: [
      {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "procedure",
            display: "Procedure",
          },
        ],
      },
    ],
    code: {
      coding: [{ system: MDC, code: "131328", display: "MDC_ECG_ELEC_POTL" }],
      text: "Synthetic Holter ECG strip",
    },
    subject: { reference: `Patient/${ECG_PATIENT_ID}` },
    effectivePeriod: {
      start: iso(RECORDING_START_MS + start * 1000),
      end: iso(RECORDING_START_MS + end * 1000),
    },
    device: { display: "Synthetic Holter recorder" },
    component: [
      lead("131330", "MDC_ECG_ELEC_POTL_II", ii),
      lead("131335", "MDC_ECG_ELEC_POTL_V5", v5),
    ],
  };
}

/** The fictional patient the recording belongs to; pseudonymised on a push like any other. */
export const HOLTER_PATIENT = {
  resourceType: "Patient",
  id: ECG_PATIENT_ID,
  meta: SYNTHETIC_TAG,
  name: [{ text: "Holter Demo" }],
  gender: "male",
  birthDate: "1961-05-23",
};

function link(q: HolterQuery, offsetSeconds: number, path: string): string {
  const p = new URLSearchParams({
    offsetSeconds: String(offsetSeconds),
    seconds: String(q.seconds),
    durationSeconds: String(q.durationSeconds),
    stripSeconds: String(q.stripSeconds),
  });
  return `${path}?${p.toString()}`;
}

/**
 * One window of the recording as a searchset: the strips that start in
 * [offsetSeconds, offsetSeconds + seconds), the Patient in the first window
 * only. `total` counts the strips of the whole recording; `next` is there
 * while more follow. The links are relative, at `path`: the path the caller
 * asked on, so a pull's links lead back through /dataspace/data and a push
 * source's through /dataspace/push-source, as the FHIR facade's do.
 */
export function holterWindow(
  q: HolterQuery,
  path: string = ECG_DATASET_PATH,
): Record<string, unknown> {
  const total = Math.ceil(q.durationSeconds / q.stripSeconds);
  const first = Math.ceil(q.offsetSeconds / q.stripSeconds);
  const end = Math.min(
    Math.ceil((q.offsetSeconds + q.seconds) / q.stripSeconds),
    total,
  );
  const entry: Array<Record<string, unknown>> = [];
  if (q.offsetSeconds === 0) {
    entry.push({
      fullUrl: `Patient/${ECG_PATIENT_ID}`,
      resource: HOLTER_PATIENT,
      search: { mode: "include" },
    });
  }
  for (let i = first; i < end; i++) {
    entry.push({
      fullUrl: `Observation/${STRIP_ID_PREFIX}${i}`,
      resource: stripObservation(i, q),
      search: { mode: "match" },
    });
  }
  const nextOffset = q.offsetSeconds + q.seconds;
  return {
    resourceType: "Bundle",
    type: "searchset",
    total,
    link: [
      { relation: "self", url: link(q, q.offsetSeconds, path) },
      ...(nextOffset < q.durationSeconds
        ? [{ relation: "next", url: link(q, nextOffset, path) }]
        : []),
    ],
    entry,
  };
}
