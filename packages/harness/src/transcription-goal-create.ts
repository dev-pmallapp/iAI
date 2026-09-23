// A TRANSCRIPTION of skills/goal-create/SKILL.md's re-entry contract, for
// #322's runner to exercise against the fixture repository and the fake
// forge -- never the skill itself.
//
// THIS IS A HUMAN READING THE SKILL.md, NOT THE MODEL EXECUTING IT. Every
// line below was authored ahead of time by a person (or a tool) working
// through skills/goal-create/SKILL.md's Phase 0 and Re-entry table; the
// model that actually reads that markdown and decides what to do is never
// invoked anywhere in this module, and never will be -- runner.ts's own
// `NOT_VERIFIED` block says so for the whole harness. Whether this
// transcription is FAITHFUL to the body it was copied from is CLAIM-293.11.
// That claim is model-judged, and ruling on it is #323's job, not this
// module's and not this task's. A green run through this file proves the
// transcription is idempotent against one fixture and one fake forge; it
// proves nothing about whether skills/goal-create/SKILL.md's own prose was
// read correctly.
//
// No `node:fs`, no launcher, no `process.exit`, no `FixtureRepo`. Every git
// argv uses the `["git", "-C", ctx.root, ...]` form and every mutation goes
// through `ctx.port.run`, never `ctx.read`. `OWNER/REPO` is the literal repo
// slug fake-forge.ts and its own tests use.

import type { ScenarioContext } from "./runner";

export interface GoalCreateParams {
  readonly goalsPath: string;
  readonly goalId: string;
  readonly milestoneTitle: string;
  readonly featureTable: string;
}

interface RawMilestone {
  readonly number: number;
  readonly title: string;
  readonly description: string;
}

function milestonesListArgv(): readonly string[] {
  return ["gh", "api", "--paginate", "repos/OWNER/REPO/milestones?state=all&per_page=100"];
}

function parseMilestones(stdout: string): readonly RawMilestone[] {
  return JSON.parse(stdout) as readonly RawMilestone[];
}

export async function runGoalCreate(ctx: ScenarioContext, params: GoalCreateParams): Promise<void> {
  // Read first: "Did the goal resolve at all?" (skills/goal-create/SKILL.md's
  // Re-entry table, row 3). Checked FIRST in this transcription even though
  // it is the table's third row, because it is the hard-failure gate: a goal
  // that does not resolve must mutate nothing, and every row above it in the
  // table is a create-or-leave decision that only makes sense once the goal
  // is known to exist.
  const goalsRead = await ctx.read(3, ["git", "-C", ctx.root, "show", `HEAD:${params.goalsPath}`]);
  if (goalsRead.exitCode !== 0 || !goalsRead.stdout.includes(params.goalId)) {
    throw new Error(
      "HARD FAILURE in Phase 0 (goal-create):\n" +
        `- Goal: ${params.goalId}\n` +
        "- Expected: a readable goals source containing that identifier\n" +
        "- Found: none\n" +
        "- Action: Pipeline cannot continue. Supply the goals source and re-run.",
    );
  }

  // Read first: "Does a milestone with this title exist?" (row 1). Identity
  // is the milestone TITLE, per skills/goal-create/SKILL.md:79 -- that is
  // what a second run matches on, and it is why a second run against the
  // same goal creates nothing here.
  const listRead1 = await ctx.read(1, milestonesListArgv());
  const milestones1 = parseMilestones(listRead1.stdout);
  const existing1 = milestones1.find((m) => m.title === params.milestoneTitle);
  if (existing1 === undefined) {
    await ctx.port.run([
      "gh",
      "api",
      "--method",
      "POST",
      "repos/OWNER/REPO/milestones",
      "-f",
      `title=${params.milestoneTitle}`,
      "-f",
      `description=${params.featureTable}`,
    ]);
  }

  // Read first: "Does its description already carry the feature table?"
  // (row 2). Re-read the list -- never trust the create above to have
  // landed, because a rate-limited read of this same list is exactly the
  // failure mode skills/goal-create/SKILL.md:107-110 names as the one that
  // must never be read as "no such milestone".
  const listRead2 = await ctx.read(2, milestonesListArgv());
  const milestones2 = parseMilestones(listRead2.stdout);
  const existing2 = milestones2.find((m) => m.title === params.milestoneTitle);
  if (existing2 !== undefined && !existing2.description.includes(params.featureTable)) {
    // NOT ONE OF THE ARGV SHAPES fake-forge.ts's `handleApi` MODELS. Its
    // `gh api` handler answers exactly three shapes: the `GET .../milestones`
    // list, the `POST .../milestones` create, and the `PATCH
    // .../issues/comments/{id}` comment edit -- there is no modelled
    // `PATCH .../milestones/{number}`. This is the real, correct `gh`
    // invocation for updating an existing milestone (there is no `gh
    // milestone` subcommand at all), so it is what a faithful transcription
    // of "amend the rows that differ" issues -- but against THIS fake it
    // lands on `handleApi`'s final `return unmodelled(argv)`, exit
    // `FAKE_UNMODELLED_EXIT_CODE` (125), never a real update. The attempt is
    // still recorded as a forge mutation (`isMutatingGhArgv` classifies on
    // `--method PATCH` alone, not on the path), so a scenario built around
    // this branch will see run 1 mutate -- just not actually change the
    // description in the fake's memory. Reported as the one row this
    // transcription could not honestly exercise end-to-end against this
    // fake's modelled surface, rather than inventing a call the fake does
    // answer in its place.
    await ctx.port.run([
      "gh",
      "api",
      "--method",
      "PATCH",
      `repos/OWNER/REPO/milestones/${String(existing2.number)}`,
      "-f",
      `description=${params.featureTable}`,
    ]);
  }
}
