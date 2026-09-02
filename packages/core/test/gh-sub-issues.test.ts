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
  type GhRepo,
} from "../src/gh/index";

const REPO: GhRepo = { owner: "dev-pmallapp", name: "iAI" };

// Real node ids from dev-pmallapp/iAI, shape-wise: opaque base64-ish strings,
// never issue numbers.
const PARENT_NODE = "I_kwDdev-pmallapp21";
const CHILD_NODE = "I_kwDdev-pmallapp22";

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

describe("planSubIssueAttach — case 3 (P0, CLAIM-21.2): the GraphQL mutation is emitted when the capability input reports the API present", () => {
  test("the plan is the addSubIssue mutation with both node-id variables", () => {
    const plan = value(
      planSubIssueAttach(REPO, {
        capability: "present",
        parent: 21,
        parentNodeId: PARENT_NODE,
        childNodeId: CHILD_NODE,
      }),
    );
    expect(plan.commands.length).toBe(1);
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
      }),
    );
    expect(plan.childBody).toBeUndefined();
    expect(plan.commands[0]!.join(" ")).not.toContain("Parent: #");
    expect(plan.commands[0]!.join(" ")).not.toContain(TASKS_HEADING);
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
