// The sentinel namespace and the matcher (issue #27, CLAIM-26.1).
//
// "A **sentinel** is a magic heading that makes an issue comment
//  machine-findable. It is how the pipeline reads its own history without a
//  database." — docs/design/03-workflow.md:369-370
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Same standing decision as classify/, guards/ and gh/. Note that as of this
// task the `no-io-in-pure-modules` lint rule does NOT yet cover this
// directory — its scope predicate matches `classify`, `guards` and `gh` only.
// Widening it is NEVER-26.7 and lands in #261. Until then the purity of this
// file is a convention rather than an enforced property, which is exactly the
// gap #253 had to close for gh/ and the reason #261 exists from the start of
// this Story rather than as a follow-up.

// The namespace is a CLOSED set of nine, from the only table in the tree that
// enumerates it: docs/design/03-workflow.md:372-382. A tenth name is a Design
// change, not a runtime value, which is why this is a union type and not
// `string`.
//
// The retired tenth, `## iai-isa`, became `## iai-design` under #194
// (docs/design/stories/194.md:227-229). It must not reappear here.
export type SentinelName =
  | "design"
  | "test-plan"
  | "evidence"
  | "verdict"
  | "checkpoint"
  | "gate"
  | "risk"
  | "effort"
  | "learnings";

export const SENTINEL_NAMES: readonly SentinelName[] = [
  "design",
  "test-plan",
  "evidence",
  "verdict",
  "checkpoint",
  "gate",
  "risk",
  "effort",
  "learnings",
];

// The namespace prefix, including the heading marker and the trailing hyphen.
//
// EXPORTED FOR S1.5. docs/milestones/M1.md:214-216 (CLAIM-31.5) requires the
// registry to reject "a binding whose `evidence.sentinel` falls outside the
// `## iai-` namespace". Decision 11 of docs/design/stories/26.md commits this
// Story to exporting the constant rather than letting S1.5 restate the
// literal, because two copies of a namespace rule drift.
export const SENTINEL_NAMESPACE_PREFIX = "## iai-";

// Only the three sentinels with an artifact path under docs/ carry budget,
// permalink and path-template behaviour. The other six are inline-only, write
// outside docs/, or write to a KB repo — see docs/design/03-workflow.md:372-382.
//
// Decision 10 of docs/design/stories/26.md: artifact-bearing behaviour is
// conditional on a path template being present, NOT on the sentinel's name.
// This set exists so #29 and #30 can assert that distinction rather than
// rediscover it, and so a binding declaring a path template for an inline-only
// sentinel is a validation failure S1.5 can name.
export const ARTIFACT_BEARING_SENTINELS: readonly SentinelName[] = [
  "design",
  "test-plan",
  "evidence",
];

export function sentinelFor(name: SentinelName): string {
  return SENTINEL_NAMESPACE_PREFIX + name;
}

export function isKnownSentinelName(value: unknown): value is SentinelName {
  return typeof value === "string" && (SENTINEL_NAMES as readonly string[]).includes(value);
}

// Namespace membership, for CLAIM-31.5. Deliberately a PREFIX test and not a
// closed-set test: the claim's words are "falls outside the `## iai-`
// namespace", which is a weaker condition than "is one of the nine". A binding
// naming `## iai-something-new` is inside the namespace and outside the set,
// and only S1.5 can decide whether that is an error. Use
// `isKnownSentinelName` when the closed set is what matters.
export function isSentinelNamespace(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!value.startsWith(SENTINEL_NAMESPACE_PREFIX)) return false;
  return value.length > SENTINEL_NAMESPACE_PREFIX.length;
}

// Prefix-freedom is ASSERTED, not assumed.
//
// Decision 4 of docs/design/stories/26.md: matching is name-plus-boundary
// rather than `startswith`, because docs/design/03-workflow.md:400's
// `startswith("## iai-verdict")` would also match a comment opening
// `## iai-designation`. No current name is a prefix of another, so this is a
// latent hazard rather than a live bug — and it becomes live the moment a
// tenth name is added by someone who is not reading this file. Case 1 calls
// this, so the guard fails at the moment the namespace gains a bad member
// rather than at the moment a comment is mis-attributed.
export function sentinelNamesArePrefixFree(
  names: readonly string[] = SENTINEL_NAMES,
): boolean {
  for (const a of names) {
    for (const b of names) {
      if (a !== b && b.startsWith(a)) return false;
    }
  }
  return true;
}

// Whitespace that may separate a sentinel from trailing payload on the same
// line. Deliberately not `\s`: a line terminator has already been removed by
// the caller's split, and matching one here would let a sentinel "end" in the
// middle of a multi-line string passed in by mistake.
function isInlineWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t";
}

// Matches ONE line against the namespace, name-plus-boundary (Decision 4).
//
// Returns the name when the line is exactly `## iai-<name>` or
// `## iai-<name>` followed by inline whitespace and arbitrary payload.
// `## iai-verdict PASS` therefore matches and yields "verdict" — that form is
// used at docs/design/04-domain-dev.md:474 and
// docs/design/05-domain-trading.md:581, so rejecting it would invalidate two
// worked examples. `## iai-designation` does not match.
//
// Total over hostile input: a non-string returns undefined rather than
// throwing (NEVER-26.8).
export function matchSentinelLine(line: unknown): SentinelName | undefined {
  if (typeof line !== "string") return undefined;
  for (const name of SENTINEL_NAMES) {
    const token = SENTINEL_NAMESPACE_PREFIX + name;
    if (!line.startsWith(token)) continue;
    if (line.length === token.length) return name;
    const next = line.charAt(token.length);
    if (isInlineWhitespace(next)) return name;
    // A longer name that merely starts with this one. Keep scanning rather
    // than returning: SENTINEL_NAMES order must not decide correctness.
  }
  return undefined;
}

// The trailing payload on a sentinel line, if any. `## iai-verdict PASS`
// yields "PASS". Used by #28 to read a verdict token off the sentinel line
// without re-parsing it, and by #29 to measure the envelope.
export function sentinelLinePayload(line: unknown): string | undefined {
  const name = matchSentinelLine(line);
  if (name === undefined || typeof line !== "string") return undefined;
  const rest = line.slice((SENTINEL_NAMESPACE_PREFIX + name).length);
  const trimmed = rest.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
