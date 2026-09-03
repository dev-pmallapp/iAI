import { describe, expect, test } from "bun:test";
import {
  commentCreate,
  commentEdit,
  issueClose,
  issueCreate,
  issueEditBody,
  issueView,
  labelCreate,
  makeRepo,
  milestoneCreate,
  milestoneList,
  parseRepo,
  planLabelTransition,
  prCreate,
  subIssueLink,
  type GhRepo,
} from "../src/gh/index";

// A single fixture repo across the file. Every constructor takes it
// explicitly, per Decision 6 of docs/design/stories/21.md — the golden argv
// below could not be written at all if the repo were implicit, because the
// expected value would depend on the test runner's working directory.
const REPO: GhRepo = { owner: "dev-pmallapp", name: "iAI" };

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

describe("gh — case 1 (P0, CLAIM-21.1): each operation family has a constructor returning an argv array", () => {
  test("issues: create, edit, close and view each return their golden argv", () => {
    expect(value(issueCreate(REPO, { title: "T", body: "B" }))).toEqual([
      "gh", "issue", "create", "--repo", "dev-pmallapp/iAI", "--title", "T", "--body", "B",
    ]);
    expect(value(issueEditBody(REPO, 21, "B"))).toEqual([
      "gh", "issue", "edit", "21", "--repo", "dev-pmallapp/iAI", "--body", "B",
    ]);
    expect(value(issueClose(REPO, 21))).toEqual([
      "gh", "issue", "close", "21", "--repo", "dev-pmallapp/iAI",
    ]);
    expect(value(issueView(REPO, 21, ["labels", "state"]))).toEqual([
      "gh", "issue", "view", "21", "--repo", "dev-pmallapp/iAI", "--json", "labels,state",
    ]);
  });

  test("issue create repeats --label per value rather than comma-joining", () => {
    expect(value(issueCreate(REPO, { title: "T", body: "B", labels: ["type:task", "iai"] }))).toEqual([
      "gh", "issue", "create", "--repo", "dev-pmallapp/iAI",
      "--title", "T", "--body", "B", "--label", "type:task", "--label", "iai",
    ]);
  });

  test("milestones: list and create return their golden argv", () => {
    expect(value(milestoneList(REPO))).toEqual([
      "gh", "api", "--paginate", "repos/dev-pmallapp/iAI/milestones?state=all&per_page=100",
    ]);
    expect(value(milestoneCreate(REPO, { title: "M1", state: "open" }))).toEqual([
      "gh", "api", "--method", "POST", "repos/dev-pmallapp/iAI/milestones",
      "-f", "title=M1", "-f", "state=open",
    ]);
  });

  test("labels: create carries --force so a drifted colour reconciles in place", () => {
    const argv = value(labelCreate(REPO, { name: "iai", color: "24292f", description: "d" }));
    expect(argv).toEqual([
      "gh", "label", "create", "iai", "--repo", "dev-pmallapp/iAI",
      "--color", "24292f", "--description", "d", "--force",
    ]);
  });

  test("comments: create and edit return their golden argv", () => {
    expect(value(commentCreate(REPO, 21, "hello"))).toEqual([
      "gh", "issue", "comment", "21", "--repo", "dev-pmallapp/iAI", "--body", "hello",
    ]);
    // Note the endpoint carries no issue number: comment ids are unique per
    // repository, not per issue.
    expect(value(commentEdit(REPO, 5487994224, "hello"))).toEqual([
      "gh", "api", "--method", "PATCH",
      "repos/dev-pmallapp/iAI/issues/comments/5487994224", "-f", "body=hello",
    ]);
  });

  test("every constructor returns a plain array of strings", () => {
    const argvs = [
      value(issueCreate(REPO, { title: "T", body: "B" })),
      value(milestoneList(REPO)),
      value(labelCreate(REPO, { name: "iai", color: "24292f" })),
      value(commentCreate(REPO, 1, "b")),
    ];
    for (const argv of argvs) {
      expect(Array.isArray(argv)).toBe(true);
      expect(argv.every((part) => typeof part === "string")).toBe(true);
      expect(argv[0]).toBe("gh");
    }
  });

  // CLAIM-21.1 counts SIX families. Four shipped in #22, sub-issues in #23 and
  // pull requests in #24. This asserts each is actually CONSTRUCTIBLE by
  // calling one constructor per family — a list of six names would only assert
  // that six names were typed.
  test("all six families named by CLAIM-21.1 are constructible", () => {
    const families: Record<string, () => { ok: boolean }> = {
      issues: () => issueCreate(REPO, { title: "T", body: "B" }),
      milestones: () => milestoneList(REPO),
      labels: () => labelCreate(REPO, { name: "iai", color: "24292f" }),
      comments: () => commentCreate(REPO, 21, "b"),
      "sub-issues": () => subIssueLink("I_parentNode", "I_childNode"),
      "pull-requests": () =>
        prCreate(REPO, {
          base: "story/21-s",
          head: "task/22-c",
          title: "T",
          body: "B",
          defaultBranch: "main",
        }),
    };
    const names = Object.keys(families);
    expect(names.length).toBe(6);
    for (const name of names) {
      const result = families[name]!();
      expect(result.ok).toBe(true);
    }
  });
});

describe("gh — case 1 (P0, CLAIM-21.1): the repository is explicit on every constructed command", () => {
  test("every argv carries --repo, or the REST path, naming the repository", () => {
    const flagged = [
      value(issueCreate(REPO, { title: "T", body: "B" })),
      value(issueClose(REPO, 1)),
      value(labelCreate(REPO, { name: "n", color: "aabbcc" })),
      value(commentCreate(REPO, 1, "b")),
    ];
    for (const argv of flagged) {
      expect(argv).toContain("--repo");
      expect(argv).toContain("dev-pmallapp/iAI");
    }
    // The `gh api` family names the repo in the path instead of a flag.
    expect(value(milestoneList(REPO)).join(" ")).toContain("repos/dev-pmallapp/iAI/");
  });

  test("parseRepo round-trips owner/name and rejects ambiguous slugs", () => {
    expect(value(parseRepo("dev-pmallapp/iAI"))).toEqual(REPO);
    expect(parseRepo("github.com/dev-pmallapp/iAI").ok).toBe(false);
    expect(parseRepo("iAI").ok).toBe(false);
    expect(parseRepo("").ok).toBe(false);
  });
});

// Decision 2 of docs/design/stories/21.md. CLAIM-21.3 reads "both --add-label
// and --remove-label", which is unsatisfiable for a first status;
// docs/design/03-workflow.md:224 omits the removal in that case. The invariant
// being protected is ATOMICITY (03-workflow.md:167-169), not flag count.
describe("planLabelTransition — case 6 (P0, CLAIM-21.3): a transition with a predecessor emits one command carrying both flags", () => {
  test("status:in-progress to status:resolved is a single command with both flags", () => {
    const plan = value(
      planLabelTransition(REPO, 21, {
        add: "status:resolved",
        current: ["type:story", "status:in-progress", "domain:dev", "iai"],
      }),
    );
    expect(plan.length).toBe(1);
    expect(plan[0]).toEqual([
      "gh", "issue", "edit", "21", "--repo", "dev-pmallapp/iAI",
      "--add-label", "status:resolved", "--remove-label", "status:in-progress",
    ]);
  });

  test("the incumbent is derived from the exclusive family, not from the caller", () => {
    const plan = value(
      planLabelTransition(REPO, 21, { add: "rung:paper", current: ["rung:research"] }),
    );
    expect(plan[0]).toContain("--remove-label");
    expect(plan[0]).toContain("rung:research");
  });

  test("an explicit remove overrides derivation, for families with no stated exclusivity", () => {
    const plan = value(
      planLabelTransition(REPO, 21, {
        add: "gate:approved",
        current: ["gate:pending"],
        remove: "gate:pending",
      }),
    );
    expect(plan[0]).toContain("--remove-label");
    expect(plan[0]).toContain("gate:pending");
  });

  test("gate:* is NOT treated as exclusive without an explicit remove", () => {
    // docs/design/03-workflow.md:153 calls gate:* an additive marker. This
    // module must not invent an exclusivity rule the tree does not state.
    const plan = value(
      planLabelTransition(REPO, 21, { add: "gate:approved", current: ["gate:pending"] }),
    );
    expect(plan[0]).not.toContain("--remove-label");
  });
});

describe("planLabelTransition — case 7 (P0, CLAIM-21.3): a first-status transition emits one command carrying --add-label alone", () => {
  test("no predecessor means no --remove-label, and no fabricated argument", () => {
    const plan = value(
      planLabelTransition(REPO, 21, { add: "status:in-progress", current: ["type:task", "iai"] }),
    );
    expect(plan.length).toBe(1);
    expect(plan[0]).toEqual([
      "gh", "issue", "edit", "21", "--repo", "dev-pmallapp/iAI",
      "--add-label", "status:in-progress",
    ]);
    expect(plan[0]).not.toContain("--remove-label");
  });

  test("an explicit remove naming an absent label is dropped rather than fabricated", () => {
    const plan = value(
      planLabelTransition(REPO, 21, {
        add: "gate:approved",
        current: ["iai"],
        remove: "gate:pending",
      }),
    );
    expect(plan[0]).not.toContain("--remove-label");
  });
});

describe("planLabelTransition — case 8 (P0, CLAIM-21.3): a transition never emits two commands, in any form", () => {
  test("no input in the corpus produces a plan of length 2", () => {
    const corpus: Array<{ add: string; current: string[]; remove?: string }> = [
      { add: "status:resolved", current: ["status:in-progress"] },
      { add: "status:in-progress", current: [] },
      { add: "status:resolved", current: ["status:resolved"] },
      { add: "domain:dev", current: ["domain:health"] },
      { add: "rung:paper", current: ["rung:research"] },
      { add: "gate:approved", current: ["gate:pending"], remove: "gate:pending" },
      { add: "gate:approved", current: ["gate:pending"] },
      { add: "iai", current: ["type:task"] },
      { add: "class:private", current: ["class:private"] },
    ];
    for (const input of corpus) {
      const result = planLabelTransition(REPO, 21, input);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.length).toBeLessThanOrEqual(1);
      expect(result.value.length).not.toBe(2);
    }
  });

  test("a corrupted issue carrying two labels from one exclusive family is refused, not half-fixed", () => {
    // docs/design/03-workflow.md:165-166 calls two status labels "a corruption"
    // warranting a hard failure. Removing one and leaving the other would look
    // like it worked.
    const result = planLabelTransition(REPO, 21, {
      add: "status:resolved",
      current: ["status:in-progress", "status:blocked"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("at most one");
  });
});

describe("planLabelTransition — case 9 (P1, CLAIM-21.4): a target label already present emits zero commands and returns success", () => {
  test("already applied is success with an empty plan, not an error", () => {
    const result = planLabelTransition(REPO, 21, {
      add: "status:resolved",
      current: ["status:resolved", "iai"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
    expect(result.value.length).toBe(0);
  });

  test("re-running a transition is a no-op, so a skill re-run costs nothing", () => {
    const first = value(
      planLabelTransition(REPO, 21, { add: "status:resolved", current: ["status:in-progress"] }),
    );
    expect(first.length).toBe(1);
    // Apply the first plan's effect to the label set, then re-derive.
    const second = value(
      planLabelTransition(REPO, 21, { add: "status:resolved", current: ["status:resolved"] }),
    );
    expect(second.length).toBe(0);
  });
});

describe("gh — case 17 (P0, NEVER-21.8): hostile and malformed input returns a typed failure and never throws", () => {
  const throwingGetter = {} as Record<string, unknown>;
  Object.defineProperty(throwingGetter, "title", {
    enumerable: true,
    get(): string {
      throw new Error("boom");
    },
  });

  test("0 throws across the hostile corpus", () => {
    const calls: Array<() => { ok: boolean }> = [
      () => issueCreate(REPO, null as never),
      () => issueCreate(REPO, undefined as never),
      () => issueCreate(REPO, {} as never),
      () => issueCreate(REPO, throwingGetter as never),
      () => issueCreate(REPO, { title: "T", body: "B", labels: ["", "x"] } as never),
      () => issueCreate(REPO, { title: "T", body: "B", labels: "type:task" } as never),
      () => issueEditBody(REPO, -1, "b"),
      () => issueEditBody(REPO, 0, "b"),
      () => issueEditBody(REPO, 1.5, "b"),
      () => issueEditBody(REPO, Number.NaN, "b"),
      () => issueEditBody(REPO, Number.POSITIVE_INFINITY, "b"),
      () => issueEditBody(REPO, "21" as never, "b"),
      () => issueClose(REPO, 1, "" as never),
      () => issueView(REPO, 1, []),
      () => issueView(REPO, 1, null as never),
      () => labelCreate(REPO, { name: "n", color: "#24292f" }),
      () => labelCreate(REPO, { name: "", color: "24292f" }),
      () => labelCreate(REPO, null as never),
      () => milestoneCreate(REPO, { title: "" }),
      () => milestoneCreate(REPO, null as never),
      () => commentCreate(REPO, 1, ""),
      () => commentEdit(REPO, -5, "b"),
      () => planLabelTransition(REPO, 1, null as never),
      () => planLabelTransition(REPO, 1, { add: "", current: [] }),
      () => planLabelTransition(REPO, 1, { add: "x", current: null as never }),
      () => planLabelTransition(REPO, 1, { add: "x", current: [1 as never] }),
      () => makeRepo(null, "iAI"),
      () => makeRepo("owner with space", "iAI"),
      () => parseRepo(null),
      () => parseRepo(42 as never),
    ];

    let threw = 0;
    let failures = 0;
    for (const call of calls) {
      try {
        const result = call();
        if (!result.ok) failures += 1;
      } catch {
        threw += 1;
      }
    }
    expect(threw).toBe(0);
    // Every one of these is malformed, so every one must be a typed failure.
    expect(failures).toBe(calls.length);
  });

  test("a shell metacharacter in a title is carried safely, not rejected", () => {
    // argv construction is not shell interpolation and the adapter uses
    // execFile (docs/design/09-security.md:190), so these are ordinary data.
    // Rejecting them would be security theatre that breaks real titles.
    const title = 'fix: `rm -rf /` && $(whoami) | tee "x"';
    const argv = value(issueCreate(REPO, { title, body: "b" }));
    // The metacharacters survive intact as ONE argv element. That is the whole
    // point of building argv rather than a shell string.
    expect(argv).toContain(title);
    expect(argv.filter((part) => part === title).length).toBe(1);
    expect(argv.length).toBe(9);
  });

  test("a newline in a body is preserved rather than split into two argv entries", () => {
    const body = "line one\nline two\n";
    const argv = value(issueEditBody(REPO, 21, body));
    expect(argv).toContain(body);
    expect(argv.length).toBe(8);
  });
});

// docs/design/01-skill-hierarchy.md:434 still asks for `parent`, which is not
// a gh issue view --json field. The reconciliation pass recorded the verdict
// `corrected` at docs/design/verification-pass.md:246 and it was never applied
// at source, so the layer refuses it rather than modelling it.
describe("issueView — the parent field is refused at construction", () => {
  test("requesting parent is a typed failure naming the real problem", () => {
    const result = issueView(REPO, 21, ["labels", "parent"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not a gh issue view --json field");
  });

  test("the valid form from the same document eleven lines earlier still works", () => {
    expect(value(issueView(REPO, 41, ["labels", "body"]))).toContain("labels,body");
  });
});
