/**
 * No URL, query string or client address leaves the proxy in a span
 * (ADR-045 plane 1, #418). `/fhir/Patient/<id>` carries a patient id.
 */
import { describe, it, expect } from "vitest";
import { scrubSpanAttributes } from "../src/tracing.js";

describe("span attributes", () => {
  it("lose the URL and the caller, keep the route pattern", () => {
    const attributes: Record<string, string | number> = {
      "url.full":
        "http://proxy/fhir/Patient/patient-4711/$everything?name=Erika",
      "url.path": "/fhir/Patient/patient-4711/$everything",
      "url.query": "name=Erika",
      "http.target": "/fhir/Patient/patient-4711/$everything?name=Erika",
      "network.peer.address": "10.0.3.17",
      "client.address": "203.0.113.9",
      "http.route": "/fhir/Patient/:id/$everything",
      "http.response.status_code": 200,
    };
    scrubSpanAttributes(attributes);
    expect(attributes).toEqual({
      "http.route": "/fhir/Patient/:id/$everything",
      "http.response.status_code": 200,
    });
  });
});
