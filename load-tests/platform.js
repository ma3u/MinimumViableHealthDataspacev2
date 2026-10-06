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

/**
 * The persona of this VU, by weight, stable for the VU's lifetime. VUs are
 * spread over the slots by a stride coprime to the total, so any number of
 * VUs gets the mix: with `vu % total`, VUs 1 to 50 were all patients and
 * researchers, and the clinic, regulator and admin journeys never ran
 * below 60 users.
 */
const PERSONA_STRIDE = 37;
function personaFor(vu) {
  const total = PERSONA_MIX.reduce((n, [, w]) => n + w, 0);
  let slot = ((vu - 1) * PERSONA_STRIDE) % total;
  for (const [persona, weight] of PERSONA_MIX) {
    if (slot < weight) return persona;
    slot -= weight;
  }
  return PERSONA_MIX[0][0];
}

/** One step of a journey: a page or an API the persona opens. */
const page = (path) => ({ kind: "page", method: "GET", path });
const api = (path, expect = [200]) => ({
  kind: "api",
  method: "GET",
  path,
  expect,
});
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
    // The compliance page asks for the trust centres, and the route admits
    // only TRUST_CENTER_OPERATOR and EDC_ADMIN, so a regulator gets 403 and
    // the page shows an empty section (#519, found by this suite). Expected
    // here until that is decided, so it does not read as a capacity failure.
    api("/api/trust-center", [200, 403]),
  ],
  edcadmin: [
    page("/admin"),
    api("/api/participants"),
    api("/api/credentials"),
    api("/api/overview"),
  ],
};

// ---------------------------------------------------------------------------
// The data user's contract journey (#571)
// ---------------------------------------------------------------------------
//
// Browsing alone writes nothing to the contract and transfer chain, so the
// EHDS audit trail and the EDC dashboards stayed empty under load. This is
// the DSP flow the negotiate and transfer pages run: PharmaCo (data user)
// reads AlphaKlinik's catalogue, negotiates an offer and transfers under its
// data permit; one time in four it also asks for a dataset no permit covers,
// which the hub refuses (Regulation (EU) 2025/327, Art. 61(1)).
//
// Every record it writes carries the run's id (X-Load-Test), so an auditor
// can tell it from real use. Where the connector cannot serve the catalogue
// (on Azure today, #25) the hub falls back to its demo offers; the records
// then say demo, and the flow and its audit writes are the same.

const CONSUMER = "pharmaco";
const PROVIDER = "alpha-klinik";
const DSP_ADDRESS = "http://controlplane:8082/api/dsp";
/** A dataset no permit names: the transfer the access body's rule refuses. */
const UNPERMITTED_DATASET = "dataset:load-test-no-permit";

/** This VU's participant contexts, looked up once (each VU has its own copy). */
let contexts = null;

function participantContexts(persona) {
  if (contexts) return contexts;
  const res = request(BASE_URL, persona, api("/api/participants"));
  let list = [];
  try {
    const body = res.json();
    list = Array.isArray(body) ? body : body.participants || [];
  } catch (_err) {
    return null;
  }
  const find = (slug) =>
    list.find((p) =>
      String(p.identity || p.participantId || "").includes(slug),
    );
  const consumer = find(CONSUMER);
  const provider = find(PROVIDER);
  if (!consumer || !provider) return null;
  contexts = {
    consumer: consumer["@id"],
    provider: provider["@id"],
    providerDid: provider.identity || provider.participantId,
  };
  return contexts;
}

function firstOffer(catalog) {
  let datasets = catalog.dataset || catalog["dcat:dataset"] || [];
  if (!Array.isArray(datasets)) datasets = [datasets];
  for (const ds of datasets) {
    let policies = ds.hasPolicy || ds["odrl:hasPolicy"] || [];
    if (!Array.isArray(policies)) policies = [policies];
    const offer = policies.find((p) => p && p["@id"]);
    if (ds["@id"] && offer)
      return { assetId: ds["@id"], offerId: offer["@id"] };
  }
  return null;
}

/** Catalogue, contract, transfer, and now and then a refused transfer. */
function contractJourney(persona) {
  const ctx = participantContexts(persona);
  if (!ctx) return;
  const think = () => sleep(1 + Math.random() * 2);

  const query = `participantId=${
    ctx.consumer
  }&catalog=true&providerDid=${encodeURIComponent(ctx.providerDid)}`;
  const catalog = request(BASE_URL, persona, {
    ...api(`/api/negotiations?${query}`),
    name: "GET /api/negotiations (catalogue)",
  });
  let offer = null;
  try {
    offer = firstOffer(catalog.json());
  } catch (_err) {
    offer = null;
  }
  if (!offer) return;
  think();

  const negotiation = request(BASE_URL, persona, {
    kind: "api",
    method: "POST",
    path: "/api/negotiations",
    expect: [201],
    body: {
      participantId: ctx.consumer,
      assetId: offer.assetId,
      counterPartyAddress: DSP_ADDRESS,
      counterPartyId: ctx.provider,
      providerDid: ctx.providerDid,
      offerId: offer.offerId,
    },
  });
  let agreement = null;
  try {
    agreement = negotiation.json().contractAgreementId || null;
  } catch (_err) {
    agreement = null;
  }
  think();

  // A live negotiation has no agreement yet when the POST answers (the
  // connector agrees later, and reports it to the chain itself), so the
  // transfer runs only on an agreement the answer names: a demo one today.
  if (agreement) {
    const transfer = {
      kind: "api",
      method: "POST",
      path: "/api/transfers",
      expect: [201],
      body: {
        participantId: ctx.consumer,
        contractId: agreement,
        assetId: offer.assetId,
        counterPartyAddress: DSP_ADDRESS,
      },
    };
    request(BASE_URL, persona, transfer);
    think();
    if (__ITER % 4 === 0) {
      request(BASE_URL, persona, {
        ...transfer,
        name: "POST /api/transfers (no permit)",
        expect: [403],
        body: { ...transfer.body, datasetId: UNPERMITTED_DATASET },
      });
      think();
    }
  }
  request(BASE_URL, persona, {
    ...api(`/api/transfers?participantId=${ctx.consumer}`),
    name: "GET /api/transfers",
  });
}

function headersFor(persona, step) {
  // One of the persona's forged users, fixed per VU: the proxy's rate limit
  // counts per user, so 50 VUs are 50 people (#519).
  const users = SESSIONS[persona];
  if (!users || users.length === 0)
    throw new Error(`no session for persona ${persona}`);
  const session = users[__VU % users.length];
  const headers = {
    Cookie: `${session.cookieName}=${session.cookieValue}`,
    "X-Load-Test": TESTID,
    Accept: step.kind === "page" ? "text/html" : "application/json",
  };
  if (step.method === "POST") headers["Content-Type"] = "application/json";
  return headers;
}

function request(base, persona, step) {
  const expect = step.expect || [200];
  const params = {
    headers: headersFor(persona, step),
    // `name` is the route; a step whose path carries ids or a query names
    // itself, so the dashboard keeps one series per endpoint.
    tags: {
      name: step.name || `${step.method} ${step.path}`,
      kind: step.kind,
      persona,
    },
    responseCallback: http.expectedStatuses(...expect),
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
      [`${step.kind} answers as expected`]: (r) => expect.includes(r.status),
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

/**
 * The persona mix, each VU walking its persona's journey with think time.
 * A researcher negotiates and transfers every third visit, not every one: a
 * data user reads far more than they contract.
 */
export function browse() {
  const persona = personaFor(__VU);
  for (const step of JOURNEYS[persona]) {
    request(BASE_URL, persona, step);
    sleep(1 + Math.random() * 2);
  }
  if (persona === "researcher" && __ITER % 3 === 0) contractJourney(persona);
}

/** The contract journey alone, to try it or to load the audit writes. */
export function contracts() {
  contractJourney("researcher");
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
    "Content-Type": "application/json",
  };
  // /omop/cohort is a POST with the grouping in the body; a GET is a 404.
  const calls = [
    ["GET", "/catalog/datasets", null],
    ["GET", "/fhir/Patient", null],
    ["POST", "/omop/cohort", { groupBy: "concept", limit: 20 }],
  ];
  for (const [method, path, body] of calls) {
    const name = `${method} proxy ${path}`;
    const res = http.request(
      method,
      `${PROXY_URL}${path}`,
      body ? JSON.stringify(body) : null,
      { headers, tags: { name, kind: "api", persona: "proxy" } },
    );
    if (res.status === 429) rateLimited.add(1, { name });
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
