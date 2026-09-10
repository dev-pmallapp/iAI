// A TRANSCRIPTION of skills/story-design/SKILL.md's re-entry contract, for
// #322's runner to exercise against the fixture repository and the fake
// forge -- never the skill itself.
//
// THIS IS A HUMAN READING THE SKILL.md, NOT THE MODEL EXECUTING IT. Every
// line below was authored ahead of time by a person (or a tool) working
// through skills/story-design/SKILL.md's Phase 0 and Re-entry table; the
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

export interface StoryDesignParams {
  readonly issue: number;
  readonly designPath: string;
  readonly designBody: string;
  readonly sentinelBody: string;
}

interface RawIssueView {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly comments: readonly { readonly id: number; readonly body: string }[];
}

function issueViewArgv(issue: number): readonly string[] {
  return ["gh", "issue", "view", String(issue), "--repo", "OWNER/REPO", "--json", "comments"];
}

function firstLine(body: string): string {
  return body.split("\n")[0] ?? "";
}

export async function runStoryDesign(ctx: ScenarioContext, params: StoryDesignParams): Promise<void> {
  // Read first: "Does `docs/design/stories/{n}.md` exist?" (row 1).
  const existsRead = await ctx.read(1, ["git", "-C", ctx.root, "cat-file", "-e", `HEAD:${params.designPath}`]);
  if (existsRead.exitCode !== 0) {
    ctx.writeFile(params.designPath, params.designBody);
    await ctx.port.run(["git", "-C", ctx.root, "add", "-A"]);
    await ctx.port.run(["git", "-C", ctx.root, "commit", "-q", "-m", `#${String(params.issue)}: the Design`]);
  }
  // IF IT EXISTS, WRITE NOTHING. An identical-bytes rewrite is itself a
  // recorded mutation (#321, case 10 of docs/test-plans/293-plan.md) --
  // `MutationRecorder.writeFile` pushes a `RecordedWrite` unconditionally,
  // identical bytes included -- so a re-entrant skill must not rewrite a
  // file it has already written. That is what makes "the Design file on disk
  // ... is either absent, or present and current" (skills/story-design/
  // SKILL.md:89-90) an ACT of leaving it alone, never a rewrite that happens
  // to produce the same bytes.

  // Read first: "Does the pinned commit resolve on the remote?" (row 3).
  // Read AFTER the write above, never before -- the sha that resolves is the
  // one the write (if any) just produced, and that sha is what the permalink
  // in `params.sentinelBody` pins.
  const headRead = await ctx.read(3, ["git", "-C", ctx.root, "rev-parse", "HEAD"]);
  const pinnedSha = headRead.stdout.trim();
  void pinnedSha; // captured for the read's own sake; the permalink text itself is `params.sentinelBody`'s, supplied ready-made by the caller.

  // Read first: "Do the registered claims already exist?" (row 4). Purely
  // observational here: claims live as checklist text INSIDE the Design file
  // itself, not as a separate forge object, so there is no second mutation
  // to "register" one beyond the write (or non-write) already decided by row
  // 1 above. "leave the existing identifiers alone" (skills/story-design/
  // SKILL.md:98) is satisfied by construction: this transcription never
  // rewrites a Design that already exists.
  await ctx.read(4, ["git", "-C", ctx.root, "show", `HEAD:${params.designPath}`]);

  // Read first: "Does the Story already carry a design sentinel?" (row 2).
  const viewRead = await ctx.read(2, issueViewArgv(params.issue));
  const view = JSON.parse(viewRead.stdout) as RawIssueView;
  const sentinelLine = firstLine(params.sentinelBody);
  const existingSentinel = view.comments.find((c) => c.body.startsWith(sentinelLine));
  if (existingSentinel === undefined) {
    // ONE SENTINEL, ONE COMMENT -- the comment count must not grow on
    // re-run, and the fake DELIBERATELY will not stop a second one
    // (fake-forge.ts:511-514 accepts an unlimited number of `gh issue
    // comment` calls against the same issue): it is this read, and never the
    // fake, that must hold the line.
    //
    await ctx.port.run(["gh", "issue", "comment", String(params.issue), "--repo", "OWNER/REPO", "--body", params.sentinelBody]);
  } else if (existingSentinel.body !== params.sentinelBody) {
    // The second half of the cell's disjunction: "post one, or edit that
    // comment IN PLACE". Amending by comment id is the only shape that
    // cannot append -- packages/core/src/gh/comments.ts records why there is
    // no porcelain edit-by-id.
    //
    // PRESENT AND CURRENT IS "NOTHING TO DO". A re-run that PATCHed an
    // already-correct sentinel would be "an update that rewrites the same
    // bytes", which skills/goal-create/SKILL.md:92-93 names as a mutation a
    // second run must not make.
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
}
