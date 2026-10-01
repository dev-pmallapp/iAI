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

import {
  BLOCKED_BY_PREFIX,
  BuildTargetsParseError,
  issueNodeId,
  parseBuildTargets,
  renderBlockedByLine,
  subIssueCapabilityProbe,
  subIssueLink,
  withParentLine,
  withTasksChecklist,
  type ChecklistItem,
  type GhRepo,
  type SubIssueCapability,
} from "iai-core";

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

// The same repo, structured -- `subIssueCapabilityProbe`, `issueNodeId` and
// `subIssueLink` (packages/core/src/gh/sub-issues.ts) take a `GhRepo`, not
// the `--repo owner/name` flag pair every other call in this file builds by
// hand. One literal, so the two forms cannot drift apart.
const GH_REPO: GhRepo = { owner: "OWNER", name: "REPO" };

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

// `subIssueCapabilityProbe`, `issueNodeId`, `subIssueLink` and
// `withParentLine` all return a `GhResult<T>` -- `ghFail` only for a
// malformed CALLER input (a non-positive issue number, an invalid node id),
// never for anything the forge could answer. Every value this module ever
// hands them is read off `params` or off a `gh issue create` /
// `issueNodeId` response, so a failure here names a bug in this
// transcription, not a re-entry case to recover from.
function unwrapResult<T>(result: { readonly ok: boolean; readonly value?: T; readonly reason?: string }): T {
  if (!result.ok) {
    throw new Error(`task-create: ${result.reason ?? "sub-issue construction failed"}`);
  }
  return result.value as T;
}

const CREATE_URL_ISSUE_RE = /\/issues\/(\d+)$/;

// `gh issue create`'s stdout is the issue's HTML URL
// (fake-forge.ts's `handleIssue`'s `create` branch), ending in `/issues/{n}`
// the same way a real `gh issue create` does.
function issueNumberFromCreateStdout(stdout: string): number {
  const match = CREATE_URL_ISSUE_RE.exec(stdout.trim());
  if (match === null) {
    throw new Error(`task-create: could not read the created issue's number from: ${stdout}`);
  }
  return Number(match[1]);
}

interface SubIssueProbeResponse {
  readonly data?: {
    readonly repository?: {
      readonly issue?: {
        readonly subIssues?: unknown;
      };
    };
  };
}

// THE VERDICT, read off exactly what fake-forge.ts's graphql branch (and a
// real GitHub instance, per sub-issues.ts's header) answers: a `subIssues`
// field that is present (an object, even an empty-count one) means the API
// is available; a `null` field, a request that failed outright, or a body
// this probe cannot parse all mean "absent" -- the conservative verdict,
// because answering "present" on anything less than a genuine, parseable
// success is how a false positive would send a `subIssueLink` mutation this
// instance cannot actually honour.
function readSubIssueCapability(result: { readonly exitCode: number; readonly stdout: string }): SubIssueCapability {
  if (result.exitCode !== 0) return "absent";
  let parsed: SubIssueProbeResponse;
  try {
    parsed = JSON.parse(result.stdout) as SubIssueProbeResponse;
  } catch {
    return "absent";
  }
  return parsed.data?.repository?.issue?.subIssues != null ? "present" : "absent";
}

export async function runTaskCreate(ctx: ScenarioContext, params: TaskCreateParams): Promise<void> {
  // Read first, row 1: "Does docs/design/stories/{n}.md exist, and does its
  // `## Build Targets` table parse?" This is the hard-failure gate and is
  // checked before anything else, because a Story with no readable table has
  // no units of work and must mutate nothing at all.
  //
  // THE GATE IS THE PARSER'S VERDICT, NOT A SUBSTRING CHECK ON THE HEADING.
  // `designRead.stdout.includes("## Build Targets")` passes for a Design that
  // merely MENTIONS the literal heading text in prose -- docs/design/stories/
  // 47.md does exactly that at lines 70 and 466, and test/build-targets.test.ts
  // :140-147 names the hazard directly. `parseBuildTargets`
  // (packages/core/src/guards/build-targets.ts:72) asserts the real structure
  // -- heading present, separator present, a `Target` column found BY NAME,
  // every row the header's width -- and "refuses a table it cannot read rather
  // than guessing" per skills/task-create/SKILL.md's Phase 0 item 4. A design
  // whose table is unreadable is exactly as hard-failing as one with no
  // heading at all, so both collapse into the same gate below.
  const designRead = await ctx.read(1, ["git", "-C", ctx.root, "show", `HEAD:${params.designPath}`]);
  let buildTargetsReason: string | undefined;
  if (designRead.exitCode !== 0) {
    buildTargetsReason = "no Design on disk at that path";
  } else {
    try {
      parseBuildTargets(designRead.stdout);
    } catch (error) {
      buildTargetsReason = error instanceof BuildTargetsParseError ? error.message : String(error);
    }
  }
  if (buildTargetsReason !== undefined) {
    throw new Error(
      "HARD FAILURE in Phase 0 (task-create):\n" +
        `- Story: #${String(params.story)}\n` +
        "- Expected: a Design on disk whose `## Build Targets` table parses\n" +
        `- Found: ${buildTargetsReason}\n` +
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

  // Read first, row 3: "Is the sub-issue API available on this instance?"
  // Probed with `subIssueCapabilityProbe` (packages/core/src/gh/sub-issues.ts)
  // -- the argv is built there and never hand-rolled here, because that
  // constructor is what keeps `SUB_ISSUE_FEATURE_HEADER` attached on every
  // call. A probe sent without that header answers "absent" even on an
  // instance where the API is present (sub-issues.ts:15-27 calls a missed or
  // mis-headered probe "the most dangerous failure this module can have"),
  // and that is a silent, permanent mis-route this transcription cannot
  // afford to reintroduce by restating the argv by hand.
  //
  // THE CHOICE IS MADE HERE, BEFORE THE CREATE LOOP, because the create
  // loop's own argv depends on it: the fallback path's body carries a
  // `Parent: #N` line the present path never writes, so the decision has to
  // exist before the first `gh issue create` is built, not after.
  const probeArgv = unwrapResult<readonly string[]>(subIssueCapabilityProbe(GH_REPO, params.story));
  const probeRead = await ctx.read(3, probeArgv);
  const capability = readSubIssueCapability(probeRead);

  // Read first, row 4: "Which sub-issues does the Story already have, and
  // which row does each cover?" Re-read rather than reusing row 2's response:
  // they are separate decisions in the table, and a transcription that
  // collapsed them would report one read where the body requires two.
  //
  // MATCHED BY TITLE TEXT, NEVER BY POSITION -- see titleFor above. This is
  // the read every create below keys on, and it is why a second run creates
  // nothing.
  const existingRead = await ctx.read(4, issueListArgv());
  const existingTitles = new Set(parseIssues(existingRead.stdout).map((i) => i.title));

  // Resolved lazily and at most once: the Story's own node id is needed only
  // on the capability-present path, and only once some target actually needs
  // linking. A re-run where every target already exists never touches it,
  // which is what keeps that run free of this extra read too.
  let parentNodeId: string | undefined;

  const opened: string[] = [];
  for (const target of params.targets) {
    const title = titleFor(params.story, target);
    if (existingTitles.has(title)) continue;

    if (capability === "present") {
      // THE REAL SUB-ISSUE LINK, not the body fallback. No `Parent:` line is
      // written: the parent is the GraphQL relation itself, and writing the
      // line here too would leave two parentage records free to disagree.
      const created = await ctx.port.run([
        "gh",
        "issue",
        "create",
        ...REPO,
        "--title",
        title,
        "--label",
        "type:task",
        // The PARENT'S label, read above and copied. This transcription
        // never chooses a domain.
        "--label",
        params.domainLabel,
      ]);
      const childNumber = issueNumberFromCreateStdout(created.stdout);

      if (parentNodeId === undefined) {
        const parentNodeIdRead = await ctx.port.run(
          unwrapResult<readonly string[]>(issueNodeId(GH_REPO, params.story)),
        );
        parentNodeId = parentNodeIdRead.stdout.trim();
      }
      const childNodeIdRead = await ctx.port.run(unwrapResult<readonly string[]>(issueNodeId(GH_REPO, childNumber)));
      const childNodeId = childNodeIdRead.stdout.trim();

      await ctx.port.run(unwrapResult<readonly string[]>(subIssueLink(parentNodeId, childNodeId)));
    } else {
      // THE FALLBACK. `withParentLine` (sub-issues.ts) owns the line's exact
      // form and its own idempotence guard against a body that already
      // declares a (different) parent; this transcription supplies only the
      // body a brand-new task starts with -- empty -- and the parent number.
      const fallbackBody = unwrapResult<string>(withParentLine("", params.story));
      await ctx.port.run([
        "gh",
        "issue",
        "create",
        ...REPO,
        "--title",
        title,
        "--label",
        "type:task",
        "--label",
        params.domainLabel,
        "--body",
        fallbackBody,
      ]);
    }
    opened.push(title);
  }

  // Read first, row 5: "Does the Story body already carry a `## Tasks`
  // section?" The body is read here, at row 5, exactly as the table requires
  // -- but the DECISION the read feeds is made further down, after row 6,
  // once every target's issue number is known (see the comment there for
  // why). Reading row 5 here and acting on it there is still "read first,
  // then decide": the read's position in the call sequence is what row 5
  // pins, not the line number of the code that consumes it.
  const bodyRead = await ctx.read(5, ["gh", "issue", "view", String(params.story), ...REPO, "--json", "body"]);
  const storyBody = (JSON.parse(bodyRead.stdout) as { body: string }).body;

  // Read first, row 6: "Does each opened task already carry its `Blocked by:`
  // line?" Only the tasks this run opened are candidates; one already present
  // is left exactly as it is, because its line may have been edited by hand
  // and the body's Re-entry section says to leave existing state alone.
  const tasksRead = await ctx.read(6, issueListArgv());
  const tasks = parseIssues(tasksRead.stdout);
  const numberByTitle = new Map(tasks.map((i) => [i.title, i.number] as const));

  // THE CHECKLIST IS MERGED, NEVER SKIPPED. row 5's read decided only whether
  // `## Tasks` was ALREADY present -- not whether to write. The prior
  // transcription stopped there and wrote nothing at all once the section
  // existed, which is a SKIP wearing a comment that claimed "MERGED". That
  // contradicted this very skill's Re-entry row 5 ("merge into it, or add
  // one -- never replace the body") on the exact case the row names: "after a
  // gate ruling adds a row to the Design's table", the new row's task issue
  // opens (row 4's title match above), but its checklist entry never reached
  // the body, on every subsequent run, forever.
  //
  // `withTasksChecklist` (packages/core/src/gh/sub-issues.ts:256) is the real
  // merger skills/task-create/SKILL.md:90-92 names: it rewrites only the
  // leading run of entry lines, so prose inside `## Tasks` survives; it
  // inherits a tick already on an entry rather than clearing it; and it
  // refuses outright a body carrying two `## Tasks` sections rather than
  // picking one and silently discarding the other's meaning. Both the
  // section-absent and the section-present cases go through it below -- there
  // is no second, hand-rolled append path left in this function.
  //
  // Checklist items cover EVERY target, not only the ones `opened` above:
  // a target whose task already existed before this run still belongs in the
  // checklist, and omitting it is how a re-run would make the checklist
  // regress on its own prior output.
  const checklistItems: ChecklistItem[] = [];
  for (const target of params.targets) {
    const title = titleFor(params.story, target);
    const issue = numberByTitle.get(title);
    // row 6's read is the same `gh issue list` that must enumerate every task
    // this function has ever opened (this run's creates included, since the
    // create loop above runs strictly before this read). A target with no
    // match means that read is incomplete -- skip it rather than fabricate an
    // issue number, the same posture the `Blocked by:` loop below takes for a
    // missing blocker.
    if (issue === undefined) continue;
    checklistItems.push({ issue, title });
  }

  const merged = withTasksChecklist(storyBody, checklistItems);
  if (!merged.ok) {
    // Refused, never guessed: a body with two `## Tasks` sections (or one
    // whose entries are split by interleaved prose) has no single correct
    // merge target, and `sub-issues.ts` names exactly that rather than
    // picking a section to overwrite. That is a hard failure on the same
    // footing as an unreadable Design -- a human has to resolve the body
    // before this skill can continue.
    throw new Error(
      "HARD FAILURE in task-create (## Tasks merge):\n" +
        `- Story: #${String(params.story)}\n` +
        "- Expected: a Story body `withTasksChecklist` can merge a checklist into\n" +
        `- Found: ${merged.reason}\n` +
        "- Action: Pipeline cannot continue. Resolve the Story body by hand and re-run.",
    );
  }

  // THE IDEMPOTENCE GUARANTEE: a merge that reproduces the body it read is a
  // no-op, and a no-op must not become a `gh issue edit` call. Run 2 of every
  // scenario in `scenario-roster.ts` asserts zero mutations; an unconditional
  // write here -- even one that writes back byte-identical content -- would
  // turn that assertion red on every re-entrant run, which is the harness's
  // core invariant per this module's own header.
  if (merged.value !== storyBody) {
    await ctx.port.run([
      "gh",
      "issue",
      "edit",
      String(params.story),
      ...REPO,
      "--body",
      merged.value,
    ]);
  }

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
