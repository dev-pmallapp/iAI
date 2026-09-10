// #322, step B1: the anti-vacuity runner, tested against a SYNTHETIC roster
// and a SYNTHETIC skills directory built here, hermetically. Neither the
// scenario roster nor any transcription belongs to this step -- a later step
// owns those (see `packages/harness/src/runner.ts`'s own header). Corpus:
// synthetic throughout.
//
// House anti-vacuity applies to this file too: denominators are asserted
// `> 0` before anything else, lists are asserted rather than counts, and
// `new Set(...)` is used wherever cardinality (not length) is the property.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRealPort } from "iai-exec";
import {
  createTempDirs,
  decideVerdict,
  renderArtifact,
  renderReport,
  runHarness,
  SUCCESS_PHRASES,
  type Denominators,
  type Failure,
  type HarnessVerdict,
  type RunObservation,
  type Scenario,
  type ScenarioContext,
  type ScenarioResult,
} from "../src/index";

const runnerSourcePath = join(import.meta.dir, "..", "src", "runner.ts");

const temps = createTempDirs();
afterAll(() => temps.cleanup());

// ===========================================================================
// The synthetic skills directory: two skills, 2 and 3 Re-entry rows
// ===========================================================================

const ALPHA = "skill-alpha";
const BETA = "skill-beta";
const ALPHA_ROWS = 2;
const BETA_ROWS = 3;

function reEntryTable(rowCount: number): string[] {
  const lines = ["## Re-entry", "", "| Read first |", "|---|"];
  for (let i = 1; i <= rowCount; i += 1) lines.push(`| check number ${String(i)} |`);
  lines.push("");
  return lines;
}

function buildSyntheticSkillsDir(): string {
  const root = temps.create("iai-322-runner-skills");
  for (const [name, rows] of [[ALPHA, ALPHA_ROWS] as const, [BETA, BETA_ROWS] as const]) {
    mkdirSync(join(root, name), { recursive: true });
    const body = [`# ${name}`, "", "synthetic skill body for #322's runner tests.", "", ...reEntryTable(rows)];
    writeFileSync(join(root, name, "SKILL.md"), body.join("\n"), "utf8");
  }
  return root;
}

const skillsDir = buildSyntheticSkillsDir();
const PINNED = 2; // this synthetic corpus's own pin, unrelated to runner.ts's PINNED_SKILL_COUNT (4, the real corpus)

const GH_READ_ARGV = ["gh", "issue", "list", "--repo", "OWNER/REPO"] as const;

function rowCountFor(skill: string): number {
  return skill === ALPHA ? ALPHA_ROWS : BETA_ROWS;
}

// ===========================================================================
// Scenario builders -- every one issues real argv through ctx.port/ctx.read
// against the fake forge, or writes through ctx.writeFile
// ===========================================================================

/** Idempotent by construction: creates a file on run 1, and on run 2 issues
 *  exactly `rowCountFor(skill)` reads and writes/mutates nothing. */
function makeHappyScenario(id: string, skill: string): Scenario {
  return {
    id,
    skill,
    corpus: "synthetic — built for #322 step B1's runner tests",
    files: [{ path: "SEED.md", contents: `seed for ${id}\n` }],
    async run(ctx: ScenarioContext): Promise<void> {
      if (ctx.runIndex === 1) {
        ctx.writeFile("OUTPUT.md", `created by ${id}\n`);
        return;
      }
      for (let row = 1; row <= rowCountFor(skill); row += 1) {
        await ctx.read(row, [...GH_READ_ARGV]);
      }
    },
  };
}

/** Never mutates on run 1: only ever reads. Used for the run-1-vacuous case. */
function makeVacuousScenario(id: string, skill: string): Scenario {
  return {
    id,
    skill,
    corpus: "synthetic — built for #322 step B1's runner tests",
    files: [{ path: "SEED.md", contents: `seed for ${id}\n` }],
    async run(ctx: ScenarioContext): Promise<void> {
      await ctx.read(1, [...GH_READ_ARGV]);
    },
  };
}

/** Mutates a `gh` argv on EVERY run, including run 2 -- the fake forge does
 *  not enforce identity-key uniqueness (NEVER-293.7), so this succeeds twice
 *  and both attempts are recorded. */
function makeForgeMutatesEveryRunScenario(id: string, skill: string): Scenario {
  const argv = ["gh", "issue", "create", "--repo", "OWNER/REPO", "--title", `dup ${id}`] as const;
  return {
    id,
    skill,
    corpus: "synthetic — built for #322 step B1's runner tests",
    files: [{ path: "SEED.md", contents: `seed for ${id}\n` }],
    async run(ctx: ScenarioContext): Promise<void> {
      await ctx.port.run([...argv]);
    },
  };
}

/** Mutates the worktree on run 1, and reads FEWER times than its skill's
 *  Re-entry row count on run 2. */
function makeUnderReadScenario(id: string, skill: string): Scenario {
  return {
    id,
    skill,
    corpus: "synthetic — built for #322 step B1's runner tests",
    files: [{ path: "SEED.md", contents: `seed for ${id}\n` }],
    async run(ctx: ScenarioContext): Promise<void> {
      if (ctx.runIndex === 1) {
        ctx.writeFile("OUTPUT.md", `created by ${id}\n`);
        return;
      }
      // Deliberately fewer than rowCountFor(skill): exactly one read.
      await ctx.read(1, [...GH_READ_ARGV]);
    },
  };
}

/** Mutates on run 1, and on run 2 declares a read attribution for a row
 *  OUTSIDE the skill's 1..rowCount range. */
function makeBadAttributionScenario(id: string, skill: string): Scenario {
  return {
    id,
    skill,
    corpus: "synthetic — built for #322 step B1's runner tests",
    files: [{ path: "SEED.md", contents: `seed for ${id}\n` }],
    async run(ctx: ScenarioContext): Promise<void> {
      if (ctx.runIndex === 1) {
        ctx.writeFile("OUTPUT.md", `created by ${id}\n`);
        return;
      }
      await ctx.read(rowCountFor(skill) + 97, [...GH_READ_ARGV]);
    },
  };
}

function runOptions(roster: readonly Scenario[], pinnedSkillCount = PINNED) {
  return {
    roster,
    skillsDir,
    temps,
    makePort: () => createRealPort(),
    pinnedSkillCount,
    startedAt: "2026-09-10T00:00:00.000Z",
  };
}

// ===========================================================================
// 1. The happy roster
// ===========================================================================

const happyRoster: readonly Scenario[] = [makeHappyScenario("happy-alpha", ALPHA), makeHappyScenario("happy-beta", BETA)];
const happyVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(happyRoster));

describe("1. a happy roster covering every skill, each clean on run 2", () => {
  test("exitCode is 0, failures is empty, verdict is pass", async () => {
    const verdict = await happyVerdictPromise;
    expect(verdict.exitCode).toBe(0);
    expect(verdict.failures).toEqual([]);
    expect(verdict.verdict).toBe("pass");
  });
});

// ===========================================================================
// 2. Empty roster, through the production path
// ===========================================================================

describe("2. an empty roster", () => {
  test("exitCode is 1 and failures[0].code is empty-roster", async () => {
    const verdict = await runHarness(runOptions([]));
    expect(verdict.exitCode).toBe(1);
    expect(verdict.failures.length).toBeGreaterThan(0);
    expect(verdict.failures[0]?.code).toBe("empty-roster");
  });
});

// ===========================================================================
// 3. A vacuous run 1
// ===========================================================================

const vacuousRoster: readonly Scenario[] = [
  makeVacuousScenario("vacuous-alpha", ALPHA),
  makeHappyScenario("happy-beta-2", BETA),
];
const vacuousVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(vacuousRoster));

describe("3. a scenario whose run 1 mutates nothing", () => {
  test("exitCode is 1, run-1-made-no-mutation names the scenario, run2 is null, status is run-1-vacuous", async () => {
    const verdict = await vacuousVerdictPromise;
    expect(verdict.exitCode).toBe(1);

    const failure = verdict.failures.find((f) => f.code === "run-1-made-no-mutation");
    expect(failure).toBeDefined();
    expect(failure?.message).toContain("vacuous-alpha");

    const result = verdict.scenarios.find((s) => s.id === "vacuous-alpha");
    expect(result).toBeDefined();
    expect(result?.run2).toBeNull();
    expect(result?.status).toBe("run-1-vacuous");
  });
});

// ===========================================================================
// 4. A skill with no scenario
// ===========================================================================

const partialRoster: readonly Scenario[] = [makeHappyScenario("only-alpha", ALPHA)];
const partialVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(partialRoster));

describe("4. a skill with no scenario", () => {
  test("skill-without-scenario names the uncovered skill", async () => {
    const verdict = await partialVerdictPromise;
    expect(verdict.exitCode).toBe(1);
    const failure = verdict.failures.find((f) => f.code === "skill-without-scenario" && f.message.includes(BETA));
    expect(failure).toBeDefined();
  });
});

// ===========================================================================
// 5. Pinned mismatch
// ===========================================================================

const pinnedMismatchVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(happyRoster, 99));

describe("5. a wrong pinnedSkillCount", () => {
  test("pinned-skill-count-mismatch quotes both numbers", async () => {
    const verdict = await pinnedMismatchVerdictPromise;
    expect(verdict.exitCode).toBe(1);
    const failure = verdict.failures.find((f) => f.code === "pinned-skill-count-mismatch");
    expect(failure).toBeDefined();
    expect(failure?.message).toContain("2");
    expect(failure?.message).toContain("99");
  });
});

// ===========================================================================
// 6. A scenario that mutates in run 2
// ===========================================================================

const run2MutatesRoster: readonly Scenario[] = [
  makeForgeMutatesEveryRunScenario("mutates-run2", ALPHA),
  makeHappyScenario("happy-beta-3", BETA),
];
const run2MutatesVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(run2MutatesRoster));

describe("6. a scenario that mutates in run 2", () => {
  test("run-2-mutated, and the message contains the offending argv joined", async () => {
    const verdict = await run2MutatesVerdictPromise;
    expect(verdict.exitCode).toBe(1);
    const failure = verdict.failures.find((f) => f.code === "run-2-mutated");
    expect(failure).toBeDefined();
    expect(failure?.message).toContain("gh issue create --repo OWNER/REPO --title dup mutates-run2");
  });
});

// ===========================================================================
// 7. A scenario whose run 2 reads fewer times than its skill's Re-entry rows
// ===========================================================================

const underReadRoster: readonly Scenario[] = [
  makeUnderReadScenario("under-read-beta", BETA),
  makeHappyScenario("happy-alpha-2", ALPHA),
];
const underReadVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(underReadRoster));

describe("7. a scenario whose run 2 under-reads", () => {
  test("run-2-reads-below-re-entry-rows fires", async () => {
    const verdict = await underReadVerdictPromise;
    expect(verdict.exitCode).toBe(1);
    const failure = verdict.failures.find((f) => f.code === "run-2-reads-below-re-entry-rows");
    expect(failure).toBeDefined();
    expect(failure?.message).toContain("under-read-beta");
  });
});

// ===========================================================================
// 8. Two scenarios seeded with identical file content
// ===========================================================================

function makeDuplicateSeedScenario(id: string): Scenario {
  return {
    id,
    skill: ALPHA,
    corpus: "synthetic — built for #322 step B1's runner tests",
    files: [{ path: "SEED.md", contents: "identical seed content\n" }],
    async run(ctx: ScenarioContext): Promise<void> {
      ctx.writeFile("OUTPUT.md", `created by ${id}\n`);
    },
  };
}

const duplicateSeedRoster: readonly Scenario[] = [
  makeDuplicateSeedScenario("dup-a"),
  makeDuplicateSeedScenario("dup-b"),
];
const duplicateSeedVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(duplicateSeedRoster));

describe("8. two scenarios seeded with identical file content", () => {
  test("duplicate-seed-tree-hash fires, by cardinality of distinct hashes", async () => {
    const verdict = await duplicateSeedVerdictPromise;
    expect(verdict.exitCode).toBe(1);
    const failure = verdict.failures.find((f) => f.code === "duplicate-seed-tree-hash");
    expect(failure).toBeDefined();

    const hashes = verdict.scenarios.map((s) => s.seedTreeHash);
    expect(hashes.length).toBeGreaterThan(0);
    expect(new Set(hashes).size).toBeLessThan(hashes.length);
  });
});

// ===========================================================================
// 13. Attribution: a read declared for a row outside 1..rows
// ===========================================================================

const badAttributionRoster: readonly Scenario[] = [
  makeBadAttributionScenario("bad-row-alpha", ALPHA),
  makeHappyScenario("happy-beta-4", BETA),
];
const badAttributionVerdictPromise: Promise<HarnessVerdict> = runHarness(runOptions(badAttributionRoster));

describe("13. a read attribution outside the skill's row range", () => {
  test("read-attribution-invalid fires", async () => {
    const verdict = await badAttributionVerdictPromise;
    expect(verdict.exitCode).toBe(1);
    const failure = verdict.failures.find((f) => f.code === "read-attribution-invalid");
    expect(failure).toBeDefined();
    expect(failure?.message).toContain("bad-row-alpha");
  });
});

// ===========================================================================
// 9. decideVerdict is pure
// ===========================================================================

describe("9. decideVerdict is pure", () => {
  test("calling it twice with the same input yields byte-identical JSON, and no input value is a string of stdout", () => {
    const denominators: Denominators = {
      skillsOnDisk: ["skill-x"],
      skillsCovered: ["skill-x"],
      pinnedSkillCount: 1,
      rosterLength: 1,
      scenariosExecuted: 1,
      scenariosPerSkill: { "skill-x": 1 },
      reEntryRows: { "skill-x": 1 },
      seedTreeHashes: ["a".repeat(40)],
    };
    const run1: RunObservation = {
      forgeMutations: [["gh", "issue", "create", "--repo", "O/R", "--title", "t"]],
      worktreeMutations: [],
      mutations: 1,
      reads: 0,
      attributions: [],
      treeHash: "b".repeat(40),
      evidence: ["attempted mutating gh argv: gh issue create --repo O/R --title t"],
      calls: [{ argv: ["gh", "issue", "create", "--repo", "O/R", "--title", "t"], exitCode: 0 }],
    };
    const run2: RunObservation = {
      forgeMutations: [],
      worktreeMutations: [],
      mutations: 0,
      reads: 1,
      attributions: [{ callIndex: 0, row: 1, argv: [...GH_READ_ARGV] }],
      treeHash: "b".repeat(40),
      evidence: [],
      calls: [{ argv: [...GH_READ_ARGV], exitCode: 0 }],
    };
    const scenario: ScenarioResult = {
      id: "s1",
      skill: "skill-x",
      corpus: "synthetic",
      seedTreeHash: "a".repeat(40),
      run1,
      run2,
      status: "ok",
    };
    const input = { denominators, scenarios: [scenario], pinnedSkillCount: 1 };

    // No input to decideVerdict is a string of stdout: MutationReport's own
    // exit-code-dropping discipline (mutation-recorder.ts:230-237) carried
    // one layer up. RecordedCall (iai-exec) carries only argv and exitCode.
    expect(JSON.stringify(input)).not.toContain("stdout");

    const first = decideVerdict(input);
    const second = decideVerdict(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.verdict).toBe("pass");
    expect(first.exitCode).toBe(0);
    expect(first.failures).toEqual([]);
  });
});

// ===========================================================================
// 10. renderArtifact round-trips
// ===========================================================================

describe("10. renderArtifact round-trips", () => {
  test("JSON.parse(renderArtifact(v)) carries the same exitCode and verdict", async () => {
    const verdict = await happyVerdictPromise;
    const rendered = renderArtifact(verdict);
    const parsed = JSON.parse(rendered) as { exitCode: number; verdict: string };
    expect(parsed.exitCode).toBe(verdict.exitCode);
    expect(parsed.verdict).toBe(verdict.verdict);
  });
});

// ===========================================================================
// 11. Every SUCCESS_PHRASES entry appears in renderReport(passing verdict)
// ===========================================================================

describe("11. SUCCESS_PHRASES and renderReport agree", () => {
  test("SUCCESS_PHRASES is non-empty, and every phrase appears in the passing report", async () => {
    expect(SUCCESS_PHRASES.length).toBeGreaterThan(0);
    const verdict = await happyVerdictPromise;
    expect(verdict.verdict).toBe("pass");
    const report = renderReport(verdict);
    const missing = SUCCESS_PHRASES.filter((phrase) => !report.includes(phrase));
    expect(missing).toEqual([]);
  });
});

// ===========================================================================
// 12. Failure-message distinctness across every failing case above
// ===========================================================================

describe("12. failure messages are pairwise distinct and self-distinguishing", () => {
  test("collected across every failing test above, no two messages are equal and none contains another's code", async () => {
    const [
      empty,
      vacuous,
      partial,
      pinnedMismatch,
      run2Mutates,
      underRead,
      duplicateSeed,
      badAttribution,
    ] = await Promise.all([
      runHarness(runOptions([])),
      vacuousVerdictPromise,
      partialVerdictPromise,
      pinnedMismatchVerdictPromise,
      run2MutatesVerdictPromise,
      underReadVerdictPromise,
      duplicateSeedVerdictPromise,
      badAttributionVerdictPromise,
    ]);

    function messageFor(verdict: HarnessVerdict, code: Failure["code"]): string {
      const failure = verdict.failures.find((f) => f.code === code);
      if (failure === undefined) throw new Error(`expected a "${code}" failure and found none`);
      return failure.message;
    }

    const cases: readonly { readonly code: Failure["code"]; readonly message: string }[] = [
      { code: "empty-roster", message: messageFor(empty, "empty-roster") },
      { code: "run-1-made-no-mutation", message: messageFor(vacuous, "run-1-made-no-mutation") },
      { code: "skill-without-scenario", message: messageFor(partial, "skill-without-scenario") },
      { code: "pinned-skill-count-mismatch", message: messageFor(pinnedMismatch, "pinned-skill-count-mismatch") },
      { code: "run-2-mutated", message: messageFor(run2Mutates, "run-2-mutated") },
      { code: "run-2-reads-below-re-entry-rows", message: messageFor(underRead, "run-2-reads-below-re-entry-rows") },
      { code: "duplicate-seed-tree-hash", message: messageFor(duplicateSeed, "duplicate-seed-tree-hash") },
      { code: "read-attribution-invalid", message: messageFor(badAttribution, "read-attribution-invalid") },
    ];

    expect(cases.length).toBeGreaterThan(0);
    const messages = cases.map((c) => c.message);
    expect(new Set(messages).size).toBe(messages.length);

    for (const a of cases) {
      for (const b of cases) {
        if (a.code === b.code) continue;
        expect(a.message).not.toContain(b.code);
      }
    }
  });
});

// ===========================================================================
// 22. The runner's own vocabulary, seeded into a fixture, cannot fool it
// ===========================================================================
//
// Step C of #322. `decideVerdict` is pure over typed observations
// (`Denominators`, `ScenarioResult[]`) and never reads a byte of fixture
// content or a spawned process's stdout -- but nothing in this file had ever
// PROVED that by seeding the runner's own success and failure vocabulary
// into a fixture and checking the verdict does not flip. Two directions,
// because either alone is satisfiable by the wrong fix (see direction B's
// own comment below).

describe("22. success-phrase and failure-vocabulary seeding cannot fool the verdict", () => {
  // --- Direction A -----------------------------------------------------
  //
  // A scenario whose run 1 mutates nothing is the correct-FAIL case
  // (`run-1-made-no-mutation`, same shape as case 3 above). Its fixture is
  // seeded with the runner's own SUCCESS_PHRASES in THREE places at once:
  //
  //   (a) the CONTENTS of a tracked file;
  //   (b) the NAME of a tracked file;
  //   (c) nothing else is needed -- (b) is the sharp one. `git status
  //       --porcelain` (mutation-recorder.ts's own probe, which the
  //       recorder parses into the boolean `dirty`) emits the PATH of every
  //       tracked-then-changed file, so a phrase living in a file NAME
  //       reaches that probe's raw stdout; a phrase living only in file
  //       CONTENTS never does, because `git status --porcelain` never
  //       echoes a tracked file's bytes. If any part of this pipeline ever
  //       decided a verdict by scanning raw git stdout for a success
  //       phrase rather than from `dirty`'s typed boolean, (b) is what
  //       would catch it and (a) alone could not.
  //
  // BUILT FROM THE EXPORTED CONSTANT, NEVER A COPY-PASTED STRING. A
  // hand-typed trap fixture goes stale the first time a message in
  // SUCCESS_PHRASE_BY_CODE changes, and a stale trap that still happens to
  // pass is a token gesture, not a check -- the same lesson this file's own
  // `overCap`/`atCap` builders in sibling suites exist to enforce for
  // reference-citation-count.
  test("direction A: SUCCESS_PHRASES seeded into a vacuous run 1's fixture still fails as run-1-made-no-mutation", async () => {
    expect(SUCCESS_PHRASES.length).toBeGreaterThan(0);
    const phraseContents = SUCCESS_PHRASES.join("\n");
    const phraseAsFileName = `${(SUCCESS_PHRASES[0] ?? "").replace(/[^a-zA-Z0-9_-]/g, "-")}.md`;

    const seededVacuousScenario: Scenario = {
      id: "case-22-direction-a-vacuous",
      skill: ALPHA,
      corpus: "synthetic — built for #322 step C's case 22 (direction A)",
      files: [
        { path: "SEED.md", contents: "seed for case-22-direction-a-vacuous\n" },
        // (a) contents
        { path: "SUCCESS-PHRASES-IN-CONTENT.md", contents: phraseContents },
        // (b) the sharp one — the name itself
        { path: phraseAsFileName, contents: "seed for case 22 direction A, file (b)\n" },
      ],
      async run(ctx: ScenarioContext): Promise<void> {
        // Never mutates — the run-1-vacuous shape, same as case 3's
        // `makeVacuousScenario` above.
        await ctx.read(1, [...GH_READ_ARGV]);
      },
    };

    const roster: readonly Scenario[] = [seededVacuousScenario, makeHappyScenario("happy-beta-case-22-a", BETA)];
    const verdict = await runHarness(runOptions(roster));

    expect(verdict.exitCode).toBe(1);
    expect(verdict.failures[0]?.code).toBe("run-1-made-no-mutation");
    expect(verdict.verdict).toBe("fail");
  });

  // --- Direction B -----------------------------------------------------
  //
  // Direction A alone would be satisfied by a runner that inverted a grep --
  // one that failed BECAUSE it found a success phrase rather than despite
  // finding one. Direction B is what stops "invert the grep" being the fix:
  // seed a scenario whose correct verdict is PASS with the runner's own
  // FAILURE vocabulary (real failure messages, collected from real failing
  // verdicts produced earlier in this file, never restated by hand) and
  // require the verdict to still be a clean pass.
  test("direction B: real failure messages seeded into a passing scenario's fixture still pass", async () => {
    const [empty, partial, pinnedMismatch, run2Mutates, underRead, duplicateSeed, badAttribution] = await Promise.all([
      runHarness(runOptions([])),
      partialVerdictPromise,
      pinnedMismatchVerdictPromise,
      run2MutatesVerdictPromise,
      underReadVerdictPromise,
      duplicateSeedVerdictPromise,
      badAttributionVerdictPromise,
    ]);
    const failureMessages = [empty, partial, pinnedMismatch, run2Mutates, underRead, duplicateSeed, badAttribution].flatMap(
      (v) => v.failures.map((f) => f.message),
    );
    // Denominator first: a corpus of zero failure messages would make the
    // seeding below vacuous.
    expect(failureMessages.length).toBeGreaterThan(0);

    const seededPassingScenario: Scenario = {
      id: "case-22-direction-b-passing",
      skill: ALPHA,
      corpus: "synthetic — built for #322 step C's case 22 (direction B)",
      files: [
        { path: "SEED.md", contents: "seed for case-22-direction-b-passing\n" },
        { path: "FAILURE-VOCABULARY.md", contents: failureMessages.join("\n") },
      ],
      async run(ctx: ScenarioContext): Promise<void> {
        if (ctx.runIndex === 1) {
          ctx.writeFile("OUTPUT.md", "created by case-22-direction-b-passing\n");
          return;
        }
        for (let row = 1; row <= rowCountFor(ALPHA); row += 1) {
          await ctx.read(row, [...GH_READ_ARGV]);
        }
      },
    };

    const roster: readonly Scenario[] = [seededPassingScenario, makeHappyScenario("happy-beta-case-22-b", BETA)];
    const verdict = await runHarness(runOptions(roster));

    expect(verdict.exitCode).toBe(0);
    expect(verdict.failures).toEqual([]);
  });
});

// ===========================================================================
// 23. renderArtifact's verdict and exitCode agree, both with the source
// verdict and with each other -- on a PASSING run AND a FAILING run.
// ===========================================================================
//
// Closes mutation gap M12: `renderArtifact` forcing `verdict: "pass"`
// unconditionally, with `exitCode` untouched, survived because nothing here
// exercised it against a FAILING verdict -- the case where a forced "pass"
// and an untouched `exitCode: 1` disagree with each other. #323's CI job may
// read this artifact rather than the process's own exit code, so an
// artifact that disagrees with its own process is a defect that would
// surface as a green CI job over a red run.

describe("23. renderArtifact agrees with its source verdict, in both directions, on pass and fail", () => {
  test("verdict and exitCode round-trip, and verdict === \"pass\" iff exitCode === 0, for both a passing and a failing verdict", async () => {
    const passing = await happyVerdictPromise;
    const failing = await vacuousVerdictPromise;

    expect(passing.verdict).toBe("pass");
    expect(passing.exitCode).toBe(0);
    expect(failing.verdict).toBe("fail");
    expect(failing.exitCode).toBe(1);

    for (const source of [passing, failing]) {
      const parsed = JSON.parse(renderArtifact(source)) as { verdict: "pass" | "fail"; exitCode: 0 | 1 };

      // Agrees with the source verdict object.
      expect(parsed.verdict).toBe(source.verdict);
      expect(parsed.exitCode).toBe(source.exitCode);

      // Agrees with itself, both directions.
      if (parsed.verdict === "pass") expect(parsed.exitCode).toBe(0);
      if (parsed.exitCode === 0) expect(parsed.verdict).toBe("pass");
      if (parsed.verdict === "fail") expect(parsed.exitCode).toBe(1);
      if (parsed.exitCode === 1) expect(parsed.verdict).toBe("fail");
    }
  });
});

// ===========================================================================
// 24. decideVerdict's source never re-derives the verdict from rendered
// TEXT -- a STATIC check, because the mutation it kills is behaviourally
// equivalent over every fixture in this file.
// ===========================================================================
//
// Closes mutation gap M11: deriving `exitCode` from
// `renderReport(...).includes("verdict: pass")` is behaviourally identical
// to the real implementation over the current corpus, so no DYNAMIC test
// can kill it -- any input that makes the real `decideVerdict` fail also
// makes `renderReport` omit "verdict: pass", and vice versa. Case 21 of
// docs/test-plans/293-plan.md already establishes the house pattern for
// exactly this shape: the verdict is the exit code plus a JSON artifact,
// and is NEVER a grep of text -- and that finding's shape (37: a harness
// that decided on a substring of its own output) is recorded against no
// specific module, because it is a defect ANY future harness can reintroduce.
// The check below is therefore static: it inspects `decideVerdict`'s own
// source text for the tokens that would make such a substring-of-output
// decision possible, rather than trying to reach it through behaviour no
// fixture can distinguish.

function skipBalancedBraceGroup(source: string, from: number): number {
  let j = from;
  while (source[j] !== "{") j += 1;
  let depth = 0;
  for (; j < source.length; j += 1) {
    if (source[j] === "{") depth += 1;
    else if (source[j] === "}") {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  throw new Error("unbalanced braces: no matching close found");
}

/** Extracts `export function decideVerdict(...) {...}`'s full source, from
 *  the marker to its OWN matching close -- not the first brace to return to
 *  depth zero, which (for this function) would be the parameter list's own
 *  type-literal closing brace, well short of the function body. Skips the
 *  parameter list (by paren depth, which the type literal's braces cannot
 *  perturb), then the return-type annotation if it is itself an object
 *  literal, then reads the function body's own balanced brace group. */
function extractFunctionSource(source: string, marker: string): string {
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) throw new Error(`marker not found in source: ${marker}`);

  let i = startIdx + marker.length;
  let parenDepth = 1; // the marker's own trailing "(" is already consumed
  for (; i < source.length && parenDepth > 0; i += 1) {
    if (source[i] === "(") parenDepth += 1;
    else if (source[i] === ")") parenDepth -= 1;
  }

  let j = i;
  while (/\s/.test(source[j] ?? "")) j += 1;
  if (source[j] === ":") {
    j += 1;
    while (/\s/.test(source[j] ?? "")) j += 1;
    if (source[j] === "{") {
      j = skipBalancedBraceGroup(source, j);
    } else {
      while (source[j] !== "{") j += 1;
    }
  }
  while (/\s/.test(source[j] ?? "")) j += 1;

  const bodyEnd = skipBalancedBraceGroup(source, j);
  return source.slice(startIdx, bodyEnd);
}

describe("24. decideVerdict's own source never re-derives a verdict from rendered text", () => {
  test("the extracted function body is non-empty, and contains none of the forbidden tokens", () => {
    const source = readFileSync(runnerSourcePath, "utf8");
    const decideVerdictSource = extractFunctionSource(source, "export function decideVerdict(");

    // FIRST: a failed extraction (an empty or near-empty string) must not
    // be able to pass the checks below vacuously.
    expect(decideVerdictSource.length).toBeGreaterThan(0);
    // A stronger sanity floor than `> 0` alone -- catches an extraction that
    // technically returned a non-empty but truncated (and therefore
    // meaningless) slice.
    expect(decideVerdictSource.length).toBeGreaterThan(500);
    expect(decideVerdictSource).toContain("return { verdict, exitCode, failures");

    const forbiddenTokens = ["renderReport", "renderArtifact", "SUCCESS_PHRASES", '.includes("', "stdout"] as const;
    const found = forbiddenTokens.filter((token) => decideVerdictSource.includes(token));
    expect(found).toEqual([]);
  });
});

// ===========================================================================
// 25. A scenario that throws does not escape runHarness, and is reported as
// exactly one failure naming the scenario.
// ===========================================================================
//
// Closes mutation gap M10. Re-seeding the fake forge between runs made a
// real transcription's parsing throw (`JSON Parse error`), and the process
// died with no verdict and no artifact -- a runner whose failure mode is an
// uncaught rejection cannot report which scenario failed, and the artifact
// (which #323 will read) is absent exactly when it is most needed.

function makeThrowingScenario(id: string, skill: string): Scenario {
  return {
    id,
    skill,
    corpus: "synthetic — built for #322 step B1's runner tests (gap 3, scenario-threw)",
    files: [{ path: "SEED.md", contents: `seed for ${id}\n` }],
    async run(): Promise<void> {
      throw new Error(`synthetic throw from scenario "${id}"`);
    },
  };
}

describe("25. a scenario whose run throws is recorded as scenario-threw, not an uncaught rejection", () => {
  test("runHarness resolves (never rejects); exitCode is 1; failures has exactly one scenario-threw entry naming the scenario", async () => {
    const throwingRoster: readonly Scenario[] = [
      makeThrowingScenario("throws-alpha", ALPHA),
      makeHappyScenario("happy-beta-case-25", BETA),
    ];

    // `runHarness` itself must not reject: awaiting it must resolve to a
    // verdict, never throw out of this `await`.
    const verdict = await runHarness(runOptions(throwingRoster));

    expect(verdict.exitCode).toBe(1);

    const threwFailures = verdict.failures.filter((f) => f.code === "scenario-threw");
    expect(threwFailures.length).toBe(1);
    expect(threwFailures[0]?.scenario).toBe("throws-alpha");
    expect(threwFailures[0]?.message).toContain("throws-alpha");
    expect(threwFailures[0]?.message).toContain("synthetic throw from scenario");

    // Exactly one entry overall in `failures` -- the throw must not ALSO be
    // reported as `run-1-made-no-mutation` (one cause, one failure).
    expect(verdict.failures.length).toBe(1);

    const result = verdict.scenarios.find((s) => s.id === "throws-alpha");
    expect(result).toBeDefined();
    expect(result?.status).toBe("threw");
    expect(result?.run2).toBeNull();
  });
});
