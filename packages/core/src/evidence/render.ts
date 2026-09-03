// The character budget and the two rendering strategies (issue #29,
// CLAIM-26.4, NEVER-26.10).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Still outside the `no-io-in-pure-modules` scope until #261 (NEVER-26.7).
//
// THREE QUANTITIES, NOT ONE. This is Decision 5 of docs/design/stories/26.md,
// approved at the design-approval gate on #26, and it resolves a real
// contradiction rather than tidying one away.
//
//   docs/design/03-workflow.md:413 heads its decision column "Artifact size".
//   docs/milestones/M1.md:174 constrains "no emitted comment body exceeds
//   65,536 characters".
//
// Those are different quantities. An artifact of 59,999 characters plus an
// envelope is not 59,999 characters. Both are enforceable at once precisely
// because the gap between 60,000 and 65,536 is the room the envelope needs:
//
//   1. the inline/summary choice reads ARTIFACT size, at <= 60000
//   2. the rendered COMMENT BODY is capped at 65536
//   3. the ENVELOPE -- rendered minus inlined artifact -- is bounded at 5536
//
// Bound 3 appears in NO DOCUMENT. docs/design/03-workflow.md:411 says the
// remainder is "headroom for the sentinel, metadata and permalinks" and
// nothing computes it. Making it an enforced bound is what turns the slogan
// into something a test can fail, and it is what makes bound 2 hold BY
// CONSTRUCTION rather than by luck: 60000 + 5536 = 65536 exactly.
import { lintSentinelComment } from "./lint";
import { isShaPinnedPermalink, requireShaPinnedPermalink } from "./permalink";
import { sentinelFor, type SentinelName } from "./sentinel";
import { evFail, evOk, safeOwnString, safeOwnValue, type EvidenceResult } from "./types";

// The working budget. Artifacts at or below this are inlined.
//
// EXPORTED FOR S1.5. docs/milestones/M1.md:214-216 (CLAIM-31.5) requires the
// registry to reject a binding whose `evidence.budgetChars` EXCEEDS 60,000 —
// so `budgetChars: 60000`, which all six EvidenceSpec literals in the tree
// use, is legal. Decision 11 commits this Story to exporting the constant
// rather than letting S1.5 restate the literal.
export const BUDGET_CHARS = 60000;

// GitHub's stated cap on an issue comment body.
//
// ENFORCED AS AN EXPLICITLY UNVERIFIED INHERITED CONSTANT. Nothing in this
// repository establishes it. It is asserted three times — at
// docs/design/03-workflow.md:410, docs/design/01-skill-hierarchy.md:230 and
// docs/milestones/M1.md:23 — and every verification row attributes it to
// forge's gh-api.md reference, which is a document in an ancestor repository
// and not a file in this tree. docs/design/00-synthesis.md:80 frames it as a
// forge inheritance.
//
// It is enforced rather than dropped because the failure mode of an over-long
// body is a rejected API call, and failing closed at 65536 costs nothing if
// the number turns out to be merely conservative. Marked here so a future
// reader finds a known assumption rather than a fact.
export const HARD_LIMIT_CHARS = 65536;

// The envelope's own budget, authored by Decision 5. See the header.
export const ENVELOPE_BUDGET_CHARS = HARD_LIMIT_CHARS - BUDGET_CHARS;

export type RenderStrategy = "inline" | "summary";

// docs/design/03-workflow.md:415-416. `<=` is deliberate and load-bearing:
// CLAIM-26.4 names only 59,999 and 60,001, while docs/milestones/M1.md:189
// demands a fixture at exactly 60,000. The rule that settles it is
// docs/design/03-workflow.md:415 -- "<= 60000 chars | Inline" -- and Decision 5
// adopts it, so 60,000 inlines.
export function chooseStrategy(artifactChars: number): RenderStrategy {
  if (!Number.isFinite(artifactChars) || artifactChars < 0) return "summary";
  return artifactChars <= BUDGET_CHARS ? "inline" : "summary";
}

export interface EvidenceCommentInput {
  readonly sentinel: SentinelName;
  readonly artifact: string;
  readonly story?: number;
  readonly run?: string;
  readonly verdict?: string;
  readonly cases?: string;
  // Required when the strategy is `summary`. NEVER-26.10 makes it
  // non-optional there: a summary without a permalink is a dead end, because
  // the payload is on disk and nothing points at it.
  readonly permalink?: string;
  // Emit `## iai-verdict PASS` rather than a bare sentinel. Legal per
  // Decision 4 and used at docs/design/04-domain-dev.md:474.
  readonly verdictOnSentinelLine?: boolean;
}

export interface RenderedComment {
  readonly body: string;
  readonly strategy: RenderStrategy;
  readonly artifactChars: number;
  // body length minus inlined artifact length. For a summary the artifact is
  // not inlined, so this is the whole body.
  readonly envelopeChars: number;
}

// "184 kB" in the worked example at docs/design/03-workflow.md:424. SI kB
// (1000), not KiB, because the example's own figure reads as SI.
function humanSize(chars: number): string {
  if (chars < 1000) return `${String(chars)} characters`;
  return `${String(Math.round(chars / 1000))} kB`;
}

function metadataLine(story: number | undefined, run: string | undefined, verdict: string | undefined): string | undefined {
  const parts: string[] = [];
  if (story !== undefined) parts.push(`**Story:** #${String(story)}`);
  if (run !== undefined && run.length > 0) parts.push(`**Run:** ${run}`);
  if (verdict !== undefined && verdict.length > 0) parts.push(`**Verdict:** ${verdict}`);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

// Renders one sentinel comment body.
//
// The shape follows the only rendered example in the tree,
// docs/design/03-workflow.md:418-426, adopted by Decision 6 because
// docs/milestones/M1.md:186 names "summary rendering" a build target and no
// document specifies it. Its implicit fields are pinned here so they stop
// being implicit: sentinel line, metadata line, counts line, a size statement,
// and the permalink as a BARE URL on its own line. The example uses a bare
// URL rather than a markdown link, and a bare URL survives being pasted into
// a terminal.
//
// TRUNCATION IS NOT A STRATEGY. scripts/bootstrap-github.sh:44 truncates
// milestone descriptions at a 10,000-character budget and is the only
// over-budget precedent in the tree. It is deliberately not adopted:
// docs/design/03-workflow.md:416 says summary PLUS permalink, and
// packages/core/src/gh/comments.ts:24-27 already records that this choice is
// this Story's. A truncated artifact is a silently incomplete record; a
// summary plus a permalink is a complete one.
export function renderSentinelComment(input: unknown): EvidenceResult<RenderedComment> {
  const sentinelName = safeOwnValue(input, "sentinel");
  const artifact = safeOwnString(input, "artifact");
  const permalink = safeOwnString(input, "permalink");
  const run = safeOwnString(input, "run");
  const verdict = safeOwnString(input, "verdict");
  const cases = safeOwnString(input, "cases");
  const storyRaw = safeOwnValue(input, "story");
  const onLine = safeOwnValue(input, "verdictOnSentinelLine") === true;

  if (typeof sentinelName !== "string") return evFail("sentinel is missing");
  if (artifact === undefined) return evFail("artifact must be a string");
  const story =
    typeof storyRaw === "number" && Number.isInteger(storyRaw) && storyRaw > 0
      ? storyRaw
      : undefined;

  const sentinelLine =
    onLine && verdict !== undefined && verdict.length > 0
      ? `${sentinelFor(sentinelName as SentinelName)} ${verdict}`
      : sentinelFor(sentinelName as SentinelName);

  const artifactChars = artifact.length;
  const strategy = chooseStrategy(artifactChars);

  const header: string[] = [sentinelLine, ""];
  const meta = metadataLine(story, run, verdict);
  if (meta !== undefined) header.push(meta);
  if (cases !== undefined && cases.length > 0) header.push(`**Cases:** ${cases}`);
  if (header.length > 2) header.push("");

  let body: string;
  if (strategy === "inline") {
    // An artifact that itself carries a column-zero `## iai-*` heading would
    // make the rendered comment carry two sentinels, breaking #27's
    // one-per-comment rule. Fail closed and say what to do instead, rather
    // than emitting a body the linter rejects.
    body = `${header.join("\n")}${artifact}`;
  } else {
    const checked = requireShaPinnedPermalink(permalink);
    if (!checked.ok) {
      return evFail(
        `a ${humanSize(artifactChars)} artifact exceeds the ${String(BUDGET_CHARS)}-character ` +
          `budget and must be rendered as a summary plus an SHA-pinned permalink, but ` +
          `the permalink is unusable: ${checked.reason}`,
      );
    }
    body =
      `${header.join("\n")}Full output (${humanSize(artifactChars)}) exceeds the inline budget:\n` +
      `${checked.value}\n`;
  }

  const envelopeChars = strategy === "inline" ? body.length - artifactChars : body.length;

  if (envelopeChars > ENVELOPE_BUDGET_CHARS) {
    return evFail(
      `the rendered envelope is ${String(envelopeChars)} characters, over the ` +
        `${String(ENVELOPE_BUDGET_CHARS)}-character budget reserved for the sentinel, ` +
        "metadata and permalink; that reserve is what keeps a full-budget artifact " +
        `under the ${String(HARD_LIMIT_CHARS)}-character hard limit`,
    );
  }

  // UNREACHABLE WHILE THE CONSTANTS COMPOSE, and kept deliberately.
  //
  // An inline body is at most BUDGET_CHARS + ENVELOPE_BUDGET_CHARS, and the
  // envelope check above has already returned. A summary body is envelope
  // only. Since ENVELOPE_BUDGET_CHARS is DERIVED as HARD_LIMIT_CHARS -
  // BUDGET_CHARS, the sum is exactly HARD_LIMIT_CHARS and this branch cannot
  // fire.
  //
  // Mutation-testing confirmed it: deleting this check breaks no test, which
  // makes it an equivalent mutant rather than an untested branch. It is kept
  // because docs/milestones/M1.md:174 states the 65,536 constraint directly,
  // and code that no longer mentions the number a claim names is code that has
  // quietly stopped implementing it. The relationship that makes this
  // unreachable is what is actually protected — case 11 asserts
  // BUDGET_CHARS + ENVELOPE_BUDGET_CHARS === HARD_LIMIT_CHARS, and decoupling
  // them fails that test.
  if (body.length > HARD_LIMIT_CHARS) {
    return evFail(
      `the rendered body is ${String(body.length)} characters, over GitHub's ` +
        `${String(HARD_LIMIT_CHARS)}-character hard limit`,
    );
  }

  // The renderer validates its own output against #27's linter. NEVER-26.10
  // requires that nothing is placed above the sentinel line and that the body
  // is well formed; asserting it here makes it a structural property of every
  // rendered comment rather than something each test has to remember to check.
  //
  // This is also the only thing that catches an inlined artifact carrying its
  // own column-zero `## iai-*` heading, which would otherwise ship a body with
  // two sentinels.
  const violations = lintSentinelComment(body, sentinelName as SentinelName);
  if (violations.length > 0) {
    const first = violations[0];
    return evFail(
      `the rendered body fails the sentinel linter: ${first?.message ?? "unknown"}` +
        (strategy === "inline"
          ? ". An artifact carrying its own column-zero `## iai-*` heading cannot be " +
            "inlined; render it as a summary plus a permalink instead"
          : ""),
    );
  }

  return evOk({ body, strategy, artifactChars, envelopeChars });
}

// True when every permalink in a rendered body is SHA-pinned. NEVER-26.10's
// "no rendered summary omits the permalink" half is enforced in the renderer;
// this is the read-side predicate a verifier uses over a posted comment.
export function bodyPermalinksArePinned(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const urls = body.match(/https?:\/\/\S+/g);
  if (urls === null) return true;
  return urls.every((url) => !url.includes("/blob/") || isShaPinnedPermalink(url));
}
