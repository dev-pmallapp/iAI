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

function bucketMagnitude(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  return `1e${Math.floor(Math.log10(abs))}`;
}

function last4(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 4) return null;
  return digitsOnly.slice(-4);
}

function dayPrecision(value: unknown): string | null {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === "string" || typeof value === "number") date = new Date(value);
  if (date === null || Number.isNaN(date.getTime())) return null;
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
): { in_range: boolean | null; direction: "above" | "below" | "within" | null } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { in_range: null, direction: null };
  }
  const range = parseRange(rangeRaw);
  if (range === null) return { in_range: null, direction: null };
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
    switch (rule) {
      case "drop":
        break;
      case "retain":
        output[key] = value !== null && typeof value === "object" ? redactChild(value, depth, visited) : value;
        break;
      case "last-4": {
        const tail = last4(value);
        output[key] = { last_4: tail };
        break;
      }
      case "magnitude":
        output[key] = { magnitude: bucketMagnitude(value) };
        break;
      case "day-precision":
        output[key] = dayPrecision(value);
        break;
      case "biomarker":
        output[key] = biomarkerProjection(value, rangeRaw);
        break;
      default: {
        // Unrecognised field name. A container is walked in case a named
        // field is nested one level down; a bare unrecognised primitive has
        // no known-safe rewrite and is dropped rather than passed through
        // raw, per NEVER-15.9.
        if (value !== null && typeof value === "object") {
          output[key] = redactChild(value, depth, visited);
        }
        break;
      }
    }
  }
  return output;
}

function redactChild(value: unknown, depth: number, visited: Set<object>): unknown {
  if (depth > MAX_DEPTH) return null;
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;

  if (visited.has(value)) return null;
  visited.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactChild(item, depth + 1, visited));
    }
    if (value instanceof Date) return dayPrecision(value);
    if (value instanceof Map) {
      const entries: [string, unknown][] = [];
      for (const [mapKey, mapValue] of value.entries()) {
        if (typeof mapKey === "string") entries.push([mapKey, mapValue]);
      }
      return redactEntries(entries, depth + 1, visited);
    }
    if (value instanceof Set) {
      return Array.from(value.values()).map((item) => redactChild(item, depth + 1, visited));
    }
    const entries = safeOwnEntries(value);
    if (entries === null) return null;
    return redactEntries(entries, depth + 1, visited);
  } catch {
    return null;
  }
}

/** The de-identified projection of a PRIVATE payload, per
 *  docs/design/09-security.md:137-153. Never returns the raw record, never
 *  throws. */
export function deidentifyPrivatePayload(payload: unknown): unknown {
  try {
    return redactChild(payload, 0, new Set<object>());
  } catch {
    return null;
  }
}
