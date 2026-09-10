// A TRANSCRIPTION of skills/story-test-plan/SKILL.md's re-entry contract,
// for #322's runner to exercise against the fixture repository and the fake
// forge -- never the skill itself.
//
// THIS IS A HUMAN READING THE SKILL.md, NOT THE MODEL EXECUTING IT. Every
// line below was authored ahead of time by a person (or a tool) working
// through skills/story-test-plan/SKILL.md's Phase 0 and Re-entry table; the
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

export interface StoryTestPlanParams {
  readonly issue: number;
  readonly designPath: string;
  readonly planPath: string;
  readonly planBody: string;
  readonly sentinelBody: string;
}

export interface StoryTestPlanOutcome {
  readonly uncoveredClaims: readonly string[];
  readonly danglingCases: readonly string[];
}

interface RawIssueView {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly comments: readonly { readonly id: number; readonly body: string }[];
}

const CLAIM_RE = /CLAIM-\d+\.\d+/g;

/** A DELIBERATELY SIMPLE proxy for "every claim in the `anchors_to` column",
 *  never a full markdown-table parser. `claim-lint` (scripts/claim-lint.ts)
 *  is the authoritative parser of that grammar; this transcription only
 *  needs enough to decide whether a claim identifier is PRESENT in a body of
 *  text, and scanning for the identifier grammar directly is sufficient for
 *  that and honest about not being more than that. */
function claimIds(text: string): ReadonlySet<string> {
  return new Set(text.match(CLAIM_RE) ?? []);
}

function firstLine(body: string): string {
  return body.split("\n")[0] ?? "";
}

export async function runStoryTestPlan(
  ctx: ScenarioContext,
  params: StoryTestPlanParams,
): Promise<StoryTestPlanOutcome> {
  // Read first: "Does the plan file exist?" (row 1).
  const existsRead = await ctx.read(1, ["git", "-C", ctx.root, "cat-file", "-e", `HEAD:${params.planPath}`]);
  const planAbsent = existsRead.exitCode !== 0;

  // Read first: "Which claims have no case?" (row 2). The Design is the
  // ONLY source of claims (skills/story-test-plan/SKILL.md:29-31) -- this
  // transcription never invents one to plan against.
  const designRead = await ctx.read(2, ["git", "-C", ctx.root, "show", `HEAD:${params.designPath}`]);
  const designClaims = claimIds(designRead.exitCode === 0 ? designRead.stdout : "");
  const planBodyClaims = claimIds(params.planBody);
  const uncoveredClaims = [...designClaims].filter((claim) => !planBodyClaims.has(claim)).sort();

  // Read first: "Which cases anchor to a claim that is gone?" (row 3). Read
  // BEFORE the write below, on purpose: on the first run, before the plan
  // file exists, `git show HEAD:{planPath}` exits non-zero -- that is
  // EXPECTED and is still a recorded read, never a reason to skip it. Report
  // into `danglingCases`; never silently delete a case
  // (skills/story-test-plan/SKILL.md:105).
  const planBeforeWriteRead = await ctx.read(3, ["git", "-C", ctx.root, "show", `HEAD:${params.planPath}`]);
  const onDiskCaseAnchors = claimIds(planBeforeWriteRead.exitCode === 0 ? planBeforeWriteRead.stdout : "");
  const danglingCases = [...onDiskCaseAnchors].filter((claim) => !designClaims.has(claim)).sort();

  // Read first: "Does every case already declare a `Corpus`?" (row 4). Same
  // pre-write state as row 3 above -- reading it again, under its own row
  // number, is what makes the annotation honest: the runner's read-count
  // threshold is `countReads(report.calls)` (argv-kind.ts:72-77), computed
  // from calls actually issued, never from a declared row alone. Purely
  // observational: this transcription does not implement "add the column"
  // as a second mutation path, since `docs/test-plans/{n}-plan.md`'s
  // authoritative shape is always written whole, once, by row 1's create.
  const planBeforeWriteRead2 = await ctx.read(4, ["git", "-C", ctx.root, "show", `HEAD:${params.planPath}`]);
  void ((planBeforeWriteRead2.exitCode === 0 ? planBeforeWriteRead2.stdout : "").includes("Corpus"));

  // Row 1's mutation, decided by row 1's read above.
  if (planAbsent) {
    ctx.writeFile(params.planPath, params.planBody);
    await ctx.port.run(["git", "-C", ctx.root, "add", "-A"]);
    await ctx.port.run(["git", "-C", ctx.root, "commit", "-q", "-m", `#${String(params.issue)}: the test plan`]);
  }
  // IF PRESENT, WRITE NOTHING -- the same reason story-design's row 1
  // rewrites nothing: an identical-bytes rewrite is itself a recorded
  // mutation (#321, case 10 of docs/test-plans/293-plan.md), so a
  // re-entrant skill must not rewrite a file it has already written.

  // Read first: "Is a test-plan sentinel already posted?" (row 5). Edit in
  // place, never append a second (skills/story-test-plan/SKILL.md:107,
  // :87-88) -- unlike story-design's row 2, this row's own table cell asks
  // for both halves, so both are implemented: post when absent, PATCH the
  // existing comment in place when present.
  const viewRead = await ctx.read(5, ["gh", "issue", "view", String(params.issue), "--repo", "OWNER/REPO", "--json", "comments"]);
  const view = JSON.parse(viewRead.stdout) as RawIssueView;
  const sentinelLine = firstLine(params.sentinelBody);
  const existingSentinel = view.comments.find((c) => c.body.startsWith(sentinelLine));
  if (existingSentinel === undefined) {
    await ctx.port.run(["gh", "issue", "comment", String(params.issue), "--repo", "OWNER/REPO", "--body", params.sentinelBody]);
  } else if (existingSentinel.body !== params.sentinelBody) {
    // PRESENT AND CURRENT IS "NOTHING TO DO", NOT "EDIT ANYWAY".
    //
    // The cell says "edit that comment, never append a second", and the
    // disjunction it is guarding against is APPEND. Editing a sentinel that
    // already carries the exact bytes is the same defect one surface over:
    // skills/goal-create/SKILL.md:92-93 states the rule for the whole family
    // -- a second run issues "not a create that fails, not an update that
    // rewrites the same bytes". Without this guard every second run posts a
    // PATCH and the zero-mutation property is false for a reason that has
    // nothing to do with the skill.
    await ctx.port.run([
      "gh",
      "api",
      "--method",
      "PATCH",
      `repos/OWNER/REPO/issues/comments/${String(existingSentinel.id)}`,
      "-f",
      `body=${params.sentinelBody}`,
    ]);
  }

  return Object.freeze({
    uncoveredClaims: Object.freeze(uncoveredClaims),
    danglingCases: Object.freeze(danglingCases),
  });
}
