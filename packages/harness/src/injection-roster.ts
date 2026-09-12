// The injection roster: five scenarios, one per `FailureMode`
// (`fake-forge.ts`'s closed set), each arming its lie via
// `Scenario.injectBeforeRun2` after run 1 and before run 2. Case 9 of
// `docs/test-plans/293-plan.md`. Build target of #323 (task #323, closing
// CLAIM-293.6 half (ii)).
//
// NOT A SEVENTH ROSTER FREE TO GROW. `INJECTION_ROSTER` is a frozen module
// constant, exactly like `SCENARIO_ROSTER` (`scenario-roster.ts`) is. It
// reuses the same four `runXxx` transcriptions that module already imports
// -- goal-create, story-create, story-design, story-test-plan -- rather than
// authoring a sixth transcription. No new skill body is transcribed here;
// this module only supplies a different SEED and a different LIE to
// existing, already-reviewed re-entry logic.
//
// =============================================================================
// THE CRITICAL DESIGN CONSTRAINT: `--inject` DOES NOT REOPEN THE VACUITY HOLE
// `scenario-roster.ts`'s HEADER CLOSES.
// =============================================================================
//
// `scenario-roster.ts:9-17` says, in terms: "NO FLAG, NO PARAMETERISATION, NO
// INJECTION POINT -- AND THAT IS DELIBERATE", because a flag that can SHRINK
// a roster on demand is a harness that can be silenced from outside itself --
// that is the exact shape the `empty-roster` failure code exists to catch.
//
// `scripts/skill-harness.ts`'s `--inject` flag does NOT have that shape, and
// here is the argument for why, stated once, in the one place a reader
// auditing both rosters together would look for it:
//
//   1. `--inject` selects between exactly TWO FROZEN CONSTANTS --
//      `SCENARIO_ROSTER` (six scenarios, unconditionally) or
//      `INJECTION_ROSTER` (five scenarios, unconditionally, defined below).
//      It is a SWITCH between two fixed values, never a parameter that
//      shapes either one. There is no `--inject=<n>` that trims
//      `INJECTION_ROSTER` to fewer than five entries, no `--inject=<mode>`
//      that swaps which `FailureMode` a given scenario arms, and no
//      argument threading from the CLI into either roster's construction at
//      all -- the flag is boolean, and everything downstream of "which
//      constant" is exactly as frozen as `SCENARIO_ROSTER` already is.
//
//   2. `SCENARIO_ROSTER` remains UNREACHABLE FROM ANY ARGUMENT in the sense
//      that matters: no combination of flags can make it smaller, reorder
//      it, or remove a scenario from it. `--inject` does not touch it at
//      all -- it *replaces* it wholesale with a second, equally-frozen
//      roster; it does not parameterise the six-scenario roster into
//      producing fewer than six results.
//
//   3. `INJECTION_ROSTER` is EQUALLY FROZEN. It is a `readonly Scenario[]`
//      built exactly the way `SCENARIO_ROSTER` is (`Object.freeze([...])`,
//      module-level, no factory function, no argument taken anywhere in
//      this file). The only way to change its length or contents is a
//      source edit to THIS file -- the same discipline
//      `scenario-roster.ts`'s header states for its own roster, and the
//      same thing a mutation test on this module would be built to defend.
//
// So the flag widens WHICH FROZEN CONSTANT runs, never HOW MANY SCENARIOS a
// constant contains, and never WHAT A SCENARIO DOES once selected. That is
// the property `scenario-roster.ts`'s header actually forbids losing, and
// `--inject` does not lose it.
//
// =============================================================================
// WHY THE TRUNCATED-LIST SCENARIO IS THE ONE THAT PROVES THE HARNESS CAN FAIL
// =============================================================================
//
// `goal-create`'s row-1 read is `gh api --paginate repos/OWNER/REPO/
// milestones?...` (`transcription-goal-create.ts`'s `milestonesListArgv`),
// and it creates a milestone exactly when that list does not already carry
// one with the wanted title (skills/goal-create/SKILL.md:79's identity key).
// `fake-forge.ts`'s `truncate()` drops the LAST element of any list while
// `truncated-list` is armed -- "the newest object is the one a re-entrant
// skill just created and is about to look for" (`fake-forge.ts:358-360`).
//
// `INJECTION_TRUNCATED_LIST` below seeds NO milestone (run 1 creates the
// first, and only, one -- exactly `SCENARIO_1`'s shape in
// `scenario-roster.ts`). Between run 1 and run 2, `truncated-list` is armed.
// Run 2's re-read of a ONE-ELEMENT list, truncated by one, is an EMPTY list
// -- the milestone run 1 just created is now indistinguishable from a
// milestone that was never created. `goal-create`'s transcription reads
// exactly that empty list and does exactly what its own re-entry contract
// says to do when a milestone is absent: it creates one. `fake-forge.ts`
// has NO DUPLICATE CHECK ON ANY IDENTITY KEY (NEVER-293.7,
// `fake-forge.ts:26-32`), so the second `POST .../milestones` call, carrying
// the SAME title as run 1's, is accepted and lands as a second, real
// milestone. This is verified empirically in
// `packages/harness/test/injection-roster.test.ts`, not assumed: the test
// reads run 2's recorded forge mutations and asserts a second
// `-f title=<same title>` argv is present.

import type { FailureMode, FakeForge } from "./fake-forge";
import { GOALS_FIXTURE_CORPUS_DECLARATION, renderGoalsFixture } from "./goals-fixture";
import type { Scenario } from "./runner";
import { runGoalCreate } from "./transcription-goal-create";
import { runStoryCreate } from "./transcription-story-create";
import { runStoryDesign } from "./transcription-story-design";
import { runStoryTestPlan } from "./transcription-story-test-plan";

/** A CLOSED SET: the five scenario ids below, and nothing else -- the same
 *  discipline `scenario-roster.ts`'s `ScenarioId` applies to its own six. */
export type InjectionScenarioId =
  | "goal-create/injected-truncated-list"
  | "story-create/injected-rate-limit"
  | "story-design/injected-forbidden-header"
  | "story-test-plan/injected-transient-error"
  | "goal-create/injected-silent-no-op";

type IdentifiedInjectionScenario = Scenario & { readonly id: InjectionScenarioId; readonly injectBeforeRun2: FailureMode };

const REPO_FLAG = ["--repo", "OWNER/REPO"] as const;

function designBodyFor(issue: number): string {
  return [
    `# Story ${String(issue)} Design`,
    "",
    "## Problem",
    "",
    `CLAIM-${String(issue)}.1: the subject behaves correctly the first time it is entered.`,
    "",
  ].join("\n");
}

function designSentinelBodyFor(issue: number): string {
  return `## iai-design pinned\n\nDesign for #${String(issue)} committed by injection-roster. Corpus: synthetic.`;
}

function planBodyFor(issue: number): string {
  return [
    `# Test Plan for Story ${String(issue)}`,
    "",
    "| Case | anchors_to | Corpus |",
    "|---|---|---|",
    `| 1 | CLAIM-${String(issue)}.1 | synthetic |`,
    "",
  ].join("\n");
}

function testPlanSentinelBodyFor(issue: number): string {
  return `## iai-test-plan pinned\n\nTest plan for #${String(issue)} committed by injection-roster. Corpus: synthetic.`;
}

// =============================================================================
// 1. goal-create/injected-truncated-list -- THE REQUIRED CASE.
// =============================================================================
//
// Byte-for-byte `SCENARIO_1` of `scenario-roster.ts` (same goals fixture,
// same milestone title, same feature table), except for its marker line
// (own seed tree hash) and `injectBeforeRun2`. Run 1: milestone absent,
// created. Run 2, with `truncated-list` armed: the one-element list is
// truncated to zero elements, the milestone reads as absent again, and
// `goal-create` creates a SECOND milestone with the SAME title -- the
// duplicate create this case exists to prove.

const INJECTION_TRUNCATED_LIST: IdentifiedInjectionScenario = {
  id: "goal-create/injected-truncated-list",
  skill: "goal-create",
  corpus: GOALS_FIXTURE_CORPUS_DECLARATION,
  files: [
    { path: "goals/GOALS.md", contents: renderGoalsFixture({ goals: ["universal lifecycle"] }) },
    {
      path: "docs/milestones/M9.md",
      contents: "# M9\n\n<!-- injection scenario 1: truncated-list marker -->\n",
    },
  ],
  milestones: [],
  injectBeforeRun2: "truncated-list",
  async run(ctx): Promise<void> {
    await runGoalCreate(ctx, {
      goalsPath: "goals/GOALS.md",
      goalId: "G0",
      milestoneTitle: "M9 — universal lifecycle",
      featureTable: "| Feature | Description |\n|---|---|\n| Onboarding | user completes onboarding |\n",
    });
  },
};

// =============================================================================
// 2. story-create/injected-rate-limit
// =============================================================================
//
// `story-create`'s row 1 read is `gh issue list --json number,title,
// milestone` (`transcription-story-create.ts`'s `issueListArgv`), a plain
// `gh issue list` classified by `handleIssue`'s `action === "list"` branch
// -- exactly the shape `lieOnRead` intercepts. Run 1 seeds no issues, so it
// creates both feature rows (non-vacuous). Run 2, with
// `rate-limit-zeroed-budget` armed: the re-read fails (exit 1, empty
// stdout), and `parseIssues` (`JSON.parse` over that empty string) throws --
// this transcription never checks the read's exit code before parsing it,
// so the failure surfaces as `scenario-threw`, not a graceful re-entry
// decision. Reported, not hidden: see this module's header and
// `injection-roster.test.ts`'s report on signature collapse.

const FEATURE_ROWS_INJECTED = ["Feature: create the injected widget", "Feature: retire the injected widget"] as const;

const INJECTION_RATE_LIMIT: IdentifiedInjectionScenario = {
  id: "story-create/injected-rate-limit",
  skill: "story-create",
  corpus: "synthetic — a two-row feature table authored for #323's injection roster; no real binding behind it",
  files: [
    {
      path: "docs/milestones/M9.md",
      contents: [
        "# M9 — full lifecycle",
        "",
        "<!-- injection scenario 2: rate-limit marker -->",
        "",
        "| Feature | Description |",
        "|---|---|",
        `| A | ${FEATURE_ROWS_INJECTED[0]} |`,
        `| B | ${FEATURE_ROWS_INJECTED[1]} |`,
        "",
      ].join("\n"),
    },
    { path: "bindings/dev.md", contents: "domain: dev\nowner: platform\n" },
  ],
  injectBeforeRun2: "rate-limit-zeroed-budget",
  async run(ctx): Promise<void> {
    await runStoryCreate(ctx, {
      milestonePath: "docs/milestones/M9.md",
      milestoneTitle: "M9 — full lifecycle",
      bindingPath: "bindings/dev.md",
      featureRows: FEATURE_ROWS_INJECTED,
    });
  },
};

// =============================================================================
// 3. story-design/injected-forbidden-header
// =============================================================================
//
// `story-design`'s row 2 read is `gh issue view <n> --json comments`
// (`transcription-story-design.ts`'s `issueViewArgv`), classified by
// `handleIssue`'s `action === "view"` branch -- also intercepted by
// `lieOnRead`. `seed()` issues one `gh issue create` on the raw fake
// (becoming issue 1), same reasoning as `SCENARIO_3`. Run 1: no Design file
// yet, so it writes the Design and posts the sentinel (non-vacuous). Run 2,
// with `forbidden-no-budget-header` armed (the THIRD STATE --
// `fake-forge.ts:130-144` -- a 403 with no budget header captured): the
// sentinel re-read fails (exit 1, empty stdout) and `JSON.parse` over that
// empty stdout throws, again surfacing as `scenario-threw`.

const INJECTION_FORBIDDEN_HEADER: IdentifiedInjectionScenario = {
  id: "story-design/injected-forbidden-header",
  skill: "story-design",
  corpus: "synthetic — a Story with no Design yet, authored for #323's injection roster",
  files: [{ path: "MARKER.md", contents: "injection scenario 3: forbidden-header marker\n" }],
  injectBeforeRun2: "forbidden-no-budget-header",
  async seed(forge: FakeForge): Promise<void> {
    await forge.run([
      "gh",
      "issue",
      "create",
      ...REPO_FLAG,
      "--title",
      "Story: injected-forbidden-header",
      "--body",
      "seed body for injection scenario 3",
      "--label",
      "type:story",
    ]);
  },
  async run(ctx): Promise<void> {
    await runStoryDesign(ctx, {
      issue: 1,
      designPath: "docs/design/stories/1.md",
      designBody: designBodyFor(1),
      sentinelBody: designSentinelBodyFor(1),
    });
  },
};

// =============================================================================
// 4. story-test-plan/injected-transient-error
// =============================================================================
//
// `story-test-plan`'s row 5 read is `gh issue view <n> --json comments`
// (`transcription-story-test-plan.ts`), also intercepted by `lieOnRead`.
// `seed()` issues one `gh issue create` (issue 1), same reasoning as
// `SCENARIO_4`. Run 1: no plan yet, so it writes the plan and posts the
// sentinel (non-vacuous). Run 2, with `transient-connection-error` armed:
// the mode is TRANSIENT (`fake-forge.ts:288-292` -- it "spends itself on the
// first call ... and the identical argv then succeeds"), but this
// transcription issues its row-5 read exactly ONCE per run and never
// retries, so the one call that fails is the only call made -- the failure
// still surfaces as `scenario-threw`, for the same reason as scenarios 2 and
// 3: none of the four transcriptions implement retry-on-failure logic.

const INJECTION_TRANSIENT_ERROR: IdentifiedInjectionScenario = {
  id: "story-test-plan/injected-transient-error",
  skill: "story-test-plan",
  corpus: "synthetic — a Design with one claim and no plan yet, authored for #323's injection roster",
  files: [{ path: "docs/design/stories/1.md", contents: designBodyFor(1) }],
  injectBeforeRun2: "transient-connection-error",
  async seed(forge: FakeForge): Promise<void> {
    await forge.run([
      "gh",
      "issue",
      "create",
      ...REPO_FLAG,
      "--title",
      "Story: injected-transient-error",
      "--body",
      "seed body for injection scenario 4",
      "--label",
      "type:story",
    ]);
  },
  async run(ctx): Promise<void> {
    await runStoryTestPlan(ctx, {
      issue: 1,
      designPath: "docs/design/stories/1.md",
      planPath: "docs/test-plans/1-plan.md",
      planBody: planBodyFor(1),
      sentinelBody: testPlanSentinelBodyFor(1),
    });
  },
};

// =============================================================================
// 5. goal-create/injected-silent-no-op
// =============================================================================
//
// Reuses `goal-create` a second time, deliberately -- the roster has five
// modes and only four transcriptions, and `goal-create`'s is the only
// re-entry contract this module found a genuine duplicate-create hazard
// in, so it earns the repeat rather than a fifth transcription being
// invented to avoid one. Same shape as scenario 1: run 1 creates the one
// milestone from an empty list (non-vacuous). Run 2, with
// `silent-no-op-mutation` armed, but WITHOUT `truncated-list`: the re-read
// is answered HONESTLY (`lieOnRead` has no clause for this mode --
// `fake-forge.ts:325-337` -- it only touches `lieOnMutation`), so
// `goal-create` correctly sees the milestone it already created and
// attempts NO create at all. `silent-no-op-mutation`'s own clause in
// `lieOnMutation` (`fake-forge.ts:345-351`, "exit 0, nothing written") is
// therefore armed but never reached by this scenario's run 2 -- there is no
// mutation attempt for it to intercept.
//
// THIS IS REPORTED, NOT PAPERED OVER (see this module's header and
// `injection-roster.test.ts`). None of the four transcriptions attempts a
// mutation on a truthfully-re-read run 2 by design -- that is the exact
// re-entrance property `scenario-roster.ts`'s six scenarios exist to prove.
// `silent-no-op-mutation` only has an effect on an ATTEMPTED mutation, and
// producing one honestly (without also lying about a read, which is a
// different mode's job) is not available from any of the four existing
// transcriptions' correct behaviour. `injection-roster.test.ts` instead
// exercises `silent-no-op-mutation`'s own behaviour directly against
// `createFakeForge`, at the fake's own seam, so the mode's mechanics are
// still verified even though this particular scenario's run 2 cannot
// observe them.

const INJECTION_SILENT_NO_OP: IdentifiedInjectionScenario = {
  id: "goal-create/injected-silent-no-op",
  skill: "goal-create",
  corpus: GOALS_FIXTURE_CORPUS_DECLARATION,
  files: [
    { path: "goals/GOALS.md", contents: renderGoalsFixture({ goals: ["universal lifecycle"] }) },
    {
      path: "docs/milestones/M9.md",
      contents: "# M9\n\n<!-- injection scenario 5: silent-no-op marker -->\n",
    },
  ],
  milestones: [],
  injectBeforeRun2: "silent-no-op-mutation",
  async run(ctx): Promise<void> {
    await runGoalCreate(ctx, {
      goalsPath: "goals/GOALS.md",
      goalId: "G0",
      milestoneTitle: "M9 — silent no-op lifecycle",
      featureTable: "| Feature | Description |\n|---|---|\n| Onboarding | user completes onboarding |\n",
    });
  },
};

// =============================================================================
// The roster
// =============================================================================

/** Five scenarios, one per `FailureMode`, FROZEN -- see this module's own
 *  header for why that freeze is exactly as load-bearing as
 *  `SCENARIO_ROSTER`'s. */
export const INJECTION_ROSTER: readonly Scenario[] = Object.freeze([
  INJECTION_TRUNCATED_LIST,
  INJECTION_RATE_LIMIT,
  INJECTION_FORBIDDEN_HEADER,
  INJECTION_TRANSIENT_ERROR,
  INJECTION_SILENT_NO_OP,
]);
