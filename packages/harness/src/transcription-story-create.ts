// A TRANSCRIPTION of skills/story-create/SKILL.md's re-entry contract, for
// #322's runner to exercise against the fixture repository and the fake
// forge -- never the skill itself.
//
// THIS IS A HUMAN READING THE SKILL.md, NOT THE MODEL EXECUTING IT. Every
// line below was authored ahead of time by a person (or a tool) working
// through skills/story-create/SKILL.md's Phase 0 and Re-entry table; the
// model that actually reads that markdown and decides what to do is never
// invoked anywhere in this module. Whether this transcription is FAITHFUL to
// the body it was copied from is CLAIM-293.11 -- model-judged, and #323's to
// rule on, not this module's and not this task's.
//
// No `node:fs`, no launcher, no `process.exit`, no `FixtureRepo`. Every git
// argv uses the `["git", "-C", ctx.root, ...]` form and every mutation goes
// through `ctx.port.run`, never `ctx.read`. `OWNER/REPO` is the literal repo
// slug fake-forge.ts and its own tests use.

import type { ScenarioContext } from "./runner";

export interface StoryCreateParams {
  readonly milestonePath: string;
  readonly milestoneTitle: string;
  readonly bindingPath: string;
  readonly featureRows: readonly string[];
}

export interface StoryCreateOutcome {
  readonly created: readonly string[];
  readonly orphans: readonly string[];
}

interface RawIssue {
  readonly number: number;
  readonly title: string;
  readonly milestone: { readonly title: string } | null;
}

function issueListArgv(): readonly string[] {
  return ["gh", "issue", "list", "--repo", "OWNER/REPO", "--json", "number,title,milestone"];
}

function parseIssues(stdout: string): readonly RawIssue[] {
  return JSON.parse(stdout) as readonly RawIssue[];
}

function bodyFor(row: string, milestoneTitle: string): string {
  return `Feature row: ${row}\n\nCut for milestone "${milestoneTitle}" by story-create.`;
}

export async function runStoryCreate(
  ctx: ScenarioContext,
  params: StoryCreateParams,
): Promise<StoryCreateOutcome> {
  // Read first: "Does the declared domain resolve to a binding?" (row 2).
  // Validated BEFORE anything is created, per skills/story-create/SKILL.md
  // :34-37 -- a Story labelled with a domain no later verb can resolve is a
  // Story that stalls the pipeline after it has already been created.
  const bindingRead = await ctx.read(2, ["git", "-C", ctx.root, "show", `HEAD:${params.bindingPath}`]);
  if (bindingRead.exitCode !== 0) {
    throw new Error(
      "HARD FAILURE in Phase 0 (story-create):\n" +
        `- Milestone: ${params.milestoneTitle}\n` +
        "- Expected: exactly one resolvable `domain:` label declared for the Story\n" +
        "- Found: none\n" +
        "- Action: Pipeline cannot continue. Declare the domain and re-run.",
    );
  }

  // Read first: "Does a Story already exist for this row?" (row 1). Fetched
  // HERE, ahead of row 4's orphan comparison below and ahead of every
  // create -- row 4's own constraint is only that it precedes row 1's
  // CREATES, never that it precedes row 1's READ, and this same issue list
  // is what row 4's orphan report compares against.
  const existingRead = await ctx.read(1, issueListArgv());
  const existingIssues = parseIssues(existingRead.stdout);
  const existingTitles = new Set(existingIssues.map((issue) => issue.title));

  // Read first: "Are there Stories with no row?" (row 4). Runs before row
  // 1's creates below, per skills/story-create/SKILL.md:73-85. REPORT ONLY.
  // Never create, edit or close -- the skill says "never"
  // (skills/story-create/SKILL.md:102), and a transcription that quietly
  // fixed an orphan would be a different skill than the one this transcribes.
  await ctx.read(4, ["git", "-C", ctx.root, "show", `HEAD:${params.milestonePath}`]);
  const featureRowSet = new Set(params.featureRows);
  const orphans = existingIssues.filter((issue) => !featureRowSet.has(issue.title)).map((issue) => issue.title);

  // Row 1's CREATES. Identity is the row's description text
  // (skills/story-create/SKILL.md:93), never a section number.
  const created: string[] = [];
  for (const row of params.featureRows) {
    if (existingTitles.has(row)) continue;
    await ctx.port.run([
      "gh",
      "issue",
      "create",
      "--repo",
      "OWNER/REPO",
      "--title",
      row,
      "--body",
      bodyFor(row, params.milestoneTitle),
      "--label",
      "type:story",
      "--label",
      "domain:dev",
      "--milestone",
      params.milestoneTitle,
    ]);
    created.push(row);
  }

  // Read first: "Is the existing Story assigned to this milestone?" (row 3).
  // Re-read AGAIN, never reused from row 1's read above -- the creates just
  // issued could have changed which issues exist, and a rate-limited read
  // here must never be mistaken for "no Stories exist"
  // (skills/story-create/SKILL.md:119-123).
  const reassignRead = await ctx.read(3, issueListArgv());
  const reassignIssues = parseIssues(reassignRead.stdout);
  for (const issue of reassignIssues) {
    if (issue.milestone === null) {
      await ctx.port.run([
        "gh",
        "issue",
        "edit",
        String(issue.number),
        "--repo",
        "OWNER/REPO",
        "--milestone",
        params.milestoneTitle,
      ]);
    }
  }

  return Object.freeze({ created: Object.freeze(created), orphans: Object.freeze(orphans) });
}
