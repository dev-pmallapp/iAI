import { describe, expect, test } from "bun:test";
import {
  SUB_ISSUE_FEATURE_HEADER,
  TASKS_HEADING,
  findParentInBody,
  issueNodeId,
  parentBodyLine,
  planSubIssueAttach,
  subIssueCapabilityProbe,
  subIssueLink,
  tasksChecklist,
  withParentLine,
  withTasksChecklist,
  type GhRepo,
} from "../src/gh/index";

const REPO: GhRepo = { owner: "dev-pmallapp", name: "iAI" };

// Real node ids from dev-pmallapp/iAI, shape-wise: opaque base64-ish strings,
// never issue numbers.
const PARENT_NODE = "I_kwDdev-pmallapp21";
const CHILD_NODE = "I_kwDdev-pmallapp22";

// A parent Story body with prose that must survive a checklist merge. Every
// call below supplies one, because `parentBody` is required on both paths:
// case 2 of docs/test-plans/47-plan.md is the reason it has no default.
const STORY_BODY = [
  "# S9.9 — A Story whose body is worth keeping",
  "",
  "## Problem",
  "",
  "This paragraph is what a reviewer reads, and HEAD replaced it with a checklist.",
  "",
  "## Claims",
  "",
  "- [ ] CLAIM-99.1: something load-bearing",
  "",
].join("\n");

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

describe("planSubIssueAttach — case 3 (P0, CLAIM-21.2): the GraphQL mutation is emitted when the capability input reports the API present", () => {
  // The count moved from 1 to 2 at #315, build target 2: the checklist edit is
  // now emitted on this path too. The mutation is still the FIRST command and
  // every assertion below still reads commands[0], so what this test pins is
  // unchanged — only the claim that nothing else is emitted has been retired,
  // and deliberately, because that absence was CLAIM-47.1's unreachable clause.
  test("the plan is the addSubIssue mutation with both node-id variables", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "present",
        parent: 21,
        parentNodeId: PARENT_NODE,
        childNodeId: CHILD_NODE,
        siblings: [{ issue: 905 }],
        parentBody: STORY_BODY,
      }),
    );
    expect(plan.commands.length).toBe(2);
    const argv = plan.commands[0]!.join(" ");
    expect(argv).toContain("api graphql");
    expect(argv).toContain("addSubIssue");
    expect(argv).toContain(`p=${PARENT_NODE}`);
    expect(argv).toContain(`c=${CHILD_NODE}`);
  });

  test("no body-link form is emitted on the GraphQL path", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "present",
        parent: 21,
        parentNodeId: PARENT_NODE,
        childNodeId: CHILD_NODE,
        siblings: [{ issue: 905 }],
        parentBody: STORY_BODY,
      }),
    );
    expect(plan.childBody).toBeUndefined();
    expect(plan.commands[0]!.join(" ")).not.toContain("Parent: #");
    expect(plan.commands[0]!.join(" ")).not.toContain(TASKS_HEADING);
    // The linkage is the mutation, not a body line — on EVERY command, not
    // just the first. Asserting only commands[0] would stop meaning anything
    // the moment a second command appeared, which is what just happened.
    for (const argv of plan.commands) {
      expect(argv.join(" ")).not.toContain("Parent: #");
    }
  });

  // Build target 2 of docs/design/stories/47.md. CLAIM-47.1's clause "adds a
  // `## Tasks` checklist to the Story" was unreachable here: this path returned
  // exactly one command and no checklist at all.
  test("the checklist edit is emitted on the primary path, not only the fallback", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "present",
        parent: 21,
        parentNodeId: PARENT_NODE,
        childNodeId: CHILD_NODE,
        siblings: [{ issue: 905 }, { issue: 906 }],
        parentBody: STORY_BODY,
      }),
    );
    const edit = plan.commands[1]!;
    expect(edit.slice(0, 4)).toEqual(["gh", "issue", "edit", "21"]);
    const emitted = edit[edit.length - 1]!;
    expect(emitted).toContain(TASKS_HEADING);
    expect(emitted).toContain("- [ ] #905");
    // And it merges here too. A path that emitted the checklist but destroyed
    // the body would satisfy build target 2 and reintroduce the defect.
    expect(emitted).toContain("## Problem");
    expect(emitted).toContain("- [ ] CLAIM-99.1: something load-bearing");
  });

  test("the primary path refuses the checklist inputs it cannot invent", () => {
    const noSiblings = planSubIssueAttach(REPO, {
      capability: "present",
      parent: 21,
      parentNodeId: PARENT_NODE,
      childNodeId: CHILD_NODE,
      parentBody: STORY_BODY,
    });
    expect(noSiblings.ok).toBe(false);
    if (noSiblings.ok) return;
    expect(noSiblings.reason).toContain("both capability paths");

    const noBody = planSubIssueAttach(REPO, {
      capability: "present",
      parent: 21,
      parentNodeId: PARENT_NODE,
      childNodeId: CHILD_NODE,
      siblings: [{ issue: 905 }],
    });
    expect(noBody.ok).toBe(false);
    if (noBody.ok) return;
    expect(noBody.reason).toContain("merged into it");
  });

  // The observation this whole module is built around. Without the header the
  // API answers with no nodes AND no error, which is indistinguishable from an
  // absent API — a false negative that silently makes the fallback permanent.
  test("the feature header is attached and is not a caller option", () => {
    const link = value(subIssueLink(PARENT_NODE, CHILD_NODE));
    expect(link).toContain("-H");
    expect(link).toContain(SUB_ISSUE_FEATURE_HEADER);
    const probe = value(subIssueCapabilityProbe(REPO, 21));
    expect(probe).toContain("-H");
    expect(probe).toContain(SUB_ISSUE_FEATURE_HEADER);
  });

  test("node ids are required; an issue number is refused", () => {
    expect(subIssueLink(21 as never, 22 as never).ok).toBe(false);
    expect(subIssueLink("21", "22").ok).toBe(true); // shape-valid, caller's problem
    expect(subIssueLink(PARENT_NODE, PARENT_NODE).ok).toBe(false); // self-parenting
    const missing = planSubIssueAttach(REPO, { capability: "present", parent: 21 });
    expect(missing.ok).toBe(false);
  });

  test("issueNodeId constructs the resolver the adapter runs first", () => {
    expect(value(issueNodeId(REPO, 21))).toEqual([
      "gh", "api", "repos/dev-pmallapp/iAI/issues/21", "--jq", ".node_id",
    ]);
  });
});

describe("planSubIssueAttach — case 4 (P0, CLAIM-21.2): on a reported absence the task body carries the Parent: #N line", () => {
  test("the line is at column zero, on its own line, exactly once", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "absent",
        parent: 901,
        child: 905,
        childBody: "## Task\n\nSome scope.\n",
        siblings: [{ issue: 905 }],
        parentBody: STORY_BODY,
      }),
    );
    const body = plan.childBody!;
    const matches = body.split("\n").filter((line) => line === "Parent: #901");
    expect(matches.length).toBe(1);
    expect(body).toContain("\nParent: #901\n");
    expect(findParentInBody(body)).toBe(901);
  });

  test("no GraphQL argv is emitted on the fallback path", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "absent",
        parent: 901,
        childBody: "## Task\n\nScope.\n",
        siblings: [{ issue: 905 }],
        parentBody: STORY_BODY,
      }),
    );
    for (const argv of plan.commands) {
      expect(argv.join(" ")).not.toContain("graphql");
      expect(argv.join(" ")).not.toContain("addSubIssue");
    }
  });

  test("the line lands under a leading heading, matching the shipped precedent", () => {
    const body = value(withParentLine("## Task\n\nScope.\n", 901));
    expect(body.split("\n").slice(0, 3)).toEqual(["## Task", "", "Parent: #901"]);
  });

  test("adding the link twice is idempotent, not a second line", () => {
    const once = value(withParentLine("## Task\n\nScope.\n", 901));
    const twice = value(withParentLine(once, 901));
    expect(twice).toBe(once);
    expect(twice.split("\n").filter((l) => l.startsWith("Parent: #")).length).toBe(1);
  });

  test("re-parenting an already-parented body is refused rather than silently rewritten", () => {
    const once = value(withParentLine("## Task\n\nScope.\n", 901));
    const result = withParentLine(once, 902);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("already declares Parent: #901");
  });

  // Decision 5: scripts/bootstrap-stories.py:198 degrades to
  // `Parent: the S1.1 Story`. That form is deliberately not adopted — a link
  // with a prose variant is a link that silently stops being a link.
  test("an unknown parent is a construction failure, with no prose fallback form", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, undefined, null, "901"]) {
      const result = parentBodyLine(bad as never);
      expect(result.ok).toBe(false);
    }
    const reason = parentBodyLine(0 as never);
    if (reason.ok) return;
    expect(reason.reason).toContain("no prose fallback form");
  });
});

describe("planSubIssueAttach — case 5 (P0, CLAIM-21.2): the fallback also emits a ## Tasks checklist edit on the parent", () => {
  test("a second command edits the parent with the checklist", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "absent",
        parent: 901,
        childBody: "## Task\n\nScope.\n",
        siblings: [{ issue: 905 }, { issue: 906 }, { issue: 907 }],
        parentBody: STORY_BODY,
      }),
    );
    expect(plan.commands.length).toBe(1);
    const argv = plan.commands[0]!;
    expect(argv.slice(0, 4)).toEqual(["gh", "issue", "edit", "901"]);
    expect(argv).toContain("--repo");
    expect(argv[argv.length - 1]).toContain(TASKS_HEADING);
  });

  test("the heading is exactly ## Tasks, not ### Tasks", () => {
    const checklist = value(tasksChecklist([{ issue: 905 }]));
    expect(checklist.split("\n")[0]).toBe("## Tasks");
    expect(TASKS_HEADING).toBe("## Tasks");
  });

  // docs/milestones/M2.md:123-125 requires Blocked by: lines to match "the
  // parent checklist order", so sorting here would break a claim two
  // milestones away.
  test("supplied order is preserved exactly, never sorted", () => {
    const checklist = value(
      tasksChecklist([{ issue: 907 }, { issue: 905 }, { issue: 906 }]),
    );
    const numbers = checklist
      .split("\n")
      .filter((l) => l.startsWith("- ["))
      .map((l) => Number(/#(\d+)/.exec(l)![1]));
    expect(numbers).toEqual([907, 905, 906]);
  });

  test("items render as task-list entries, with optional titles and check state", () => {
    const checklist = value(
      tasksChecklist([
        { issue: 905, title: "Baseline panel" },
        { issue: 906, checked: true },
      ]),
    );
    expect(checklist).toContain("- [ ] #905 Baseline panel");
    expect(checklist).toContain("- [x] #906");
  });

  test("a duplicate issue is refused, so the checklist cannot disagree with the graph", () => {
    const result = tasksChecklist([{ issue: 905 }, { issue: 905 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("duplicate issue #905");
  });

  // CLAIM-21.2 requires BOTH halves. A body link with no checklist leaves the
  // parent unable to enumerate its children, which is exactly what `status`
  // reads in fallback mode (docs/design/04-domain-dev.md:504).
  test("the fallback refuses to emit a body link without the sibling list", () => {
    const result = planSubIssueAttach(REPO, {
      capability: "absent",
      parent: 901,
      childBody: "## Task\n\nScope.\n",
      parentBody: STORY_BODY,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("unable to enumerate its children");
  });
});

describe("planSubIssueAttach — the capability is reported, never probed here", () => {
  test("an unreported or invented capability is refused", () => {
    for (const bad of [undefined, null, "", "maybe", true, 1]) {
      const result = planSubIssueAttach(REPO, {
        capability: bad as never,
        parent: 21,
        parentNodeId: PARENT_NODE,
        childNodeId: CHILD_NODE,
      });
      expect(result.ok).toBe(false);
    }
  });

  test("0 throws across the hostile corpus", () => {
    const throwingItem = {} as Record<string, unknown>;
    Object.defineProperty(throwingItem, "checked", {
      enumerable: true,
      get(): boolean {
        throw new Error("boom");
      },
    });
    const throwing = {} as Record<string, unknown>;
    Object.defineProperty(throwing, "capability", {
      enumerable: true,
      get(): string {
        throw new Error("boom");
      },
    });
    const calls: Array<() => { ok: boolean }> = [
      () => planSubIssueAttach(REPO, null as never),
      () => planSubIssueAttach(REPO, throwing as never),
      () => planSubIssueAttach(REPO, { capability: "absent", parent: -1 } as never),
      () => subIssueLink(null, undefined),
      () => tasksChecklist(null as never),
      () => tasksChecklist([{ issue: 0 }]),
      () => tasksChecklist([{ issue: 905, title: 42 as never }]),
      () => withParentLine(null, 901),
      () => withParentLine("body", 0),
      () => withTasksChecklist(null, [{ issue: 905 }]),
      () => withTasksChecklist("body", null as never),
      () => withTasksChecklist("body", [{ issue: 0 }]),
      // A getter that throws, inside the item list the merger re-reads to
      // inherit tick state. This is why that loop uses safeOwnValue and never
      // a spread — a spread runs the getter and this count becomes 1.
      () => withTasksChecklist(`${TASKS_HEADING}\n\n- [x] #905\n`, [throwingItem as never]),
      () => subIssueCapabilityProbe(REPO, 0),
      () => issueNodeId(REPO, -3),
    ];
    let threw = 0;
    for (const call of calls) {
      try {
        call();
      } catch {
        threw += 1;
      }
    }
    expect(threw).toBe(0);
  });
});

describe("withTasksChecklist — case 2 (P0, CLAIM-47.7): a ## Tasks checklist merges into the Story body without discarding it", () => {
  // AT HEAD (story/47 @ a6ce084) THIS DESCRIBE BLOCK IS RED IN EVERY TEST, and
  // that is the finding, not an accident of ordering: `planSubIssueAttach`
  // passed `tasksChecklist`'s output as the whole `--body`, and no merger
  // existed to import. docs/test-plans/47-plan.md case 12 is the mutation that
  // keeps it red if the preservation logic is ever removed again.
  test("the pre-existing body survives, in full, and the checklist is added", () => {
    const merged = value(withTasksChecklist(STORY_BODY, [{ issue: 905 }, { issue: 906 }]));

    // Every line of the original body is still there, in order. `toContain`
    // on a heading would pass against a body that kept the headings and
    // dropped the prose between them — the two-assertions-that-differ-only-in-
    // case shape, one level up.
    expect(merged.startsWith(STORY_BODY.replace(/\n+$/, ""))).toBe(true);
    for (const line of STORY_BODY.split("\n")) {
      if (line.length > 0) expect(merged).toContain(line);
    }
    expect(merged).toContain(TASKS_HEADING);
    expect(merged).toContain("- [ ] #905");
    expect(merged).toContain("- [ ] #906");

    // NON-VACUITY. If the fixture body were empty, or if the checklist alone
    // happened to equal the merge, every assertion above would pass against
    // the destructive behaviour this case exists to forbid.
    expect(STORY_BODY.length).toBeGreaterThan(0);
    expect(merged).not.toBe(value(tasksChecklist([{ issue: 905 }, { issue: 906 }])));
    expect(merged.length).toBeGreaterThan(STORY_BODY.length);
  });

  test("re-running is idempotent, not a second checklist", () => {
    const once = value(withTasksChecklist(STORY_BODY, [{ issue: 905 }]));
    const twice = value(withTasksChecklist(once, [{ issue: 905 }]));
    expect(twice).toBe(once);
    expect(twice.split("\n").filter((l) => l === TASKS_HEADING).length).toBe(1);
  });

  test("a later run that adds a sibling rewrites the section in place", () => {
    const once = value(withTasksChecklist(STORY_BODY, [{ issue: 905 }]));
    const grown = value(withTasksChecklist(once, [{ issue: 905 }, { issue: 906 }]));
    expect(grown.split("\n").filter((l) => l === TASKS_HEADING).length).toBe(1);
    expect(grown).toContain("- [ ] #905");
    expect(grown).toContain("- [ ] #906");
    expect(grown).toContain("## Problem");
    // Order is the supplied order, still never sorted.
    expect(grown.indexOf("#905")).toBeLessThan(grown.indexOf("#906"));
  });

  test("content AFTER the checklist section survives the rewrite", () => {
    const body = [
      "## Claims",
      "",
      "- [ ] CLAIM-99.1: load-bearing",
      "",
      TASKS_HEADING,
      "",
      "- [ ] #905",
      "",
      "## Gate",
      "",
      "Unanswered, and it must stay that way.",
      "",
    ].join("\n");
    const merged = value(withTasksChecklist(body, [{ issue: 905 }, { issue: 906 }]));
    expect(merged).toContain("## Gate");
    expect(merged).toContain("Unanswered, and it must stay that way.");
    expect(merged).toContain("- [ ] CLAIM-99.1: load-bearing");
    expect(merged.indexOf(TASKS_HEADING)).toBeLessThan(merged.indexOf("## Gate"));
    expect(merged.indexOf("#906")).toBeLessThan(merged.indexOf("## Gate"));
  });

  // A tick is body content too. #293's checklist was ticked box by box as its
  // eight tasks merged; a task-create re-run that renders `- [ ] ` over a
  // ticked box destroys a human's record of what is done, which is the same
  // defect class as destroying the prose, one line smaller.
  test("a box ticked in the body stays ticked when the caller is silent", () => {
    const ticked = value(withTasksChecklist(STORY_BODY, [{ issue: 905 }])).replace(
      "- [ ] #905",
      "- [x] #905",
    );
    expect(ticked).toContain("- [x] #905");
    const merged = value(withTasksChecklist(ticked, [{ issue: 905 }, { issue: 906 }]));
    expect(merged).toContain("- [x] #905");
    expect(merged).toContain("- [ ] #906");
  });

  test("an explicit checked:false unticks a box, so the body never wins over a stated intent", () => {
    const ticked = value(withTasksChecklist(STORY_BODY, [{ issue: 905 }])).replace(
      "- [ ] #905",
      "- [x] #905",
    );
    const merged = value(withTasksChecklist(ticked, [{ issue: 905, checked: false }]));
    expect(merged).toContain("- [ ] #905");
  });

  test("two ## Tasks sections are refused rather than silently halved", () => {
    const body = `${TASKS_HEADING}\n\n- [ ] #905\n\n## Notes\n\n${TASKS_HEADING}\n\n- [ ] #906\n`;
    const result = withTasksChecklist(body, [{ issue: 905 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Assert the reason, not the verdict: a refusal for the wrong reason is
    // not the refusal this asserts.
    expect(result.reason).toContain("2");
    expect(result.reason).toContain("refusing to guess");
  });

  test("an empty story body yields the checklist alone, and stays idempotent", () => {
    const once = value(withTasksChecklist("", [{ issue: 905 }]));
    expect(once).toContain(TASKS_HEADING);
    expect(once.startsWith("\n")).toBe(false);
    expect(value(withTasksChecklist(once, [{ issue: 905 }]))).toBe(once);
  });

  test("the merged body is what the emitted argv actually carries, on both paths", () => {
    for (const input of [
      {
        capability: "absent" as const,
        parent: 901,
        childBody: "## Task\n\nScope.\n",
        siblings: [{ issue: 905 }],
        parentBody: STORY_BODY,
      },
      {
        capability: "present" as const,
        parent: 901,
        parentNodeId: PARENT_NODE,
        childNodeId: CHILD_NODE,
        siblings: [{ issue: 905 }],
        parentBody: STORY_BODY,
      },
    ]) {
      const plan = value(planSubIssueAttach(REPO, input));
      const edit = plan.commands.find((argv) => argv[1] === "issue" && argv[2] === "edit")!;
      expect(edit).toBeDefined();
      const emitted = edit[edit.length - 1]!;
      // The whole point: the argv carries the MERGE, not the checklist. An
      // assertion that only checked the heading was present is what let the
      // defect ship, and it is quoted in docs/design/stories/47.md Problem 2.
      expect(emitted).toBe(value(withTasksChecklist(STORY_BODY, [{ issue: 905 }])));
      expect(emitted).toContain("## Problem");
      expect(emitted).not.toBe(value(tasksChecklist([{ issue: 905 }])));
    }
  });
});
