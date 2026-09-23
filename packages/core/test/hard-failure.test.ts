import { describe, expect, test } from "bun:test";
import {
  HARD_FAILURE_ACTION_PREFIX,
  HARD_FAILURE_HEADLINE_PREFIX,
  HARD_FAILURE_SUBJECT_KINDS,
  HardFailureInputError,
  renderHardFailure,
} from "../src/index";

// NOTE ON SCOPE (#316): the module's "two directions" property — that a
// rendered block also satisfies skill-lint's `hard-failure-block` rule, for
// every member of HARD_FAILURE_SUBJECT_KINDS — is NOT in this file. Importing
// `scripts/skill-lint` from `packages/core/test/` trips the repository's own
// `no-host-import` lint rule (scope: core; see
// packages/core/test/binding-conformance.test.ts for the same discovery made
// on a different import), because it resolves outside packages/core. That one
// property lives in `test/skill-lint.test.ts` instead, appended alongside the
// existing hard-failure-block coverage there, which already imports
// `scripts/skill-lint` from outside any package's scope.

describe("HARD_FAILURE_SUBJECT_KINDS", () => {
  test("is Milestone, Story, Goal, in that order — broadest to narrowest per gate ruling G-a on #47, and skill-lint's hard-failure-block message text names this order", () => {
    expect(HARD_FAILURE_SUBJECT_KINDS).toEqual(["Milestone", "Story", "Goal"]);
  });

  test("has exactly 3 members — the denominator, so a silently added kind is noticed", () => {
    expect(HARD_FAILURE_SUBJECT_KINDS.length).toBe(3);
  });
});

describe("renderHardFailure — the canonical shape (phase 6, skill task-do, Story 902)", () => {
  const canonical = renderHardFailure({
    phase: 6,
    skill: "task-do",
    subject: { kind: "Story", value: 902 },
    expected: "rung:research or rung:paper for an /iai:auto run",
    found: "rung:live",
    remedy: "Fix and re-run.",
  });

  // Directly comparable to docs/design/03-workflow.md:498-504's fenced block —
  // same phase, same skill, same Story, so the literal below can be read
  // side by side with the doc rather than trusted on faith.
  test("renders the exact 5-line block, byte for byte", () => {
    expect(canonical).toBe(
      "HARD FAILURE in Phase 6 (task-do):\n" +
        "- Story: #902\n" +
        "- Expected: rung:research or rung:paper for an /iai:auto run\n" +
        "- Found: rung:live\n" +
        "- Action: Pipeline cannot continue. Fix and re-run.",
    );
  });

  test("has exactly 5 lines and no trailing newline", () => {
    const lines = canonical.split("\n");
    expect(lines.length).toBe(5);
    expect(canonical.endsWith("\n")).toBe(false);
  });

  test("starts with HARD_FAILURE_HEADLINE_PREFIX, and the 5th line starts with HARD_FAILURE_ACTION_PREFIX", () => {
    // Asserted against the imported constants, never a restated literal —
    // restating either here would let the test and the renderer drift
    // together instead of the test catching the drift.
    expect(canonical.startsWith(HARD_FAILURE_HEADLINE_PREFIX)).toBe(true);
    const lines = canonical.split("\n");
    expect(lines[4]?.startsWith(HARD_FAILURE_ACTION_PREFIX)).toBe(true);
  });
});

describe("the # sigil rule", () => {
  test("Story renders with the # sigil", () => {
    const block = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Story", value: 902 },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    expect(block).toContain("- Story: #902");
  });

  test("Goal renders with NO # sigil — a Goal names an identifier from the goals source, not a forge issue", () => {
    const block = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Goal", value: "g-1" },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    expect(block).toContain("- Goal: g-1");
  });

  test("Milestone renders with NO # sigil", () => {
    const block = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Milestone", value: "M2" },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    expect(block).toContain("- Milestone: M2");
  });

  test("a Story value already carrying # renders identically to the bare form — the sigil is stripped exactly once", () => {
    const withHash = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Story", value: "#902" },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    const bare = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Story", value: 902 },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    expect(withHash).toBe(bare);
  });

  // "##902" is NOT repaired to "#902" — only one leading "#" is ever
  // stripped. Same posture as risk-mandate.ts's RUNG_LABEL_PREFIX, which
  // strips at most one "rung:" prefix so "rung:rung:live" stays visibly
  // wrong rather than being silently fixed into a permitted rung.
  test('"##902" renders "- Story: ##902" — not repaired', () => {
    const block = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Story", value: "##902" },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    expect(block).toContain("- Story: ##902");
  });

  test("a numeric value and the equivalent string value render identically", () => {
    const numeric = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Story", value: 902 },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    const stringy = renderHardFailure({
      phase: 0,
      skill: "x",
      subject: { kind: "Story", value: "902" },
      expected: "e",
      found: "f",
      remedy: "r",
    });
    expect(numeric).toBe(stringy);
  });
});

describe("input rejection — all throw HardFailureInputError", () => {
  const valid = {
    phase: 0,
    skill: "x",
    subject: { kind: "Story" as const, value: 1 },
    expected: "e",
    found: "f",
    remedy: "r",
  };

  const blankableFields = ["skill", "expected", "found", "remedy"] as const;

  // Asserted FIRST so the loop below cannot pass vacuously if a field were
  // silently dropped from the checked set.
  test("the loop below covers exactly the 4 blankable string fields", () => {
    expect(blankableFields.length).toBe(4);
  });

  for (const field of blankableFields) {
    test(`blank ${field} throws HardFailureInputError`, () => {
      expect(() => renderHardFailure({ ...valid, [field]: "" })).toThrow(HardFailureInputError);
    });

    test(`whitespace-only ${field} throws HardFailureInputError`, () => {
      expect(() => renderHardFailure({ ...valid, [field]: "   " })).toThrow(HardFailureInputError);
    });
  }

  test("blank subject.value throws HardFailureInputError", () => {
    expect(() =>
      renderHardFailure({ ...valid, subject: { kind: "Story", value: "" } }),
    ).toThrow(HardFailureInputError);
  });

  // A newline in `expected` would forge an extra bullet line, letting a
  // caller inject a field the spec does not have — or split the Action line
  // so the invariant "- Action: ..." prefix is still literally present but
  // no longer governs the line it opens.
  test("a newline inside expected throws HardFailureInputError", () => {
    expect(() => renderHardFailure({ ...valid, expected: "line one\nline two" })).toThrow(
      HardFailureInputError,
    );
  });

  // Same hazard, the other invariant slot.
  test("a newline inside remedy throws HardFailureInputError", () => {
    expect(() => renderHardFailure({ ...valid, remedy: "line one\nline two" })).toThrow(
      HardFailureInputError,
    );
  });

  test("a negative phase throws HardFailureInputError", () => {
    expect(() => renderHardFailure({ ...valid, phase: -1 })).toThrow(HardFailureInputError);
  });

  test("a non-integer phase throws HardFailureInputError", () => {
    expect(() => renderHardFailure({ ...valid, phase: 1.5 })).toThrow(HardFailureInputError);
  });

  test("NaN phase throws HardFailureInputError", () => {
    expect(() => renderHardFailure({ ...valid, phase: NaN })).toThrow(HardFailureInputError);
  });

  // Boundary: phase 0 is VALID and must NOT throw — all four shipped prose
  // bodies use phase 0, so a defect here would break every one of them.
  test("phase 0 is valid and does not throw", () => {
    expect(() => renderHardFailure({ ...valid, phase: 0 })).not.toThrow();
  });
});
