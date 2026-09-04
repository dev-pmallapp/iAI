// The sentinel linter (issue #27, CLAIM-26.1).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// See the note in sentinel.ts — the lint rule does not cover this directory
// until #261.
//
// FIVE RULES, NOT FOUR. This is Decision 3 of docs/design/stories/26.md,
// approved at the design-approval gate on #26.
//
// docs/design/03-workflow.md:388-392 defines five producer requirements.
// CLAIM-26.1 as seeded at docs/milestones/M1.md:165-167 named four — it drops
// `Exact` (docs/design/03-workflow.md:391), the only rule carrying heading
// level, case and hyphenation. docs/design/verification-pass.md:434
// independently drops the same rule while citing the range that contains it.
//
// A linter built to the seed would accept `### iai-design` and `## IAI-Design`,
// and heading level is precisely what a markdown author gets wrong. Shipping
// four rules would leave the fifth unenforced and invisible, which is the
// skill-lint failure mode recorded at docs/design/stories/21.md:339-341.
//
// WHY EACH RULE CARRIES ITS OWN MESSAGE:
//
// CLAIM-26.1 says "with a distinct message". An implementation returning
// "malformed sentinel" five times satisfies a test that only counts
// rejections, and tells the author who tripped it nothing. Case 3 of
// docs/test-plans/26-plan.md exists to exclude exactly that, and it is the
// same class of defect as a check that passes while scanning nothing.
import {
  matchSentinelLine,
  safeSentinelLabel,
  SENTINEL_NAMESPACE_PREFIX,
  type SentinelName,
} from "./sentinel";

export type SentinelRuleId =
  | "first-line"
  | "column-zero"
  | "not-fenced"
  | "exact"
  | "one-per-comment";

// Every rule the linter enforces, in the order docs/design/03-workflow.md:388-392
// states them. Exported so a test can assert the set is complete rather than
// counting violations and hoping.
export const SENTINEL_RULE_IDS: readonly SentinelRuleId[] = [
  "first-line",
  "column-zero",
  "not-fenced",
  "exact",
  "one-per-comment",
];

export interface SentinelViolation {
  readonly rule: SentinelRuleId;
  // 1-based, matching the convention in guards/claim-lint.ts. 0 means the
  // violation is about the body as a whole rather than a specific line.
  readonly line: number;
  readonly message: string;
}

// A line that is ATTEMPTING to be a sentinel. Deliberately loose: it must
// catch the near-misses the `Exact` rule exists to reject, so it cannot
// require `##`, a single space, or lowercase.
//
// Groups: indent, hashes, separator, name-ish token, trailing payload.
const CANDIDATE_RE = /^([ \t]*)(#{1,6})([ \t]*)(iai[-_][A-Za-z0-9_-]*)(.*)$/i;

// A fence opener or closer. Indented fences are still fences.
const FENCE_RE = /^[ \t]*(```|~~~)/;

interface Candidate {
  readonly line: number;
  readonly indent: string;
  readonly bare: string;
  readonly insideFence: boolean;
}

function violation(rule: SentinelRuleId, line: number, message: string): SentinelViolation {
  return { rule, line, message };
}

// Lints one comment body against all five producer rules.
//
// Returns every violation found rather than the first, so a body with two
// faults reports two. A fenced sentinel that is consequently not on line 1
// legitimately reports both `not-fenced` and `first-line` — both are true, and
// suppressing one would hide a real fault to make a fixture tidier.
//
// Total over hostile input (NEVER-26.8): a non-string body yields a single
// violation rather than a throw.
export function lintSentinelComment(
  body: unknown,
  expected?: SentinelName,
): readonly SentinelViolation[] {
  if (typeof body !== "string") {
    return [
      violation(
        "first-line",
        0,
        "first-line: the comment body is not a string, so it carries no sentinel; " +
          `the body must open with "${SENTINEL_NAMESPACE_PREFIX}<name>"`,
      ),
    ];
  }

  const lines = body.split("\n");
  const candidates: Candidate[] = [];
  let fenced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = CANDIDATE_RE.exec(line);
    if (match !== null) {
      const indent = match[1] ?? "";
      candidates.push({
        line: index + 1,
        indent,
        bare: line.slice(indent.length),
        insideFence: fenced,
      });
    }
    // Toggled AFTER the candidate test so the fence opener itself is never a
    // candidate, and a sentinel on the line following the opener is correctly
    // seen as fenced.
    if (FENCE_RE.test(line)) fenced = !fenced;
  }

  const violations: SentinelViolation[] = [];

  if (candidates.length === 0) {
    violations.push(
      violation(
        "first-line",
        0,
        "first-line: no sentinel found anywhere in the body; the sentinel must be " +
          `the first line, as "${SENTINEL_NAMESPACE_PREFIX}<name>"`,
      ),
    );
    return violations;
  }

  for (const candidate of candidates) {
    if (candidate.insideFence) {
      violations.push(
        violation(
          "not-fenced",
          candidate.line,
          "not-fenced: the sentinel sits inside a code fence; a fenced sentinel is " +
            "documentation, not a sentinel (docs/design/03-workflow.md:390)",
        ),
      );
    }
    if (candidate.indent !== "") {
      violations.push(
        violation(
          "column-zero",
          candidate.line,
          "column-zero: the sentinel is indented; a leading space breaks the match, " +
            "so it must start at column zero",
        ),
      );
    }
    // The single definition of well-formed, shared with the consumer's
    // matcher. Tying the two together is what stops the producer emitting a
    // shape the consumer cannot find.
    if (matchSentinelLine(candidate.bare) === undefined) {
      violations.push(
        violation(
          "exact",
          candidate.line,
          "exact: the sentinel is not in the exact form — it must be lowercase, " +
            `hyphenated, at "##" heading level and one of the nine known names, as ` +
            `"${SENTINEL_NAMESPACE_PREFIX}<name>"`,
        ),
      );
    }
  }

  if (candidates.length > 1) {
    const second = candidates[1];
    violations.push(
      violation(
        "one-per-comment",
        second === undefined ? 0 : second.line,
        `one-per-comment: the body carries ${candidates.length} sentinels; a comment ` +
          "carries exactly one",
      ),
    );
  }

  const opensWithCandidate = candidates.some((candidate) => candidate.line === 1);
  if (!opensWithCandidate) {
    violations.push(
      violation(
        "first-line",
        1,
        "first-line: the sentinel is not the first line of the comment body; nothing " +
          "may precede it, not a greeting and not a blank-line-prefixed preamble",
      ),
    );
  }

  // Only checked once the shape is otherwise sound, so a malformed sentinel
  // reports its shape fault rather than a confusing "wrong name".
  if (expected !== undefined && violations.length === 0) {
    const first = candidates[0];
    const actual = first === undefined ? undefined : matchSentinelLine(first.bare);
    if (actual !== expected) {
      violations.push(
        violation(
          "exact",
          first === undefined ? 0 : first.line,
          `exact: expected the "${SENTINEL_NAMESPACE_PREFIX}${safeSentinelLabel(expected)}" ` +
            `sentinel but the body carries ` +
            `"${SENTINEL_NAMESPACE_PREFIX}${safeSentinelLabel(actual)}"`,
        ),
      );
    }
  }

  return violations;
}

// True when the body satisfies all five producer rules. The predicate a
// producer calls before posting.
export function isWellFormedSentinelComment(body: unknown, expected?: SentinelName): boolean {
  return lintSentinelComment(body, expected).length === 0;
}
