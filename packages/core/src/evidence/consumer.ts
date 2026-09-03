// The sentinel consumer (issue #28, CLAIM-26.2, CLAIM-26.3).
//
// "Query, then disambiguate. ... If multiple comments match a sentinel, **use
//  the most recent by `createdAt`**. Earlier ones are history, not state —
//  never merge them, never average them. Absence of a required sentinel is a
//  hard failure, not a default." — docs/design/03-workflow.md:396-406
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// The directory is still outside the `no-io-in-pure-modules` scope until #261
// widens it (NEVER-26.7). See the note in sentinel.ts.
//
// THE COMMENT LIST IS AN INPUT VALUE, NEVER A LOOKUP (Decision 1 of
// docs/design/stories/26.md). This module cannot read an issue. The adapter
// runs the argv from `commentList` (packages/core/src/gh/comments.ts:74) and
// hands the parsed result in. That module deliberately carries no `--jq` —
// packages/core/src/gh/comments.ts:71-73 records that the sentinel predicate
// belongs here, which is exactly what this module is.
//
// WHY THE CONSUMER DOES NOT TRUST THE PRODUCER (Decision 2):
//
// #30's upsert guarantees iAI never stacks two comments carrying one sentinel.
// It does NOT guarantee the list contains one, and a consumer that assumed
// otherwise would break on the first comment iAI did not write. Four routes to
// multiplicity that no upsert can close:
//
//   1. A human wrote one. docs/design/02-roles.md:431 requires a risk override
//      to be "an explicit human comment on the Story under `## iai-risk`".
//   2. History predates the engine — every sentinel posted before S1.4 ships
//      was posted by hand.
//   3. An edit failed after a create succeeded.
//   4. Two callers held the same snapshot and both decided "create".
//
// So CLAIM-26.2 is a requirement on THIS module and CLAIM-26.6 is a guarantee
// about #30's output. They describe different surfaces, which is why both can
// be true at once.
import { decide, type Decision } from "../decision";
import { matchSentinelLine, sentinelFor, type SentinelName } from "./sentinel";

// One comment as the caller holds it. Field names match `gh issue view --json
// comments` so the adapter hands its parse straight in without renaming.
//
// `id` is REQUIRED and is the tie-break key — see `selectSentinelComment`.
// packages/core/src/gh/comments.ts:51-54 establishes that a comment id is the
// addressable unit for an edit, so a consumer that returned a comment without
// one would hand #30 something it cannot act on.
export interface SentinelComment {
  readonly id: number;
  readonly createdAt: string;
  readonly body: string;
}

export interface SentinelMatch {
  readonly comment: SentinelComment;
  readonly name: SentinelName;
  // How many comments in the list carried this sentinel. Exposed so a caller
  // can record that it discarded history rather than silently dropping it —
  // docs/design/03-workflow.md:405 calls the earlier ones "history, not state".
  readonly matchCount: number;
}

// Reads one own property without trusting the object: a hostile input can
// carry a throwing getter. Same shape and rationale as `safeOwnValue` in
// gh/types.ts and `safeOwnString` in guards/egress.ts (NEVER-26.8).
function safeOwn(source: unknown, key: string): unknown {
  try {
    if (source === null || typeof source !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined;
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

// Narrows an unknown list element to a usable comment. Every field is read
// through `safeOwn` BEFORE any is validated, so a throwing getter on `body`
// cannot escape after `id` has already been accepted.
function toComment(input: unknown): SentinelComment | undefined {
  const id = safeOwn(input, "id");
  const createdAt = safeOwn(input, "createdAt");
  const body = safeOwn(input, "body");
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return undefined;
  if (typeof createdAt !== "string" || createdAt.length === 0) return undefined;
  if (typeof body !== "string") return undefined;
  return { id, createdAt, body };
}

// A comment carries a sentinel only if the sentinel is its FIRST line at
// column zero. This reuses the matcher #27 shipped rather than re-testing the
// body with a second predicate, so the producer's linter and this query cannot
// disagree about what counts as carrying a sentinel.
//
// Deliberately NOT the full five-rule lint: a comment already posted is
// evidence of what happened, and refusing to read a slightly malformed
// historical comment would lose exactly the history
// docs/design/03-workflow.md:405 says to keep. The producer is strict; the
// consumer is strict about the first line only.
function sentinelOf(comment: SentinelComment): SentinelName | undefined {
  const firstLine = comment.body.split("\n", 1)[0] ?? "";
  return matchSentinelLine(firstLine);
}

// `createdAt` is ISO-8601 from the GitHub API. Compared as a timestamp rather
// than lexically: a lexical compare is correct only while every value carries
// the same shape and zone, and an offset form such as
// `2026-09-03T06:35:40+00:00` sorts wrong against a `Z` form despite naming the
// same instant. An unparseable value sorts oldest so it can never win by
// accident.
function instantOf(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

// Newest wins. Ties break to the HIGHEST comment id.
//
// The tie-break is not decoration. `createdAt` has one-second resolution and
// batched writes are real — five artifacts in docs/evidence/ share the
// timestamp 20260902T071821Z. Without a total order, CLAIM-26.2 is satisfiable
// by a function that returns either of two comments, and case 6 tests both
// input orderings precisely because a stable-sort implementation would pass a
// one-ordering test while remaining order-dependent.
//
// Ids are monotonic per repository, so the higher id is the later comment even
// when the recorded second is identical.
function isNewer(candidate: SentinelComment, incumbent: SentinelComment): boolean {
  const a = instantOf(candidate.createdAt);
  const b = instantOf(incumbent.createdAt);
  if (a !== b) return a > b;
  return candidate.id > incumbent.id;
}

// Finds the comment carrying `name`, or undefined when none does.
//
// Returns the newest by `createdAt` and NEVER a value assembled from more than
// one comment. CLAIM-26.2's "never merges or averages" is a structural
// property here: the returned `comment` is a reference to one element of the
// input, so there is no code path that could blend two.
//
// Total over hostile input (NEVER-26.8): a non-array, or an array containing
// non-objects, yields undefined rather than throwing.
export function selectSentinelComment(
  comments: unknown,
  name: SentinelName,
): SentinelMatch | undefined {
  if (!Array.isArray(comments)) return undefined;

  let winner: SentinelComment | undefined;
  let matchCount = 0;

  for (const element of comments) {
    const comment = toComment(element);
    if (comment === undefined) continue;
    if (sentinelOf(comment) !== name) continue;
    matchCount += 1;
    if (winner === undefined || isNewer(comment, winner)) winner = comment;
  }

  if (winner === undefined) return undefined;
  return { comment: winner, name, matchCount };
}

// Every comment carrying `name`, newest first. For a caller that wants to
// record what it discarded. The head is always the same comment
// `selectSentinelComment` returns, which is asserted rather than assumed.
export function findSentinelComments(
  comments: unknown,
  name: SentinelName,
): readonly SentinelComment[] {
  if (!Array.isArray(comments)) return [];
  const matched: SentinelComment[] = [];
  for (const element of comments) {
    const comment = toComment(element);
    if (comment === undefined) continue;
    if (sentinelOf(comment) === name) matched.push(comment);
  }
  return matched.sort((a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0));
}

// CLAIM-26.3: absence of a REQUIRED sentinel is a hard failure, never a
// default.
//
// `block` rather than `warn`, and a `Decision` rather than `undefined` or an
// empty string, because the caller of a required sentinel is about to act on
// state it believes exists. docs/design/03-workflow.md:406 states the rule in
// one line: "Absence of a required sentinel is a hard failure, not a default."
//
// The success arm still carries a `Decision` so the caller has one shape to
// handle. `action: "allow"` with the match attached is the only success form —
// there is deliberately no path that returns a match alongside `block`.
export interface RequiredSentinelResult {
  readonly decision: Decision;
  readonly match?: SentinelMatch;
}

export function requireSentinelComment(
  comments: unknown,
  name: SentinelName,
): RequiredSentinelResult {
  const match = selectSentinelComment(comments, name);
  if (match === undefined) {
    return {
      decision: decide(
        "block",
        `required sentinel "${sentinelFor(name)}" is absent from the comment list; ` +
          "absence is a hard failure, not a default",
      ),
    };
  }
  return {
    decision: decide(
      "allow",
      `found "${sentinelFor(name)}" in comment ${String(match.comment.id)}` +
        (match.matchCount > 1
          ? `; ${String(match.matchCount - 1)} earlier match(es) are history and were not merged`
          : ""),
    ),
    match,
  };
}
