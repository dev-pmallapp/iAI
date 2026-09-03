import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  branchSlug,
  bugBranch,
  prCreate,
  prList,
  prReady,
  prView,
  renderPrBody,
  storyBranch,
  taskBranch,
  type GhRepo,
} from "../src/gh/index";
import * as prModule from "../src/gh/pr";

const REPO: GhRepo = { owner: "dev-pmallapp", name: "iAI" };

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

describe("gh pr — case 1 (P0, CLAIM-21.1): the pull-request family has constructors returning golden argv", () => {
  test("prCreate: draft, base, head, title, body and repo, in that order", () => {
    expect(
      value(
        prCreate(REPO, {
          base: "story/901-apob-protocol",
          head: "task/905-baseline-panel",
          title: "Baseline lipid panel",
          body: "Refs #905",
          defaultBranch: "main",
        }),
      ),
    ).toEqual([
      "gh", "pr", "create", "--repo", "dev-pmallapp/iAI",
      "--draft", "--base", "story/901-apob-protocol", "--head", "task/905-baseline-panel",
      "--title", "Baseline lipid panel", "--body", "Refs #905",
    ]);
  });

  test("prReady: gh pr ready with the number and repo", () => {
    expect(value(prReady(REPO, 905))).toEqual(["gh", "pr", "ready", "905", "--repo", "dev-pmallapp/iAI"]);
  });

  test("prView: gh pr view with the number, repo and --json fields", () => {
    expect(value(prView(REPO, 905, ["state", "mergedAt"]))).toEqual([
      "gh", "pr", "view", "905", "--repo", "dev-pmallapp/iAI", "--json", "state,mergedAt",
    ]);
  });

  test("prList: gh pr list scoped to a head branch, across all states", () => {
    expect(value(prList(REPO, { head: "task/905-baseline-panel" }))).toEqual([
      "gh", "pr", "list", "--repo", "dev-pmallapp/iAI",
      "--head", "task/905-baseline-panel", "--state", "all",
      "--json", "number,state,headRefName,baseRefName",
    ]);
  });

  test("every pull-request argv is a plain array of strings starting with gh", () => {
    const argvs = [
      value(prCreate(REPO, { base: "main", head: "story/901-x", title: "T", body: "B", defaultBranch: "main" })),
      value(prReady(REPO, 1)),
      value(prView(REPO, 1, ["state"])),
      value(prList(REPO, { head: "story/901-x" })),
    ];
    for (const argv of argvs) {
      expect(Array.isArray(argv)).toBe(true);
      expect(argv.every((part) => typeof part === "string")).toBe(true);
      expect(argv[0]).toBe("gh");
      expect(argv[1]).toBe("pr");
    }
  });
});

// The four-step rule, docs/design/03-workflow.md:302-309 / CONTRIBUTING.md:169-173.
describe("branchSlug — the four-step rule, including 40-char truncation and the trailing-hyphen strip", () => {
  test("step 1+2: lowercase, and every run of non-alphanumerics collapses to one hyphen", () => {
    expect(value(branchSlug("Ship acme/telemetry metric export"))).toBe("ship-acme-telemetry-metric-export");
  });

  test("step 3: leading and trailing hyphens are stripped before truncation, not fabricated by it", () => {
    expect(value(branchSlug("--- already hyphenated ---"))).toBe("already-hyphenated");
    expect(value(branchSlug("!!!leading punctuation"))).toBe("leading-punctuation");
    expect(value(branchSlug("trailing punctuation!!!"))).toBe("trailing-punctuation");
  });

  test("step 4: truncated to exactly 40 characters when longer, then a trailing hyphen from the cut is stripped again", () => {
    // Chosen so the un-truncated slug is longer than 40 and character 40
    // itself lands on a hyphen, which is the only way to prove the SECOND
    // strip actually fires rather than merely never being exercised.
    const title = "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa moretext";
    const collapsed = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    expect(collapsed.length).toBeGreaterThan(40);
    expect(collapsed[39]).toBe("-");
    const slug = value(branchSlug(title));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a".repeat(39));
  });

  test("the first and third documented examples reproduce exactly", () => {
    // docs/design/03-workflow.md:307-309. The second documented example is
    // NOT asserted here: applying this file's four steps to it mechanically
    // yields a 40-character slug ending "...assessme", one character longer
    // than the 39-character "...assessm" printed in that document — the
    // printed example itself looks like a transcription typo against its own
    // stated 40-character rule, and asserting it verbatim would encode that
    // typo into this suite rather than the rule.
    expect(value(branchSlug("Baseline lipid panel + 90d wearable export"))).toBe(
      "baseline-lipid-panel-90d-wearable-export",
    );
    expect(value(branchSlug("Ship acme/telemetry metric export"))).toBe(
      "ship-acme-telemetry-metric-export",
    );
  });

  test("an empty or all-punctuation title is a construction failure, not an empty slug", () => {
    expect(branchSlug("").ok).toBe(false);
    expect(branchSlug("!!!---___").ok).toBe(false);
  });

  test("storyBranch, taskBranch and bugBranch compose the prefix, the issue number and the slug", () => {
    expect(value(storyBranch(901, "APOB protocol"))).toBe("story/901-apob-protocol");
    expect(value(taskBranch(905, "Baseline lipid panel"))).toBe("task/905-baseline-lipid-panel");
    expect(value(bugBranch(913, "Exporter drops labels"))).toBe("bug/913-exporter-drops-labels");
  });

  test("an invalid issue number is refused before the slug is even computed", () => {
    expect(taskBranch(-1, "x").ok).toBe(false);
    expect(taskBranch(0, "x").ok).toBe(false);
    expect(taskBranch(1.5, "x").ok).toBe(false);
    expect(storyBranch(Number.NaN, "x").ok).toBe(false);
  });
});

describe("renderPrBody — case 15 (P0, NEVER-21.7): a multi-issue integration PR body never carries a comma-separated Closes list", () => {
  test("four issues produce four Closes #N lines, one per line", () => {
    const body = value(renderPrBody({ kind: "integration", closes: [901, 905, 906, 907] }));
    expect(body).toBe("Closes #901\nCloses #905\nCloses #906\nCloses #907");
  });

  test("no line contains two issue references", () => {
    const body = value(renderPrBody({ kind: "integration", closes: [901, 905, 906, 907] }));
    for (const line of body.split("\n")) {
      const refs = line.match(/#\d+/g) ?? [];
      expect(refs.length).toBe(1);
    }
    expect(body.split("\n").length).toBe(4);
  });

  test("a comma-joined string is refused rather than accepted as one Closes line", () => {
    // A hostile or careless caller might hand the whole comma list as a single
    // string, which is exactly the corruption CONTRIBUTING.md:336 warns about
    // ("Closes #901, #905, #906" closes #901 and silently ignores the rest).
    // This must be a typed failure, not a silently-accepted single line.
    const result = renderPrBody({ kind: "integration", closes: "901, 905, 906" as never });
    expect(result.ok).toBe(false);
  });

  test("Closes is refused on a task PR at construction, because it would never fire", () => {
    const result = renderPrBody({ kind: "task", closes: [905] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("never fires on a task PR");
  });
});

describe("renderPrBody — case 16 (P1, NEVER-21.7): a comma-separated Blocked by: list is constructed, not rejected", () => {
  test("Blocked by: #931, #932 is emitted intact, exactly matching docs/design/04-domain-dev.md:449", () => {
    const body = value(renderPrBody({ kind: "task", blockedBy: [931, 932] }));
    expect(body).toBe("Blocked by: #931, #932");
  });

  test("the rejection is directive-specific: Blocked by keeps its comma while Closes never gets one", () => {
    const blocked = value(renderPrBody({ kind: "integration", blockedBy: [931, 932] }));
    expect(blocked).toContain(",");
    expect(blocked).toBe("Blocked by: #931, #932");

    const closed = value(renderPrBody({ kind: "integration", closes: [931, 932] }));
    expect(closed).not.toContain(",");
    expect(closed).toBe("Closes #931\nCloses #932");
  });

  test("Blocked by preserves supplied order, matching the parent checklist order", () => {
    const body = value(renderPrBody({ kind: "task", blockedBy: [932, 931] }));
    expect(body).toBe("Blocked by: #932, #931");
  });

  test("all three directives can combine, each keeping its own list rule, plus a free-text body", () => {
    const body = value(
      renderPrBody({
        kind: "task",
        refs: [933],
        blockedBy: [931, 932],
        body: "Executes the test plan.",
      }),
    );
    expect(body).toBe("Refs #933\nBlocked by: #931, #932\n\nExecutes the test plan.");
  });
});

describe("prCreate — a task PR targeting the default branch is refused at construction", () => {
  test("head starting task/ with base equal to the default branch is refused", () => {
    const result = prCreate(REPO, {
      base: "main",
      head: "task/905-baseline-panel",
      title: "T",
      body: "B",
      defaultBranch: "main",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("never the default");
  });

  test("the same task head targeting the story branch is accepted", () => {
    const result = prCreate(REPO, {
      base: "story/901-apob-protocol",
      head: "task/905-baseline-panel",
      title: "T",
      body: "B",
      defaultBranch: "main",
    });
    expect(result.ok).toBe(true);
  });

  test("a story or bug PR targeting the default branch is unaffected by the task refusal", () => {
    expect(
      prCreate(REPO, { base: "main", head: "story/901-x", title: "T", body: "B", defaultBranch: "main" }).ok,
    ).toBe(true);
    expect(
      prCreate(REPO, { base: "main", head: "bug/913-x", title: "T", body: "B", defaultBranch: "main" }).ok,
    ).toBe(true);
  });

  test("a repository using a different default branch name is refused just the same", () => {
    const result = prCreate(REPO, {
      base: "trunk",
      head: "task/905-x",
      title: "T",
      body: "B",
      defaultBranch: "trunk",
    });
    expect(result.ok).toBe(false);
  });
});

describe("prCreate — draft by default, with no field able to disable it", () => {
  test("--draft is present on every constructed argv", () => {
    const inputs = [
      { base: "main", head: "story/901-x", title: "T", body: "B", defaultBranch: "main" },
      { base: "main", head: "bug/913-x", title: "T", body: "B", defaultBranch: "main" },
      { base: "story/901-x", head: "task/905-x", title: "T", body: "B", defaultBranch: "main" },
    ];
    for (const input of inputs) {
      expect(value(prCreate(REPO, input))).toContain("--draft");
    }
  });

  test("PrCreateInput carries no field named draft, ready or similar that could turn it off", () => {
    // If such a field existed a caller could set it false; the guarantee here
    // is structural absence, not a guard that happens to always say yes.
    const withDraftFalse = { ...{
      base: "main", head: "story/901-x", title: "T", body: "B", defaultBranch: "main",
    }, draft: false } as never;
    expect(value(prCreate(REPO, withDraftFalse))).toContain("--draft");
  });
});

describe("prView — the merged field is refused at construction", () => {
  test("requesting merged is a typed failure naming the valid fields", () => {
    const result = prView(REPO, 905, ["state", "merged"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not a gh pr view --json field");
    expect(result.reason).toContain("state");
    expect(result.reason).toContain("mergedAt");
    expect(result.reason).toContain("mergeCommit");
  });

  test("the three valid replacement fields all work, individually and together", () => {
    expect(value(prView(REPO, 905, ["state"]))).toContain("state");
    expect(value(prView(REPO, 905, ["mergedAt"]))).toContain("mergedAt");
    expect(value(prView(REPO, 905, ["mergeCommit"]))).toContain("mergeCommit");
    expect(value(prView(REPO, 905, ["state", "mergedAt", "mergeCommit"]))).toContain(
      "state,mergedAt,mergeCommit",
    );
  });
});

describe("pr — case 21 (P0, NEVER-21.10): gh pr merge cannot be constructed by any function in the layer", () => {
  const EXPECTED_EXPORTED_FUNCTIONS = [
    "branchSlug",
    "bugBranch",
    "prCreate",
    "prList",
    "prReady",
    "prView",
    "renderPrBody",
    "storyBranch",
    "taskBranch",
  ].sort();

  test("every exported function in the module is accounted for by this corpus", () => {
    const actual = Object.entries(prModule)
      .filter(([, v]) => typeof v === "function")
      .map(([name]) => name)
      .sort();
    expect(actual).toEqual(EXPECTED_EXPORTED_FUNCTIONS);
  });

  test("no call in a varied corpus, across every argv-returning function, ever produces the token merge", () => {
    // Titles and bodies below deliberately include the ENGLISH WORD "merge"
    // as ordinary caller data — proving the guarantee holds even when a
    // caller's own text contains it, not merely when nobody tries.
    const calls: Array<() => unknown> = [
      () => prCreate(REPO, {
        base: "main", head: "story/901-x", title: "Merge conflict resolution",
        body: "Auto-merge notes", defaultBranch: "main",
      }),
      () => prCreate(REPO, {
        base: "story/901-x", head: "task/905-x", title: "t", body: "b", defaultBranch: "main",
      }),
      () => prCreate(REPO, {
        base: "main", head: "task/905-x", title: "t", body: "b", defaultBranch: "main",
      }), // refused (task targeting default) — still must not leak "merge"
      () => prReady(REPO, 21),
      () => prView(REPO, 21, ["state", "mergedAt", "mergeCommit"]),
      () => prView(REPO, 21, ["merged"]), // refused
      () => prList(REPO, { head: "task/905-x" }),
    ];

    let checked = 0;
    for (const call of calls) {
      const result = call() as { ok: boolean; value?: unknown; reason?: string };
      checked += 1;
      if (result.ok && Array.isArray(result.value)) {
        const argv = result.value as readonly string[];
        expect(argv.some((part) => part.toLowerCase() === "merge")).toBe(false);
        expect(argv.join(" ").toLowerCase()).not.toContain("pr merge");
      }
    }
    expect(checked).toBe(calls.length);
  });

  test("0 occurrences of the literal \"pr merge\" anywhere under packages/core/src/gh", () => {
    const dir = join(import.meta.dir, "../src/gh");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(join(dir, file), "utf8");
      expect(contents.toLowerCase()).not.toContain("pr merge");
    }
  });

  test("there is no field named merge, and no exported function whose name mentions merge", () => {
    const names = Object.keys(prModule);
    for (const name of names) {
      expect(name.toLowerCase()).not.toContain("merge");
    }
  });
});

describe("gh pr — hostile and malformed input returns a typed failure and never throws", () => {
  const throwingGetter = {} as Record<string, unknown>;
  Object.defineProperty(throwingGetter, "base", {
    enumerable: true,
    get(): string {
      throw new Error("boom");
    },
  });

  test("0 throws across the hostile corpus", () => {
    const calls: Array<() => { ok: boolean }> = [
      () => prCreate(REPO, null as never),
      () => prCreate(REPO, undefined as never),
      () => prCreate(REPO, {} as never),
      () => prCreate(REPO, throwingGetter as never),
      () => prCreate(REPO, { base: "main", head: "", title: "T", body: "B", defaultBranch: "main" }),
      () => prCreate(REPO, { base: "", head: "x", title: "T", body: "B", defaultBranch: "main" }),
      () => prCreate(REPO, { base: "main", head: "x", title: "", body: "B", defaultBranch: "main" }),
      () => prCreate(REPO, { base: "main", head: "x", title: "T", body: 1 as never, defaultBranch: "main" }),
      () => prCreate(REPO, { base: "main", head: "x", title: "T", body: "B", defaultBranch: "" }),
      () => prCreate(REPO, { base: "main", head: "x", title: "T", body: "B" } as never),
      () => prReady(REPO, -1),
      () => prReady(REPO, 0),
      () => prReady(REPO, 1.5),
      () => prReady(REPO, Number.NaN),
      () => prReady(REPO, "905" as never),
      () => prView(REPO, 1, []),
      () => prView(REPO, 1, null as never),
      () => prView(REPO, -1, ["state"]),
      () => prView(REPO, 1, [""]),
      () => prList(REPO, null as never),
      () => prList(REPO, {} as never),
      () => prList(REPO, { head: "" }),
      () => prList(REPO, { head: 1 as never }),
      () => branchSlug(null),
      () => branchSlug(undefined),
      () => branchSlug(42 as never),
      () => branchSlug(""),
      () => storyBranch(-1, "x"),
      () => storyBranch(1, null),
      () => taskBranch(Number.POSITIVE_INFINITY, "x"),
      () => bugBranch(1, {} as never),
      () => renderPrBody(null as never),
      () => renderPrBody(undefined as never),
      () => renderPrBody({} as never),
      () => renderPrBody({ kind: "bogus" as never }),
      () => renderPrBody({ kind: "integration", closes: [] }),
      () => renderPrBody({ kind: "integration", closes: [0, -1, 1.5] as never }),
      () => renderPrBody({ kind: "integration", closes: "901" as never }),
      () => renderPrBody({ kind: "task", refs: null as never }),
      () => renderPrBody({ kind: "task", blockedBy: [Number.NaN] as never }),
      () => renderPrBody({ kind: "task", body: 42 as never }),
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
    expect(failures).toBe(calls.length);
  });

  test("a shell metacharacter in a PR title is carried safely, not rejected", () => {
    const title = 'fix: `rm -rf /` && $(whoami) | tee "x"';
    const argv = value(
      prCreate(REPO, { base: "main", head: "story/901-x", title, body: "b", defaultBranch: "main" }),
    );
    expect(argv).toContain(title);
    expect(argv.filter((part) => part === title).length).toBe(1);
  });

  test("a newline in a PR body is preserved rather than split into two argv entries", () => {
    const body = "Closes #901\nCloses #905\n";
    const argv = value(
      prCreate(REPO, { base: "main", head: "story/901-x", title: "T", body, defaultBranch: "main" }),
    );
    expect(argv).toContain(body);
  });
});
