// The idempotent comment upsert (issue #30, CLAIM-26.6, NEVER-26.9).
//
// "Idempotent comment upsert keyed by sentinel | iai-core | Re-run safety for
//  every M2 skill" — docs/milestones/M1.md:187
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Still outside the `no-io-in-pure-modules` scope until #261 (NEVER-26.7).
//
// THIS RETURNS AN INSTRUCTION, NOT AN ARGV. Decision 10 of
// docs/design/stories/21.md split the two Stories along the pure/impure line:
// S1.3 constructs `gh` argv, S1.4 owns sentinel discovery and the upsert
// choice. The caller takes this instruction and selects `commentCreate`
// (packages/core/src/gh/comments.ts:37) or `commentEdit`
// (packages/core/src/gh/comments.ts:55). Importing either here would make that
// split cosmetic.
//
// THE KEY IS (issue, sentinel), STATED EXPLICITLY.
//
// Decision 10 of docs/design/stories/26.md records a consequence rather than
// solving it: docs/design/03-workflow.md:379 gives `## iai-gate` a producer of
// "any gate trigger", and docs/design/03-workflow.md:270 allows one gate
// comment per issue. Two DIFFERENT gate kinds firing on one issue therefore
// collide under this key — the second would edit the first's comment rather
// than opening its own gate. That is M3's problem (docs/milestones/M3.md,
// CLAIM-75.1), and the key is named here so M3 inherits a decision instead of
// an assumption.
import { selectSentinelComment, type SentinelComment } from "./consumer";
import { isKnownSentinelName, sentinelFor, type SentinelName } from "./sentinel";
import { evFail, evOk, type EvidenceResult } from "./types";

// `create` carries no id because there is nothing to address yet. `edit`
// carries the id and NEVER an issue number: comment ids are unique per
// repository, not per issue, and passing an issue number to the REST endpoint
// would address a different comment entirely
// (packages/core/src/gh/comments.ts:51-54).
export type UpsertAction =
  | { readonly action: "create"; readonly sentinel: SentinelName; readonly body: string }
  | {
      readonly action: "edit";
      readonly sentinel: SentinelName;
      readonly body: string;
      readonly commentId: number;
      // How many comments carried this sentinel. > 1 means the list held
      // history the producer did not create — see Decision 2. Surfaced so a
      // caller can record that it edited the newest rather than silently
      // picking one.
      readonly matchCount: number;
    };

export interface UpsertInput {
  readonly sentinel: SentinelName;
  readonly body: string;
  // The comment list as a VALUE (Decision 1). This module cannot read an issue.
  readonly comments: unknown;
}

// Decides whether to create a new comment or edit the existing one.
//
// IDEMPOTENCE IS THE POINT. docs/milestones/M1.md:191 requires that "a double
// producer run leaves exactly one comment per sentinel". Run 1 against a list
// with no match emits `create`; run 2 against a list containing run 1's
// comment emits `edit` naming it. The pair leaves one comment.
//
// NEVER-26.9's two invariants are structural here rather than checked
// afterwards:
//
//   1. An `edit` target always carries the requested sentinel, because the
//      target comes from `selectSentinelComment`, whose predicate IS the
//      sentinel match. There is no path that selects a comment by any other
//      means.
//   2. Exactly one instruction is returned. The function's return type is a
//      single `UpsertAction`, so emitting both a create and an edit is not
//      representable.
//
// Reusing #28's selector rather than re-scanning is deliberate: two scans
// would be two definitions of "which comment wins", and they would drift the
// first time the tie-break changed.
export function planCommentUpsert(input: unknown): EvidenceResult<UpsertAction> {
  const sentinel = readSentinel(input);
  const body = readBody(input);
  const comments = readComments(input);

  if (sentinel === undefined) return evFail("upsert sentinel is missing or not a known name");
  if (body === undefined) return evFail("upsert body must be a string");
  if (body.length === 0) {
    return evFail(
      `upsert body is empty; a comment carrying "${sentinelFor(sentinel)}" must at ` +
        "minimum carry the sentinel line itself",
    );
  }

  const match = selectSentinelComment(comments, sentinel);
  if (match === undefined) return evOk({ action: "create", sentinel, body });

  return evOk({
    action: "edit",
    sentinel,
    body,
    commentId: match.comment.id,
    matchCount: match.matchCount,
  });
}

// Applies an instruction to a comment list, for testing idempotence without an
// adapter. Returns the list as it would stand after the instruction ran.
//
// This is NOT a substitute for running the real command — it models the
// adapter's effect so a test can assert that a second run leaves exactly one
// comment per sentinel. `docs/milestones/M1.md:191` states that as a
// verification requirement and it cannot be checked from a single invocation.
export function applyUpsert(
  comments: readonly SentinelComment[],
  action: UpsertAction,
  newId: number,
  createdAt: string,
): readonly SentinelComment[] {
  // Total over hostile input (NEVER-26.8). A non-array `comments` reached
  // `.map` and threw before #261's sweep; a malformed `action` reached
  // `.action` on undefined. Both now degrade to "no change" rather than
  // throwing, because this models an adapter effect and an adapter handed
  // garbage should produce no change, not an exception mid-batch.
  const list: readonly SentinelComment[] = Array.isArray(comments) ? comments : [];
  if (action === null || typeof action !== "object") return list;
  if (action.action === "create") {
    return [...list, { id: newId, createdAt, body: action.body }];
  }
  if (action.action !== "edit") return list;
  const target = action.commentId;
  const body = action.body;
  return list.map((c) =>
    c !== null && typeof c === "object" && c.id === target
      ? { id: c.id, createdAt: c.createdAt, body }
      : c,
  );
}

function readSentinel(input: unknown): SentinelName | undefined {
  try {
    if (input === null || typeof input !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(input, "sentinel")) return undefined;
    const raw = (input as Record<string, unknown>).sentinel;
    return isKnownSentinelName(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function readBody(input: unknown): string | undefined {
  try {
    if (input === null || typeof input !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(input, "body")) return undefined;
    const raw = (input as Record<string, unknown>).body;
    return typeof raw === "string" ? raw : undefined;
  } catch {
    return undefined;
  }
}

function readComments(input: unknown): unknown {
  try {
    if (input === null || typeof input !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(input, "comments")) return undefined;
    return (input as Record<string, unknown>).comments;
  } catch {
    return undefined;
  }
}
