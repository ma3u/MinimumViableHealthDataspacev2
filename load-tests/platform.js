// load-tests/platform.js
// The platform as its users see it (#519): each virtual user is one persona
// with a forged session, browsing the pages and APIs that persona uses. Every
// request carries X-Load-Test, so the proxy's log lines of this run can be
// found later (`load_test` in Loki or Log Analytics), and every metric is
// tagged with the same id (`testid`).
//
//   SCENARIO=smoke k6 run load-tests/platform.js        (see config.js)
//
// Pages and APIs are tagged `kind` (page, api, nlq) and `name` (the route,
// never a URL with ids), so the dashboard shows the website's and the API's
// response time apart, and the slowest endpoint by name.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";
import {
  BASE_URL,
  PROXY_URL,
  TESTID,
  SCENARIOS,
  PERSONA_MIX,
  SLO_MS,
  thresholds,
  loadSessions,
} from "./config.js";
import { signin } from "./signin.js";

const SCENARIO = __ENV.SCENARIO || "smoke";
if (!SCENARIOS[SCENARIO]) {
  throw new Error(
    `unknown SCENARIO '${SCENARIO}'; one of ${Object.keys(SCENARIOS).join(
      ", ",
    )}`,
  );
}
if (SCENARIO === "proxy" && !PROXY_URL) {
  throw new Error(
    "SCENARIO=proxy needs PROXY_URL (the proxy is internal on Azure)",
  );
}

export const options = {
  scenarios: { [SCENARIO]: SCENARIOS[SCENARIO] },
  thresholds: thresholds(SCENARIO),
  tags: { testid: TESTID },
  // Pages and the Keycloak flow redirect; the API does not.
  maxRedirects: 10,
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max"],
};

/** 429s, so the rate-limit bottleneck (#519 hypothesis 1) has its own number. */
export const rateLimited = new Counter("rate_limited");

const SESSIONS = SCENARIO === "signin" ? {} : loadSessions();

// ---------------------------------------------------------------------------
// Personas and what each one does
// ---------------------------------------------------------------------------

/** The persona of this VU, by weight, stable for the VU's lifetime. */
function personaFor(vu) {
  const total = PERSONA_MIX.reduce((n, [, w]) => n + w, 0);
  let slot = vu % total;
  for (const [persona, weight] of PERSONA_MIX) {
    if (slot < weight) return persona;
    slot -= weight;
  }
  return PERSONA_MIX[0][0];
}

/** One step of a journey: a page or an API the persona opens. */
const page = (path) => ({ kind: "page", method: "GET", path });
const api = (path) => ({ kind: "api", method: "GET", path });
const ask = (question) => ({
  kind: "nlq",
  method: "POST",
  path: "/api/nlq",
  body: { question },
});

const JOURNEYS = {
  patient1: [
    page("/patient/profile"),
    api("/api/patient/profile"),
    api("/api/patient/insights"),
    page("/patient/research"),
    api("/api/patient/research"),
  ],
  researcher: [
    page("/catalog"),
    api("/api/catalog"),
    page("/analytics"),
    api("/api/analytics"),
    page("/query"),
    ask("How many patients have diabetes?"),
    api("/api/tasks"),
  ],
  clinicuser: [
    page("/catalog"),
    api("/api/catalog"),
    page("/graph"),
    api("/api/graph"),
    page("/data/share"),
  ],
  regulator: [
    page("/compliance"),
    api("/api/compliance"),
    page("/permits"),
    api("/api/trust-center"),
  ],
  edcadmin: [
    page("/admin"),
    api("/api/participants"),
    api("/api/credentials"),
    api("/api/overview"),
  ],
};

function headersFor(persona, step) {
  const session = SESSIONS[persona];
  if (!session) throw new Error(`no session for persona ${persona}`);
  const headers = {
    Cookie: `${session.cookieName}=${session.cookieValue}`,
    "X-Load-Test": TESTID,
    Accept: step.kind === "page" ? "text/html" : "application/json",
  };
  if (step.method === "POST") headers["Content-Type"] = "application/json";
  return headers;
}

function request(base, persona, step) {
  const params = {
    headers: headersFor(persona, step),
    tags: { name: `${step.method} ${step.path}`, kind: step.kind, persona },
  };
  const url = `${base}${step.path}`;
  const res =
    step.method === "POST"
      ? http.post(url, JSON.stringify(step.body), params)
      : http.get(url, params);
  if (res.status === 429) rateLimited.add(1, { name: params.tags.name });
  check(
    res,
    {
      [`${step.kind} answers 200`]: (r) => r.status === 200,
      [`${step.kind} under ${SLO_MS[step.kind]} ms`]: (r) =>
        r.timings.duration < SLO_MS[step.kind],
    },
    { kind: step.kind },
  );
  return res;
}

// ---------------------------------------------------------------------------
// Scenario functions
// ---------------------------------------------------------------------------

/** The persona mix, each VU walking its persona's journey with think time. */
export function browse() {
  const persona = personaFor(__VU);
  for (const step of JOURNEYS[persona]) {
    request(BASE_URL, persona, step);
    sleep(1 + Math.random() * 2);
  }
}

/** Audited queries only, as fast as the hub answers them. */
export function nlq() {
  const questions = [
    "How many patients have diabetes?",
    "How many patients have hypertension?",
    "How many patients have asthma?",
  ];
  request(BASE_URL, "researcher", ask(questions[__ITER % questions.length]));
  sleep(0.2);
}

/** The proxy without the UI in front, from inside the network. */
export function proxyDirect() {
  const headers = {
    "X-Participant": "did:web:pharmaco.de:research",
    "X-Load-Test": TESTID,
  };
  for (const path of ["/catalog/datasets", "/fhir/Patient", "/omop/cohort"]) {
    const res = http.get(`${PROXY_URL}${path}`, {
      headers,
      tags: { name: `GET proxy ${path}`, kind: "api", persona: "proxy" },
    });
    if (res.status === 429) rateLimited.add(1, { name: `GET proxy ${path}` });
    check(
      res,
      { "proxy answers 200": (r) => r.status === 200 },
      { kind: "api" },
    );
    sleep(0.5);
  }
}

export { signin };

// ---------------------------------------------------------------------------
// The summary: on screen, and as JSON for the report
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const out = {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
  if (__ENV.SUMMARY_PATH)
    out[__ENV.SUMMARY_PATH] = JSON.stringify(data, null, 2);
  return out;
}
