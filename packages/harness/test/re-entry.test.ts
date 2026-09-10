// #322, step A: the promoted `## Re-entry` parser, tested on its own.
//
// Corpus: `real` over `skills/` for the corpus-shaped assertions, `synthetic`
// for the two behaviour notes -- a directory added without a body, and a body
// with no `## Re-entry` section -- neither of which the real corpus currently
// exercises.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  countReEntryRows,
  createTempDirs,
  readSkillBodies,
  readSkillNames,
  reEntryRows,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");
const skillsDir = join(repoRoot, "skills");
const temps = createTempDirs();
afterAll(() => temps.cleanup());

// ===========================================================================
// The denominator: skill names off the real corpus
// ===========================================================================

describe("readSkillNames over the real corpus", () => {
  test("the count is non-zero, and the names are pairwise distinct", () => {
    const names = readSkillNames(skillsDir);
    expect(names.length).toBeGreaterThan(0);
    // Cardinality, not length: a name repeated would satisfy `.length` while
    // hiding that two directories collapsed onto one key.
    expect(new Set(names).size).toBe(names.length);
  });
});

// ===========================================================================
// reEntryRows over the real corpus: the total agrees with countReEntryRows
// ===========================================================================

describe("reEntryRows over the real corpus", () => {
  test("the row count is non-zero, and its total equals the sum of countReEntryRows's values", () => {
    const rows = reEntryRows(skillsDir);
    expect(rows.length).toBeGreaterThan(0);

    const counts = countReEntryRows(skillsDir);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(rows.length);
  });

  test("every skill in countReEntryRows is a skill readSkillNames reports, and vice versa", () => {
    const names = readSkillNames(skillsDir);
    expect(names.length).toBeGreaterThan(0);
    const counts = countReEntryRows(skillsDir);
    expect(Object.keys(counts).sort()).toEqual([...names].sort());
  });
});

// ===========================================================================
// row is 1-based and contiguous, per skill
// ===========================================================================

describe("row is 1-based and contiguous per skill", () => {
  test("for every skill with at least one row, its row numbers are exactly 1..n with no gaps", () => {
    const rows = reEntryRows(skillsDir);
    expect(rows.length).toBeGreaterThan(0);

    const names = readSkillNames(skillsDir);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const rowNumbers = rows.filter((r) => r.skill === name).map((r) => r.row);
      if (rowNumbers.length === 0) continue;
      // ASSERT THE LIST, not the count: `toBe(n)` would pass if row 2 were
      // duplicated and row 3 were dropped, which is exactly the kind of gap
      // this assertion exists to catch.
      const expected = Array.from({ length: rowNumbers.length }, (_, i) => i + 1);
      expect(rowNumbers).toEqual(expected);
    }
  });
});

// ===========================================================================
// Synthetic fixtures: the two behaviour notes
// ===========================================================================

describe("a directory with no SKILL.md is skipped, not thrown", () => {
  test("readSkillBodies over a synthetic tree with a bodyless directory does not throw, and skips it", () => {
    const root = temps.create("iai-322-reentry-nobody");
    mkdirSync(join(root, "has-body"), { recursive: true });
    writeFileSync(
      join(root, "has-body", "SKILL.md"),
      ["# has-body", "", "## Re-entry", "", "| Read first |", "|---|", "| a check |", ""].join("\n"),
      "utf8",
    );
    mkdirSync(join(root, "no-body"), { recursive: true });
    // Deliberately no SKILL.md written under "no-body".

    let bodies: readonly { readonly name: string; readonly text: string }[] = [];
    expect(() => {
      bodies = readSkillBodies(root);
    }).not.toThrow();

    expect(bodies.map((b) => b.name)).toEqual(["has-body"]);
    expect(readSkillNames(root)).toEqual(["has-body"]);
  });
});

describe("a body with no ## Re-entry section contributes zero rows, but is still counted as a skill", () => {
  test("readSkillNames includes it, countReEntryRows keys it at zero, and reEntryRows adds no row for it", () => {
    const root = temps.create("iai-322-reentry-noreentry");
    mkdirSync(join(root, "with-reentry"), { recursive: true });
    writeFileSync(
      join(root, "with-reentry", "SKILL.md"),
      ["# with-reentry", "", "## Re-entry", "", "| Read first |", "|---|", "| a check |", ""].join("\n"),
      "utf8",
    );
    mkdirSync(join(root, "no-reentry"), { recursive: true });
    writeFileSync(
      join(root, "no-reentry", "SKILL.md"),
      ["# no-reentry", "", "## Problem", "", "no Re-entry section here at all", ""].join("\n"),
      "utf8",
    );

    const names = readSkillNames(root);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual(["no-reentry", "with-reentry"]);

    const rows = reEntryRows(root);
    expect(rows.filter((r) => r.skill === "no-reentry")).toEqual([]);
    expect(rows.filter((r) => r.skill === "with-reentry").length).toBeGreaterThan(0);

    const counts = countReEntryRows(root);
    expect(counts["no-reentry"]).toBe(0);
    expect(counts["with-reentry"]).toBeGreaterThan(0);
  });
});
