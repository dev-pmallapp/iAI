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
      return options.designOk === false
        ? { exitCode: 1, stdout: "", stderr: "no such path" }
        : { exitCode: 0, stdout: "# D\n\n## Build Targets\n\n| # | Target |\n|---|---|\n| 1 | a |\n", stderr: "" };
    }
    if (argv[2] === "list") return { exitCode: 0, stdout: JSON.stringify(issues), stderr: "" };
    if (argv[2] === "view") {
      const n = Number(argv[3]);
      const issue = issues.find((i) => i.number === n);
      return { exitCode: 0, stdout: JSON.stringify({ body: issue?.body ?? "" }), stderr: "" };
    }
    if (argv[2] === "create") {
      const t = argv[argv.indexOf("--title") + 1] as string;
      issues.push({ number: issues.length + 1, title: t, body: "", labels: [] });
      return { exitCode: 0, stdout: "", stderr: "" };
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

  test("a body that already has ## Tasks is not rewritten at all", async () => {
    const { ctx, mutations } = stubContext({
      storyBody: LOAD_BEARING,
      labels: ["type:story", "domain:dev"],
    });

    await runTaskCreate(ctx, params());

    // Row 4's read decided the section exists, so no body edit is issued and
    // the ruling inside `## Tasks` is never at risk in the first place.
    const bodyEdits = mutations.filter(
      (m) => m.argv[2] === "edit" && Number(m.argv[3]) === 1,
    );
    expect(bodyEdits).toEqual([]);
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
