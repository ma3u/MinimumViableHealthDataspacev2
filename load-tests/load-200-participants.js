// load-tests/load-200-participants.js
// Simulates 200 dataspace participants with realistic mixed workload:
//   40% catalog browsing, 30% OMOP analytics, 20% patient lookup, 10% graph view
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { BASE_PROXY, BASE_UI, THRESHOLDS } from "./config.js";

export const options = {
  scenarios: {
    participants: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 }, // warm up
        { duration: "60s", target: 50 }, // ramp
        { duration: "120s", target: 200 }, // target: 200 participants
        { duration: "60s", target: 200 }, // sustain
        { duration: "30s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    ...THRESHOLDS,
    "http_req_duration{endpoint:catalog}": ["p(95)<1500"],
    "http_req_duration{endpoint:omop}": ["p(95)<3000"],
    "http_req_duration{endpoint:patient}": ["p(95)<2000"],
    "http_req_duration{endpoint:graph}": ["p(95)<5000"],
  },
};

// Custom metrics
const catalogErrors = new Counter("catalog_errors");
const omopErrors = new Counter("omop_errors");
const patientErrors = new Counter("patient_errors");
const graphErrors = new Counter("graph_errors");
const successRate = new Rate("success_rate");

// Realistic patient IDs (small subset to simulate cache-friendly access)
const PATIENT_IDS = ["1", "2", "3", "5", "10", "15", "20", "25"];
const COHORT_GROUPS = ["gender", "ageDecade", "concept"];

export default function () {
  const roll = Math.random();

  if (roll < 0.4) {
    // 40% — Catalog browsing (DATA_USER discovering datasets)
    group("catalog", () => {
      const res = http.get(`${BASE_PROXY}/catalog/datasets`, {
        tags: { endpoint: "catalog" },
      });
      const ok = check(res, {
        "catalog 200": (r) => r.status === 200,
        "catalog has @type": (r) => r.body && r.body.includes("dcat:Catalog"),
        "catalog <2s": (r) => r.timings.duration < 2000,
      });
      successRate.add(ok);
      if (!ok) catalogErrors.add(1);
    });
  } else if (roll < 0.7) {
    // 30% — OMOP analytics (research query)
    group("omop", () => {
      const groupBy =
        COHORT_GROUPS[Math.floor(Math.random() * COHORT_GROUPS.length)];
      const res = http.post(
        `${BASE_PROXY}/omop/cohort`,
        JSON.stringify({ groupBy }),
        {
          headers: { "Content-Type": "application/json" },
          tags: { endpoint: "omop" },
        },
      );
      const ok = check(res, {
        "omop 200": (r) => r.status === 200,
        "omop has data": (r) => r.body && r.body.length > 10,
        "omop <4s": (r) => r.timings.duration < 4000,
      });
      successRate.add(ok);
      if (!ok) omopErrors.add(1);
    });
  } else if (roll < 0.9) {
    // 20% — Patient lookup (clinical staff)
    group("patient", () => {
      const res = http.get(`${BASE_UI}/api/patient`, {
        tags: { endpoint: "patient" },
      });
      const ok = check(res, {
        "patient 200": (r) => r.status === 200,
        "patient <3s": (r) => r.timings.duration < 3000,
      });
      successRate.add(ok);
      if (!ok) patientErrors.add(1);
    });
  } else {
    // 10% — Graph visualization (admin / architect)
    group("graph", () => {
      const res = http.get(`${BASE_UI}/api/graph`, {
        tags: { endpoint: "graph" },
      });
      const ok = check(res, {
        "graph 200": (r) => r.status === 200,
        "graph <6s": (r) => r.timings.duration < 6000,
      });
      successRate.add(ok);
      if (!ok) graphErrors.add(1);
    });
  }

  // Realistic think time: 1-3s between participant actions
  sleep(1 + Math.random() * 2);
}
