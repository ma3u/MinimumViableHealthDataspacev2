// load-tests/neo4j-endurance.js
// Endurance / soak test: 50 VUs for 10 minutes to detect memory leaks or Neo4j connection pool exhaustion
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_PROXY, BASE_UI } from "./config.js";

export const options = {
  scenarios: {
    endurance: {
      executor: "constant-vus",
      vus: 50,
      duration: "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
  },
};

const SEQUENCE = [
  { method: "GET", url: `${BASE_PROXY}/health`, tag: "health" },
  { method: "GET", url: `${BASE_PROXY}/catalog/datasets`, tag: "catalog" },
  {
    method: "POST",
    url: `${BASE_PROXY}/omop/cohort`,
    tag: "omop",
    body: '{"groupBy":"gender"}',
    ct: "application/json",
  },
  { method: "GET", url: `${BASE_UI}/api/analytics`, tag: "analytics" },
  { method: "GET", url: `${BASE_UI}/api/patient`, tag: "patient" },
];

export default function () {
  for (const step of SEQUENCE) {
    const params = step.ct
      ? { headers: { "Content-Type": step.ct }, tags: { endpoint: step.tag } }
      : { tags: { endpoint: step.tag } };

    const res =
      step.method === "POST"
        ? http.post(step.url, step.body, params)
        : http.get(step.url, params);

    check(res, {
      [`${step.tag} 2xx`]: (r) => r.status >= 200 && r.status < 300,
      [`${step.tag} <5s`]: (r) => r.timings.duration < 5000,
    });
    sleep(1);
  }
  sleep(2);
}
