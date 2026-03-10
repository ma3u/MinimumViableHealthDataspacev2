export async function fetchApi(
  endpoint: string,
  init?: RequestInit,
): Promise<Response> {
  const isStatic = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const basePath = isStatic ? "/MinimumViableHealthDataspacev2" : "";

  if (isStatic) {
    let mockPath = endpoint;
    if (endpoint === "/api/catalog") mockPath = "/mock/catalog.json";
    else if (endpoint === "/api/graph") mockPath = "/mock/graph.json";
    else if (endpoint === "/api/compliance") mockPath = "/mock/compliance.json";
    else if (endpoint.startsWith("/api/compliance?"))
      mockPath = "/mock/compliance_check.json";
    else if (endpoint === "/api/patient") mockPath = "/mock/patient.json";
    else if (endpoint.startsWith("/api/patient?"))
      mockPath = "/mock/patient_default.json";
    else if (endpoint === "/api/analytics") mockPath = "/mock/analytics.json";
    else if (endpoint === "/api/eehrxf") mockPath = "/mock/eehrxf.json";
    else if (endpoint === "/api/nlq") mockPath = "/mock/nlq_templates.json";
    else if (endpoint === "/api/federated")
      mockPath = "/mock/federated_stats.json";

    // Simulate small latency to make it feel natural
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fetch(basePath + mockPath, init);
  }

  return fetch(endpoint, init);
}
