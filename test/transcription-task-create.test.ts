import { describe, expect, test } from "bun:test";
import { BLOCKED_BY_PREFIX } from "../packages/core/src/index";
import { runTaskCreate } from "../packages/harness/src/transcription-task-create";
import type { ScenarioContext } from "../packages/harness/src/runner";

// ===========================================================================
// THE TRANSCRIPTION'S OWN GATES, EXERCISED DIRECTLY.
//
// WHY THIS FILE EXISTS, AND IT IS NOT "more coverage". #48's mutation round
// ran eleven mutations and four survived. Two of them were here:
//
//   M8  — the `domain:` label read stops gating, `hasDomain = true`.
//   M11 — the Story body is REPLACED instead of merged.
//
// Both survived the full suite AND a green `bun run skill-harness`, because
// the roster scenario always supplies the label and never asserts that the
// seeded body survives. The harness proves the transcription is IDEMPOTENT;
// it does not prove the transcription is CORRECT, and those are different
// claims.
//
// M11 is the one worth reading twice. It reproduces, inside this
// transcription, the exact defect #315 existed to fix: building a `## Tasks`
// section and sending it as the WHOLE body, destroying everything else.
// Against the roster's fixture the body is one throwaway seed line, so
// nothing observable changed — the same reason the original defect shipped,
// one level down, in the fix's own lineage.
//
// A fake context rather than the harness: these are unit facts about one
// function's branches, and routing them through a fixture repository and a
// fake forge would make them slower without making them stronger.
// ===========================================================================

interface Call {
  readonly argv: readonly string[];
}

interface StubOptions {
  readonly storyBody: string;
  readonly labels: readonly string[];
  readonly designOk?: boolean;
  // Overrides the git-read stdout entirely, for a Design whose `##
  // Build Targets` HEADING is present but whose table does not parse
  // (#48 M4). Left undefined, the default fixture below is used.
  readonly designStdout?: string;
  // Row 3's capability probe answer. Defaults to "absent", unchanged from
  // every test that predates this field (#48 M5).
  readonly subIssueCapability?: "present" | "absent";
}

function stubContext(options: StubOptions): {
  readonly ctx: ScenarioContext;
  readonly mutations: Call[];
  readonly reads: number[];
} {
  const mutations: Call[] = [];
  const reads: number[] = [];

  // A tiny in-memory forge: enough for the five reads this transcription
  // issues, and nothing more.
  const issues = [
    {
      number: 1,
      title: "Story: stub",
      body: options.storyBody,
      labels: options.labels.map((name) => ({ name })),
    },
  ];

  function answer(argv: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
    if (argv[0] === "git") {
      if (options.designOk === false) return { exitCode: 1, stdout: "", stderr: "no such path" };
      return {
        exitCode: 0,
        stdout:
          options.designStdout ??
          "# D\n\n## Build Targets\n\n| # | Target |\n|---|---|\n| 1 | a |\n",
        stderr: "",
      };
    }
    // The row-3 sub-issue capability probe and, on the present path, the
    // `subIssueLink` mutation -- both `gh api graphql ...` (#48 M5). Default
    // "absent" reproduces every test written before this field existed: a
    // `null` `subIssues` field, exit 0, the same shape fake-forge.ts's
    // graphql branch emits when the capability is configured absent -- so
    // those tests exercise the fallback (`Parent: #N`) path exclusively.
    if (argv[1] === "api" && argv[2] === "graphql") {
      const present = options.subIssueCapability === "present";
      const queryField = argv[argv.indexOf("-f") + 1] as string | undefined;
      const query = queryField?.startsWith("query=") ? queryField.slice("query=".length) : queryField;
      if (query?.trimStart().startsWith("mutation")) {
        // THE LINK. Only reachable on the present path -- a transcription
        // that read the probe honestly and got "absent" never issues this.
        if (!present) return { exitCode: 125, stdout: "", stderr: "unmodelled" };
        return {
          exitCode: 0,
          stdout: JSON.stringify({ data: { addSubIssue: { issue: { number: 0 } } } }),
          stderr: "",
        };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          data: { repository: { issue: { subIssues: present ? { totalCount: 0 } : null } } },
        }),
        stderr: "",
      };
    }
    // The present path's node-id lookups: `gh api repos/{owner}/{name}/issues/{n} --jq .node_id`
    // (`issueNodeId`, sub-issues.ts:84). Opaque only in the shape
    // `subIssueLink`'s own validation requires, and reversible by this stub
    // alone so the mutation below can be asserted against the real issue
    // number it names.
    if (argv[1] === "api" && /\/issues\/(\d+)$/.test(argv[2] ?? "") && argv.includes("--jq")) {
      const n = (/\/issues\/(\d+)$/.exec(argv[2] as string) as RegExpExecArray)[1];
      return { exitCode: 0, stdout: `NODE_${n}`, stderr: "" };
    }
    if (argv[2] === "list") return { exitCode: 0, stdout: JSON.stringify(issues), stderr: "" };
    if (argv[2] === "view") {
      const n = Number(argv[3]);
      const issue = issues.find((i) => i.number === n);
      return { exitCode: 0, stdout: JSON.stringify({ body: issue?.body ?? "" }), stderr: "" };
    }
    if (argv[2] === "create") {
      const t = argv[argv.indexOf("--title") + 1] as string;
      const bodyIndex = argv.indexOf("--body");
      const created = {
        number: issues.length + 1,
        title: t,
        body: bodyIndex === -1 ? "" : (argv[bodyIndex + 1] as string),
        labels: [],
      };
      issues.push(created);
      // The real fake (fake-forge.ts's `handleIssue`) answers with the
      // issue's HTML URL, and the present path's `issueNumberFromCreateStdout`
      // (transcription-task-create.ts) reads the issue number back off it.
      return { exitCode: 0, stdout: `https://github.com/OWNER/REPO/issues/${String(created.number)}`, stderr: "" };
    }
    if (argv[2] === "edit") {
      const n = Number(argv[3]);
      const i = issues.findIndex((x) => x.number === n);
      if (i !== -1) issues[i] = { ...issues[i], body: argv[argv.indexOf("--body") + 1] as string };
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 125, stdout: "", stderr: "unmodelled" };
  }

  const ctx = {
    root: "/tmp/stub",
    runIndex: 1,
    port: {
      async run(argv: readonly string[]) {
        mutations.push({ argv });
        return answer(argv);
      },
    },
    async read(row: number, argv: readonly string[]) {
      reads.push(row);
      return answer(argv);
    },
    writeFile(): void {
      throw new Error("this transcription writes no files");
    },
  } as unknown as ScenarioContext;

  return { ctx, mutations, reads, issues } as never;
}

const TARGETS = ["the parser", "the emitter"] as const;

function params(extra: Partial<Parameters<typeof runTaskCreate>[1]> = {}) {
  return {
    story: 1,
    designPath: "docs/design/stories/7.md",
    domainLabel: "domain:dev",
    targets: TARGETS,
    dependsOn: {},
    ...extra,
  };
}

describe("task-create's transcription: the hard-failure gates actually gate (#48 M8)", () => {
  test("an absent domain: label refuses, and mutates NOTHING", async () => {
    const { ctx, mutations } = stubContext({ storyBody: "prose", labels: ["type:story"] });

    await expect(runTaskCreate(ctx, params())).rejects.toThrow("HARD FAILURE in Phase 0 (task-create)");

    // The refusal must be total. A gate that throws AFTER opening three
    // issues has not prevented anything — it has only made the damage
    // harder to see.
    expect(mutations).toEqual([]);
  });

  test("an unreadable Design refuses, and mutates NOTHING", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
      designOk: false,
    });

    await expect(runTaskCreate(ctx, params())).rejects.toThrow("HARD FAILURE in Phase 0 (task-create)");
    expect(mutations).toEqual([]);
  });

  // THE VACUITY GUARD. Without it, both tests above could be passing because
  // the transcription refuses EVERYTHING.
  test("with the label present and the Design readable, it proceeds and opens the targets", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
    });

    await runTaskCreate(ctx, params());

    const created = mutations.filter((m) => m.argv[2] === "create");
    expect(created).toHaveLength(TARGETS.length);
    // And each carries the PARENT'S label, copied rather than chosen.
    for (const c of created) expect(c.argv).toContain("domain:dev");
  });
});

// ===========================================================================
// THE GATE IS THE PARSER'S VERDICT, NOT A SUBSTRING CHECK — mutation M4.
// ===========================================================================
describe("task-create's transcription: the Build Targets gate is the parser's verdict (#48 M4)", () => {
  // THE ASSERTION M4 DEFEATED: `designRead.stdout.includes("## Build Targets")`
  // (the reverted form) would pass on this fixture — the literal heading text
  // IS present, exactly as docs/design/stories/47.md merely mentions it in
  // prose at lines 70 and 466 (transcription-task-create.ts's own gate
  // comment names that hazard directly). Only `parseBuildTargets`
  // (packages/core/src/guards/build-targets.ts:72) actually refuses this
  // table: its header has no "Target" column (build-targets.ts:125-130), so
  // it throws `BuildTargetsParseError` by name instead of guessing a column.
  test("a heading with an unparseable table refuses, and mutates NOTHING", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
      designStdout: "# D\n\n## Build Targets\n\n| # | NotTarget |\n|---|---|\n| 1 | a |\n",
    });

    let thrown: Error | undefined;
    try {
      await runTaskCreate(ctx, params());
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toContain("HARD FAILURE in Phase 0 (task-create)");
    // The reason line must be the PARSER's, not a reworded "none" — proving
    // the gate actually ran `parseBuildTargets` rather than merely finding no
    // heading at all (that case is already covered above).
    expect(thrown?.message).toMatch(/no "Target" column/);

    // THE "MUTATES NOTHING" HALF. SKILL.md:76-78: "Do not open the tasks you
    // *can* read and leave the rest — a partial cut is indistinguishable, on
    // re-run, from a complete one." A table that fails to parse must stop
    // before a single issue opens, exactly like the no-heading-at-all case.
    expect(mutations).toEqual([]);
  });
});

// ===========================================================================
// MERGE, NEVER REPLACE — mutation M11. This is #315's defect, and the test
// that would have caught it there is the test that catches it here.
// ===========================================================================
describe("task-create's transcription: the Story body is MERGED, never replaced (#48 M11)", () => {
  const LOAD_BEARING = [
    "# Story 1",
    "",
    "Some prose that must survive.",
    "",
    "## Tasks",
    "",
    "**Sequencing.** This ruling lives INSIDE the Tasks section and is exactly",
    "what a whole-section rewrite deletes.",
    "",
  ].join("\n");

  test("a body with no ## Tasks section keeps every byte it had, ahead of the new section", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "# Story 1\n\nProse that must survive.\n",
      labels: ["type:story", "domain:dev"],
    });

    await runTaskCreate(ctx, params());

    const edit = mutations.find((m) => m.argv[2] === "edit");
    expect(edit, "the checklist edit must have happened").toBeDefined();

    const written = (edit as Call).argv[(edit as Call).argv.indexOf("--body") + 1] as string;

    // THE ASSERTION M11 DEFEATED: the prior body is still there, verbatim.
    expect(written).toContain("Prose that must survive.");
    expect(written.startsWith("# Story 1")).toBe(true);
    expect(written).toContain("## Tasks");
    // And the new section is APPENDED, not substituted.
    expect(written.indexOf("Prose that must survive.")).toBeLessThan(written.indexOf("## Tasks"));
  });

  // THE MUTATION THIS RETIRES: the prior version of this test was named
  // identically and asserted `expect(bodyEdits).toEqual([])` for ANY body
  // that already carried `## Tasks` -- which pinned the exact defect this
  // task fixes (a new row's checklist entry never reaching the body on
  // re-run, forever). A body already carrying the section must still be
  // MERGED, not left alone, whenever it is missing an entry the current
  // target list requires.
  test("a body with ## Tasks and a new target not yet in it gains the entry, prose and ticks survive", async () => {
    // One task (the parser, #2) already in the checklist and already
    // ticked; "the emitter" is a second target this run must also open and
    // add to the checklist. Entries use `- [ ] #N title`, the real format
    // `withTasksChecklist` reads back (sub-issues.ts:231), unlike the
    // defective transcription's `- [ ] <title>` it replaces.
    const body = [
      "# Story 1",
      "",
      "Some prose that must survive.",
      "",
      "## Tasks",
      "",
      "- [x] #2 S1 — the parser",
      "",
      "**Sequencing.** This ruling lives INSIDE the Tasks section and is exactly",
      "what a whole-section rewrite deletes.",
      "",
    ].join("\n");

    const { ctx, mutations, issues } = stubContext({
      storyBody: body,
      labels: ["type:story", "domain:dev"],
    }) as unknown as {
      readonly ctx: ScenarioContext;
      readonly mutations: Call[];
      readonly issues: { number: number; title: string }[];
    };
    // Seed the pre-existing task issue #2 the body above already cites, so
    // row 3's existing-title match skips creating it again and row 5's read
    // can resolve its number back to a checklist entry.
    issues.push({ number: 2, title: "S1 — the parser" });

    await runTaskCreate(ctx, params());

    const bodyEdit = mutations.find((m) => m.argv[2] === "edit" && Number(m.argv[3]) === 1);
    expect(bodyEdit, "the new target must reach the checklist via a real merge").toBeDefined();
    const written = (bodyEdit as Call).argv[(bodyEdit as Call).argv.indexOf("--body") + 1] as string;

    // THE ASSERTION THE OLD SKIP DEFEATED: the newly opened target's entry is
    // now present, referencing the issue just created for "the emitter".
    const emitterIssue = issues.find((i) => i.title === "S1 — the emitter");
    expect(emitterIssue, "the emitter target must have been opened this run").toBeDefined();
    expect(written).toContain(`#${String((emitterIssue as { number: number }).number)} S1 — the emitter`);

    // The existing entry's tick is INHERITED, never cleared by the merge.
    expect(written).toContain("- [x] #2 S1 — the parser");

    // The load-bearing prose inside `## Tasks` survives verbatim, and so does
    // the prose ahead of the section.
    expect(written).toContain("Some prose that must survive.");
    expect(written).toContain("**Sequencing.** This ruling lives INSIDE the Tasks section");
  });

  // THE IDEMPOTENCE GUARANTEE, pinned directly: a checklist that is already
  // complete and correct must produce NO body edit at all. Without this test,
  // a "helpful" unconditional rewrite could slip back in and still pass every
  // other assertion in this file while turning `bun run skill-harness`'s
  // "run 2: mutations=0" check red.
  test("a body whose checklist is already complete and correct produces no body edit", async () => {
    const body = [
      "# Story 1",
      "",
      "## Tasks",
      "",
      "- [ ] #2 S1 — the parser",
      "- [ ] #3 S1 — the emitter",
      "",
    ].join("\n");

    const { ctx, mutations, issues } = stubContext({
      storyBody: body,
      labels: ["type:story", "domain:dev"],
    }) as unknown as {
      readonly ctx: ScenarioContext;
      readonly mutations: Call[];
      readonly issues: { number: number; title: string }[];
    };
    issues.push({ number: 2, title: "S1 — the parser" }, { number: 3, title: "S1 — the emitter" });

    await runTaskCreate(ctx, params());

    const bodyEdits = mutations.filter((m) => m.argv[2] === "edit" && Number(m.argv[3]) === 1);
    expect(bodyEdits).toEqual([]);
  });
});

// ===========================================================================
// THE CAPABILITY BRANCH IS WIRED BOTH WAYS — mutation M5. Forcing the probe
// result to a constant "absent" leaves every other test in this file green,
// because none of them ever set the capability to "present". These two tests
// pin both halves directly, at the argv level, the way every other test in
// this file does.
// ===========================================================================
describe("task-create's transcription: the sub-issue capability branch (#48 M5)", () => {
  function isGraphqlMutationCall(argv: readonly string[]): boolean {
    if (argv[1] !== "api" || argv[2] !== "graphql") return false;
    const fIndex = argv.indexOf("-f");
    const field = fIndex === -1 ? undefined : argv[fIndex + 1];
    return typeof field === "string" && field.slice("query=".length).trimStart().startsWith("mutation");
  }

  test("capability present: the real sub-issue link runs, and no Parent: line is written", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
      subIssueCapability: "present",
    });

    await runTaskCreate(ctx, params({ targets: ["the widget"] as const }));

    // THE ASSERTION A CONSTANT "absent" DEFEATS: the real graphql mutation
    // actually ran, once per target opened.
    const links = mutations.filter((m) => isGraphqlMutationCall(m.argv));
    expect(links).toHaveLength(1);

    // And the create carries no `--body` at all on this path: the parent is
    // the GraphQL relation itself (transcription-task-create.ts's own
    // comment), and a `Parent:` line here too would leave two parentage
    // records free to disagree.
    const created = mutations.find((m) => m.argv[2] === "create");
    expect(created, "the target must have been opened").toBeDefined();
    expect((created as Call).argv).not.toContain("--body");
  });

  test("capability absent: no link mutation runs, and the Parent: fallback body is written", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
      subIssueCapability: "absent",
    });

    await runTaskCreate(ctx, params({ targets: ["the widget"] as const }));

    // THE MIRROR ASSERTION: on this path the real link must NEVER be issued
    // — sub-issues.ts:556-559 names an attempt here as a transcription bug in
    // its own right, not merely an untaken branch.
    const links = mutations.filter((m) => isGraphqlMutationCall(m.argv));
    expect(links).toEqual([]);

    const created = mutations.find((m) => m.argv[2] === "create");
    expect(created, "the target must have been opened").toBeDefined();
    const bodyIndex = (created as Call).argv.indexOf("--body");
    expect(bodyIndex).not.toBe(-1);
    expect((created as Call).argv[bodyIndex + 1]).toContain("Parent: #1");
  });
});

describe("task-create's transcription: the Blocked by line (#48)", () => {
  test("is written once, in target order, from the shared renderer", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
    });

    await runTaskCreate(ctx, params({ dependsOn: { [TARGETS[1]]: [TARGETS[0]] } }));

    const withLine = mutations.filter((m) => {
      const i = m.argv.indexOf("--body");
      return i !== -1 && String(m.argv[i + 1]).includes(BLOCKED_BY_PREFIX);
    });
    expect(withLine).toHaveLength(1);
  });

  test("is not written for a target that declares no dependency", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: "prose",
      labels: ["type:story", "domain:dev"],
    });

    await runTaskCreate(ctx, params({ dependsOn: {} }));

    const withLine = mutations.filter((m) => {
      const i = m.argv.indexOf("--body");
      return i !== -1 && String(m.argv[i + 1]).includes(BLOCKED_BY_PREFIX);
    });
    expect(withLine).toEqual([]);
  });
});
