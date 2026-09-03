// Path templating (issue #30, CLAIM-26.6).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Still outside the `no-io-in-pure-modules` scope until #261 (NEVER-26.7).
//
// `{issue}` IS THE ONLY ISSUE PLACEHOLDER. This is Decision 7 of
// docs/design/stories/26.md, approved at the design-approval gate on #26, and
// it is the one decision in this Story whose cost lands outside it.
//
// The evidence for `{issue}`:
//   docs/design/01-skill-hierarchy.md:229 -- "`{issue}` and `{ts}` interpolate"
//   CONTRIBUTING.md:66                    -- defines `{issue}`
//   all six EvidenceSpec literals in the tree use docs/evidence/{issue}-{ts}.md
//   all 25 artifacts on disk match that shape
//
// Against it: docs/design/03-workflow.md:376 and docs/milestones/M2.md:132
// both write `docs/evidence/{n}-{ts}.md`. `{n}` is defined NOWHERE as an issue
// number, and it means the CLAIM ORDINAL in `CLAIM-{story}.{n}`
// (docs/design/00-synthesis.md:34).
//
// So an unknown placeholder is a CONSTRUCTION FAILURE rather than a
// pass-through. The consequence is deliberate: M2's CLAIM-47.5 will not work
// as literally written, and whoever implements it hits a loud error naming
// `{n}` instead of silently emitting a path containing the literal characters
// `{n}`. Failing closed is the whole point -- a filename with an
// uninterpolated placeholder in it is a file nobody will ever find again.
import { evFail, evOk, type EvidenceResult } from "./types";

// Decision 8. `{ts}` is compact UTC ISO-8601 with seconds and a trailing `Z`:
// 20260825T141207Z, as pinned at docs/design/04-domain-dev.md:301 and restated
// in CLAIM-26.6 (docs/milestones/M1.md:177-178).
//
// PINNED AGAINST DISK, NOT AGAINST PROSE. Four of the eight `{ts}` examples in
// the design documents disagree with each other:
//   docs/design/01-skill-hierarchy.md:440  41-20260825T1412Z.md    (no seconds)
//   docs/design/06-domain-health.md:563    951-20261101T0914Z.md   (no seconds)
//   docs/design/07-domain-wealth-know.md:339  963-20270115T1102Z.md (no seconds)
//   docs/design/03-workflow.md:425         901-20260114T092211.md  (no trailing Z)
// All 25 artifacts in docs/evidence/ agree with each other and with the form
// above. docs/design/verification-pass.md:1108 records the conflict as "three
// formats across four documents", which itself undercounts: there are six
// documents and it misses the no-`Z` form entirely.
const TS_RE = /^\d{8}T\d{6}Z$/;

// The complete set of placeholders this layer interpolates. CLOSED, for the
// same reason SENTINEL_NAMES is closed: a new placeholder is a Design change,
// not a runtime value.
export const TEMPLATE_PLACEHOLDERS: readonly string[] = ["issue", "ts"];

// Any `{...}` token, so an unknown one can be NAMED in the failure rather than
// reported as a generic parse error.
const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

export interface TemplateValues {
  readonly issue: number;
  readonly ts: string;
}

export function isCompactUtcTimestamp(value: unknown): boolean {
  return typeof value === "string" && TS_RE.test(value);
}

// Formats a Date as `{ts}`. Takes a Date rather than reading a clock: reading
// the clock is I/O and this module cannot do it. The caller holds the instant,
// which is the same Decision 1 shape used throughout this Story.
export function formatCompactUtcTimestamp(instant: Date): EvidenceResult<string> {
  const ms = instant instanceof Date ? instant.getTime() : Number.NaN;
  if (!Number.isFinite(ms)) return evFail("timestamp is not a valid Date");
  const iso = new Date(ms).toISOString();
  // 2026-08-25T14:12:07.000Z -> 20260825T141207Z
  const compact = `${iso.slice(0, 10).replace(/-/g, "")}T${iso.slice(11, 19).replace(/:/g, "")}Z`;
  if (!TS_RE.test(compact)) return evFail(`formatted timestamp "${compact}" is malformed`);
  return evOk(compact);
}

// Interpolates `{issue}` and `{ts}`. Any other placeholder is a failure that
// names the offending token.
//
// Total over hostile input (NEVER-26.8): a non-string template, a
// non-positive issue or a malformed `{ts}` all yield typed failures.
export function renderPathTemplate(
  template: unknown,
  values: unknown,
): EvidenceResult<string> {
  if (typeof template !== "string" || template.length === 0) {
    return evFail("path template must be a non-empty string");
  }

  const issue = readIssue(values);
  const ts = readTs(values);
  if (issue === undefined) {
    return evFail("template value `issue` must be a positive integer");
  }
  if (ts === undefined) {
    return evFail(
      "template value `ts` must be compact UTC ISO-8601 with seconds and a " +
        'trailing "Z", as 20260825T141207Z',
    );
  }

  // Collect unknown placeholders BEFORE substituting, so the failure names
  // every offender rather than the first.
  const unknown: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = match[1] ?? "";
    if (!TEMPLATE_PLACEHOLDERS.includes(name)) unknown.push(name);
  }
  if (unknown.length > 0) {
    return evFail(
      `path template carries unknown placeholder(s) ${unknown.map((u) => `{${u}}`).join(", ")}; ` +
        `only ${TEMPLATE_PLACEHOLDERS.map((p) => `{${p}}`).join(" and ")} interpolate. ` +
        "Note that `{n}` is not an issue-number placeholder anywhere in this repository " +
        "-- it is the claim ordinal in CLAIM-{story}.{n} -- so " +
        "docs/design/03-workflow.md:376 and docs/milestones/M2.md:132 are defective",
    );
  }

  const rendered = template
    .replace(/\{issue\}/g, String(issue))
    .replace(/\{ts\}/g, ts);

  // A rendered path that still contains a brace means a placeholder survived,
  // which is the failure mode this whole function exists to prevent.
  if (rendered.includes("{") || rendered.includes("}")) {
    return evFail(`rendered path still contains an uninterpolated brace: "${rendered}"`);
  }
  return evOk(rendered);
}

function readIssue(values: unknown): number | undefined {
  try {
    if (values === null || typeof values !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(values, "issue")) return undefined;
    const raw = (values as Record<string, unknown>).issue;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

function readTs(values: unknown): string | undefined {
  try {
    if (values === null || typeof values !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(values, "ts")) return undefined;
    const raw = (values as Record<string, unknown>).ts;
    return isCompactUtcTimestamp(raw) ? (raw as string) : undefined;
  } catch {
    return undefined;
  }
}
