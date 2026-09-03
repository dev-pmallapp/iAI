// The resume plan and the backoff planner (issue #25, CLAIM-21.5, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// Decision 4 of docs/design/stories/21.md: "The resume plan is a value
// returned to the caller, not state held here." Nothing in this file sleeps,
// counts an attempt across calls, or re-invokes anything — all three are
// effects and belong to the adapter, per docs/design/stories/21.md's Out of
// Scope: "Sleeping, counting attempts and re-invoking are the adapter's,
// because all three are effects."
//
// CASE 11, NOT CASE 10, IS THE PROPERTY THIS FILE HAS TO GET RIGHT.
//
// docs/test-plans/21-plan.md Note 3: "A plan that names the right items still
// corrupts the run if re-invoking re-emits the processed ones — that
// duplicates issues, which is the failure docs/design/04-domain-dev.md:505
// describes as 'a re-run duplicates'. Exactly-once across the union is the
// property; naming the remainder is only half of it." `planResume` is
// therefore built around a stable item identity (`BatchItem.id`) rather than
// a bare count, so "items 4 through 10" is a provable slice of the ORIGINAL
// array and not a number a caller could recompute inconsistently between two
// invocations.
//
// BACKOFF CONSTANTS ARE INVENTED HERE, AND NAMED AS SUCH.
//
// ARCHITECTURE.md:194 and docs/design/04-domain-dev.md:505 both say `gh/`
// "backs off exponentially". Neither, nor anything else in the tree, states a
// base delay, a cap, jitter or an attempt limit. The four constants below are
// this file's own choice; the rationale is recorded next to each one rather
// than left implicit.
//
// docs/design/02-roles.md:186's "retry up to 3 times on transient failure" is
// NOT reused here. That line governs an executor retrying a whole TASK run —
// a different failure domain, at a different layer, on a much longer time
// scale — and borrowing its "3" silently would blur two unrelated retry
// budgets into one number that happens to coincide. MAX_RETRY_ATTEMPTS below
// is chosen independently.
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  safeOwnValue,
  type GhResult,
} from "./types";

// ---------------------------------------------------------------------------
// Backoff.
// ---------------------------------------------------------------------------

// 1 second. Small enough that a batch which recovers quickly (a transient
// blip rather than a real rate limit) is not held up noticeably; large enough
// that a tight retry loop cannot hammer the API in the first second after a
// failure.
export const BACKOFF_BASE_MS = 1000;

// Doubling is the textbook exponential-backoff multiplier and is what
// "backs off exponentially" most plainly means absent any other number in the
// tree to anchor on.
export const BACKOFF_MULTIPLIER = 2;

// 30 seconds. GitHub's primary rate-limit window is an hour
// (https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api),
// far longer than any delay this layer could reasonably compute a caller
// should sleep for inside one process. The cap exists so a long-running batch
// does not compute an ever-growing sleep as attempts accumulate; the actual
// wait for a real primary rate limit is expected to span multiple resumed
// invocations (Decision 4: the caller re-invokes with the plan), not one
// single in-process sleep.
export const BACKOFF_CAP_MS = 30_000;

// After 5 attempts at BACKOFF_BASE_MS doubling, the delay would already have
// been capped for two of them (attempt 6 onward, see backoffDelayMs's own
// comment). Retrying past this is spending process time against a failure
// the taxonomy in errors.ts has already had five chances to classify as
// transient; PLAN.md:217's "invented detail" risk applies just as much to an
// invented attempt budget as to an invented exit code, so this number is
// named as a choice, not a fact.
export const MAX_RETRY_ATTEMPTS = 5;

// attempt is 1-based: the first try that failed and is about to be retried is
// attempt 1. Uncapped-then-clamped so the cap is exercised at high attempt
// counts regardless of MAX_RETRY_ATTEMPTS, which is a separate, independently
// enforced budget (see attemptsExceeded below) rather than something this
// function has to know about.
export function backoffDelayMs(attempt: unknown): GhResult<number> {
  if (!isPositiveInteger(attempt)) {
    return ghFail(`invalid backoff attempt: ${String(attempt)}; expected a positive integer`);
  }
  const raw = BACKOFF_BASE_MS * BACKOFF_MULTIPLIER ** (attempt - 1);
  return ghOk(Math.min(raw, BACKOFF_CAP_MS));
}

export function attemptsExceeded(attempt: unknown): boolean {
  return !isPositiveInteger(attempt) || attempt > MAX_RETRY_ATTEMPTS;
}

// ---------------------------------------------------------------------------
// Resume identity.
// ---------------------------------------------------------------------------

// The only requirement on an item this planner can resume: something stable
// enough to survive being passed to a second, separate invocation. A bare
// array index would NOT survive that — if a caller reconstructs the items
// array differently on retry (a real risk for anything rebuilt from a
// paginated listing), an index-based plan would silently point at the wrong
// item. An explicit id makes the exactly-once property in case 11 provable
// rather than assumed.
export interface BatchItem {
  readonly id: string | number;
}

export interface ResumePlan<T extends BatchItem = BatchItem> {
  // The unprocessed items, K..N, in original order, INCLUDING the one that
  // failed — it did not succeed, so it is not "already processed" and must
  // not be silently dropped.
  readonly remaining: readonly T[];
  // The index into the ORIGINAL items array of remaining[0]. Exposed so a
  // caller can log "resuming at item 4 of 10" without recomputing it from
  // remaining.length, which would be one more place for an off-by-one to
  // creep in.
  readonly resumeIndex: number;
  readonly totalItems: number;
  readonly attempt: number;
  readonly delayMs: number;
}

// CLAIM-21.5. Given the full batch and the id of the item that failed,
// returns a plan naming exactly the unprocessed remainder — items 1..K-1 are
// omitted because they already succeeded; re-emitting them is the "re-run
// duplicates" failure docs/design/04-domain-dev.md:505 names.
export function planResume<T extends BatchItem>(
  items: unknown,
  failedId: unknown,
  attempt: unknown,
): GhResult<ResumePlan<T>> {
  if (!Array.isArray(items) || items.length === 0) {
    return ghFail("resume plan requires a non-empty array of batch items");
  }

  // Snapshot-then-validate each item's id via safeOwnValue, per NEVER-21.8: a
  // hostile item carrying a throwing getter on `id` must not throw out of a
  // planner that a batch's failure path calls.
  const ids: Array<string | number> = [];
  for (const item of items) {
    const id = safeOwnValue(item, "id");
    if (typeof id !== "string" && typeof id !== "number") {
      return ghFail("every batch item requires a string or number id");
    }
    ids.push(id);
  }

  const seen = new Set<string | number>();
  for (const id of ids) {
    // A duplicate id makes "exactly once" unanswerable before this planner
    // even runs, so it is refused here rather than producing a plan whose
    // exactly-once property nobody could verify.
    if (seen.has(id)) return ghFail(`duplicate batch item id: ${String(id)}`);
    seen.add(id);
  }

  if (typeof failedId !== "string" && typeof failedId !== "number") {
    return ghFail(`invalid failed item id: ${String(failedId)}`);
  }
  const resumeIndex = ids.indexOf(failedId);
  if (resumeIndex === -1) {
    return ghFail(`failed item id ${String(failedId)} is not present in the supplied batch`);
  }

  if (attemptsExceeded(attempt)) {
    return ghFail(
      `attempt ${String(attempt)} exceeds MAX_RETRY_ATTEMPTS (${MAX_RETRY_ATTEMPTS}); ` +
        "refusing to plan another retry rather than retrying forever, per PLAN.md:217",
    );
  }
  const delay = backoffDelayMs(attempt);
  if (!delay.ok) return delay;

  return ghOk({
    remaining: items.slice(resumeIndex) as readonly T[],
    resumeIndex,
    totalItems: items.length,
    attempt: attempt as number,
    delayMs: delay.value,
  });
}
