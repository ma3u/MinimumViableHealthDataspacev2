// load-tests/stress.js
// Stress test: push to 400 VUs (2× production load) to find the breaking point
// Measures: at what VU count does error rate exceed 1%? What is max stable RPS?
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_PROXY, BASE_UI } from "./config.js";

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "60s", target: 200 },
        { duration: "60s", target: 400 }, // 2× design capacity
        { duration: "60s", target: 600 }, // 3× — stress ceiling
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    // Intentionally loose — we WANT to see where it breaks
    http_req_failed: ["rate<0.20"], // alert at 20% failures
    http_req_duration: ["p(99)<10000"],
  },
};

// Track Neo4j bottleneck separately
const neo4jTrend = new Trend("neo4j_query_duration");

const WRITE_ENDPOINTS = [
  // Read-only endpoints that exercise different code paths
  { url: `${BASE_PROXY}/health`, label: "proxy-health", weight: 10 },
  { url: `${BASE_PROXY}/catalog/datasets`, label: "catalog", weight: 40 },
  { url: `${BASE_UI}/api/catalog`, label: "ui-catalog", weight: 25 },
  { url: `${BASE_UI}/api/patient`, label: "ui-patient", weight: 15 },
  { url: `${BASE_UI}/api/analytics`, label: "ui-analytics", weight: 10 },
];

// Weighted random selection
function pickEndpoint() {
  const total = WRITE_ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let rand = Math.random() * total;
  for (const ep of WRITE_ENDPOINTS) {
    rand -= ep.weight;
    if (rand <= 0) return ep;
  }
  return WRITE_ENDPOINTS[0];
}

export default function () {
  const ep = pickEndpoint();
  const res = http.get(ep.url, { tags: { endpoint: ep.label } });

  if (ep.label.startsWith("proxy") || ep.label === "catalog") {
    neo4jTrend.add(res.timings.duration);
  }

  check(res, {
    [`${ep.label} not 5xx`]: (r) => r.status < 500,
    [`${ep.label} <10s`]: (r) => r.timings.duration < 10000,
  });

  sleep(0.5 + Math.random() * 0.5);
}
