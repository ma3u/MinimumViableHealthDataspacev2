// load-tests/config.js
// Shared configuration for the k6 scenarios (#519). Everything that differs
// between the compose stack and https://ehds.mabu.red comes from the
// environment; run.sh sets it.

export const BASE_URL = (__ENV.BASE_URL || "http://localhost:3003").replace(
  /\/$/,
  "",
);
/** The proxy, reachable only on the compose stack (internal on Azure). */
export const PROXY_URL = (__ENV.PROXY_URL || "").replace(/\/$/, "");
/**
 * The run's id. It tags every k6 metric (`testid`) and goes to the hub as
 * X-Load-Test, which the proxy logs as `load_test`, so the metrics and the
 * server-side log lines of one run can be read together later.
 */
export const TESTID = __ENV.TESTID || `local-${Date.now()}`;

/** Multiplies every stage duration; 0.05 turns a 15 minute run into 45 seconds. */
const TIME_SCALE = Number(__ENV.TIME_SCALE || "1");
export function scaled(duration) {
  const m = duration.match(/^(\d+)(s|m|h)$/);
  if (!m) return duration;
  const seconds = Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]] * TIME_SCALE;
  return `${Math.max(1, Math.round(seconds))}s`;
}

function stages(list) {
  return list.map(([duration, target]) => ({
    duration: scaled(duration),
    target,
  }));
}

/**
 * The scenarios of #519. One runs per k6 invocation (SCENARIO=...), so each
 * run's metrics stand alone under their testid.
 */
export const SCENARIOS = {
  // the run works at all
  smoke: {
    executor: "constant-vus",
    exec: "browse",
    vus: 1,
    duration: scaled("1m"),
  },
  // the expected demo peak
  load: {
    executor: "ramping-vus",
    exec: "browse",
    startVUs: 0,
    stages: stages([
      ["2m", 50],
      ["11m", 50],
      ["2m", 0],
    ]),
  },
  // the breaking point: the thresholds below abort the run when it is passed
  stress: {
    executor: "ramping-vus",
    exec: "browse",
    startVUs: 0,
    stages: stages([
      ["2m", 50],
      ["3m", 50],
      ["2m", 100],
      ["3m", 100],
      ["2m", 200],
      ["3m", 200],
      ["2m", 400],
      ["3m", 400],
      ["1m", 0],
    ]),
  },
  // a room full of people scanning a QR code
  spike: {
    executor: "ramping-vus",
    exec: "browse",
    startVUs: 10,
    stages: stages([
      ["10s", 200],
      ["2m", 200],
      ["30s", 10],
      ["1m", 10],
    ]),
  },
  // leaks, heap, connections, log cost
  soak: {
    executor: "constant-vus",
    exec: "browse",
    vus: 50,
    duration: scaled("2h"),
  },
  // audited queries only: the chain is written once per query (hypothesis 2)
  audited: {
    executor: "ramping-vus",
    exec: "nlq",
    startVUs: 1,
    stages: stages([
      ["1m", 1],
      ["1m", 5],
      ["1m", 10],
      ["1m", 20],
      ["30s", 0],
    ]),
  },
  // the proxy directly, from inside the network (hypothesis 1)
  proxy: {
    executor: "ramping-vus",
    exec: "proxyDirect",
    startVUs: 1,
    stages: stages([
      ["1m", 5],
      ["2m", 25],
      ["30s", 0],
    ]),
  },
  // the real Keycloak sign-in (hypotheses 4 and 6); signin.js
  signin: {
    executor: "ramping-arrival-rate",
    exec: "signin",
    startRate: 5,
    timeUnit: "1m",
    preAllocatedVUs: 10,
    maxVUs: 60,
    stages: stages([
      ["2m", 5],
      ["2m", 20],
      ["2m", 50],
      ["1m", 0],
    ]),
  },
};

/** Who is on the platform, in hundredths (#519). */
export const PERSONA_MIX = [
  ["patient1", 30],
  ["researcher", 30],
  ["clinicuser", 20],
  ["regulator", 10],
  ["edcadmin", 10],
];

/** Proposed SLOs (#519): what a check and a threshold call too slow, in ms. */
export const SLO_MS = { page: 2000, api: 1000, nlq: 3000, signin: 3000 };

/**
 * Thresholds: the run fails when they are missed. For stress, spike and soak
 * the failure rate and the API p95 also abort the run, which is how the
 * breaking point is found without finishing every stage.
 */
export function thresholds(scenario) {
  const abort = ["stress", "spike", "soak"].includes(scenario);
  const limit = (value) => ({
    threshold: value,
    abortOnFail: abort,
    delayAbortEval: scaled("1m"),
  });
  return {
    http_req_failed: [limit("rate<0.01")],
    "http_req_duration{kind:api}": [limit(`p(95)<${SLO_MS.api}`)],
    "http_req_duration{kind:page}": [`p(95)<${SLO_MS.page}`],
    "http_req_duration{kind:nlq}": [`p(95)<${SLO_MS.nlq}`],
    "http_req_duration{kind:signin}": [`p(95)<${SLO_MS.signin}`],
    checks: ["rate>0.99"],
  };
}

/** Forged NextAuth sessions, one per persona; load-tests/forge-sessions.sh writes the file. */
export function loadSessions() {
  try {
    return JSON.parse(open(__ENV.SESSIONS || "./.sessions.json"));
  } catch (err) {
    throw new Error(
      `no sessions file (${err.message}). Run load-tests/forge-sessions.sh first, or use run.sh.`,
    );
  }
}
