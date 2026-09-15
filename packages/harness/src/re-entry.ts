// The Re-entry parser, promoted out of a test file so #322's runner does not
// have to build a second one.
//
// `skillBodies` and `reentryRows` existed only as private helpers in
// packages/harness/test/fake-forge.test.ts (~:46-51 and ~:150-171). Their
// logic is copied here EXACTLY -- same parsing, same section-boundary rule,
// same `.slice(2)`, same column-1 extraction -- and that test now imports
// these instead of restating them.
//
// THE STANDING RULE THIS FOLLOWS IS ALREADY IN THIS PACKAGE.
// packages/harness/src/fake-forge.ts:216-222 forbids a second `gh` argv
// classifier: "#321 owns the two-surface mutation recorder and must REUSE
// this rather than build a second classifier... Two classifiers disagreeing
// ... is a disagreement no test would surface until a run 2 quietly scored
// zero." A second `## Re-entry` table parser is the same hazard one layer
// up: #322's runner needs the "Read first" column to know what a re-entrant
// skill is supposed to check, and a hand-rolled second parser there could
// disagree with the one case 8's tests were written against without either
// test noticing.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SkillBody {
  readonly name: string;
  readonly text: string;
}

export interface ReEntryRow {
  readonly skill: string;
  /** 1-based, and counted PER SKILL, not across the corpus -- so this and
   *  `countReEntryRows` agree on what "row 1" means for a given skill. */
  readonly row: number;
  readonly read: string;
}

/** Every directory under `skillsDir` that carries a SKILL.md, sorted by name.
 *
 *  A DIRECTORY WITH NO SKILL.md IS SKIPPED, NOT THROWN. The original private
 *  helper this was promoted from threw via `readFileSync` on a missing file;
 *  the guarded form here is the one test/skill-lint.test.ts's
 *  `realSkillFiles` (test/skill-lint.test.ts:1176-1186) already takes, via
 *  `existsSync`. A directory added without a body must not turn an unrelated
 *  caller -- anything that just wants the corpus -- into a crash. Where a
 *  missing body MUST fail loudly is a denominator assertion in the runner
 *  (#322), not here. */
export function readSkillBodies(skillsDir: string): readonly SkillBody[] {
  return readdirSync(skillsDir)
    .filter((name) => statSync(join(skillsDir, name)).isDirectory())
    .filter((name) => existsSync(join(skillsDir, name, "SKILL.md")))
    .map((name) => ({ name, text: readFileSync(join(skillsDir, name, "SKILL.md"), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkillNames(skillsDir: string): readonly string[] {
  return readSkillBodies(skillsDir).map((b) => b.name);
}

/** Every `## Re-entry` "Read first" cell, 1-based `row` PER SKILL.
 *
 *  Copied from the private `reentryRows()` this replaces: find the
 *  `## Re-entry` heading, take lines up to the NEXT `## ` heading (or the end
 *  of the body), keep the `|`-prefixed table lines, drop the header row and
 *  the `|---|---|` separator with `.slice(2)`, and read column 1 out of each
 *  remaining row. */
export function reEntryRows(skillsDir: string): readonly ReEntryRow[] {
  const rows: ReEntryRow[] = [];
  for (const body of readSkillBodies(skillsDir)) {
    const lines = body.text.split("\n");
    const start = lines.findIndex((l) => l.trim() === "## Re-entry");
    if (start === -1) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if ((lines[i] as string).startsWith("## ")) {
        end = i;
        break;
      }
    }
    const tableLines = lines.slice(start, end).filter((l) => l.startsWith("|"));
    // Drop the header row and the `|---|---|` separator.
    let row = 0;
    for (const line of tableLines.slice(2)) {
      const cell = (line.split("|")[1] ?? "").trim();
      if (cell.length === 0) continue;
      row += 1;
      rows.push({ skill: body.name, row, read: cell });
    }
  }
  return rows;
}

/** Per-skill row counts, keyed by skill name.
 *
 *  EVERY SKILL IS A KEY, INCLUDING ONE WITH ZERO ROWS. Seeding from
 *  `readSkillNames` before folding in `reEntryRows` means a body with no
 *  `## Re-entry` section is still counted as a skill -- it just carries the
 *  count 0 -- rather than being silently absent from the map. */
export function countReEntryRows(skillsDir: string): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of readSkillNames(skillsDir)) counts[name] = 0;
  for (const row of reEntryRows(skillsDir)) {
    counts[row.skill] = (counts[row.skill] ?? 0) + 1;
  }
  return counts;
}
