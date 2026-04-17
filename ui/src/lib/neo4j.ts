import neo4j, { Config, Driver } from "neo4j-driver";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI ?? "bolt://localhost:7687";

    // Encryption is controlled by the URI scheme for +s / +ssc variants.
    // When the scheme is plain bolt:// or neo4j://, default to the driver's
    // implicit behaviour unless NEO4J_ENCRYPTED is explicitly set. ACA internal
    // TCP ingress is passthrough (no envoy TLS), so we want encryption OFF for
    // mvhd-neo4j.internal.* endpoints.
    const config: Config = { disableLosslessIntegers: true };
    const schemeHasTLS = /^(bolt|neo4j)\+s(sc)?:/.test(uri);
    if (!schemeHasTLS) {
      const encEnv = (process.env.NEO4J_ENCRYPTED ?? "").toLowerCase();
      if (encEnv === "false" || encEnv === "0" || encEnv === "no") {
        config.encrypted = "ENCRYPTION_OFF";
      } else if (encEnv === "true" || encEnv === "1" || encEnv === "yes") {
        config.encrypted = "ENCRYPTION_ON";
      }
    }

    driver = neo4j.driver(
      uri,
      neo4j.auth.basic(
        process.env.NEO4J_USER ?? "neo4j",
        process.env.NEO4J_PASSWORD ?? "healthdataspace",
      ),
      config,
    );
  }
  return driver;
}

// Recursively convert Neo4j temporal types (Date, DateTime, Time, etc.) and
// Integer objects to JSON-safe primitives. React cannot render objects with
// {year, month, day} shape as children, so unconverted Date values crash the
// client with "Minified React error #31".
function normalizeNeo4jValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(normalizeNeo4jValue);
  if (typeof v !== "object") return v;
  if (
    neo4j.isDate(v as never) ||
    neo4j.isDateTime(v as never) ||
    neo4j.isLocalDateTime(v as never) ||
    neo4j.isTime(v as never) ||
    neo4j.isLocalTime(v as never) ||
    neo4j.isDuration(v as never)
  ) {
    return (v as { toString(): string }).toString();
  }
  if (neo4j.isInt(v as never)) {
    return (v as { toNumber(): number }).toNumber();
  }
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = normalizeNeo4jValue(val);
  }
  return out;
}

export async function runQuery<T>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = getDriver().session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => normalizeNeo4jValue(r.toObject()) as T);
  } finally {
    await session.close();
  }
}
