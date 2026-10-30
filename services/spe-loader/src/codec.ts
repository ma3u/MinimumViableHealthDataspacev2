import neo4j, {
  isDate,
  isDateTime,
  isDuration,
  isInt,
  isLocalDateTime,
  isLocalTime,
  isPoint,
  isTime,
} from "neo4j-driver";

// ---------------------------------------------------------------------------
// Neo4j property values as JSON and back, without losing a type
// ---------------------------------------------------------------------------
//
// An extract is JSON lines, and a workspace must hold exactly what the hub
// held: an INTEGER stays an INTEGER (a JSON number would come back as FLOAT,
// which is how the driver sends every JS number), a DATE stays a DATE. Plain
// strings, booleans, floats and lists of them are JSON as they are; every
// other value is an object with one `$t` tag. A value this module does not
// know is refused at export rather than written in a form the load cannot
// read back.

export type Encoded =
  | null
  | boolean
  | number
  | string
  | Encoded[]
  | { $t: string; v: unknown };

const num = (v: unknown): number =>
  isInt(v) ? (v as { toNumber(): number }).toNumber() : Number(v);

export function encodeValue(value: unknown): Encoded {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { $t: "Float", v: String(value) };
    return value;
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (isInt(value)) return { $t: "Int", v: String(value) };
  if (isDateTime(value)) {
    const d = value as unknown as Record<string, unknown>;
    return {
      $t: "DateTime",
      v: {
        year: num(d.year),
        month: num(d.month),
        day: num(d.day),
        hour: num(d.hour),
        minute: num(d.minute),
        second: num(d.second),
        nanosecond: num(d.nanosecond),
        timeZoneOffsetSeconds:
          d.timeZoneOffsetSeconds == null ? null : num(d.timeZoneOffsetSeconds),
        timeZoneId: d.timeZoneId ?? null,
      },
    };
  }
  if (isLocalDateTime(value)) {
    const d = value as unknown as Record<string, unknown>;
    return {
      $t: "LocalDateTime",
      v: [d.year, d.month, d.day, d.hour, d.minute, d.second, d.nanosecond].map(
        num,
      ),
    };
  }
  if (isDate(value)) {
    const d = value as unknown as Record<string, unknown>;
    return { $t: "Date", v: [d.year, d.month, d.day].map(num) };
  }
  if (isTime(value)) {
    const d = value as unknown as Record<string, unknown>;
    return {
      $t: "Time",
      v: [
        d.hour,
        d.minute,
        d.second,
        d.nanosecond,
        d.timeZoneOffsetSeconds,
      ].map(num),
    };
  }
  if (isLocalTime(value)) {
    const d = value as unknown as Record<string, unknown>;
    return {
      $t: "LocalTime",
      v: [d.hour, d.minute, d.second, d.nanosecond].map(num),
    };
  }
  if (isDuration(value)) {
    const d = value as unknown as Record<string, unknown>;
    return {
      $t: "Duration",
      v: [d.months, d.days, d.seconds, d.nanoseconds].map(num),
    };
  }
  if (isPoint(value)) {
    const p = value as unknown as Record<string, unknown>;
    return {
      $t: "Point",
      v: [
        num(p.srid),
        Number(p.x),
        Number(p.y),
        p.z == null ? null : Number(p.z),
      ],
    };
  }
  throw new Error(
    `cannot put a ${Object.prototype.toString.call(value)} into an extract`,
  );
}

function tuple(v: unknown, length: number, tag: string): number[] {
  if (
    !Array.isArray(v) ||
    v.length !== length ||
    v.some((x) => typeof x !== "number")
  ) {
    throw new Error(`malformed ${tag} in extract`);
  }
  return v as number[];
}

export function decodeValue(value: Encoded): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeValue);
  const { $t, v } = value;
  switch ($t) {
    case "Int":
      return neo4j.int(String(v));
    case "Float":
      return Number(v);
    case "Date": {
      const [y, m, d] = tuple(v, 3, $t);
      return new neo4j.types.Date(y, m, d);
    }
    case "DateTime": {
      const d = v as Record<string, number | string | null>;
      return new neo4j.types.DateTime(
        Number(d.year),
        Number(d.month),
        Number(d.day),
        Number(d.hour),
        Number(d.minute),
        Number(d.second),
        Number(d.nanosecond),
        d.timeZoneId == null ? Number(d.timeZoneOffsetSeconds) : undefined,
        d.timeZoneId == null ? undefined : String(d.timeZoneId),
      );
    }
    case "LocalDateTime": {
      const [y, mo, d, h, mi, s, ns] = tuple(v, 7, $t);
      return new neo4j.types.LocalDateTime(y, mo, d, h, mi, s, ns);
    }
    case "Time": {
      const [h, mi, s, ns, off] = tuple(v, 5, $t);
      return new neo4j.types.Time(h, mi, s, ns, off);
    }
    case "LocalTime": {
      const [h, mi, s, ns] = tuple(v, 4, $t);
      return new neo4j.types.LocalTime(h, mi, s, ns);
    }
    case "Duration": {
      const [months, days, seconds, nanoseconds] = tuple(v, 4, $t);
      return new neo4j.types.Duration(months, days, seconds, nanoseconds);
    }
    case "Point": {
      const [srid, x, y, z] = v as [number, number, number, number | null];
      return new neo4j.types.Point(srid, x, y, z ?? undefined);
    }
    default:
      throw new Error(`unknown value type '${String($t)}' in extract`);
  }
}

export function encodeProps(
  props: Record<string, unknown>,
): Record<string, Encoded> {
  const out: Record<string, Encoded> = {};
  for (const [k, v] of Object.entries(props)) out[k] = encodeValue(v);
  return out;
}

export function decodeProps(
  props: Record<string, Encoded>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) out[k] = decodeValue(v);
  return out;
}
