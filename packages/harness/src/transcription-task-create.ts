// A TRANSCRIPTION of skills/task-create/SKILL.md's re-entry contract, for
// the runner to exercise against the fixture repository and the fake forge --
// never the skill itself.
//
// THIS IS A HUMAN READING THE SKILL.md, NOT THE MODEL EXECUTING IT. Every
// line below was authored ahead of time by working through
// skills/task-create/SKILL.md's Phase 0 and Re-entry table; the model that
// actually reads that markdown and decides what to do is never invoked
// anywhere in this module. Whether this transcription is FAITHFUL to the body
// it was copied from is CLAIM-293.11.
//
// THAT CLAIM IS NOT DISCHARGED HERE, AND DELIBERATELY SO. This module and
// skills/task-create/SKILL.md were written by the SAME task (#48), so a
// faithfulness verdict issued from here would be self-attestation -- exactly
// what #322 declined to do when it wrote four transcriptions and refused to
// rule on their faithfulness. The audit row for this skill is recorded
// UNAUDITED in docs/audits/293-transcription-audit.md and the independent
// audit is tracked by #344.
//
// No `node:fs`, no launcher, no `process.exit`, no `FixtureRepo`. Every git
// argv uses the `["git", "-C", ctx.root, ...]` form and every mutation goes
// through `ctx.port.run`, never `ctx.read`.

import { BLOCKED_BY_PREFIX, renderBlockedByLine } from "iai-core";

import type { ScenarioContext } from "./runner";

export interface TaskCreateParams {
  /** The Story issue number whose Design is being cut into tasks. */
  readonly story: number;
  /** Repo-relative path to that Story's Design. */
  readonly designPath: string;
  /** The `domain:` label the Story is expected to carry. */
  readonly domainLabel: string;
  /** The `Target` cell of each Build Targets row, in table order. */
  readonly targets: readonly string[];
  /** Target text -> the target texts it is blocked by, in checklist order.
   *  A target absent from this map has no dependencies and gets no line. */
  readonly dependsOn: Readonly<Record<string, readonly string[]>>;
}

interface RawIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly { readonly name: string }[];
}

const REPO = ["--repo", "OWNER/REPO"] as const;

function issueListArgv(): readonly string[] {
  return ["gh", "issue", "list", ...REPO, "--json", "number,title,body,labels"];
}

function parseIssues(stdout: string): readonly RawIssue[] {
  return JSON.parse(stdout) as readonly RawIssue[];
}

// The task title carries the target text verbatim, because that is this
// skill's IDENTITY KEY: skills/task-create/SKILL.md's Re-entry section says
// to match an existing task to its row "by the row's target text, not by
// position", precisely so a row inserted mid-table does not shift every task
// after it and cause a re-run to open duplicates.
function titleFor(story: number, target: string): string {
  return `S${String(story)} — ${target}`;
}

export async function runTaskCreate(ctx: ScenarioContext, params: TaskCreateParams): Promise<void> {
  // Read first, row 1: "Does docs/design/stories/{n}.md exist, and does its
  // `## Build Targets` table parse?" This is the hard-failure gate and is
  // checked before anything else, because a Story with no readable table has
  // no units of work and must mutate nothing at all.
  const designRead = await ctx.read(1, ["git", "-C", ctx.root, "show", `HEAD:${params.designPath}`]);
  if (designRead.exitCode !== 0 || !designRead.stdout.includes("## Build Targets")) {
    throw new Error(
      "HARD FAILURE in Phase 0 (task-create):\n" +
        `- Story: #${String(params.story)}\n` +
        "- Expected: a Design on disk whose `## Build Targets` table parses\n" +
        "- Found: none\n" +
        "- Action: Pipeline cannot continue. Write the Design and re-run.",
    );
  }

  // Read first, row 2: "Does the Story already carry a `domain:` label?"
  // Read from the forge, not assumed from params: the label is the thing
  // every task inherits, and inventing it here is the failure the body's
  // hard-failure block exists to prevent.
  //
  // `gh issue list` rather than `gh issue view`, because this fake's `view`
  // response carries no `labels` field (fake-forge.ts's handleIssue) while
  // its `list` response does. A transcription that called `view` would be
  // reading a field the double never returns and would fail closed on every
  // run, which is indistinguishable from the label genuinely being absent.
  const labelRead = await ctx.read(2, issueListArgv());
  const storyIssue = parseIssues(labelRead.stdout).find((i) => i.number === params.story);
  const hasDomain = storyIssue?.labels.some((l) => l.name === params.domainLabel) ?? false;
  if (!hasDomain) {
    throw new Error(
      "HARD FAILURE in Phase 0 (task-create):\n" +
        `- Story: #${String(params.story)}\n` +
        "- Expected: exactly one `domain:` label, to copy onto every task\n" +
        "- Found: none\n" +
        "- Action: Pipeline cannot continue. Label the Story and re-run.",
    );
  }

  // Read first, row 3: "Which sub-issues does the Story already have, and
  // which row does each cover?" Re-read rather than reusing row 2's response:
  // they are separate decisions in the table, and a transcription that
  // collapsed them would report one read where the body requires two.
  //
  // MATCHED BY TITLE TEXT, NEVER BY POSITION -- see titleFor above. This is
  // the read every create below keys on, and it is why a second run creates
  // nothing.
  const existingRead = await ctx.read(3, issueListArgv());
  const existingTitles = new Set(parseIssues(existingRead.stdout).map((i) => i.title));

  const opened: string[] = [];
  for (const target of params.targets) {
    const title = titleFor(params.story, target);
    if (existingTitles.has(title)) continue;
    await ctx.port.run([
      "gh",
      "issue",
      "create",
      ...REPO,
      "--title",
      title,
      "--label",
      "type:task",
      // The PARENT'S label, read above and copied. This transcription never
      // chooses a domain.
      "--label",
      params.domainLabel,
      "--body",
      `Parent: #${String(params.story)}`,
    ]);
    opened.push(title);
  }

  // Read first, row 4: "Does the Story body already carry a `## Tasks`
  // section?" The body is read and the checklist MERGED into it. The whole
  // point of the read is that the rest of the body survives: real Story
  // bodies carry load-bearing prose inside that section, and a whole-body
  // write deletes it. That defect shipped once already and is what #315 fixed.
  const bodyRead = await ctx.read(4, ["gh", "issue", "view", String(params.story), ...REPO, "--json", "body"]);
  const storyBody = (JSON.parse(bodyRead.stdout) as { body: string }).body;
  if (!storyBody.includes("## Tasks")) {
    await ctx.port.run([
      "gh",
      "issue",
      "edit",
      String(params.story),
      ...REPO,
      "--body",
      // Appended, never substituted: the existing body is carried through
      // verbatim ahead of the new section.
      `${storyBody}\n\n## Tasks\n\n${params.targets.map((t) => `- [ ] ${titleFor(params.story, t)}`).join("\n")}\n`,
    ]);
  }

  // Read first, row 5: "Does each opened task already carry its `Blocked by:`
  // line?" Only the tasks this run opened are candidates; one already present
  // is left exactly as it is, because its line may have been edited by hand
  // and the body's Re-entry section says to leave existing state alone.
  const tasksRead = await ctx.read(5, issueListArgv());
  const tasks = parseIssues(tasksRead.stdout);
  const numberByTitle = new Map(tasks.map((i) => [i.title, i.number] as const));

  // Walked in TARGET order, not in `opened` order, so the dependency line is
  // emitted in checklist order exactly as CLAIM-47.2 requires -- the same
  // reason sub-issues.ts refuses to sort a checklist.
  for (const target of params.targets) {
    const blockers = params.dependsOn[target];
    if (blockers === undefined || blockers.length === 0) continue;

    const task = tasks.find((i) => i.title === titleFor(params.story, target));
    // Already carries its line: leave it exactly as it is. It may have been
    // edited by hand, and the body's Re-entry section says to leave existing
    // state alone rather than rewrite it to the computed value.
    if (task === undefined || task.body.includes(BLOCKED_BY_PREFIX)) continue;

    const numbers: number[] = [];
    for (const blocker of blockers) {
      const n = numberByTitle.get(titleFor(params.story, blocker));
      // A blocker with no issue means the read above is incomplete. Skip
      // rather than invent a number: a wrong dependency line is worse than a
      // missing one, because the next run sees a line present and leaves it.
      if (n !== undefined) numbers.push(n);
    }
    if (numbers.length === 0) continue;

    await ctx.port.run([
      "gh",
      "issue",
      "edit",
      String(task.number),
      ...REPO,
      "--body",
      // ONE comma-joined line, from the shared renderer in
      // packages/core/src/gh/blocked-by.ts. The form is not restated here.
      `${task.body}\n\n${renderBlockedByLine(numbers)}`,
    ]);
  }
}
