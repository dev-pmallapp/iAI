// #322, step B3: the real scenario roster, run once through the real
// harness against the real `skills/` corpus and the real fake forge.
//
// Corpus: `real` over `skills/` for the corpus-shaped assertions (roster
// hygiene, skill coverage, Re-entry row counts); `synthetic` for every
// scenario's own fixture content (`SCENARIO_ROSTER`'s own header names each
// scenario's declaration). This file adds no new fixture of its own -- it
// exercises the one `../src/scenario-roster.ts` built.
//
// House anti-vacuity applies here too: denominators asserted `> 0` before any
// equality, lists asserted rather than counts, `new Set(...)` wherever
// cardinality (not length) is the property, no emoji, comments only where
// they record a decision.

import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createRealPort } from "iai-exec";
import {
  countReEntryRows,
  createTempDirs,
  readSkillNames,
  runHarness,
  SCENARIO_ROSTER,
  type HarnessVerdict,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");
const skillsDir = join(repoRoot, "skills");
const temps = createTempDirs();
afterAll(() => temps.cleanup());

// ===========================================================================
// Roster hygiene -- no full run required for any of this
// ===========================================================================

describe("roster hygiene", () => {
  test("the roster is non-empty", () => {
    expect(SCENARIO_ROSTER.length).toBeGreaterThan(0);
  });

  test("scenario ids are pairwise distinct", () => {
    const ids = SCENARIO_ROSTER.map((s) => s.id);
    // Cardinality, not length: two scenarios sharing an id would silently
    // collapse in the runner's own per-scenario bookkeeping.
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every scenario's skill is a member of readSkillNames(skillsDir) -- the unknown-skill list is empty", () => {
    const knownSkills = new Set(readSkillNames(skillsDir));
    expect(knownSkills.size).toBeGreaterThan(0); // denominator first
    const unknown = SCENARIO_ROSTER.filter((s) => !knownSkills.has(s.skill)).map((s) => `${s.id} -> ${s.skill}`);
    // ASSERT THE LIST. A typo'd skill name should name itself, not hide
    // behind a count.
    expect(unknown).toEqual([]);
  });
});

// ===========================================================================
// The one full run, memoised
// ===========================================================================

let verdictPromise: Promise<HarnessVerdict> | undefined;

function runFullRoster(): Promise<HarnessVerdict> {
  verdictPromise ??= runHarness({
    roster: SCENARIO_ROSTER,
    skillsDir,
    temps,
    makePort: () => createRealPort(),
  });
  return verdictPromise;
}

// ===========================================================================
// 2. The full run passes
// ===========================================================================

describe("the full roster run", () => {
  test("exitCode is 0 and failures is empty", async () => {
    const verdict = await runFullRoster();
    // ASSERT THE LIST, NOT A SUBSTRING OR A COUNT. If this fails, `failures`
    // IS the diagnosis -- weakening this to `.length === 0` or a substring
    // check would throw that diagnosis away.
    expect(verdict.failures).toEqual([]);
    expect(verdict.exitCode).toBe(0);
  });
});

// ===========================================================================
// 3. Every skill on disk has at least one scenario
// ===========================================================================

describe("every skill on disk is covered by the roster", () => {
  test("the list of uncovered skills is empty", () => {
    const skillsOnDisk = readSkillNames(skillsDir);
    expect(skillsOnDisk.length).toBeGreaterThan(0); // denominator first
    const covered = new Set(SCENARIO_ROSTER.map((s) => s.skill));
    const uncovered = skillsOnDisk.filter((skill) => !covered.has(skill));
    expect(uncovered).toEqual([]);
  });
});

// ===========================================================================
// 4. reEntryRows denominator agreement
// ===========================================================================

describe("the run's reEntryRows denominator agrees with countReEntryRows, and every value is positive", () => {
  test("agreement, then positivity", async () => {
    const verdict = await runFullRoster();
    const expected = countReEntryRows(skillsDir);
    expect(verdict.denominators.reEntryRows).toEqual(expected);

    const values = Object.values(verdict.denominators.reEntryRows);
    expect(values.length).toBeGreaterThan(0); // denominator first
    const nonPositive = Object.entries(verdict.denominators.reEntryRows).filter(([, count]) => count <= 0);
    expect(nonPositive).toEqual([]);
  });
});

// ===========================================================================
// 5. Per-scenario run-1/run-2 shape
// ===========================================================================

describe("per-scenario run-1/run-2 shape", () => {
  test("the loop count equals the roster length, then every scenario satisfies the re-entrant shape", async () => {
    const verdict = await runFullRoster();
    expect(verdict.scenarios.length).toBe(SCENARIO_ROSTER.length);

    for (const scenario of verdict.scenarios) {
      expect(scenario.run1.mutations).toBeGreaterThan(0);

      const run2 = scenario.run2;
      expect(run2).not.toBeNull();
      if (run2 === null) continue; // unreachable given the assertion above; narrows for TS

      expect(run2.mutations).toBe(0);
      // ASSERT THE LIST: an empty forge-mutation list on run 2 is the claim,
      // not merely a zero count of it.
      expect(run2.forgeMutations).toEqual([]);

      const threshold = verdict.denominators.reEntryRows[scenario.skill] ?? 0;
      expect(threshold).toBeGreaterThan(0); // denominator first
      expect(run2.reads).toBeGreaterThanOrEqual(threshold);

      expect(run2.treeHash).toBe(scenario.run1.treeHash);
    }
  });
});

// ===========================================================================
// 6. The surface-separation pair, by name
// ===========================================================================

describe("the surface-separation pair", () => {
  test('"story-design/sentinel-only" trips only the forge surface on run 1', async () => {
    const verdict = await runFullRoster();
    const scenario = verdict.scenarios.find((s) => s.id === "story-design/sentinel-only");
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    expect(scenario.run1.forgeMutations.length).toBeGreaterThan(0);
    expect(scenario.run1.worktreeMutations).toEqual([]);
  });

  test('"story-test-plan/file-only" trips only the worktree surface on run 1', async () => {
    const verdict = await runFullRoster();
    const scenario = verdict.scenarios.find((s) => s.id === "story-test-plan/file-only");
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    expect(scenario.run1.forgeMutations).toEqual([]);
    expect(scenario.run1.worktreeMutations.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 7. The tree moved in run 1 for every file-writing scenario -- CLAIM-293.8's
// per-skill threshold, the half #321 measured it could not meet
// ===========================================================================

describe("run 1's tree hash moves for every scenario that actually writes a file", () => {
  test("scenarios 3, 4 and 6 move the tree, and the set of file-writing skills they cover is exactly story-design and story-test-plan", async () => {
    const verdict = await runFullRoster();
    const moved = verdict.scenarios.filter((s) => s.run1.treeHash !== s.seedTreeHash);
    const movedIds = moved.map((s) => s.id).sort();
    expect(movedIds).toEqual(
      ["story-design/design-and-sentinel", "story-test-plan/file-only", "story-test-plan/plan-and-sentinel"].sort(),
    );

    const skillsCoveredBySet = [...new Set(moved.map((s) => s.skill))].sort();
    expect(skillsCoveredBySet).toEqual(["story-design", "story-test-plan"]);
  });
});

// ===========================================================================
// 8. No unclassified-argv failure anywhere, denominator asserted first
// ===========================================================================

describe("no scenario issues an argv the classifier cannot place", () => {
  test("the total recorded call count across all scenarios is positive, and no unclassified-argv failure is present", async () => {
    const verdict = await runFullRoster();
    const totalCalls = verdict.scenarios.reduce(
      (sum, s) => sum + s.run1.calls.length + (s.run2?.calls.length ?? 0),
      0,
    );
    expect(totalCalls).toBeGreaterThan(0); // denominator first

    const unclassifiedFailures = verdict.failures.filter((f) => f.code === "unclassified-argv");
    expect(unclassifiedFailures).toEqual([]);
  });
});

// ===========================================================================
// 9. run2.reads is > 0 per scenario -- distinguishes "decided to do nothing"
// from "did nothing"
// ===========================================================================

describe("run 2 always reads something", () => {
  test("every scenario's run2.reads is greater than zero", async () => {
    const verdict = await runFullRoster();
    const zeroReadScenarios = verdict.scenarios.filter((s) => (s.run2?.reads ?? 0) <= 0).map((s) => s.id);
    expect(zeroReadScenarios).toEqual([]);
  });
});
