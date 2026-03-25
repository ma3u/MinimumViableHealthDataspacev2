// load-tests/config.js
// Shared configuration for all k6 load test scenarios

export const BASE_PROXY = "http://localhost:9090";
export const BASE_UI = "http://localhost:3000";

// Thresholds aligned with WAF Performance Efficiency pillar
export const THRESHOLDS = {
  http_req_failed: [{ threshold: "rate<0.01", abortOnFail: false }], // <1% errors
  http_req_duration: [
    { threshold: "p(50)<500", abortOnFail: false }, // median <500ms
    { threshold: "p(95)<2000", abortOnFail: false }, // p95 <2s
    { threshold: "p(99)<5000", abortOnFail: false }, // p99 <5s
  ],
};

// Scenario: 200 dataspace participants issuing ~1 req/5s each = 40 RPS sustained
export const SCENARIOS = {
  smoke: {
    executor: "constant-vus",
    vus: 1,
    duration: "30s",
    tags: { scenario: "smoke" },
  },
  load_200_participants: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "30s", target: 10 }, // ramp up
      { duration: "60s", target: 50 }, // warm up
      { duration: "120s", target: 200 }, // 200 concurrent participants
      { duration: "60s", target: 200 }, // sustain
      { duration: "30s", target: 0 }, // ramp down
    ],
    tags: { scenario: "load_200" },
  },
  stress: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "30s", target: 50 },
      { duration: "60s", target: 200 },
      { duration: "60s", target: 400 }, // 2x expected peak
      { duration: "30s", target: 0 },
    ],
    tags: { scenario: "stress" },
  },
  spike: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "10s", target: 10 },
      { duration: "5s", target: 500 }, // sudden spike
      { duration: "30s", target: 500 },
      { duration: "10s", target: 10 },
    ],
    tags: { scenario: "spike" },
  },
};
