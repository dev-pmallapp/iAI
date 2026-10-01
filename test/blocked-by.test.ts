import { describe, expect, test } from "bun:test";
import {
  BLOCKED_BY_PREFIX,
  BLOCKED_BY_SEPARATOR,
  renderBlockedByLine,
  renderPrBody,
} from "../packages/core/src/index";

// ===========================================================================
// CASE 9 of docs/test-plans/47-plan.md — CLAIM-47.2, P0, tool-checked,
// corpus: real — the shipped renderer and checklist builder.
//
//   "Exactly ONE `Blocked by:` line, comma-separated, and the order matches
//    the parent checklist exactly with a deliberately unsorted input.
//    A per-line emission fails, pinning NEVER-21.7."
//
// CLAIM-47.2 was restated at the gate (G2). The seeded wording said
// dependencies appear as `Blocked by: #N` LINES, plural. That contradicts
// Decision 8 of docs/design/stories/21.md:213 — *"Comma rejection is
// per-directive, not generic: `Closes` is per-line; `Blocked by:` is
// comma-separated and correct."*
// ===========================================================================
describe("case 9 (CLAIM-47.2): the dependency declaration is one comma-joined line", () => {
  test("exactly one line, whatever the number of blockers", () => {
    for (const issues of [[1], [1, 2], [905, 906, 907, 908]]) {
      const line = renderBlockedByLine(issues);
      expect(line.split("\n")).toHaveLength(1);
      expect(line.startsWith(BLOCKED_BY_PREFIX)).toBe(true);
    }
  });

  // THE UNSORTED INPUT THE CASE ASKS FOR BY NAME. A renderer that sorted
  // would return the identical string for an already-ordered input, so the
  // input here is deliberately descending: the only way to pass is to not
  // reorder.
  test("order is preserved exactly, with a deliberately unsorted input", () => {
    expect(renderBlockedByLine([907, 905, 906])).toBe(`${BLOCKED_BY_PREFIX}#907, #905, #906`);

    // And the negative statement said directly: the sorted form is NOT what
    // this produces. Without this, a future sort would only be caught by the
    // literal above, which reads like a formatting detail.
    expect(renderBlockedByLine([907, 905, 906])).not.toBe(`${BLOCKED_BY_PREFIX}#905, #906, #907`);
  });

  // A PER-LINE EMISSION FAILS — the case's own words, and the half that
  // pins the restatement rather than the implementation.
  test("a per-line emission is not what this renders, for any input", () => {
    for (const issues of [[1, 2], [905, 906, 907]]) {
      const line = renderBlockedByLine(issues);
      // One prefix, not one per issue: the plural form would repeat it.
      expect(line.split(BLOCKED_BY_PREFIX)).toHaveLength(2);
      expect(line).toContain(BLOCKED_BY_SEPARATOR);
    }
  });

  test("a single blocker carries no separator", () => {
    expect(renderBlockedByLine([905])).toBe(`${BLOCKED_BY_PREFIX}#905`);
    expect(renderBlockedByLine([905])).not.toContain(BLOCKED_BY_SEPARATOR);
  });
});

// ===========================================================================
// THE TWO CONSUMERS AGREE — the reason this form is a module at all.
//
// Until #48 the shape lived inline in `renderPrBody`. CLAIM-47.2 puts the
// same directive on task ISSUE bodies, and a second emitter is where a
// contract starts to drift. This is the assertion that proves the PR body and
// the shared renderer produce the same line rather than merely looking alike
// — the same posture #316 used for the hard-failure block one Story earlier.
// ===========================================================================
describe("renderPrBody's Blocked by line comes from the shared renderer (#48)", () => {
  test("the PR body contains exactly the shared renderer's output, in the same order", () => {
    const issues = [907, 905, 906];

    const result = renderPrBody({
      // A TASK PR: NEVER-47.8 forbids one carrying a `Closes` directive, so
      // this is also the kind for which `Blocked by:` is the only list
      // directive in play.
      kind: "task",
      base: "story/47-s2-3-execution-skills",
      blockedBy: issues,
      body: "x",
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    const body = result.ok ? result.value : "";

    const expected = renderBlockedByLine(issues);
    expect(body).toContain(expected);

    // Exactly one such line in the whole body, and it is unsorted — so the
    // PR path cannot be quietly emitting a second, sorted, per-line variant
    // somewhere else in the same body.
    const occurrences = body.split("\n").filter((l) => l.startsWith(BLOCKED_BY_PREFIX));
    expect(occurrences).toEqual([expected]);
  });
});
