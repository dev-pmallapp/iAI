// The anti-vacuity runner: orchestrates a scenario roster through the
// two-surface mutation recorder, twice per scenario, and renders a verdict.
//
// Build target of #322 (step B1). Anchors the same claims #321's recorder
// anchors -- CLAIM-293.3, CLAIM-293.8 -- one layer up: #321 proved the
// recorder can SEE both mutation surfaces; this module is the thing that
// runs a skill's transcription twice and REFUSES to call it clean unless run
// 1 actually did something and run 2 actually did nothing.
//
// WHAT THIS MODULE DOES NOT OWN, STATED HERE SO IT IS NOT INFERRED LATER.
//
// It does not build the scenario roster (that is a later step of #322,
// `docs/test-plans/293-plan.md`'s corpus) and it does not run the model. Its
// tests build a SYNTHETIC roster and a SYNTHETIC skills directory, entirely
// self-contained, so this step is reviewable without the roster existing yet.
//
// IT WRITES NO FILE. `writeFile` on the returned context is a straight
// delegation to `MutationRecorder.writeFile` (packages/harness/src/
// mutation-recorder.ts), which is the sanctioned write seam #321 built.
// `renderArtifact` below RETURNS a string; it is a `scripts/` wrapper's job,
// in a later step, to write it to disk. Adding a write here would be the
// exact widening packages/harness/test/mutation-recorder.test.ts's
// `SANCTIONED_WRITERS` list exists to catch.
//
// IT LAUNCHES NO PROCESS. Every git and `gh` call a scenario issues goes
// through the `Port` the caller supplies via `makePort()` -- normally
// `createRealPort` from `iai-exec` -- wrapped first by the fake forge
// (`createFakeForge`) and then by the mutation recorder
// (`createMutationRecorder`). This module imports no process launcher and
// never will, the same discipline fake-forge.ts:41 and fixture-repo.ts:7
// already state for themselves: that is what keeps CLAIM-293.1 true for a
// fourth module in a row.
//
// NO `process.exit`, NO STDOUT READING FOR THE VERDICT. `decideVerdict` is
// the ONE place an exit code is decided, and it is a pure function of
// `Denominators` and `ScenarioResult[]` -- neither of which carries a
// `stdout` field anywhere in its shape. `MutationReport` (mutation-recorder.ts
// :65-72) already drops the exit code of every recorded call for the same
// reason (see its own comment at :230-237); this module carries that
// discipline into its verdict rather than reopening the door one layer up.

import type { ExecResult, Port, RecordedCall, RecordingPort } from "iai-exec";
import { classifyArgv, countReads } from "./argv-kind";
import { createFakeForge, type FakeForge } from "./fake-forge";
import { createFixtureRepo, type FixtureFile } from "./fixture-repo";
import { createMutationRecorder, mutationEvidence, type MutationReport } from "./mutation-recorder";
import { countReEntryRows, readSkillNames } from "./re-entry";
import type { TempDirs } from "./tempdir";

// ===========================================================================
// The pinned skill count
// ===========================================================================

/** Cites case 3 of docs/test-plans/293-plan.md: the skill denominator is
 *  asserted THREE ways -- greater than zero, equal to the count of SKILL.md
 *  files read from disk at run time, and equal to `PINNED_SKILL_COUNT`, a
 *  literal pinned here so a fourth skill added without a plan update turns
 *  the run red rather than silently widening the corpus this harness scores
 *  against. */
export const PINNED_SKILL_COUNT = 4;

// ===========================================================================
// Scenario surface -- what a later step's roster implements against
// ===========================================================================

export interface ScenarioContext {
  readonly root: string;
  readonly runIndex: 1 | 2;
  /** The recorder's wrapper. EVERYTHING a scenario issues goes through this
   *  -- there is no second, unrecorded route to the fake forge or the
   *  fixture repository's git. */
  readonly port: Port;
  /** A read that decides the skill's `## Re-entry` row `row` (1-based, per
   *  skill). `row` is an ANNOTATION on the call, never the counter: the
   *  threshold in `decideVerdict` is `countReads(report.calls)`, so a
   *  transcription cannot inflate its own read count by declaring reads it
   *  never issued. */
  read(row: number, argv: readonly string[]): Promise<ExecResult>;
  /** A dumb byte sink -- delegates straight to `MutationRecorder.writeFile`.
   *  Deliberately no `commit()` or `writeDesign()` convenience helper, for
   *  the same reason mutation-recorder.ts:38-42 refuses one: that belongs to
   *  a scenario's own `run()`, never to the harness that observes it. */
  writeFile(relPath: string, contents: string): void;
}

export interface Scenario {
  /** Also the FixtureRepoSpec name and the report key. */
  readonly id: string;
  readonly skill: string;
  /** The Corpus declaration, carried into the artifact verbatim. */
  readonly corpus: string;
  readonly files: readonly FixtureFile[];
  readonly milestones?: readonly { readonly title: string; readonly description: string }[];
  /** Seed forge state BEFORE the first window opens. Runs on the RAW fake,
   *  never through the recorder, so seeding is never itself scored as a
   *  mutation the subject made. */
  seed?(forge: FakeForge): Promise<void>;
  run(ctx: ScenarioContext): Promise<void>;
}

// ===========================================================================
// Observation -- what actually happened in one run
// ===========================================================================

export interface ReadAttribution {
  readonly callIndex: number;
  readonly row: number;
  readonly argv: readonly string[];
}

export interface RunObservation {
  /** `report.attemptedMutations`, AS THE LIST. */
  readonly forgeMutations: readonly (readonly string[])[];
  /** `mutationEvidence` entries that are NOT the argv clause -- the
   *  worktree surface, reported separately from the forge surface per
   *  CLAIM-293.8. */
  readonly worktreeMutations: readonly string[];
  /** forge + worktree: the `>0` / `==0` counter. The union of both surfaces
   *  -- a forge-only count would be blind to any scenario that mutates only
   *  the worktree, which is exactly half the shipped skills
   *  (fake-forge.ts:11-16). */
  readonly mutations: number;
  readonly reads: number;
  readonly attributions: readonly ReadAttribution[];
  readonly treeHash: string;
  /** `mutationEvidence(report)`, verbatim. */
  readonly evidence: readonly string[];
  /** Every call this run issued, in order, INCLUDING refused and failed
   *  ones -- `report.calls`, unmodified.
   *
   *  A DELIBERATE ADDITION BEYOND THE LITERAL SURFACE THIS STEP'S SPEC
   *  ENUMERATED. `decideVerdict` below is required to be pure and to be
   *  "the only place an exit code is decided" -- and two of its checks
   *  (`read-attribution-invalid`, `unclassified-argv`) can only be
   *  evaluated against the actual call list, not against the summarised
   *  fields above. Without this field those two checks would have to run
   *  outside `decideVerdict`, during orchestration, and the exit code would
   *  then be decided in two places rather than one. Carrying `calls` here
   *  keeps `decideVerdict` self-contained and genuinely pure -- report this
   *  as the one deviation from the literal spec, along with the reason. */
  readonly calls: readonly RecordedCall[];
}

export type ScenarioStatus = "ok" | "run-1-vacuous";

export interface ScenarioResult {
  readonly id: string;
  readonly skill: string;
  readonly corpus: string;
  readonly seedTreeHash: string;
  readonly run1: RunObservation;
  /** `null` iff run 1 was vacuous and run 2 was NOT executed. */
  readonly run2: RunObservation | null;
  readonly status: ScenarioStatus;
}

// ===========================================================================
// Denominators
// ===========================================================================

export interface Denominators {
  readonly skillsOnDisk: readonly string[];
  readonly skillsCovered: readonly string[];
  readonly pinnedSkillCount: number;
  readonly rosterLength: number;
  readonly scenariosExecuted: number;
  readonly scenariosPerSkill: Readonly<Record<string, number>>;
  readonly reEntryRows: Readonly<Record<string, number>>;
  readonly seedTreeHashes: readonly string[];
}

// ===========================================================================
// Failures
// ===========================================================================

export interface Failure {
  readonly code: FailureCode;
  readonly scenario: string | null;
  readonly message: string;
}

export type FailureCode =
  | "empty-roster"
  | "no-skills-on-disk"
  | "skill-coverage-mismatch"
  | "pinned-skill-count-mismatch"
  | "scenario-count-mismatch"
  | "skill-without-scenario"
  | "re-entry-rows-empty"
  | "duplicate-seed-tree-hash"
  | "run-1-made-no-mutation"
  | "run-2-mutated"
  | "run-2-reads-below-re-entry-rows"
  | "run-2-tree-hash-changed"
  | "read-attribution-invalid"
  | "unclassified-argv";

// A CLOSED SET, and checked exhaustive at compile time -- the same doctrine
// scripts/skill-lint.ts:868-895 applies to its own rule-id union, so a code
// added to `FailureCode` and forgotten here is a TYPE ERROR, not a silent gap
// in `SUCCESS_PHRASES` below.
const ALL_FAILURE_CODES = [
  "no-skills-on-disk",
  "skill-coverage-mismatch",
  "pinned-skill-count-mismatch",
  "empty-roster",
  "scenario-count-mismatch",
  "skill-without-scenario",
  "re-entry-rows-empty",
  "duplicate-seed-tree-hash",
  "run-1-made-no-mutation",
  "run-2-mutated",
  "run-2-reads-below-re-entry-rows",
  "run-2-tree-hash-changed",
  "read-attribution-invalid",
  "unclassified-argv",
] as const satisfies readonly FailureCode[];

type _FailureCodesExhaustive = Exclude<FailureCode, (typeof ALL_FAILURE_CODES)[number]> extends never
  ? true
  : never;
const _failureCodesExhaustive: _FailureCodesExhaustive = true;
void _failureCodesExhaustive;

// ===========================================================================
// The verdict
// ===========================================================================

export interface HarnessVerdict {
  readonly schemaVersion: 1;
  readonly verdict: "pass" | "fail";
  readonly exitCode: 0 | 1;
  readonly startedAt: string;
  readonly failures: readonly Failure[];
  readonly denominators: Denominators;
  readonly scenarios: readonly ScenarioResult[];
  readonly notVerified: readonly string[];
}

// A FUTURE READER WILL WANT TO DELETE THIS BLOCK AS NOISE. Do not. Gate
// ruling G2 (docs/design/stories/293.md:625) is the reason this harness is
// safe to build at all: the seam rung's green earns claims about the
// protocol and command layer, and CLAIM-41.8's population -- the model
// reading SKILL.md -- is never touched by anything below. Deleting this
// array does not make the gap smaller; it only makes it silent, which is
// exactly the failure mode NEVER-293.5 exists to publish against.
const NOT_VERIFIED: readonly string[] = [
  "This run does not test the model reading any SKILL.md. Every scenario's " +
    "`run()` is a transcription authored ahead of time -- by a human or a " +
    "tool -- of what the skill body says to do; the model itself never " +
    "executes inside this harness.",
  "The scenario roster's population is the harness's OWN transcription of " +
    "each skill's re-entry contract, never the SKILL.md body parsed and " +
    "executed. A green run proves the transcription is idempotent against " +
    "this fixture repository and fake forge; it says nothing about whether " +
    "the transcription is faithful to the body it was copied from.",
  "Gate ruling G2 (docs/design/stories/293.md:625) forbids a later Story " +
    "from treating this run's green as license to upgrade CLAIM-41.8 from " +
    "`model-judged` to `tool-checked`. CLAIM-41.8's population is the model " +
    "reading the markdown; this harness's population is a transcription of " +
    "it -- a different population, however green this run is.",
];

/** Why the verdict is what it is, one phrase per denominator that holds on
 *  success. EVERY member of `SUCCESS_PHRASES` below is drawn from this map,
 *  so the two cannot drift apart the way a hand-copied trap fixture would
 *  the first time a message changed. */
const SUCCESS_PHRASE_BY_CODE: Readonly<Record<FailureCode, string>> = {
  "no-skills-on-disk": "no-skills-on-disk: the skills directory is non-empty",
  "skill-coverage-mismatch": "skill-coverage-mismatch: the roster's covered skills equal the skills on disk",
  "pinned-skill-count-mismatch":
    "pinned-skill-count-mismatch: the skill count on disk equals PINNED_SKILL_COUNT",
  "empty-roster": "empty-roster: the scenario roster is non-empty",
  "scenario-count-mismatch": "scenario-count-mismatch: every scenario in the roster was executed",
  "skill-without-scenario": "skill-without-scenario: every skill on disk has at least one scenario",
  "re-entry-rows-empty": "re-entry-rows-empty: every skill on disk has at least one Re-entry row",
  "duplicate-seed-tree-hash": "duplicate-seed-tree-hash: every scenario's seed tree hash is distinct",
  "run-1-made-no-mutation": "run-1-made-no-mutation: every scenario's run 1 made at least one mutation",
  "run-2-mutated": "run-2-mutated: no scenario's run 2 made a mutation",
  "run-2-reads-below-re-entry-rows":
    "run-2-reads-below-re-entry-rows: every scenario's run 2 read at least as many times as its " +
    "skill's Re-entry rows",
  "run-2-tree-hash-changed":
    "run-2-tree-hash-changed: every scenario's run 2 left the tree hash unchanged from run 1",
  "read-attribution-invalid":
    "read-attribution-invalid: every declared read attribution resolves to a real, in-bounds call",
  "unclassified-argv": "unclassified-argv: no recorded argv classified as unclassified",
};

const VERDICT_PASS_PHRASE = "verdict: pass";

/** Every phrase `renderReport` emits ON SUCCESS. Exported so a later step's
 *  trap fixture is built FROM this constant and cannot go stale the first
 *  time a message changes. */
export const SUCCESS_PHRASES: readonly string[] = [
  ...ALL_FAILURE_CODES.map((code) => SUCCESS_PHRASE_BY_CODE[code]),
  VERDICT_PASS_PHRASE,
];

function joinArgv(argv: readonly string[]): string {
  return argv.join(" ");
}

function checkAttributions(
  scenario: ScenarioResult,
  runLabel: 1 | 2,
  run: RunObservation,
  reEntryRowCount: number,
  failures: Failure[],
): void {
  // NOT COUNTED AMONG THE THIRTEEN DENOMINATORS. This is an annotation
  // check, never the counter -- the threshold above (`run-2-reads-below-
  // re-entry-rows`) is `countReads(report.calls)`, computed independently of
  // anything a scenario declares here.
  const invalid = run.attributions.filter((attribution) => {
    const call = run.calls[attribution.callIndex];
    if (call === undefined) return true;
    if (joinArgv(call.argv) !== joinArgv(attribution.argv)) return true;
    const kind = classifyArgv(attribution.argv);
    if (kind !== "forge-read" && kind !== "git-read") return true;
    if (attribution.row < 1 || attribution.row > reEntryRowCount) return true;
    return false;
  });
  if (invalid.length > 0) {
    failures.push({
      code: "read-attribution-invalid",
      scenario: scenario.id,
      message:
        `read-attribution-invalid: scenario "${scenario.id}" run ${String(runLabel)} declared ` +
        `${String(invalid.length)} read attribution(s) that do not resolve to a real, in-bounds ` +
        `read call: ${invalid.map((a) => `row ${String(a.row)} -> \`${joinArgv(a.argv)}\``).join("; ")}`,
    });
  }

  // A PARTITION, NOT A CARVE-OUT (argv-kind.ts:4-5): any call this run
  // issued that the classifier cannot place is reported by name.
  const unclassified = run.calls.filter((call) => classifyArgv(call.argv) === "unclassified");
  if (unclassified.length > 0) {
    failures.push({
      code: "unclassified-argv",
      scenario: scenario.id,
      message:
        `unclassified-argv: scenario "${scenario.id}" run ${String(runLabel)} issued argv this ` +
        `harness's classifier places in no partition: ${unclassified.map((c) => `\`${joinArgv(c.argv)}\``).join("; ")}`,
    });
  }
}

/** PURE. The only place an exit code is decided.
 *
 *  Takes exactly the denominators and the per-scenario observations -- never
 *  a `Port`, a temp directory, or anything with `stdout` on it -- and
 *  re-derives every one of the thirteen denominators' failures plus the two
 *  extra checks, in the order the spec states them, recording ALL of them
 *  rather than stopping at the first. */
export function decideVerdict(input: {
  readonly denominators: Denominators;
  readonly scenarios: readonly ScenarioResult[];
  readonly pinnedSkillCount: number;
}): { readonly verdict: "pass" | "fail"; readonly exitCode: 0 | 1; readonly failures: readonly Failure[] } {
  const d = input.denominators;
  const failures: Failure[] = [];

  // 1. skillsOnDisk.length > 0
  if (d.skillsOnDisk.length === 0) {
    failures.push({
      code: "no-skills-on-disk",
      scenario: null,
      message:
        "no-skills-on-disk: the skills directory contains zero skills carrying a SKILL.md, so there " +
        "is no re-entry contract for this harness to exercise",
    });
  }

  // 2. skillsCovered equals skillsOnDisk, AS SORTED LISTS -- and the message
  // names the missing and extra verbs, not merely a count (case 6).
  const onDiskSorted = [...d.skillsOnDisk].sort();
  const coveredSorted = [...d.skillsCovered].sort();
  const missingFromRoster = onDiskSorted.filter((s) => !coveredSorted.includes(s));
  const extraInRoster = coveredSorted.filter((s) => !onDiskSorted.includes(s));
  // GATED ON `rosterLength > 0`. `skillsCovered` is derived from the roster
  // (see `runHarness` below), so with an empty roster it is trivially `[]`
  // and this check would ALWAYS additionally fire whenever any skill exists
  // on disk -- a second, redundant diagnosis of the exact fact `empty-roster`
  // (#4) already names. Coverage is meaningless to ask about when there is no
  // roster to have covered anything; asking anyway would put a derivative
  // failure ahead of the root cause rather than beside it.
  if (d.rosterLength > 0 && (missingFromRoster.length > 0 || extraInRoster.length > 0)) {
    failures.push({
      code: "skill-coverage-mismatch",
      scenario: null,
      message:
        "skill-coverage-mismatch: the roster's covered skills do not equal the skills on disk. " +
        `Missing from the roster: ${missingFromRoster.length > 0 ? missingFromRoster.join(", ") : "(none)"}. ` +
        `Named by the roster but absent on disk: ${extraInRoster.length > 0 ? extraInRoster.join(", ") : "(none)"}`,
    });
  }

  // 3. skillsOnDisk.length === pinnedSkillCount
  if (d.skillsOnDisk.length !== input.pinnedSkillCount) {
    failures.push({
      code: "pinned-skill-count-mismatch",
      scenario: null,
      message:
        `pinned-skill-count-mismatch: ${String(d.skillsOnDisk.length)} skill(s) were found on disk, ` +
        `but PINNED_SKILL_COUNT is ${String(input.pinnedSkillCount)}`,
    });
  }

  // 4. rosterLength > 0, its own distinct message from #1.
  if (d.rosterLength === 0) {
    failures.push({
      code: "empty-roster",
      scenario: null,
      message:
        "empty-roster: the scenario roster passed to runHarness has zero entries, so no skill's " +
        "run-1/run-2 claim can be exercised at all",
    });
  }

  // 5. scenariosExecuted === rosterLength
  if (d.scenariosExecuted !== d.rosterLength) {
    failures.push({
      code: "scenario-count-mismatch",
      scenario: null,
      message:
        `scenario-count-mismatch: ${String(d.scenariosExecuted)} scenario(s) were executed but the ` +
        `roster declared ${String(d.rosterLength)}`,
    });
  }

  // 6. every skill on disk has scenariosPerSkill[skill] >= 1, named separately.
  for (const skill of d.skillsOnDisk) {
    const count = d.scenariosPerSkill[skill] ?? 0;
    if (count < 1) {
      failures.push({
        code: "skill-without-scenario",
        scenario: null,
        message:
          `skill-without-scenario: the skill "${skill}" is on disk but the roster contains no ` +
          "scenario naming it as its skill",
      });
    }
  }

  // 7. reEntryRows[skill] > 0 for every skill on disk.
  for (const skill of d.skillsOnDisk) {
    const rows = d.reEntryRows[skill] ?? 0;
    if (rows <= 0) {
      failures.push({
        code: "re-entry-rows-empty",
        scenario: null,
        message:
          `re-entry-rows-empty: the skill "${skill}" has no "## Re-entry" table row, so run 2's read ` +
          "count would have no threshold to clear",
      });
    }
  }

  // 8. new Set(seedTreeHashes).size === scenariosExecuted (cardinality, not length).
  const distinctSeedHashes = new Set(d.seedTreeHashes).size;
  if (distinctSeedHashes !== d.scenariosExecuted) {
    failures.push({
      code: "duplicate-seed-tree-hash",
      scenario: null,
      message:
        `duplicate-seed-tree-hash: only ${String(distinctSeedHashes)} distinct seed tree hash(es) ` +
        `were produced for ${String(d.scenariosExecuted)} executed scenario(s), so two scenarios ` +
        "seeded identical fixture content",
    });
  }

  // Denominator 9 -- "a real .git per scenario: the seed tree hash is a
  // non-empty 40-hex string" -- carries NO FailureCode of its own in the
  // union above. It is the "cheap positive check" the spec names it: a real
  // git failure inside `createFixtureRepo` already THROWS (`FixtureRepoError`,
  // fixture-repo.ts:64-77) long before a `ScenarioResult` could exist, so by
  // the time control reaches here every `seedTreeHash` already satisfies
  // this shape by construction. It is asserted directly in this module's own
  // tests rather than re-encoded as a runtime `Failure` with nothing to
  // report it under.

  // 10-13, per scenario.
  for (const scenario of input.scenarios) {
    if (scenario.run1.mutations === 0) {
      failures.push({
        code: "run-1-made-no-mutation",
        scenario: scenario.id,
        message:
          `run-1-made-no-mutation: scenario "${scenario.id}" (skill "${scenario.skill}") made zero ` +
          "mutations on run 1, so run 2 was NOT executed -- a vacuous run 1 can license no claim " +
          "about run 2",
      });
      continue;
    }

    const run2 = scenario.run2;
    if (run2 === null) continue;

    // 11. run2.mutations === 0, forgeMutations reported AS THE LIST.
    if (run2.mutations !== 0) {
      const argvList = run2.forgeMutations.map(joinArgv).join("; ");
      const worktreeList = run2.worktreeMutations.join("; ");
      failures.push({
        code: "run-2-mutated",
        scenario: scenario.id,
        message:
          `run-2-mutated: scenario "${scenario.id}" made ${String(run2.mutations)} mutation(s) on ` +
          `run 2. gh argv attempted: ${argvList.length > 0 ? argvList : "(none)"}. Worktree evidence: ` +
          `${worktreeList.length > 0 ? worktreeList : "(none)"}`,
      });
    }

    // 12. run2.reads >= reEntryRows[skill].
    const threshold = d.reEntryRows[scenario.skill] ?? 0;
    if (run2.reads < threshold) {
      failures.push({
        code: "run-2-reads-below-re-entry-rows",
        scenario: scenario.id,
        message:
          `run-2-reads-below-re-entry-rows: scenario "${scenario.id}" for skill "${scenario.skill}" ` +
          `read ${String(run2.reads)} time(s) on run 2, below the ${String(threshold)} "## Re-entry" ` +
          "row(s) that skill declares",
      });
    }

    // 13. run2.treeHash === run1.treeHash.
    if (run2.treeHash !== scenario.run1.treeHash) {
      failures.push({
        code: "run-2-tree-hash-changed",
        scenario: scenario.id,
        message:
          `run-2-tree-hash-changed: scenario "${scenario.id}" left a different committed tree hash ` +
          `after run 2 than after run 1 ("${scenario.run1.treeHash}" -> "${run2.treeHash}")`,
      });
    }
  }

  // Two extra checks, NOT counted among the thirteen.
  for (const scenario of input.scenarios) {
    const threshold = d.reEntryRows[scenario.skill] ?? 0;
    checkAttributions(scenario, 1, scenario.run1, threshold, failures);
    if (scenario.run2 !== null) checkAttributions(scenario, 2, scenario.run2, threshold, failures);
  }

  const verdict: "pass" | "fail" = failures.length === 0 ? "pass" : "fail";
  const exitCode: 0 | 1 = verdict === "pass" ? 0 : 1;
  return { verdict, exitCode, failures: Object.freeze([...failures]) };
}

// ===========================================================================
// Orchestration
// ===========================================================================

export interface RunHarnessOptions {
  readonly roster: readonly Scenario[];
  readonly skillsDir: string;
  readonly temps: TempDirs;
  /** A raw port factory, e.g. `() => createRealPort()`. Raw: the fake forge
   *  and the recorder are wrapped around it HERE, not supplied pre-wrapped,
   *  so every scenario is wrapped the identical way. */
  readonly makePort: () => Port;
  readonly pinnedSkillCount?: number;
  /** Injectable so a test can compare two runs byte for byte. */
  readonly startedAt?: string;
}

function sanitiseForTempPrefix(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function observe(report: MutationReport, attributions: readonly ReadAttribution[]): RunObservation {
  const forgeMutations = report.attemptedMutations;
  const evidence = mutationEvidence(report);
  // The bypass clause and every worktree-observable phrase all start with a
  // word other than "attempted" -- only the argv clause does
  // (mutation-recorder.ts:264-266) -- so filtering it out by that phrase
  // leaves exactly the worktree surface.
  const worktreeMutations = evidence.filter((line) => !line.includes("attempted mutating gh argv"));
  return Object.freeze({
    forgeMutations,
    worktreeMutations,
    // THE UNION OF BOTH SURFACES. A forge-only count is blind BY
    // CONSTRUCTION to any scenario that mutates only the worktree --
    // fake-forge.ts:11-16 says that is half the shipped skills.
    mutations: forgeMutations.length + worktreeMutations.length,
    reads: countReads(report.calls),
    attributions: [...attributions],
    treeHash: report.after.tree,
    evidence,
    calls: report.calls,
  });
}

/** Run the roster once and render a verdict. Per scenario: a fresh fixture
 *  repository, a fresh fake forge, a fresh recorder wrapping it, run 1 then
 *  (unless run 1 was vacuous) run 2 -- against the SAME repo, forge and
 *  recorder, per the spec's explicit ban on re-seeding either between runs. */
export async function runHarness(options: RunHarnessOptions): Promise<HarnessVerdict> {
  const startedAt = options.startedAt ?? new Date().toISOString();
  const pinnedSkillCount = options.pinnedSkillCount ?? PINNED_SKILL_COUNT;

  const skillsOnDisk = [...readSkillNames(options.skillsDir)].sort();
  const reEntryRows = countReEntryRows(options.skillsDir);

  const scenariosPerSkill: Record<string, number> = {};
  for (const name of skillsOnDisk) scenariosPerSkill[name] = 0;

  const seedTreeHashes: string[] = [];
  const scenarios: ScenarioResult[] = [];

  for (const scenario of options.roster) {
    scenariosPerSkill[scenario.skill] = (scenariosPerSkill[scenario.skill] ?? 0) + 1;

    const root = options.temps.create(`iai-322-${sanitiseForTempPrefix(scenario.id)}`);
    const raw = options.makePort();
    const forge = createFakeForge({ delegate: raw, milestones: scenario.milestones });
    const recorder = createMutationRecorder({ port: forge });
    // The recorder's `port` field is typed narrowly as `Port` (one method),
    // but the object it actually hands out is the SAME `RecordingPort`
    // `createRecordingPort` built (mutation-recorder.ts:148, :171) -- this
    // cast reaches its `.calls` length so `ctx.read` can compute the index a
    // call is ABOUT to occupy in `report.calls`, without a second capture
    // mechanism or a locally maintained counter that direct `ctx.port.run`
    // calls (which a scenario is equally free to issue) would desynchronise.
    const recordingPort = recorder.port as unknown as RecordingPort;

    const repo = await createFixtureRepo(recorder.port, root, { name: scenario.id, files: scenario.files });
    const seedTreeHash = await repo.treeHash();
    seedTreeHashes.push(seedTreeHash);

    // Seed BEFORE the first window opens, on the RAW fake -- never through
    // the recorder, so seeding is never itself scored as a mutation.
    await scenario.seed?.(forge);

    function contextFor(runIndex: 1 | 2, attributions: ReadAttribution[]): ScenarioContext {
      return {
        root,
        runIndex,
        port: recorder.port,
        async read(row: number, argv: readonly string[]): Promise<ExecResult> {
          const callIndex = recordingPort.calls.length;
          const result = await recorder.port.run(argv);
          attributions.push({ callIndex, row, argv: [...argv] });
          return result;
        },
        writeFile(relPath: string, contents: string): void {
          recorder.writeFile(relPath, contents);
        },
      };
    }

    const attributions1: ReadAttribution[] = [];
    await recorder.begin(repo);
    await scenario.run(contextFor(1, attributions1));
    const report1 = await recorder.end();
    const run1 = observe(report1, attributions1);

    if (run1.mutations === 0) {
      // MUST NOT run 2. That ordering is what makes "a vacuous run 1 cannot
      // license a run-2 claim" observable in the artifact rather than merely
      // structural -- `run2` is `null`, not a second, empty `RunObservation`.
      scenarios.push({
        id: scenario.id,
        skill: scenario.skill,
        corpus: scenario.corpus,
        seedTreeHash,
        run1,
        run2: null,
        status: "run-1-vacuous",
      });
      continue;
    }

    const attributions2: ReadAttribution[] = [];
    await recorder.begin(repo);
    await scenario.run(contextFor(2, attributions2));
    const report2 = await recorder.end();
    const run2 = observe(report2, attributions2);

    scenarios.push({
      id: scenario.id,
      skill: scenario.skill,
      corpus: scenario.corpus,
      seedTreeHash,
      run1,
      run2,
      status: "ok",
    });
  }

  const skillsCovered = [...new Set(options.roster.map((s) => s.skill))].sort();

  const denominators: Denominators = {
    skillsOnDisk,
    skillsCovered,
    pinnedSkillCount,
    rosterLength: options.roster.length,
    scenariosExecuted: scenarios.length,
    scenariosPerSkill,
    reEntryRows,
    seedTreeHashes,
  };

  const { verdict, exitCode, failures } = decideVerdict({ denominators, scenarios, pinnedSkillCount });

  return Object.freeze({
    schemaVersion: 1 as const,
    verdict,
    exitCode,
    startedAt,
    failures,
    denominators,
    scenarios,
    notVerified: NOT_VERIFIED,
  });
}

// ===========================================================================
// Rendering
// ===========================================================================

/** Human-readable, in the house style of `scripts/skill-lint.ts`'s report:
 *  one line per denominator with its value, then per-scenario lines, then a
 *  trailer. Printed by the wrapper -- this module never calls `console.log`
 *  itself, so the wrapper decides where the text goes. */
export function renderReport(verdict: HarnessVerdict): string {
  const lines: string[] = [];
  const failuresByCode = new Map<FailureCode, Failure[]>();
  for (const failure of verdict.failures) {
    const bucket = failuresByCode.get(failure.code) ?? [];
    bucket.push(failure);
    failuresByCode.set(failure.code, bucket);
  }

  const d = verdict.denominators;
  lines.push(`harness: skills on disk = ${String(d.skillsOnDisk.length)} (${d.skillsOnDisk.join(", ") || "(none)"})`);
  lines.push(`harness: skills covered by the roster = ${String(d.skillsCovered.length)} (${d.skillsCovered.join(", ") || "(none)"})`);
  lines.push(`harness: pinned skill count = ${String(d.pinnedSkillCount)}`);
  lines.push(`harness: roster length = ${String(d.rosterLength)}, scenarios executed = ${String(d.scenariosExecuted)}`);
  lines.push(`harness: distinct seed tree hashes = ${String(new Set(d.seedTreeHashes).size)}`);

  for (const code of ALL_FAILURE_CODES) {
    const bucket = failuresByCode.get(code);
    if (bucket === undefined) {
      lines.push(`harness: ${SUCCESS_PHRASE_BY_CODE[code]}`);
    } else {
      for (const failure of bucket) lines.push(`harness: FAIL ${failure.message}`);
    }
  }

  for (const scenario of verdict.scenarios) {
    const run2Summary =
      scenario.run2 === null
        ? "run 2 not executed (run 1 was vacuous)"
        : `run 2: mutations=${String(scenario.run2.mutations)} reads=${String(scenario.run2.reads)} treeHash=${scenario.run2.treeHash}`;
    lines.push(
      `harness: scenario "${scenario.id}" (skill "${scenario.skill}", status ${scenario.status}): ` +
        `run 1: mutations=${String(scenario.run1.mutations)} reads=${String(scenario.run1.reads)}; ${run2Summary}`,
    );
  }

  lines.push(verdict.verdict === "pass" ? `harness: ${VERDICT_PASS_PHRASE}` : `harness: verdict: fail (exit ${String(verdict.exitCode)})`);

  for (const statement of verdict.notVerified) lines.push(`harness: NOT VERIFIED -- ${statement}`);

  return lines.join("\n");
}

/** `JSON.stringify(verdict, null, 2) + "\n"`. The artifact a `scripts/`
 *  wrapper writes to disk in a later step -- this module renders the string
 *  and writes nothing. */
export function renderArtifact(verdict: HarnessVerdict): string {
  return `${JSON.stringify(verdict, null, 2)}\n`;
}
