// The stateful fake forge: GitHub semantics over in-memory state, able to lie,
// and deliberately NOT enforcing.
//
// Build target 4 of docs/design/stories/293.md. Anchors CLAIM-293.6 and
// NEVER-293.7. Ruled YES at the gate (G4), 2026-09-07, as TWO SEPARATE
// requirements -- Decision 5, docs/design/stories/293.md:558-571.
//
// WHY IT MUST BE ABLE TO LIE.
//
// 4 of 4 skill bodies name a rate-limited read treated as absence as their
// damaging failure mode, and skills/story-create/SKILL.md:119-123 calls it
// "the single most damaging failure mode of this skill" -- because ABSENCE IS
// WHAT EVERY CREATE STEP KEYS ON. A fixture forge that always answers
// correctly cannot exercise the failure the skills were written to survive,
// and .github/workflows/ci.yml:137-146 names that disqualifier itself: a check
// that cannot meaningfully fail is equivalent to one that is always skipped.
//
// WHY IT MUST NOT ENFORCE, WHICH IS THE SUBTLER HALF AND FAILS BY PASSING.
//
// GitHub's milestone endpoint returns 422 on a duplicate title and
// `goal-create` keys identity on that title (skills/goal-create/SKILL.md:79).
// If the fake enforces that, run 2 makes no mutation because THE FAKE refused
// it -- not because the skill declined to try. That is the S1.5 shadowing trap
// one layer out: a skill shadowed by its own test double.
//
// So this fake is MORE PERMISSIVE THAN GITHUB on the four identity keys, on
// purpose. NEVER-293.7 (docs/design/stories/293.md:373-376) says so in terms.
// The property that makes the permissiveness safe rather than sloppy is not in
// this file at all -- it is packages/exec/src/recording.ts:10-16, which records
// the ATTEMPT and not the success. Acceptance and refusal are therefore both
// visible, and the harness never has to infer a skill's behaviour from the
// fake's verdict.
//
// WHY THERE IS NO PROCESS HERE, AND WHY THAT IS LOAD-BEARING.
//
// This module answers argv from memory. It imports no launcher, which is what
// keeps CLAIM-293.1 true: case 12 of packages/exec/test/port.test.ts asserts
// exactly ONE production module in the workspace launches a process and names
// packages/exec/src/real.ts, and packages/harness/test/fixture-repo.test.ts
// independently asserts packages/harness/src imports no launcher at all. A
// `node:child_process` import here would fail both and falsify CLAIM-293.1.
//
// WHAT THIS FILE CANNOT DO, STATED HERE SO IT IS NOT INFERRED LATER.
//
// A fake forge answers `gh` argv from memory. It therefore cannot pay the
// first-contact bill of Problem 2 (docs/design/stories/293.md:70-75): a `gh`
// argv that is WRONG against the real GitHub passes here exactly as it passed
// against golden-argv tests. #318 and #319 exercised `git`, never `gh`. That
// bill is still unpaid and this task cannot pay it.

import type { GhResponse } from "iai-core";
import { checkArgv, type ExecResult, type Port } from "iai-exec";

// ---------------------------------------------------------------------------
// The five lies
// ---------------------------------------------------------------------------

/** The five injectable failure modes, per references/gh-error-handling.md and
 *  docs/design/stories/293.md:368-372.
 *
 *  A CLOSED SET, and its size is a denominator. Case 9 of
 *  docs/test-plans/293-plan.md asserts 5 of 5 are injectable, so a sixth mode
 *  added without a case is a visible edit here rather than a silent widening. */
export type FailureMode =
  | "rate-limit-zeroed-budget"
  | "forbidden-no-budget-header"
  | "truncated-list"
  | "silent-no-op-mutation"
  | "transient-connection-error";

export const FAILURE_MODES: readonly FailureMode[] = [
  "rate-limit-zeroed-budget",
  "forbidden-no-budget-header",
  "truncated-list",
  "silent-no-op-mutation",
  "transient-connection-error",
];

/** Emitted when the fake is asked for an operation it does not model.
 *
 *  DISTINCT FROM EVERY OTHER NON-ZERO CODE ON PURPOSE. `REFUSED_EXIT_CODE`
 *  (packages/exec/src/real.ts:34) means the port refused to launch; 1 means
 *  the forge answered with a failure; this means the fake has no answer at
 *  all. Collapsing the three would let "the fake does not model this" be read
 *  as "GitHub said no", which is the shadowing failure NEVER-293.7 exists to
 *  prevent, arriving through a different door. */
export const FAKE_UNMODELLED_EXIT_CODE = 125;

/** The budget headers a rate-limited response carries when they were captured.
 *
 *  MIXED CASE DELIBERATELY. packages/core/src/gh/errors.ts:153-158 records
 *  that `getHeaderCaseInsensitive` exists because a literal
 *  `headers["x-ratelimit-remaining"]` would silently miss
 *  `X-RateLimit-Remaining`. A fake that only ever emitted the lowercase form
 *  would leave that function unexercised, and a mutation collapsing it to a
 *  literal lookup would survive. */
export const RATE_LIMIT_HEADERS_MIXED_CASE: Readonly<Record<string, string>> = {
  "X-RateLimit-Limit": "5000",
  "X-RateLimit-Remaining": "0",
  "X-RateLimit-Used": "5000",
};

/** The same budget, lowercased. Not emitted by the fake -- it exists so a test
 *  can exercise the other half of the case-insensitive lookup against the same
 *  classifier. */
export const RATE_LIMIT_HEADERS_LOWER_CASE: Readonly<Record<string, string>> = {
  "x-ratelimit-limit": "5000",
  "x-ratelimit-remaining": "0",
  "x-ratelimit-used": "5000",
};

// `gh`'s own error format for a 403 is ASSUMED, NOT OBSERVED, and this comment
// is the second home of that provenance -- packages/core/src/gh/errors.ts
// :199-206 is the first, and it says a 403 "was not reproduced live (provoking
// a real rate limit was not attempted...)".
//
// THE LOOP THAT MUST NOT BE CLOSED SILENTLY: if the string below is authored
// to satisfy HTTP_403_RE (errors.ts:206) and the test is then written against
// whatever this fake emits, the fake and the regex are tuned to each other and
// CAN BOTH BE WRONG ABOUT REAL GITHUB TOGETHER. That is
// references/verification.md:79-88's non-representative-corpus failure in its
// purest form. The first real 403 -- which is #324, the live rung -- is what
// confirms or refutes it. Until then both strings carry provenance `assumed`.

/** Rate limited, budget header captured and zero. */
const RATE_LIMITED_STDERR =
  "gh: HTTP 403: API rate limit exceeded for user ID 0 " +
  "(https://api.github.com/repos/OWNER/REPO/milestones)";

/** The THIRD STATE: a 403 with no budget header captured.
 *
 *  This is the one most likely to be forgotten, and
 *  references/gh-error-handling.md:56-60 explains why it is also the COMMON
 *  case: `gh api --include` appears nowhere in this repository, so the usual
 *  situation is that no headers were captured at all.
 *
 *  IT MUST NOT CONTAIN THE SECONDARY-LIMIT PHRASE. errors.ts:226-228 tests
 *  SECONDARY_RATE_LIMIT_RE first and short-circuits, so a stray "secondary
 *  rate limit" here would classify as `rate-limited` and collapse this mode
 *  into the one above -- two modes that differ only in the value they quote
 *  are one mode. */
const FORBIDDEN_NO_HEADER_STDERR =
  "gh: HTTP 403: Resource not accessible by integration " +
  "(https://api.github.com/repos/OWNER/REPO/milestones)";

/** references/gh-error-handling.md:122-125 -- observed three times in a single
 *  session, each succeeding on immediate retry. */
const TRANSIENT_STDERR = "gh: error connecting to api.github.com: connection reset by peer";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface FakeMilestone {
  readonly number: number;
  readonly title: string;
  readonly description: string;
}

export interface FakeIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly milestone: string | null;
  readonly labels: readonly string[];
}

export interface FakeComment {
  readonly id: number;
  readonly issue: number;
  readonly body: string;
}

/** One answered call, in the envelope the kernel already declares.
 *
 *  TYPED AS `GhResponse` (packages/core/src/gh/types.ts:65-70) AND NOT AS A
 *  NEW SHAPE. That interface was designed in S1.3 for exactly this handoff --
 *  "a VALUE handed in by the caller, never a lookup, because a lookup is I/O"
 *  -- and `classifyRateLimit` (errors.ts:217) takes it directly. Five Stories
 *  later this is the first adapter able to hand it one.
 *
 *  `headers` IS NOT ON `ExecResult` AND MUST NOT BE ADDED TO IT.
 *  `createRealPort` can never populate it, because nothing in this repository
 *  passes `gh api --include`; widening packages/exec/src/port.ts:34-38 would
 *  be a type that lies to every implementation for one test's benefit. */
export interface FakeGhResponse extends GhResponse {
  readonly argv: readonly string[];
}

export interface FakeForge extends Port {
  /** Arm a lie, or `null` to answer honestly. */
  inject(mode: FailureMode | null): void;
  readonly injected: FailureMode | null;
  /** Every answer given, with the headers the kernel's classifier wants. */
  readonly responses: readonly FakeGhResponse[];
  /** Drop the answer log. State is NOT cleared: a forge that forgot its
   *  milestones between run 1 and run 2 would make every skill idempotent by
   *  construction, which is the result the harness exists to disprove. */
  reset(): void;
}

export interface FakeForgeOptions {
  /** Seeded milestones, in order. */
  readonly milestones?: readonly Pick<FakeMilestone, "title" | "description">[];
  /** Anything the fake does not model as `gh` -- notably every `git` argv --
   *  is handed here. The fixture repository runs its git through the SAME port
   *  the fake occupies, so a harness wiring both surfaces passes a real port in
   *  and gets one seam for packages/exec/src/recording.ts to wrap. */
  readonly delegate?: Port;
}

// ---------------------------------------------------------------------------
// argv classification
// ---------------------------------------------------------------------------

/** Whether a `gh` argv is a MUTATION rather than a read.
 *
 *  #321 owns the two-surface mutation recorder and must REUSE this rather than
 *  build a second classifier -- the handoff's standing rule, and the same one
 *  that kept #49's git layer from becoming a second port. Two classifiers
 *  disagreeing about whether `gh issue edit` mutates is a disagreement no test
 *  would surface until a run 2 quietly scored zero. */
export function isMutatingGhArgv(argv: readonly string[]): boolean {
  if (argv[0] !== "gh") return false;
  const verb = argv[1];
  if (verb === "api") {
    const method = flagValue(argv, "--method");
    return method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
  }
  if (verb === "issue" || verb === "pr" || verb === "label") {
    const action = argv[2];
    return (
      action === "create" ||
      action === "edit" ||
      action === "close" ||
      action === "comment" ||
      action === "ready" ||
      action === "delete"
    );
  }
  return false;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

/** All values of a repeatable flag, e.g. every `--label`. */
function flagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (const [index, part] of argv.entries()) {
    if (part !== flag) continue;
    const value = argv[index + 1];
    if (value !== undefined) values.push(value);
  }
  return values;
}

/** A `-f key=value` field, as `gh api` takes them. */
function fieldValue(argv: readonly string[], key: string): string | undefined {
  const prefix = `${key}=`;
  for (const [index, part] of argv.entries()) {
    if (part !== "-f") continue;
    const pair = argv[index + 1];
    if (pair !== undefined && pair.startsWith(prefix)) return pair.slice(prefix.length);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The fake
// ---------------------------------------------------------------------------

export function createFakeForge(options: FakeForgeOptions = {}): FakeForge {
  const milestones: FakeMilestone[] = [];
  const issues: FakeIssue[] = [];
  const comments: FakeComment[] = [];
  const responses: FakeGhResponse[] = [];

  let nextMilestone = 1;
  let nextIssue = 1;
  let nextComment = 1000;

  let injected: FailureMode | null = null;
  // The transient error is TRANSIENT: it spends itself on the first call after
  // it is armed and the identical argv then succeeds. A mode that failed for
  // ever would be indistinguishable from a fatal one, and
  // references/gh-error-handling.md:130 -- "retry once before believing a
  // failure" -- would be untestable against it.
  let transientSpent = false;

  for (const seed of options.milestones ?? []) {
    milestones.push({
      number: nextMilestone++,
      title: seed.title,
      description: seed.description,
    });
  }

  function record(argv: readonly string[], response: GhResponse): ExecResult {
    responses.push({ argv: [...argv], ...response });
    return { exitCode: response.exitCode, stdout: response.stdout, stderr: response.stderr };
  }

  function fail(
    argv: readonly string[],
    stderr: string,
    headers?: Readonly<Record<string, string>>,
  ): ExecResult {
    return record(
      argv,
      headers === undefined
        ? { exitCode: 1, stdout: "", stderr }
        : { exitCode: 1, stdout: "", stderr, headers },
    );
  }

  function ok(argv: readonly string[], stdout: string): ExecResult {
    return record(argv, { exitCode: 0, stdout, stderr: "" });
  }

  /** The lie applied to a READ, if one is armed. `null` means answer honestly. */
  function lieOnRead(argv: readonly string[]): ExecResult | null {
    if (injected === "rate-limit-zeroed-budget") {
      return fail(argv, RATE_LIMITED_STDERR, RATE_LIMIT_HEADERS_MIXED_CASE);
    }
    if (injected === "forbidden-no-budget-header") {
      return fail(argv, FORBIDDEN_NO_HEADER_STDERR);
    }
    if (injected === "transient-connection-error" && !transientSpent) {
      transientSpent = true;
      return fail(argv, TRANSIENT_STDERR);
    }
    return null;
  }

  /** The lie applied to a MUTATION, if one is armed. */
  function lieOnMutation(argv: readonly string[]): ExecResult | null {
    if (injected === "transient-connection-error" && !transientSpent) {
      transientSpent = true;
      return fail(argv, TRANSIENT_STDERR);
    }
    if (injected === "silent-no-op-mutation") {
      // Exit 0, nothing written. `gh pr ready` has done this for real
      // (references/gh-error-handling.md:126), and it is the reason case 8
      // may not assert acceptance from an exit code: a silent no-op and a
      // real acceptance are the same verdict and different reasons.
      return ok(argv, "");
    }
    return null;
  }

  /** Truncate a list the way an unpaginated read truncates it: return a
   *  PREFIX and say nothing about the remainder.
   *
   *  The last element is dropped because the newest object is the one a
   *  re-entrant skill just created and is about to look for. Dropping it turns
   *  "present" into "absent", and absence is what every create step keys on.
   *
   *  IT TRUNCATES DESPITE `--paginate`. packages/core/src/gh/milestones.ts
   *  :34-36 passes that flag precisely because "the milestone is missing" is
   *  indistinguishable from "the milestone is on page two" without it -- so a
   *  fake that honoured the flag could never reproduce the hazard the flag was
   *  added to prevent. */
  function truncate<T>(items: readonly T[]): readonly T[] {
    return injected === "truncated-list" ? items.slice(0, -1) : items;
  }

  function unmodelled(argv: readonly string[]): ExecResult {
    return record(argv, {
      exitCode: FAKE_UNMODELLED_EXIT_CODE,
      stdout: "",
      // No "403", no "secondary rate limit": an unmodelled operation is a gap
      // in the fake, never a forge refusal, and classifyRateLimit must read it
      // as `not-rate-limited`.
      stderr:
        `the fake forge does not model this operation: ${argv.join(" ")}. ` +
        "It is a gap in the double, not an answer from a forge, and it is exit " +
        `${FAKE_UNMODELLED_EXIT_CODE} so it can never be read as either a refusal or a rejection`,
    });
  }

  function milestonesJson(): string {
    return JSON.stringify(
      truncate(milestones).map((m) => ({
        number: m.number,
        title: m.title,
        description: m.description,
        state: "open",
      })),
    );
  }

  function issuesJson(): string {
    return JSON.stringify(
      truncate(issues).map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body,
        labels: i.labels.map((name) => ({ name })),
        milestone: i.milestone === null ? null : { title: i.milestone },
        state: "open",
      })),
    );
  }

  function handleApi(argv: readonly string[]): ExecResult {
    const method = flagValue(argv, "--method");
    const path = argv.find(
      (part, index) =>
        index > 1 &&
        !part.startsWith("-") &&
        argv[index - 1] !== "--method" &&
        argv[index - 1] !== "-f",
    );
    if (path === undefined) return unmodelled(argv);

    // Milestone list: GET .../milestones?...
    if (method === undefined && /\/milestones\?/.test(path)) {
      const lie = lieOnRead(argv);
      return lie ?? ok(argv, milestonesJson());
    }

    // Milestone create: POST .../milestones
    if (method === "POST" && /\/milestones$/.test(path)) {
      const lie = lieOnMutation(argv);
      if (lie) return lie;
      const title = fieldValue(argv, "title");
      if (title === undefined) return unmodelled(argv);
      // NO DUPLICATE CHECK, AND THIS ABSENCE IS THE CLAIM. GitHub answers 422
      // here; NEVER-293.7 requires the fake to accept, so that run 2's silence
      // is the SKILL's decision and never the double's.
      const created: FakeMilestone = {
        number: nextMilestone++,
        title,
        description: fieldValue(argv, "description") ?? "",
      };
      milestones.push(created);
      return ok(argv, JSON.stringify({ number: created.number, title: created.title }));
    }

    // Comment edit: PATCH .../issues/comments/{id}
    const commentEdit = /\/issues\/comments\/(\d+)$/.exec(path);
    if (method === "PATCH" && commentEdit) {
      const lie = lieOnMutation(argv);
      if (lie) return lie;
      const id = Number(commentEdit[1]);
      const index = comments.findIndex((c) => c.id === id);
      if (index === -1) return unmodelled(argv);
      const existing = comments[index] as FakeComment;
      comments[index] = { ...existing, body: fieldValue(argv, "body") ?? existing.body };
      return ok(argv, JSON.stringify({ id }));
    }

    return unmodelled(argv);
  }

  function handleIssue(argv: readonly string[]): ExecResult {
    const action = argv[2];

    if (action === "list") {
      const lie = lieOnRead(argv);
      return lie ?? ok(argv, issuesJson());
    }

    if (action === "view") {
      const lie = lieOnRead(argv);
      if (lie) return lie;
      const number = Number(argv[3]);
      const issue = issues.find((i) => i.number === number);
      if (issue === undefined) return unmodelled(argv);
      const own = comments.filter((c) => c.issue === number);
      return ok(
        argv,
        JSON.stringify({
          number: issue.number,
          title: issue.title,
          body: issue.body,
          comments: truncate(own).map((c) => ({ id: c.id, body: c.body })),
        }),
      );
    }

    if (action === "create") {
      const lie = lieOnMutation(argv);
      if (lie) return lie;
      const title = flagValue(argv, "--title");
      if (title === undefined) return unmodelled(argv);
      // Again no duplicate check: the feature row's description text is
      // `story-create`'s identity key (skills/story-create/SKILL.md:93) and the
      // fake must not be the thing that notices.
      const created: FakeIssue = {
        number: nextIssue++,
        title,
        body: flagValue(argv, "--body") ?? "",
        milestone: flagValue(argv, "--milestone") ?? null,
        labels: flagValues(argv, "--label"),
      };
      issues.push(created);
      return ok(argv, `https://github.com/OWNER/REPO/issues/${created.number}`);
    }

    if (action === "comment") {
      const lie = lieOnMutation(argv);
      if (lie) return lie;
      const number = Number(argv[3]);
      const body = flagValue(argv, "--body");
      if (!Number.isInteger(number) || body === undefined) return unmodelled(argv);
      // And again: a second `## iai-design` sentinel is accepted. "One
      // sentinel, one comment" (skills/story-design/SKILL.md:79) is the
      // SKILL's contract, and a fake that upserted on its behalf would score
      // every skill compliant including one that never read the comment list.
      const created: FakeComment = { id: nextComment++, issue: number, body };
      comments.push(created);
      return ok(
        argv,
        `https://github.com/OWNER/REPO/issues/${number}#issuecomment-${created.id}`,
      );
    }

    if (action === "edit") {
      const lie = lieOnMutation(argv);
      if (lie) return lie;
      const number = Number(argv[3]);
      const index = issues.findIndex((i) => i.number === number);
      if (index === -1) return unmodelled(argv);
      const existing = issues[index] as FakeIssue;
      issues[index] = { ...existing, body: flagValue(argv, "--body") ?? existing.body };
      return ok(argv, "");
    }

    return unmodelled(argv);
  }

  return {
    get injected() {
      return injected;
    },
    get responses() {
      return responses;
    },
    inject(mode: FailureMode | null) {
      injected = mode;
      transientSpent = false;
    },
    reset() {
      responses.length = 0;
    },
    async run(argv: readonly string[]): Promise<ExecResult> {
      // The port's own validation, reused rather than restated -- port.ts:72-73
      // says checkArgv is pure "so it is testable without a process and
      // reusable by the fake". A fake that accepted an argv the real port
      // refuses would be green over inputs production rejects.
      const check = checkArgv(argv);
      if (!check.ok) {
        return record(argv, {
          exitCode: FAKE_UNMODELLED_EXIT_CODE,
          stdout: "",
          stderr: check.refusal.message,
        });
      }

      if (argv[0] !== "gh") {
        const delegate = options.delegate;
        if (delegate === undefined) return unmodelled(argv);
        // Delegated calls are NOT recorded in `responses`: this log is the
        // forge's answers, and a git result carrying a forge envelope would
        // put the two surfaces of CLAIM-293.8 back into one list.
        return delegate.run(argv);
      }

      if (argv[1] === "api") return handleApi(argv);
      if (argv[1] === "issue") return handleIssue(argv);
      return unmodelled(argv);
    },
  };
}
