// load-tests/platform.js
// The platform as its users see it (#519): each virtual user is one persona
// with a forged session, browsing the pages and APIs that persona uses. Every
// request carries X-Load-Test, so the proxy's log lines of this run can be
// found later (`load_test` in Loki or Log Analytics), and every metric is
// tagged with the same id (`testid`).
//
//   SCENARIO=smoke k6 run load-tests/platform.js        (see config.js)
//
// Pages and APIs are tagged `kind` (page, api, nlq, poll) and `name` (the
// route, never a URL with ids), so the dashboard shows the website's and the
// API's response time apart, and the slowest endpoint by name. `poll` is the
// contract journey waiting for an agreement: no person waits on one of those
// answers, so they stay out of the API's p95.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
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

/** From the negotiation's POST to the poll that saw it FINALIZED, in ms. */
export const negotiationAgreed = new Trend("negotiation_agreed", true);
/** Negotiations that ended TERMINATED or were still open at the timeout. */
export const negotiationsUnagreed = new Counter("negotiations_unagreed");

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
// The provider's DSP base as the hub's control plane reaches it. It differs
// per stack: `controlplane` on compose, `mvhd-controlplane` on Azure, where the
// compose name does not resolve and every negotiation retried until it was
// terminated by hand (2026-11-11, docs/gotchas.md). The runners set it.
const DSP_ADDRESS = __ENV.DSP_ADDRESS || "http://controlplane:8082/api/dsp";
/** A dataset no permit names: the transfer the access body's rule refuses. */
const UNPERMITTED_DATASET = "dataset:load-test-no-permit";
/**
 * How long a negotiation may take to agree before it counts as failed, and
 * the waits between the polls that ask. The waits grow, so a negotiation that
 * agrees in a few seconds costs two or three polls and one that never agrees
 * costs ten in a minute, not thirty: the polls must not outnumber what the
 * person does. The negotiate page asks every 3 s for two minutes.
 */
const AGREEMENT_TIMEOUT_S = Number(__ENV.AGREEMENT_TIMEOUT_S || "60");
const POLL_WAITS_S = [1, 2, 3, 5, 8];
/** Rows per list request, the transfer page's page size (#1088). */
const LIST_PAGE_SIZE = 50;

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
    // The whole offer travels with the request, as the negotiate page sends
    // it: the provider agrees on the policy it offered, and a consumer that
    // asked for less refuses the agreement ("Policy in the contract agreement
    // is not equal to the one in the contract offer", 2026-11-11).
    if (ds["@id"] && offer)
      return { assetId: ds["@id"], offerId: offer["@id"], policy: offer };
  }
  return null;
}

/** A negotiation's field, compacted or with the EDC prefix (as the page reads it). */
function negotiationField(n, field) {
  if (!n) return "";
  return String(n[field] ?? n[`edc:${field}`] ?? "");
}

function jsonOf(res) {
  try {
    return res.json();
  } catch (_err) {
    return null;
  }
}

/**
 * Waits for the negotiation to agree, asking the hub's own route for it as
 * the negotiate page does, and returns the FINALIZED negotiation or null.
 * One that ends TERMINATED, or is still open at the timeout, is a failed
 * check: a run in which nothing agrees must not pass as a run without
 * transfers (the 2026-11-11 runs whose 170 negotiations all terminated).
 */
function awaitAgreement(persona, consumer, started) {
  const id = negotiationField(started, "@id");
  const begun = Date.now();
  // The demo path answers the POST with the agreement already in it.
  if (negotiationField(started, "contractAgreementId"))
    return settle(started, "FINALIZED", begun);
  if (!id) return settle(null, "no id in the answer", begun);

  let state = "";
  let last = null;
  for (let i = 0; ; i += 1) {
    const wait = POLL_WAITS_S[Math.min(i, POLL_WAITS_S.length - 1)];
    const left = AGREEMENT_TIMEOUT_S - (Date.now() - begun) / 1000;
    if (left <= 0) break;
    sleep(Math.min(wait, left));
    const res = request(BASE_URL, persona, {
      kind: "poll",
      method: "GET",
      path: `/api/negotiations/${encodeURIComponent(
        id,
      )}?participantId=${consumer}`,
      name: "GET /api/negotiations/:id (poll)",
    });
    last = jsonOf(res) || last;
    state = negotiationField(last, "state").toUpperCase();
    if (state === "FINALIZED" || state === "TERMINATED") break;
  }
  return settle(last, state || "no answer", begun);
}

function settle(negotiation, state, begun) {
  const agreed =
    state === "FINALIZED" &&
    !!negotiationField(negotiation, "contractAgreementId");
  check(
    negotiation,
    { [`negotiation agrees within ${AGREEMENT_TIMEOUT_S} s`]: () => agreed },
    { kind: "contract", state: state || "open" },
  );
  if (!agreed) {
    negotiationsUnagreed.add(1, { state: state || "open" });
    return null;
  }
  negotiationAgreed.add(Date.now() - begun);
  return negotiation;
}

/** Catalogue, contract, agreement, transfer, and now and then a refused transfer. */
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
  const catalogBody = jsonOf(catalog);
  const offer = catalogBody ? firstOffer(catalogBody) : null;
  if (!offer) return;
  think();

  const started = request(BASE_URL, persona, {
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
      policy: offer.policy,
    },
  });

  // A live negotiation has no agreement when the POST answers: the connectors
  // agree afterwards. The person on the negotiate page watches it finalize,
  // then opens the transfer page; this waits the same way.
  const agreed =
    started.status === 201
      ? awaitAgreement(persona, ctx.consumer, jsonOf(started))
      : null;
  think();

  if (agreed) {
    const transfer = {
      kind: "api",
      method: "POST",
      path: "/api/transfers",
      expect: [201],
      body: {
        participantId: ctx.consumer,
        contractId: negotiationField(agreed, "contractAgreementId"),
        assetId: offer.assetId,
        // The provider's endpoint as the negotiation recorded it, with its
        // context and profile; the transfer page sends the same.
        counterPartyAddress:
          negotiationField(agreed, "counterPartyAddress") || DSP_ADDRESS,
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
  // One page, as the transfer page asks for it (DEFAULT_PAGE_SIZE in
  // ui/src/lib/list-page.ts). The whole list grows with every run.
  request(BASE_URL, persona, {
    ...api(
      `/api/transfers?participantId=${ctx.consumer}&limit=${LIST_PAGE_SIZE}`,
    ),
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
  const checks = {
    [`${step.kind} answers as expected`]: (r) => expect.includes(r.status),
  };
  // A poll has no SLO: nobody waits on its answer, only on the agreement.
  if (SLO_MS[step.kind])
    checks[`${step.kind} under ${SLO_MS[step.kind]} ms`] = (r) =>
      r.timings.duration < SLO_MS[step.kind];
  check(res, checks, { kind: step.kind });
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
