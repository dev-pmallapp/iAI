// Tests for the transcription gap NEVER-293.5 (Task #323). Three cases:
// case 16 (P0, NEVER-293.5), case 17 (P0, NEVER-293.5), and case 18's
// tool-checked denominator (P0, CLAIM-293.11).
//
// Copied from test/skill-harness.test.ts's own conventions exactly: the
// `spawnHarness` helper shape, `repoRoot` from `import.meta.dir`,
// `createTempDirs()` with an `afterAll` teardown, and the `HarnessArtifact`
// interface. THE EXIT CODE IS ASSERTED FIRST in any spawn test.

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDirs } from "../packages/harness/src/tempdir";
import { countReEntryRows, readSkillBodies, reEntryRows } from "../packages/harness/src/re-entry";

const repoRoot = join(import.meta.dir, "..");
const realSkillsDir = join(repoRoot, "skills");

const temps = createTempDirs();
afterAll(() => temps.cleanup());

interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function spawnHarness(args: readonly string[]): Promise<Spawned> {
  const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "skill-harness.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

interface HarnessArtifact {
  readonly schemaVersion: number;
  readonly verdict: "pass" | "fail";
  readonly exitCode: 0 | 1;
  readonly failures: readonly unknown[];
  readonly denominators: {
    readonly skillsOnDisk: readonly string[];
    readonly rosterLength: number;
    readonly scenariosExecuted: number;
    readonly scenariosPerSkill: Readonly<Record<string, number>>;
    readonly reEntryRows: Readonly<Record<string, number>>;
    readonly seedTreeHashes: readonly string[];
  };
  readonly notVerified: readonly string[];
}

// ===========================================================================
// Helpers shared by the mutation in block 1.
// ===========================================================================

/** Find the `## Re-entry` section's line range in a SKILL.md's text: the
 *  heading line whose trimmed text is exactly `## Re-entry`, up to the next
 *  line starting with `## ` (or the end of the file). Mirrors
 *  packages/harness/src/re-entry.ts's own section-boundary rule exactly, so
 *  the mutation below operates on the same section the reader parses. */
function findReEntrySection(lines: readonly string[]): { start: number; end: number } {
  const start = lines.findIndex((l) => l.trim() === "## Re-entry");
  if (start === -1) throw new Error("## Re-entry heading not found");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if ((lines[i] as string).startsWith("## ")) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** Swap the first two `## Re-entry` DATA rows (header + separator dropped,
 *  same `.slice(2)` re-entry.ts itself takes) of one SKILL.md's text, and
 *  return both the mutated text and the two swapped-row strings so the
 *  caller can assert the swap actually happened. */
function swapFirstTwoReEntryRows(text: string): {
  mutatedText: string;
  originalDataRows: readonly string[];
  mutatedDataRows: readonly string[];
} {
  const lines = text.split("\n");
  const { start, end } = findReEntrySection(lines);
  const sectionLines = lines.slice(start, end);
  const tableLineIndices: number[] = [];
  for (let i = 0; i < sectionLines.length; i += 1) {
    if ((sectionLines[i] as string).startsWith("|")) tableLineIndices.push(i);
  }
  // Drop the header row and the `|---|---|` separator: the first two
  // `|`-prefixed lines in the section.
  const dataRowIndices = tableLineIndices.slice(2);
  if (dataRowIndices.length < 2) {
    throw new Error("fewer than 2 data rows in ## Re-entry table");
  }
  const originalDataRows = dataRowIndices.map((i) => sectionLines[i] as string);

  const [firstIdx, secondIdx] = dataRowIndices as [number, number];
  const firstLine = sectionLines[firstIdx] as string;
  const secondLine = sectionLines[secondIdx] as string;
  const mutatedSectionLines = sectionLines.slice();
  mutatedSectionLines[firstIdx] = secondLine;
  mutatedSectionLines[secondIdx] = firstLine;

  const mutatedDataRows = dataRowIndices.map((i) => mutatedSectionLines[i] as string);

  const mutatedLines = lines.slice();
  mutatedLines.splice(start, end - start, ...mutatedSectionLines);
  return { mutatedText: mutatedLines.join("\n"), originalDataRows, mutatedDataRows };
}

// ===========================================================================
// BLOCK 1 -- case 16 (P0, NEVER-293.5): mutating a SKILL.md leaves the seam
// rung green.
// ===========================================================================
//
// THIS CASE PASSES WHEN THE HARNESS DOES NOT NOTICE. That is not a bug in
// this test, and it is not a bug in the harness -- it is NEVER-293.5, and
// gate ruling G2 (docs/design/stories/293.md) made mechanical: no green
// harness run, however thorough, may be read as licence to upgrade
// CLAIM-41.8 or CLAIM-47.4 off `model-judged`, and this case is the proof
// that the harness's own population cannot carry that upgrade even by
// accident.
//
// The harness's population is a TRANSCRIPTION of a `## Re-entry` table, not
// the model reading the markdown. Concretely: `packages/harness/src/re-entry.ts`
// attributes each `ctx.read(<row>, ...)` call in
// `packages/harness/src/transcription-<skill>.ts` to a row NUMBER written by
// hand, by a reviewer, once -- see `docs/audits/293-transcription-audit.md`.
// At run time the harness (via `countReEntryRows`) reads only the row COUNT
// off disk. Nothing at run time re-derives which table row a transcribed
// step corresponds to, or checks that the table's ORDER matches the
// transcription's execution order.
//
// That is exactly why swapping two data rows must leave the harness green:
// the count is unchanged (it's a permutation, not a deletion -- asserted
// below), so `countReEntryRows` agrees between the mutated tree and the real
// one, and the harness has no other lever it pulls on this table.
//
// It would be tempting to call that a hole and demand the harness go red on
// a reordered table. IT MUST NOT. `docs/audits/293-transcription-audit.md`
// records, row by row, that three of the four transcriptions already
// execute their `## Re-entry` rows OUT OF the table's written order, each
// for a reason recorded in that document (a hard-failure read that must run
// before any create, a re-read that must not reuse an earlier result, a
// sentinel body that cannot be written before the read that pins it). Each
// skill body states the read-before-write CONSTRAINT itself, never a
// top-to-bottom sequence. A harness that went red on THIS reorder would be
// asserting an ordering the skill bodies never claimed, and would fail on
// three of the four skills as they are honestly shipped today.
//
// DO NOT "REPAIR" THIS TEST. Deleting it, or "fixing" it so the harness must
// go red here, deletes the only published, tool-checked measurement of the
// transcription gap. The gap that remains real -- a cell's TEXT changing to
// mean something else -- is bounded instead by CLAIM-293.11 (block 3) and by
// case 17 (block 2), which is exactly why this repository keeps that gap
// `model-judged` rather than pretending a green run here closes it.
describe("case 16 (P0, NEVER-293.5): mutating a SKILL.md leaves the seam rung green", () => {
  const bodies = readSkillBodies(realSkillsDir);

  // DENOMINATOR NON-ZERO FIRST, and exactly 4 -- so "4 of 4 bodies" is
  // visible in the output rather than a silently short loop.
  test("0. the real skills directory carries exactly 4 skill bodies", () => {
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.length).toBe(4);
  });

  // THE CONTROL. Four green runs against mutated copies prove nothing unless
  // `--skills-dir` is load-bearing: if the flag were ignored -- or silently
  // fell back to the repository's real `skills/` -- every mutation below
  // would run against an UNMUTATED corpus and pass vacuously, and the whole
  // block would be green for the wrong reason. A pure row reorder is
  // invisible in the artifact (that is the point of case 16), so nothing in
  // a green run can distinguish the two directories. This test supplies the
  // distinguishing evidence separately: a copy carrying a FIFTH skill, which
  // no scenario covers, must turn the harness RED. If it does not, the flag
  // is not being honoured and every assertion below is worthless.
  test("0b. control: --skills-dir is load-bearing, so the four runs below are not vacuous", async () => {
    const controlDir = temps.create("iai-transcription-gap-control-");
    cpSync(realSkillsDir, controlDir, { recursive: true });
    const extra = join(controlDir, "not-a-real-skill");
    mkdirSync(extra, { recursive: true });
    writeFileSync(join(extra, "SKILL.md"), "# not a real skill\n\n## Re-entry\n\n| Read first | Then, and only then |\n|---|---|\n| Does this exist? | it does not |\n", "utf8");

    // Assert the control corpus really differs from the real one before
    // drawing any conclusion from the run -- a control that is not a control
    // reports the answer you were hoping for.
    expect(readSkillBodies(controlDir).length).toBe(bodies.length + 1);

    const outPath = join(temps.create("iai-transcription-gap-control-out-"), "report.json");
    const spawned = await spawnHarness(["--skills-dir", controlDir, "--out", outPath]);
    expect(spawned.exitCode).not.toBe(0);
    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as HarnessArtifact;
    expect(artifact.verdict).toBe("fail");
    expect(artifact.failures.length).toBeGreaterThan(0);
  });

  // Driven one at a time -- 4 separate `test()` calls -- rather than a
  // single loop-wrapped assertion, so each skill's pass/fail is its own
  // line in the test output.
  for (const body of bodies) {
    test(`mutating only ${body.name}'s SKILL.md (swap first two Re-entry rows) leaves the harness green`, async () => {
      const skillNames = readdirSync(realSkillsDir).filter((name) =>
        statSync(join(realSkillsDir, name)).isDirectory(),
      );
      expect(skillNames.length).toBe(4);

      const mutatedSkillsDir = temps.create(`iai-transcription-gap-${body.name}-`);
      for (const name of skillNames) {
        cpSync(join(realSkillsDir, name), join(mutatedSkillsDir, name), { recursive: true });
      }
      // All four skills must be present in the copy, or the harness's
      // per-skill coverage denominator fails for reasons unrelated to this
      // mutation.
      for (const name of skillNames) {
        expect(existsSync(join(mutatedSkillsDir, name, "SKILL.md"))).toBe(true);
      }

      const skillMdPath = join(mutatedSkillsDir, body.name, "SKILL.md");
      const originalText = readFileSync(skillMdPath, "utf8");
      const { mutatedText, originalDataRows, mutatedDataRows } = swapFirstTwoReEntryRows(originalText);

      // THE MUTATION MUST ASSERT ITS PATTERN MATCHED.
      // (a) the section was found and there are at least 2 data rows --
      // implicit: swapFirstTwoReEntryRows throws otherwise, and a throw
      // inside this test would fail it, not silently no-op it.
      expect(originalDataRows.length).toBeGreaterThanOrEqual(2);
      // (b) the mutated text differs from the original.
      expect(mutatedText).not.toBe(originalText);
      // (c) the two swapped line strings are exchanged at their indices.
      expect(mutatedDataRows[0]).toBe(originalDataRows[1]);
      expect(mutatedDataRows[1]).toBe(originalDataRows[0]);
      // (d) the multiset of data-row lines is unchanged -- a permutation,
      // not a deletion.
      expect([...mutatedDataRows].sort()).toEqual([...originalDataRows].sort());

      writeFileSync(skillMdPath, mutatedText, "utf8");

      // The reorder must not change the denominator.
      expect(countReEntryRows(mutatedSkillsDir)).toEqual(countReEntryRows(realSkillsDir));

      const outPath = join(temps.create("iai-transcription-gap-out-"), "report.json");
      const spawned = await spawnHarness(["--skills-dir", mutatedSkillsDir, "--out", outPath]);

      // THE EXIT CODE FIRST.
      expect(spawned.exitCode).toBe(0);

      const artifact = JSON.parse(readFileSync(outPath, "utf8")) as HarnessArtifact;
      expect(artifact.verdict).toBe("pass");
      expect(artifact.failures).toEqual([]);
    });
  }
});

// ===========================================================================
// BLOCK 2 -- case 17 (P0, NEVER-293.5): the transcription gap is published.
// ===========================================================================
//
// Gate ruling G2 says the seam rung's green may never upgrade CLAIM-41.8 or
// CLAIM-47.4 off `model-judged`. CLAIM-41.8's population is the MODEL
// reading the markdown; the harness's population (block 1, above) is a
// TRANSCRIPTION of it -- a different population, however green the run is.
// This assertion is what makes that prohibition MECHANICAL rather than
// cultural: it reads `docs/test-plans/41-plan.md` itself, at run time, and
// fails if a future edit ever quietly promoted CLAIM-41.8's row out of
// `model-judged`, or split it into more than one row.
describe("case 17 (P0, NEVER-293.5): the transcription gap is published", () => {
  const planPath = join(repoRoot, "docs", "test-plans", "41-plan.md");
  const planText = readFileSync(planPath, "utf8");
  const rows = planText
    .split("\n")
    .filter((l) => l.startsWith("|"))
    .map((l) => l.split("|"));

  // | # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
  //   0   1       2            3        4          5          6        7         8   (index 0 is empty, from the leading `|`)
  const CLAIM_41_8_ROWS = rows.filter((cells) => (cells[3] ?? "").trim() === "CLAIM-41.8");

  test("exactly one row in the case table anchors to CLAIM-41.8", () => {
    expect(CLAIM_41_8_ROWS.length).toBe(1);
  });

  test("that row's Verifier column is model-judged, never tool-checked", () => {
    const row = CLAIM_41_8_ROWS[0] as string[];
    expect((row[6] ?? "").trim()).toBe("model-judged");
  });
});

// ===========================================================================
// BLOCK 3 -- case 18's tool-checked denominator (P0, CLAIM-293.11).
// ===========================================================================
//
// CLAIM-293.11 is `model-judged`, and its VERDICT lives in
// docs/audits/293-transcription-audit.md, written by hand -- not here. This
// block is only its DENOMINATOR, which IS tool-checked: the row count is
// read off each skill body at run time via `countReEntryRows`, never
// hardcoded, and this test asserts the audit's own row set against it. That
// catches a row ADDED to a `## Re-entry` table (or the audit) with no
// counterpart on the other side, and a row REMOVED the same way. IT CANNOT
// CATCH A CELL EDITED -- a row whose "Read first" text changed to mean
// something else, with the audit's corresponding cell edited to match,
// passes this test exactly as cleanly as a row nobody touched. Do not read
// a green run of this block as CLAIM-293.11 itself; it is the denominator
// CLAIM-293.11 depends on, and no more.
describe("case 18's tool-checked denominator (P0, CLAIM-293.11)", () => {
  const auditPath = join(repoRoot, "docs", "audits", "293-transcription-audit.md");
  const auditText = readFileSync(auditPath, "utf8");
  const auditLines = auditText.split("\n");

  // CRITICAL PARSING RULE: parse ONLY the table inside `## The audit`, up to
  // the next line starting with `## `. The document also carries a LATER
  // summary table whose rows also begin with a skill name followed by an
  // integer -- parsing the whole file would double-count and hide a defect
  // rather than reveal one.
  const sectionStart = auditLines.findIndex((l) => l.trim() === "## The audit");
  if (sectionStart === -1) throw new Error("## The audit section not found");
  let sectionEnd = auditLines.length;
  for (let i = sectionStart + 1; i < auditLines.length; i += 1) {
    if ((auditLines[i] as string).startsWith("## ")) {
      sectionEnd = i;
      break;
    }
  }
  const sectionLines = auditLines.slice(sectionStart, sectionEnd);
  // `## The audit` MUST CONTAIN EXACTLY ONE TABLE, AND THAT IS ASSERTED, NOT
  // ASSUMED. The document also carries a per-skill summary table whose rows
  // likewise begin with a skill name followed by an integer; while the two
  // shared a section, a section-wide parse collected 23 pairs instead of 16,
  // silently double-counting four skills. That error INFLATES the
  // denominator, which is the direction that hides a missing row.
  //
  // Taking "the first contiguous run of `|` lines" would tolerate the second
  // table instead of reporting it — and would then silently read the WRONG
  // table if one were ever inserted above this one. So the structural
  // constraint the summary table's own admonition states is enforced here:
  // every `|`-prefixed line in the section must form ONE contiguous block.
  // A second table in this section fails the test that depends on there
  // being one, which is the only way a document convention stays true.
  const tableIdx = sectionLines
    .map((l, i) => (l.startsWith("|") ? i : -1))
    .filter((i) => i !== -1);
  if (tableIdx.length === 0) throw new Error("no table found in ## The audit section");
  const first = tableIdx[0] as number;
  const last = tableIdx[tableIdx.length - 1] as number;
  const contiguous = last - first + 1 === tableIdx.length;
  const tableLines = sectionLines.slice(first, last + 1);
  // Drop the header row and the `|---|---|...|` separator.
  const dataLines = tableLines.slice(2);
  const audited = dataLines.map((line) => {
    const cells = line.split("|");
    return { skill: (cells[1] ?? "").trim(), row: Number((cells[2] ?? "").trim()) };
  });

  const onDiskRows = reEntryRows(realSkillsDir);
  const onDiskBodies = readSkillBodies(realSkillsDir);

  test("0. `## The audit` holds exactly one table, so the parse reads the rows it means to", () => {
    // If this fails, a second table has been added to the section (most
    // likely the summary table moved back under it). Do not relax the
    // parser: move the table out, under its own heading.
    expect(contiguous).toBe(true);
  });

  test("1. denominator non-zero first: on-disk Re-entry rows and skill bodies are both non-empty", () => {
    expect(onDiskRows.length).toBeGreaterThan(0);
    expect(onDiskBodies.length).toBeGreaterThan(0);
  });

  test("2. cardinality, not length: the audited (skill, row) pairs contain no duplicate", () => {
    const pairs = audited.map((a) => `${a.skill}#${a.row}`);
    expect(new Set(pairs).size).toBe(audited.length);
  });

  test("3. the audited (skill, row) pair set equals exactly the on-disk set", () => {
    const auditedPairs = audited.map((a) => `${a.skill}#${a.row}`).sort();
    const onDiskPairs = onDiskRows.map((r) => `${r.skill}#${r.row}`).sort();
    expect(auditedPairs).toEqual(onDiskPairs);
    expect(onDiskPairs).toEqual(auditedPairs);
  });

  test("4. per-skill audited row counts deep-equal countReEntryRows on disk", () => {
    const auditedCounts: Record<string, number> = {};
    for (const name of readSkillBodies(realSkillsDir).map((b) => b.name)) auditedCounts[name] = 0;
    for (const a of audited) auditedCounts[a.skill] = (auditedCounts[a.skill] ?? 0) + 1;
    expect(auditedCounts).toEqual(countReEntryRows(realSkillsDir));
  });
});
