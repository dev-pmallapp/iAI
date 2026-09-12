// Task #323, closing CLAIM-293.6 half (ii) -- case 9 of
// docs/test-plans/293-plan.md. Tests for `../src/injection-roster.ts` and
// `../src/runner.ts`'s `Scenario.injectBeforeRun2` hook.
//
// Corpus: `real` over `skills/` for the coverage-shaped assertions, exactly
// as `scenario-roster.test.ts` does; `synthetic` for every scenario's own
// fixture content, per `injection-roster.ts`'s own header.
//
// House anti-vacuity applies here too: denominators asserted `> 0` (and, per
// this task's brief, `=== 5` rather than `>= 5`, so the denominator is exact,
// not merely non-vacuous) before anything else, lists asserted rather than
// counts, `new Set(...)` wherever cardinality (not length) is the property.

import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createRealPort } from "iai-exec";
import {
  createFakeForge,
  createTempDirs,
  FAILURE_MODES,
  INJECTION_ROSTER,
  runHarness,
  SCENARIO_ROSTER,
  type FailureMode,
  type HarnessVerdict,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");
const skillsDir = join(repoRoot, "skills");
const temps = createTempDirs();
afterAll(() => temps.cleanup());

// ===========================================================================
// Roster hygiene -- no full run required for any of this
// ===========================================================================

describe("injection roster hygiene", () => {
  test("the roster is non-empty and has exactly five entries", () => {
    expect(INJECTION_ROSTER.length).toBeGreaterThan(0); // denominator first
    expect(INJECTION_ROSTER.length).toBe(5);
  });

  test("scenario ids are pairwise distinct", () => {
    const ids = INJECTION_ROSTER.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every one of the five FailureMode values appears exactly once, asserted against FAILURE_MODES itself", () => {
    // ASSERTED AGAINST THE EXPORTED MODE LIST, NOT A LOCAL LITERAL OF FIVE
    // STRINGS -- a sixth `FailureMode` added to `fake-forge.ts` without a
    // matching scenario here must fail this test, not silently pass because
    // this file's own copy of the set went stale alongside it.
    expect(FAILURE_MODES.length).toBeGreaterThan(0); // denominator first
    expect(FAILURE_MODES.length).toBe(5);

    const armed = INJECTION_ROSTER.map((s) => s.injectBeforeRun2).filter(
      (m): m is FailureMode => m !== undefined,
    );
    // EVERY SCENARIO ARMS A MODE. A scenario present in the roster but not
    // arming anything would inflate `INJECTION_ROSTER.length` without
    // covering a `FailureMode` -- this line makes that a distinct,
    // separately-visible failure from the coverage check below.
    expect(armed.length).toBe(INJECTION_ROSTER.length);

    // THE DENOMINATOR IS EXACT (`toBe`, never `toBeGreaterThanOrEqual`): a
    // mode covered twice while another goes uncovered would satisfy `>= 5`
    // on `armed.length` alone while leaving a real `FailureMode` untested.
    const coveredModes = new Set(armed);
    expect(coveredModes.size).toBe(FAILURE_MODES.length);
    const uncovered = FAILURE_MODES.filter((mode) => !coveredModes.has(mode));
    // ASSERT THE LIST: an uncovered mode should name itself.
    expect(uncovered).toEqual([]);
  });

  test("every scenario's skill is a known skill on disk", () => {
    const knownSkills = new Set(["goal-create", "story-create", "story-design", "story-test-plan"]);
    const unknown = INJECTION_ROSTER.filter((s) => !knownSkills.has(s.skill)).map((s) => `${s.id} -> ${s.skill}`);
    expect(unknown).toEqual([]);
  });
});

// ===========================================================================
// The one full run, memoised
// ===========================================================================

let verdictPromise: Promise<HarnessVerdict> | undefined;

function runInjectionRoster(): Promise<HarnessVerdict> {
  verdictPromise ??= runHarness({
    roster: INJECTION_ROSTER,
    skillsDir,
    temps,
    makePort: () => createRealPort(),
  });
  return verdictPromise;
}

// ===========================================================================
// THE REQUIRED CASE: the truncated-list scenario's run 2 issues a duplicate
// milestone create, and the harness reports a failure for it.
// ===========================================================================
//
// Explicit 120 s timeout on every test below that calls runInjectionRoster():
// each call runs a real git fixture + fake forge over the whole five-scenario
// roster; inheriting the 5 s default made the required `test` CI job flaky
// under parallel load.

describe('"goal-create/injected-truncated-list": run 2 issues a duplicate create', () => {
  test("run 1 and run 2 both mutate, and the harness's overall verdict is fail with a non-empty failures list", async () => {
    const verdict = await runInjectionRoster();
    expect(verdict.verdict).toBe("fail");
    expect(verdict.exitCode).toBe(1);
    expect(verdict.failures.length).toBeGreaterThan(0); // denominator first

    const scenario = verdict.scenarios.find((s) => s.id === "goal-create/injected-truncated-list");
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    expect(scenario.run1).not.toBeNull();
    expect(scenario.run2).not.toBeNull();
    if (scenario.run1 === null || scenario.run2 === null) return;

    expect(scenario.run1.mutations).toBeGreaterThan(0);
    expect(scenario.run2.mutations).toBeGreaterThan(0);
  }, 120_000);

  test("run 2's recorded forge mutations contain a milestone-create argv carrying the SAME title as run 1's -- asserted on the recorded argv, never on the exit code or on stdout", async () => {
    // #320's M9/M9b pair proved a double that refuses and a double that
    // accepts return the SAME verdict and differ only in STATE -- so this
    // assertion reads `run1.forgeMutations` / `run2.forgeMutations`
    // directly, never `verdict.exitCode`, `verdict.verdict`, or anything
    // rendered to a string a human reads.
    const verdict = await runInjectionRoster();
    const scenario = verdict.scenarios.find((s) => s.id === "goal-create/injected-truncated-list");
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const run1 = scenario.run1;
    const run2 = scenario.run2;
    expect(run1).not.toBeNull();
    expect(run2).not.toBeNull();
    if (run1 === null || run2 === null) return;

    function milestoneCreateTitles(mutations: readonly (readonly string[])[]): readonly string[] {
      return mutations
        .filter((argv) => argv[0] === "gh" && argv[1] === "api" && argv.includes("--method") && argv.includes("POST"))
        .map((argv) => {
          const titleFlag = argv.find((part) => part.startsWith("title="));
          return titleFlag === undefined ? "" : titleFlag.slice("title=".length);
        })
        .filter((title) => title.length > 0);
    }

    const run1Titles = milestoneCreateTitles(run1.forgeMutations);
    const run2Titles = milestoneCreateTitles(run2.forgeMutations);

    expect(run1Titles.length).toBe(1); // denominator first
    expect(run2Titles.length).toBe(1);

    // THE DUPLICATE, QUOTED: run 2's create carries the identical title run
    // 1's create carried -- a second, real milestone with the same identity
    // key skills/goal-create/SKILL.md:79 keys existence on.
    expect(run2Titles[0]).toBe(run1Titles[0]);
    expect(run2Titles[0]).toBe("M9 — universal lifecycle");

    // The full argv, quoted for the record: run 1's and run 2's
    // milestone-create calls are byte-identical, because nothing about the
    // TRANSCRIPTION changed between the two runs -- only the forge's answer
    // to the list read did.
    const run1CreateArgv = run1.forgeMutations.find(
      (argv) => argv[0] === "gh" && argv.includes("--method") && argv.includes("POST"),
    );
    const run2CreateArgv = run2.forgeMutations.find(
      (argv) => argv[0] === "gh" && argv.includes("--method") && argv.includes("POST"),
    );
    expect(run1CreateArgv).toBeDefined();
    expect(run2CreateArgv).toBeDefined();
    expect(run2CreateArgv).toEqual(run1CreateArgv);
  }, 120_000);

  test("the harness reports it: a run-2-mutated failure names this scenario", async () => {
    const verdict = await runInjectionRoster();
    const named = verdict.failures.filter((f) => f.code === "run-2-mutated" && f.scenario === "goal-create/injected-truncated-list");
    expect(named.length).toBe(1);
    expect(named[0]?.message).toContain("goal-create/injected-truncated-list");
  }, 120_000);
});

// ===========================================================================
// The other four modes: each is armed (case 9 half (i) redux, at the
// scenario level rather than the raw-forge level), and each scenario's
// outcome is asserted precisely -- never inferred from the overall verdict.
// ===========================================================================

describe("the remaining four injected scenarios", () => {
  test("the three read-lie modes (rate-limit, forbidden-header, transient) each crash run 2 with scenario-threw -- REPORTED, NOT FORCED: their messages are IDENTICAL, which is the collapse #320 recorded (a zeroed budget, a header-absent 403 and a transient error all read as \"the read exited 1\") reproduced one layer up, at the transcription level", async () => {
    const verdict = await runInjectionRoster();
    const ids = [
      "story-create/injected-rate-limit",
      "story-design/injected-forbidden-header",
      "story-test-plan/injected-transient-error",
    ] as const;

    const messages: string[] = [];
    for (const id of ids) {
      const scenario = verdict.scenarios.find((s) => s.id === id);
      expect(scenario).toBeDefined();
      if (scenario === undefined) continue;
      expect(scenario.status).toBe("threw");
      expect(scenario.threw?.runIndex).toBe(2);
      expect(scenario.run2).toBeNull();
      const message = scenario.threw?.message ?? "";
      expect(message.length).toBeGreaterThan(0); // denominator first
      messages.push(message);
    }

    expect(messages.length).toBe(ids.length);
    // THE COLLAPSE, PINNED: none of the four transcriptions
    // (`transcription-*.ts`) checks a forge read's exit code before parsing
    // its stdout as JSON (only the git-backed hard-failure reads do that),
    // so a lied read of ANY of these three modes crashes on
    // `JSON.parse("")` with the SAME engine error message. Asserting
    // equality here, rather than merely observing it, is what keeps this
    // fact from silently drifting the next time one of these transcriptions
    // changes -- a future transcription that starts checking exit codes
    // would need to update this test, which is the point.
    expect(new Set(messages).size).toBe(1);

    const failureCodes = verdict.failures
      .filter((f) => ids.includes(f.scenario as (typeof ids)[number]))
      .map((f) => f.code);
    expect(failureCodes.length).toBe(ids.length);
    expect(failureCodes.every((c) => c === "scenario-threw")).toBe(true);
  }, 120_000);

  test("silent-no-op-mutation's scenario is armed but never engaged: run 2 attempts no mutation, so the mode has nothing to intercept -- REPORTED, NOT FORCED", async () => {
    const verdict = await runInjectionRoster();
    const scenario = verdict.scenarios.find((s) => s.id === "goal-create/injected-silent-no-op");
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    expect(scenario.status).toBe("ok");
    expect(scenario.run1).not.toBeNull();
    expect(scenario.run2).not.toBeNull();
    if (scenario.run1 === null || scenario.run2 === null) return;
    expect(scenario.run1.mutations).toBeGreaterThan(0);
    expect(scenario.run2.mutations).toBe(0);
    expect(scenario.run2.forgeMutations).toEqual([]);

    // No `run-2-mutated` failure for THIS scenario specifically (other
    // scenarios in this same roster fail for their own, distinct reasons).
    const named = verdict.failures.filter(
      (f) => f.scenario === "goal-create/injected-silent-no-op",
    );
    expect(named).toEqual([]);
  }, 120_000);
});

// ===========================================================================
// silent-no-op-mutation, verified directly at the fake's own seam -- since
// none of the four transcriptions attempts a mutation on an honestly-read
// run 2 (the property the whole roster exists to prove), this is the mode's
// own mechanics, checked where they CAN be observed.
// ===========================================================================

describe("silent-no-op-mutation's own mechanics, at createFakeForge's seam", () => {
  test("exit 0, and the milestone is NOT added to the fake's state", async () => {
    const forge = createFakeForge({ milestones: [] });
    forge.inject("silent-no-op-mutation");
    const result = await forge.run([
      "gh",
      "api",
      "--method",
      "POST",
      "repos/OWNER/REPO/milestones",
      "-f",
      "title=silent-no-op-probe",
      "-f",
      "description=synthetic",
    ]);
    expect(result.exitCode).toBe(0);

    forge.inject(null);
    const after = await forge.run(["gh", "api", "--paginate", "repos/OWNER/REPO/milestones?state=all&per_page=100"]);
    expect(after.exitCode).toBe(0);
    const milestones = JSON.parse(after.stdout) as readonly { readonly title: string }[];
    // ASSERT THE LIST, NOT A COUNT: the probe title must be ABSENT, not
    // merely "the count did not grow by exactly one" (which a mutation that
    // both added and removed something could also satisfy).
    expect(milestones.map((m) => m.title)).toEqual([]);
  });
});

// ===========================================================================
// The default path is unchanged: SCENARIO_ROSTER's own length and behaviour
// do not move because INJECTION_ROSTER and `injectBeforeRun2` now exist.
// ===========================================================================

describe("the six frozen scenarios are bit-for-bit unaffected by injectBeforeRun2's existence", () => {
  test("SCENARIO_ROSTER.length is still 6, and none of its entries declares injectBeforeRun2", () => {
    expect(SCENARIO_ROSTER.length).toBe(6);
    const armed = SCENARIO_ROSTER.filter((s) => s.injectBeforeRun2 !== undefined).map((s) => s.id);
    expect(armed).toEqual([]);
  });
});
