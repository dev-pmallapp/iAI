// The de-identified PRIVATE projection (issue #18, CLAIM-15.4). This is the
// `redacted` payload `checkEgress` attaches to the one matrix cell that
// carries one: PRIVATE data, cloud destination, per-session opt-in granted.
// Per docs/design/09-security.md:137-153, redaction targets the private
// FIELD, not the private TOPIC — a ticker or a broker name is retained
// exactly as given, and only the field kinds that table names are ever
// rewritten.
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Same standing decision as classify/classify.ts and guards/claim-lint.ts.
//
// A field this module does not recognise is DROPPED rather than passed
// through. `checkEgress` only ever reaches this module once `classify()`
// has already settled the whole payload at PRIVATE or below — a
// SECRET-shaped value anywhere in the structure would have lifted the
// class and the guard would have blocked before this file ever runs — but
// an unrecognised PRIVATE field still has no known-safe rewrite, and
// NEVER-15.9 makes "drop what is not named" the only fail-closed choice
// available to a generic, domain-blind projection.
//
// Traversal is recursive but depth-capped and cycle-tracked (mirroring
// classify.ts's iterative walk in spirit, not in mechanism: this module
// builds an output tree rather than a single scalar verdict, so an explicit
// stack would have to carry parent linkage back through itself; a depth cap
// bounds the recursion instead). Every per-node access is wrapped in its own
// try/catch, and the whole entry point is wrapped again, so this module can
// never throw — any internal failure drops that node rather than leaking it.
import { normalizeKey } from "../classify/recognisers";

type Rule = "retain" | "drop" | "last-4" | "magnitude" | "biomarker" | "day-precision";

// Transcribed from the redaction table at docs/design/09-security.md:137-153.
// Nothing here invents a category beyond what that table names.
const RULES: ReadonlyMap<string, Rule> = new Map<string, Rule>([
  ["account_number", "last-4"],
  ["balance", "magnitude"],
  ["account_balance", "magnitude"],
  ["amount", "magnitude"],
  ["dollar_amount", "magnitude"],
  ["position", "magnitude"],
  ["position_size", "magnitude"],
  ["quantity", "magnitude"],
  ["shares", "magnitude"],
  ["biomarker", "biomarker"],
  ["biomarker_value", "biomarker"],
  ["apob", "biomarker"],
  ["ldl", "biomarker"],
  ["hdl", "biomarker"],
  ["cholesterol", "biomarker"],
  ["glucose", "biomarker"],
  ["hrv", "biomarker"],
  ["heart_rate", "biomarker"],
  ["sleep_score", "biomarker"],
  ["reference_range", "drop"],
  ["lab_reference_range", "drop"],
  ["date_of_birth", "drop"],
  ["dob", "drop"],
  ["mrn", "drop"],
  ["name", "drop"],
  ["patient_name", "drop"],
  ["clinician_note", "drop"],
  ["statement", "drop"],
  ["timestamp", "day-precision"],
  ["ticker", "retain"],
  ["broker", "retain"],
  ["broker_name", "retain"],
]);

const MAX_DEPTH = 32;

// A projection that yields no information is DROPPED rather than emitted as a
// null husk. Adjudicated at #18's implementation-review gate by @dev-pmallapp:
// a biomarker with no reference range in the payload used to project to
// `{in_range: null, direction: null}`, which is a key carrying nothing. The
// security property is identical either way — the raw value is gone in both —
// but an absent field cannot be mistaken for a measured one, and an emitted
// null invites a consumer to reason about why it is null.
const DROP: unique symbol = Symbol("drop");

function bucketMagnitude(value: unknown): string | typeof DROP {
  if (typeof value !== "number" || !Number.isFinite(value)) return DROP;
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  return `1e${Math.floor(Math.log10(abs))}`;
}

function last4(value: unknown): string | typeof DROP {
  if (typeof value !== "string") return DROP;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 4) return DROP;
  return digitsOnly.slice(-4);
}

function dayPrecision(value: unknown): string | typeof DROP {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === "string" || typeof value === "number") date = new Date(value);
  if (date === null || Number.isNaN(date.getTime())) return DROP;
  return date.toISOString().slice(0, 10);
}

function parseRange(rangeRaw: unknown): { low: number; high: number } | null {
  if (rangeRaw !== null && typeof rangeRaw === "object" && !Array.isArray(rangeRaw)) {
    const low = (rangeRaw as Record<string, unknown>).low;
    const high = (rangeRaw as Record<string, unknown>).high;
    if (typeof low === "number" && typeof high === "number") return { low, high };
  }
  if (typeof rangeRaw === "string") {
    const match = /(-?\d+(?:\.\d+)?)\s*[-\u2013]\s*(-?\d+(?:\.\d+)?)/.exec(rangeRaw);
    if (match) {
      const low = Number(match[1]);
      const high = Number(match[2]);
      if (Number.isFinite(low) && Number.isFinite(high)) return { low, high };
    }
  }
  return null;
}

// Combined with `in_range` a reference range reconstructs the raw value
// (docs/design/09-security.md:149), so the range itself is read here and
// then discarded — it never appears anywhere in the output.
function biomarkerProjection(
  value: unknown,
  rangeRaw: unknown,
): { in_range: boolean; direction: "above" | "below" | "within" } | typeof DROP {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DROP;
  }
  const range = parseRange(rangeRaw);
  if (range === null) return DROP;
  if (value < range.low) return { in_range: false, direction: "below" };
  if (value > range.high) return { in_range: false, direction: "above" };
  return { in_range: true, direction: "within" };
}

function safeOwnEntries(value: object): [string, unknown][] | null {
  try {
    const keys = Object.keys(value);
    const entries: [string, unknown][] = [];
    for (const key of keys) {
      entries.push([key, (value as Record<string, unknown>)[key]]);
    }
    return entries;
  } catch {
    return null;
  }
}

function redactEntries(entries: [string, unknown][], depth: number, visited: Set<object>): Record<string, unknown> {
  const rangeRaw = entries.find(([key]) => {
    const normalized = normalizeKey(key);
    return normalized === "reference_range" || normalized === "lab_reference_range";
  })?.[1];

  const output: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const rule = RULES.get(normalizeKey(key));
    let projected: unknown = DROP;

    switch (rule) {
      case "drop":
        projected = DROP;
        break;
      case "retain":
        projected =
          value !== null && typeof value === "object" ? redactChild(value, depth, visited) : value;
        break;
      case "last-4": {
        const tail = last4(value);
        projected = tail === DROP ? DROP : { last_4: tail };
        break;
      }
      case "magnitude": {
        const magnitude = bucketMagnitude(value);
        projected = magnitude === DROP ? DROP : { magnitude };
        break;
      }
      case "day-precision":
        projected = dayPrecision(value);
        break;
      case "biomarker":
        projected = biomarkerProjection(value, rangeRaw);
        break;
      default:
        // Unrecognised field name. A container is walked in case a named
        // field is nested one level down; a bare unrecognised primitive has
        // no known-safe rewrite and is dropped rather than passed through
        // raw, per NEVER-15.9.
        projected =
          value !== null && typeof value === "object" ? redactChild(value, depth, visited) : DROP;
        break;
    }

    if (projected !== DROP) {
      output[key] = projected;
    }
  }
  return output;
}

// An object or array that projects to nothing carries no information, so it is
// dropped rather than emitted as an empty husk. Without this, dropping a leaf
// would leave `{a: {b: {}}}` behind in place of the field it removed.
function isEmptyProjection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function redactChild(value: unknown, depth: number, visited: Set<object>): unknown {
  if (depth > MAX_DEPTH) return DROP;
  if (value === null || value === undefined) return DROP;
  if (typeof value !== "object") return DROP;

  if (visited.has(value)) return DROP;
  visited.add(value);

  try {
    let projected: unknown;

    if (Array.isArray(value)) {
      projected = value
        .map((item) => redactChild(item, depth + 1, visited))
        .filter((item) => item !== DROP);
    } else if (value instanceof Date) {
      projected = dayPrecision(value);
    } else if (value instanceof Map) {
      const entries: [string, unknown][] = [];
      for (const [mapKey, mapValue] of value.entries()) {
        if (typeof mapKey === "string") entries.push([mapKey, mapValue]);
      }
      projected = redactEntries(entries, depth + 1, visited);
    } else if (value instanceof Set) {
      projected = Array.from(value.values())
        .map((item) => redactChild(item, depth + 1, visited))
        .filter((item) => item !== DROP);
    } else {
      const entries = safeOwnEntries(value);
      if (entries === null) return DROP;
      projected = redactEntries(entries, depth + 1, visited);
    }

    return isEmptyProjection(projected) ? DROP : projected;
  } catch {
    return DROP;
  }
}

/** The de-identified projection of a PRIVATE payload, per
 *  docs/design/09-security.md:137-153. Never returns the raw record, never
 *  throws. */
export function deidentifyPrivatePayload(payload: unknown): unknown {
  try {
    const projected = redactChild(payload, 0, new Set<object>());
    return projected === DROP ? {} : projected;
  } catch {
    return {};
  }
}
