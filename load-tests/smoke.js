// load-tests/smoke.js
// Quick sanity check: 1 VU, 30s — all endpoints must return 2xx
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_PROXY, BASE_UI } from "./config.js";

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<3000"],
  },
};

const ENDPOINTS = [
  { method: "GET", url: `${BASE_PROXY}/health`, label: "proxy-health" },
  { method: "GET", url: `${BASE_PROXY}/catalog/datasets`, label: "catalog" },
  {
    method: "POST",
    url: `${BASE_PROXY}/omop/cohort`,
    label: "omop-cohort",
    body: JSON.stringify({ groupBy: "gender" }),
    headers: { "Content-Type": "application/json" },
  },
  { method: "GET", url: `${BASE_UI}/api/catalog`, label: "ui-catalog" },
  { method: "GET", url: `${BASE_UI}/api/patient`, label: "ui-patient" },
  { method: "GET", url: `${BASE_UI}/api/analytics`, label: "ui-analytics" },
  { method: "GET", url: `${BASE_UI}/api/graph`, label: "ui-graph" },
];

export default function () {
  for (const ep of ENDPOINTS) {
    const params = ep.headers ? { headers: ep.headers } : {};
    const res =
      ep.method === "POST"
        ? http.post(ep.url, ep.body, params)
        : http.get(ep.url, params);

    check(res, {
      [`${ep.label} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
      [`${ep.label} response <3s`]: (r) => r.timings.duration < 3000,
    });
    sleep(0.5);
  }
}
