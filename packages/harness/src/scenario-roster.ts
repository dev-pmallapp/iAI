// The scenario roster: six scenarios, one `run()` per shipped skill's
// re-entry contract (two apiece for `story-design` and `story-test-plan`,
// so the surface-separation pair below exists), populating the harness
// #322's runner (`./runner.ts`) built against a synthetic roster in its own
// step.
//
// Build target of #322 (step B3). `docs/test-plans/293-plan.md`'s corpus.
//
// NO FLAG, NO PARAMETERISATION, NO INJECTION POINT -- AND THAT IS DELIBERATE.
// `SCENARIO_ROSTER` is a frozen module constant. It could be tempting to add
// a `--roster` or `--empty-roster` flag so a caller can ask for a smaller
// roster on demand; that flag would BE the vacuity hole the empty-roster
// check (`runner.ts`'s `empty-roster` failure code) exists to prove closed.
// A harness whose roster can be emptied by an argument, rather than only by
// editing this file, is a harness that can be silenced from outside itself.
// The only way to empty this roster is a source edit -- which is exactly
// what a mutation test on this module is for.
//
// EVERY SCENARIO'S SEED FILES DIFFER IN CONTENT. The seed tree hash a
// scenario is scored on (`FixtureRepo.treeHash()`, `fixture-repo.ts:123`) is
// `HEAD^{tree}` -- the hash of the committed file set, independent of the
// scenario's own id or commit message. Two scenarios seeding an identical
// path-and-bytes set collide on `runner.ts`'s `duplicate-seed-tree-hash`
// denominator no matter how differently they are named. Every file literal
// below carries a scenario-specific marker line for exactly this reason.
//
// THE FAKE'S ISSUE NUMBERING. `createFakeForge` starts `nextIssue` at 1
// (`fake-forge.ts:283`) and `runHarness` gives every scenario its own fresh
// forge (`runner.ts`'s per-scenario `createFakeForge` call). So a scenario
// whose `seed()` issues exactly one `gh issue create` sees that issue land
// as number 1, and every `docs/design/stories/1.md` / `docs/test-plans/
// 1-plan.md` path below agrees with that.
//
// TWO DEAD BRANCHES, LEFT DEAD ON PURPOSE.
//
//   - `goal-create`'s row-2 amend (`transcription-goal-create.ts`'s `PATCH
//     .../milestones/{number}` branch) never fires here, because scenario 1
//     creates the milestone with the feature table already correct on run 1
//     -- there is no "description differs" state left for run 2 to find.
//   - `story-create`'s row-3 reassign (`transcription-story-create.ts`'s
//     "issue.milestone === null" branch) never fires here, because every
//     create in scenario 2 carries `--milestone` from the start.
//
// Both are correct re-entrant behaviour, not a gap in this roster, and
// neither is worth a seventh scenario built to force it: `handleApi`
// (`fake-forge.ts:409-458`) models no `PATCH .../milestones/{number}` at all
// (the transcription's own comment there explains why, and that a scenario
// exercising it would land on `unmodelled`, never a real update), and
// `handleIssue`'s `create` (`fake-forge.ts:486-503`) never fails to honour
// `--milestone`. A scenario built around either branch would not be honest
// about what this fake can answer, so neither is added.
//
// THE SURFACE-SEPARATION PAIR: scenarios 5 and 6. `story-design/
// sentinel-only` trips ONLY the forge (its Design file is already committed
// at the exact bytes the transcription would write, so row 1 never calls
// `ctx.writeFile`); `story-test-plan/file-only` trips ONLY the worktree (its
// sentinel is already posted at the exact bytes the transcription would
// post, so row 5 never calls `ctx.port.run` on a mutating `gh` argv). This is
// why `runner.ts`'s `mutations` counter (`observe()`, `runner.ts:572-593`) is
// the UNION of `forgeMutations.length` and `worktreeMutations.length`: a
// forge-only counter would score scenario 6's run 1 -- which never touches
// `gh` -- as vacuous, and a worktree-only counter would do the same to
// scenario 5.

import type { FakeForge } from "./fake-forge";
import { GOALS_FIXTURE_CORPUS_DECLARATION, renderGoalsFixture } from "./goals-fixture";
import type { Scenario } from "./runner";
import { runGoalCreate } from "./transcription-goal-create";
import { runStoryCreate } from "./transcription-story-create";
import { runStoryDesign } from "./transcription-story-design";
import { runStoryTestPlan } from "./transcription-story-test-plan";

/** A CLOSED SET: the six scenario ids below, and nothing else. Typing each
 *  scenario constant against `Scenario & { readonly id: ScenarioId }` turns a
 *  typo'd id -- one that does not match this union -- into a compile error
 *  rather than a roster-hygiene test failure discovered later. */
export type ScenarioId =
  | "goal-create/absent-milestone"
  | "story-create/two-unstoried-rows"
  | "story-design/design-and-sentinel"
  | "story-test-plan/plan-and-sentinel"
  | "story-design/sentinel-only"
  | "story-test-plan/file-only";

type IdentifiedScenario = Scenario & { readonly id: ScenarioId };

const REPO_FLAG = ["--repo", "OWNER/REPO"] as const;

// ===========================================================================
// Byte-identical builders -- shared between a scenario that WRITES a file or
// posts a comment and a scenario that seeds the exact same bytes ahead of
// time, so "already present, at exactly the bytes the transcription would
// produce" is provably true rather than eyeballed.
// ===========================================================================

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
  return (
    `## iai-design pinned\n\n` + `Design for #${String(issue)} committed by story-design. Corpus: synthetic.`
  );
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
  return (
    `## iai-test-plan pinned\n\n` + `Test plan for #${String(issue)} committed by story-test-plan. Corpus: synthetic.`
  );
}

// ===========================================================================
// 1. goal-create/absent-milestone
// ===========================================================================
//
// Corpus: the goals source itself is `GOALS_FIXTURE_CORPUS_DECLARATION`
// (`goals-fixture.ts`) -- the mandatory declaration for this fixture, per
// this scenario's own table row. `docs/milestones/M9.md` is present but
// never read by `goal-create`'s transcription; it exists only to carry a
// scenario-1-specific marker line so this seed's tree hash cannot collide
// with any other scenario's.

const SCENARIO_1: IdentifiedScenario = {
  id: "goal-create/absent-milestone",
  skill: "goal-create",
  corpus: GOALS_FIXTURE_CORPUS_DECLARATION,
  files: [
    { path: "goals/GOALS.md", contents: renderGoalsFixture({ goals: ["universal lifecycle"] }) },
    { path: "docs/milestones/M9.md", contents: "# M9\n\n<!-- scenario 1: absent-milestone marker -->\n" },
  ],
  milestones: [],
  async run(ctx): Promise<void> {
    await runGoalCreate(ctx, {
      goalsPath: "goals/GOALS.md",
      goalId: "G0",
      milestoneTitle: "M9 — universal lifecycle",
      featureTable: "| Feature | Description |\n|---|---|\n| Onboarding | user completes onboarding |\n",
    });
  },
};

// ===========================================================================
// 2. story-create/two-unstoried-rows
// ===========================================================================
//
// Two feature rows, neither yet a Story. The seeded milestone is decorative
// context for the fixture's `docs/milestones/M9.md`, not something
// `story-create`'s transcription itself looks up -- it never calls the
// milestones endpoint at all, only `gh issue list`.

const FEATURE_ROWS_2 = ["Feature: create the widget", "Feature: retire the widget"] as const;

const SCENARIO_2: IdentifiedScenario = {
  id: "story-create/two-unstoried-rows",
  skill: "story-create",
  corpus:
    "synthetic — a two-row feature table authored for #322's roster; no real milestone or binding exists behind it",
  files: [
    {
      path: "docs/milestones/M9.md",
      contents: [
        "# M9 — full lifecycle",
        "",
        "<!-- scenario 2: two-unstoried-rows marker -->",
        "",
        "| Feature | Description |",
        "|---|---|",
        `| A | ${FEATURE_ROWS_2[0]} |`,
        `| B | ${FEATURE_ROWS_2[1]} |`,
        "",
      ].join("\n"),
    },
    { path: "bindings/dev.md", contents: "domain: dev\nowner: platform\n" },
  ],
  milestones: [{ title: "M9 — full lifecycle", description: "seeded context; story-create never reads this" }],
  async run(ctx): Promise<void> {
    await runStoryCreate(ctx, {
      milestonePath: "docs/milestones/M9.md",
      milestoneTitle: "M9 — full lifecycle",
      bindingPath: "bindings/dev.md",
      featureRows: FEATURE_ROWS_2,
    });
  },
};

// ===========================================================================
// 3. story-design/design-and-sentinel
// ===========================================================================
//
// No Design file on disk yet. `seed()` issues one `gh issue create` on the
// RAW fake (never through the recorder, per `Scenario.seed`'s own contract
// in `runner.ts`), which becomes issue 1. Run 1 must write the Design AND
// post the sentinel: both halves of row 1 and row 2 fire from empty state.

const SCENARIO_3: IdentifiedScenario = {
  id: "story-design/design-and-sentinel",
  skill: "story-design",
  corpus: "synthetic — a Story with no Design yet, authored for #322's roster",
  files: [{ path: "MARKER.md", contents: "scenario 3: design-and-sentinel marker\n" }],
  async seed(forge: FakeForge): Promise<void> {
    await forge.run([
      "gh",
      "issue",
      "create",
      ...REPO_FLAG,
      "--title",
      "Story: design-and-sentinel",
      "--body",
      "seed body for scenario 3",
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

// ===========================================================================
// 4. story-test-plan/plan-and-sentinel
// ===========================================================================
//
// The Design exists and carries one claim (`CLAIM-1.1`); the plan does not.
// `seed()` issues one `gh issue create`, becoming issue 1 -- same reasoning
// as scenario 3.

const SCENARIO_4: IdentifiedScenario = {
  id: "story-test-plan/plan-and-sentinel",
  skill: "story-test-plan",
  corpus: "synthetic — a Design with one claim and no plan yet, authored for #322's roster",
  files: [{ path: "docs/design/stories/1.md", contents: designBodyFor(1) }],
  async seed(forge: FakeForge): Promise<void> {
    await forge.run([
      "gh",
      "issue",
      "create",
      ...REPO_FLAG,
      "--title",
      "Story: plan-and-sentinel",
      "--body",
      "seed body for scenario 4",
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

// ===========================================================================
// 5. story-design/sentinel-only -- half of the surface-separation pair
// ===========================================================================
//
// The Design file is seeded ALREADY COMMITTED at exactly `designBodyFor(1)`
// -- the same bytes `run()` below would write if it were absent -- so row 1
// finds it present and current and calls `ctx.writeFile` NOT AT ALL. Only
// the sentinel is missing (the forge is seeded with an issue and no
// comments), so run 1 trips the forge surface only.

const SCENARIO_5: IdentifiedScenario = {
  id: "story-design/sentinel-only",
  skill: "story-design",
  corpus: "synthetic — a Design already committed byte-for-byte; only the sentinel remains to post",
  files: [
    { path: "docs/design/stories/1.md", contents: designBodyFor(1) },
    { path: "MARKER.md", contents: "scenario 5: sentinel-only marker\n" },
  ],
  async seed(forge: FakeForge): Promise<void> {
    await forge.run([
      "gh",
      "issue",
      "create",
      ...REPO_FLAG,
      "--title",
      "Story: sentinel-only",
      "--body",
      "seed body for scenario 5",
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

// ===========================================================================
// 6. story-test-plan/file-only -- the other half of the pair
// ===========================================================================
//
// The Design is present (so claims resolve); the plan is absent, so row 1
// DOES write it. The forge is seeded with the issue AND a comment carrying
// exactly `testPlanSentinelBodyFor(1)` -- the same bytes row 5 would post --
// so `existingSentinel.body === params.sentinelBody` and row 5 posts
// nothing. Run 1 trips the worktree surface only.

const SCENARIO_6: IdentifiedScenario = {
  id: "story-test-plan/file-only",
  skill: "story-test-plan",
  corpus: "synthetic — a Design present and a sentinel already posted verbatim; only the plan file remains",
  files: [
    { path: "docs/design/stories/1.md", contents: designBodyFor(1) },
    { path: "MARKER.md", contents: "scenario 6: file-only marker\n" },
  ],
  async seed(forge: FakeForge): Promise<void> {
    await forge.run([
      "gh",
      "issue",
      "create",
      ...REPO_FLAG,
      "--title",
      "Story: file-only",
      "--body",
      "seed body for scenario 6",
      "--label",
      "type:story",
    ]);
    await forge.run(["gh", "issue", "comment", "1", ...REPO_FLAG, "--body", testPlanSentinelBodyFor(1)]);
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

// ===========================================================================
// The roster
// ===========================================================================

/** Six scenarios, one `run()` apiece delegating to the matching `runXxx`
 *  transcription, FROZEN. There is no parameter that shrinks or reorders
 *  this array at runtime -- see this module's own header. */
export const SCENARIO_ROSTER: readonly Scenario[] = Object.freeze([
  SCENARIO_1,
  SCENARIO_2,
  SCENARIO_3,
  SCENARIO_4,
  SCENARIO_5,
  SCENARIO_6,
]);
