// #322, step A: the argv classifier, tested on its own -- and, deliberately,
// against the subtraction it exists to forbid.

import { describe, expect, test } from "bun:test";
import type { RecordedCall } from "iai-exec";
import { classifyArgv, countReads, isMutatingGhArgv, type ArgvKind } from "../src/index";

const REPO_FLAG = ["--repo", "O/R"] as const;

interface Case {
  readonly argv: readonly string[];
  readonly kind: ArgvKind;
}

// A DELIBERATELY MIXED ROSTER: every kind in `ArgvKind`, at least once, plus a
// negative control (`curl`) that names no executable this repository's port
// would ever be asked to run.
const ROSTER: readonly Case[] = [
  {
    argv: ["gh", "api", "--method", "POST", "repos/O/R/milestones", "-f", "title=x"],
    kind: "forge-mutation",
  },
  {
    argv: ["gh", "api", "--paginate", "repos/O/R/milestones?state=all"],
    kind: "forge-read",
  },
  { argv: ["gh", "issue", "list", ...REPO_FLAG], kind: "forge-read" },
  { argv: ["gh", "issue", "create", ...REPO_FLAG, "--title", "t"], kind: "forge-mutation" },
  { argv: ["gh", "issue", "comment", "1", ...REPO_FLAG, "--body", "b"], kind: "forge-mutation" },
  { argv: ["git", "-C", "/tmp/x", "status", "--porcelain"], kind: "git-read" },
  { argv: ["git", "-C", "/tmp/x", "rev-parse", "HEAD"], kind: "git-read" },
  { argv: ["git", "-C", "/tmp/x", "add", "-A"], kind: "git-write" },
  { argv: ["git", "-C", "/tmp/x", "commit", "-q", "-m", "m"], kind: "git-write" },
  { argv: ["git", "-C", "/tmp/x", "bisect"], kind: "unclassified" },
  { argv: ["curl", "https://example.invalid"], kind: "unclassified" },
];

const ALL_KINDS: readonly ArgvKind[] = [
  "forge-read",
  "forge-mutation",
  "git-read",
  "git-write",
  "unclassified",
];

describe("classifyArgv over a deliberately mixed roster", () => {
  test("the roster is non-empty, and every argv classifies as expected", () => {
    expect(ROSTER.length).toBeGreaterThan(0);
    const misclassified = ROSTER.filter((c) => classifyArgv(c.argv) !== c.kind).map(
      (c) => `${c.argv.join(" ")} -> expected ${c.kind}, got ${classifyArgv(c.argv)}`,
    );
    expect(misclassified).toEqual([]);
  });

  test("every kind in ArgvKind is exercised at least once", () => {
    const observed = new Set(ROSTER.map((c) => c.kind));
    // Assert the LIST of observed kinds, not just the cardinality number, so a
    // dropped kind names itself rather than leaving a bare "4 !== 5".
    expect([...observed].sort()).toEqual([...ALL_KINDS].sort());
    expect(observed.size).toBe(ALL_KINDS.length);
  });
});

describe("countReads over the roster", () => {
  function asCalls(cases: readonly Case[]): readonly RecordedCall[] {
    return cases.map((c) => ({ argv: c.argv, exitCode: 0 }));
  }

  test("countReads equals the number of read-kinds in the expectations table, not a re-derivation", () => {
    // Computed from the TABLE's own expected `kind`, never by calling
    // `classifyArgv` again -- a bug shared by the classifier and this
    // expectation would otherwise cancel out and this test would still pass.
    const expectedReads = ROSTER.filter(
      (c) => c.kind === "forge-read" || c.kind === "git-read",
    ).length;
    expect(expectedReads).toBeGreaterThan(0);

    expect(countReads(asCalls(ROSTER))).toBe(expectedReads);
  });

  test("the anti-subtraction assertion: countReads is not calls.length minus mutating-gh-argv count", () => {
    // THIS IS THE DEFECT THE MODULE EXISTS TO PREVENT. `isMutatingGhArgv`
    // returns `false` for every `git` argv by construction
    // (packages/harness/src/fake-forge.ts:224), so
    // `calls.length - calls.filter(isMutatingGhArgv).length` scores `git add`
    // and `git commit` as reads. Over a roster containing both, that
    // subtraction and the true read count must diverge, or this test is not
    // exercising the hazard it names.
    const gitWriteRoster = ROSTER.filter(
      (c) => c.argv[0] === "git" && (c.kind === "git-write" || c.kind === "git-read"),
    );
    expect(gitWriteRoster.some((c) => c.kind === "git-write")).toBe(true);

    const calls = asCalls(gitWriteRoster);
    const subtraction = calls.length - calls.filter((c) => isMutatingGhArgv(c.argv)).length;
    expect(countReads(calls)).not.toBe(subtraction);
  });
});
