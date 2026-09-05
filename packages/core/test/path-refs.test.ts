import { describe, expect, test } from "bun:test";
import { extractPathRefs, lintPathRefs, staleAllowListEntries } from "../src/guards/path-refs";
import { PATH_ALLOW_LIST, isPathAllowed } from "../src/guards/path-allowlist";

const known = new Set([
  "docs",
  "docs/design",
  "docs/design/stories",
  "docs/design/stories/194.md",
  "docs/design/verification-pass.md",
  "docs/test-plans",
  "docs/test-plans/194-plan.md",
  "docs/milestones",
  "docs/milestones/M1.md",
  "packages",
  "packages/core",
  "packages/core/src",
  "packages/core/src/guards",
  "packages/core/src/guards/path-refs.ts",
  "skills",
  "references",
  "scripts",
  ".github",
]);

const doc = (path: string, ...lines: string[]) => ({ path, source: lines.join("\n") });
const run = (docs: ReturnType<typeof doc>[], extra: Record<string, unknown> = {}) =>
  lintPathRefs(docs, { knownPaths: known, ignoredPrefixes: ["USER/"], ...extra });

describe("lintPathRefs basic resolution", () => {
  test("a citation of an existing path produces no violation", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/design/stories/194.md` for detail")];
    expect(run(docs)).toEqual([]);
  });

  test("a citation of a non-existent path produces one violation naming the path", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/design/stories/888.md` for detail")];
    const violations = run(docs);
    expect(violations.length).toBe(1);
    expect(violations[0]?.message).toContain("docs/design/stories/888.md");
  });

  test("#210 done-when 3: a citation of docs/design/stories/999.md fires, and the message names the path", () => {
    const docs = [doc("docs/design/01-x.md", "planted: `docs/design/stories/999.md`")];
    const violations = run(docs);
    expect(violations.length).toBe(1);
    expect(violations[0]?.message).toContain("docs/design/stories/999.md");
  });
});

describe("lintPathRefs citation shapes", () => {
  test.each([
    ["inline code span", "see `docs/design/stories/888.md` here"],
    ["markdown link", "see [the doc](docs/design/stories/888.md) here"],
  ])("%s fires a violation naming the dangling path", (_name, line) => {
    const docs = [doc("docs/design/01-x.md", line)];
    const violations = run(docs);
    expect(violations.length).toBe(1);
    expect(violations[0]?.message).toContain("docs/design/stories/888.md");
  });
});

describe("lintPathRefs trailing line-number suffixes", () => {
  test("a :LINE suffix is stripped before resolution", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/design/stories/194.md:5` here")];
    expect(run(docs)).toEqual([]);
  });

  test("a :LINE-START-END suffix is stripped before resolution", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/design/stories/194.md:5-10` here")];
    expect(run(docs)).toEqual([]);
  });
});

describe("lintPathRefs candidate shape requirements", () => {
  test("a candidate with no `/` is never a candidate", () => {
    expect(extractPathRefs("see `loader.ts` and `Cargo.toml` here")).toEqual([]);
  });

  test("non-markdown docs are skipped entirely", () => {
    const docs = [
      doc("packages/core/src/guards/path-refs.ts", "// see docs/design/stories/999.md"),
    ];
    expect(run(docs)).toEqual([]);
  });
});

describe("lintPathRefs exclusion classes", () => {
  test("exclusion 1: citing file under docs/evidence/ produces no violation", () => {
    const docs = [doc("docs/evidence/1-x.md", "see `docs/design/stories/999.md` here")];
    expect(run(docs)).toEqual([]);
  });

  test("exclusion 2: cited target under docs/evidence/ produces no violation", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/evidence/999-x.md` here")];
    expect(run(docs)).toEqual([]);
  });

  test.each([
    ["`{}` template", "see `docs/design/stories/{issue}.md` here"],
    ["`<>` template", "see `docs/design/NN-domain-<id>.md` here"],
  ])("exclusion 3: %s placeholder produces no violation", (_name, line) => {
    const docs = [doc("docs/design/01-x.md", line)];
    expect(run(docs)).toEqual([]);
  });

  test("exclusion 4: a glob produces no violation", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/milestones/M*.md` here")];
    expect(run(docs)).toEqual([]);
  });

  test("exclusion 5: range notation produces no violation", () => {
    const docs = [doc("docs/design/01-x.md", "see `docs/milestones/M1..M8.md` here")];
    expect(run(docs)).toEqual([]);
  });

  test.each([
    ["40-hex SHA", "1234567890abcdef1234567890abcdef12345678"],
    ["8-hex short SHA (a {40}-only rule would wrongly flag this)", "4f2a1c9e"],
  ])("exclusion 6: a SHA-pinned permalink target is never reported (%s)", (_name, sha) => {
    const docs = [
      doc(
        "docs/design/01-x.md",
        `see https://github.com/dev-pmallapp/iAI/blob/${sha}/docs/design/stories/999.md for history.`,
      ),
    ];
    expect(run(docs)).toEqual([]);
  });

  test("exclusion 7: citing file is docs/design/verification-pass.md produces no violation", () => {
    const docs = [doc("docs/design/verification-pass.md", "see `agents/forge-coder.md` here")];
    expect(run(docs)).toEqual([]);
  });

  test("exclusion 7: the test plan may name a dangling path, because specifying a test for one requires naming one", () => {
    // Cases 23 and 24 read "plant `docs/design/stories/888.md`". The guard
    // cannot distinguish an instruction to create a dangling citation from a
    // dangling citation. Same reasoning, on the same file, that CLAIM-194.1
    // already uses to allow-list it for the retired token.
    const docs = [
      doc("docs/test-plans/194-plan.md", "plant `docs/design/stories/888.md` in a design doc"),
    ];
    expect(run(docs)).toEqual([]);
  });

  test("the exemption is per-document, so the same path still fails elsewhere — #210 done-when 3", () => {
    // If 888.md/999.md were allow-listed instead of the document exempted, the
    // planted-path requirement could never be met.
    const docs = [doc("docs/design/01-x.md", "see `docs/design/stories/999.md` here")];
    const violations = run(docs);
    expect(violations.length).toBe(1);
    expect(violations[0]?.message).toContain("docs/design/stories/999.md");
  });

  test("exclusion 8: a path under an ignoredPrefixes entry produces no violation", () => {
    const docs = [doc("docs/design/01-x.md", "see `USER/GOALS/GOALS.md` here")];
    expect(run(docs)).toEqual([]);
  });
});

describe("lintPathRefs false-positive families", () => {
  test.each([
    ["mg/dL"],
    ["mmol/L"],
    ["10.0.0.0/8"],
    ["192.168.0.0/16"],
    ["amd-anthropic/Claude-Opus-5"],
    ["@opencode-ai/plugin"],
    ["owner/repo"],
    ["provider/model-id"],
    ["story/901-apob-protocol"],
    ["task/41-momentum-oos-window"],
    ["dev/code-review"],
    ["trade/backtest"],
    ["180/300"],
    ["tier-B/C"],
    ["tmp/LifeOS"],
    ["MEMORY/canon.jsonl"],
  ])("%s produces no violation", (token) => {
    const docs = [doc("docs/design/01-x.md", `see ${token} in prose`)];
    expect(run(docs)).toEqual([]);
  });
});

describe("extractPathRefs", () => {
  test.each([
    ["inline code span", "see `docs/design/stories/194.md` here", "docs/design/stories/194.md"],
    ["markdown link", "see [t](docs/design/stories/194.md) here", "docs/design/stories/194.md"],
    ["bare prose", "see docs/design/stories/194.md here", "docs/design/stories/194.md"],
  ])("returns the candidate for a %s citation", (_name, line, expected) => {
    expect(extractPathRefs(line)).toContain(expected);
  });

  test("returns [] for a line with no path-shaped candidate", () => {
    expect(extractPathRefs("nothing to see here")).toEqual([]);
  });
});

describe("isPathAllowed", () => {
  test.each([
    // Was `references/gh-operations.md` until S2.1 retired it (task #36). The
    // canonical `planned` fixture must be a path this Story does NOT create,
    // or it is deleted out from under the case that depends on it.
    ["skills/dev/domain.md", "planned"],
    ["docs/design/stories/901.md", "fiction"],
    ["docs/design/9-isa.md", "historical"],
    ["skills/trade/backtest/SKILL.md", "defective"],
    [".opencode/skills", "external"],
  ])("isPathAllowed(%j) is true (%s)", (path) => {
    expect(isPathAllowed(path)).toBe(true);
  });

  test("isPathAllowed for a non-allow-listed dangling path is false", () => {
    expect(isPathAllowed("docs/design/stories/999.md")).toBe(false);
  });
});

describe("PATH_ALLOW_LIST integrity", () => {
  test("every planned entry has a non-empty milestone", () => {
    for (const entry of PATH_ALLOW_LIST) {
      if (entry.reason === "planned") {
        expect(entry.milestone).toBeTruthy();
      }
    }
  });

  test.each(["fiction", "historical", "defective", "external"] as const)(
    "no %s entry has a milestone",
    (reason) => {
      for (const entry of PATH_ALLOW_LIST) {
        if (entry.reason === reason) {
          expect(entry.milestone).toBeUndefined();
        }
      }
    },
  );

  test("every entry has a non-empty note", () => {
    for (const entry of PATH_ALLOW_LIST) {
      expect(entry.note).toBeTruthy();
    }
  });

  test("paths are unique", () => {
    const paths = PATH_ALLOW_LIST.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test("every milestone matches /^M[1-8]$/", () => {
    for (const entry of PATH_ALLOW_LIST) {
      if (entry.milestone !== undefined) {
        expect(entry.milestone).toMatch(/^M[1-8]$/);
      }
    }
  });
});


// ---------------------------------------------------------------------------
// #277 — the allow-list is meant to SHRINK, and nothing made it.
//
// Six of 43 entries named paths that had come into existence, five of them
// across four merged Stories. Every Story had a defensible reason not to touch
// the list, which is exactly why the fix is a guard rather than a cleanup.
// ---------------------------------------------------------------------------

describe("staleAllowListEntries — an entry whose path exists is stale", () => {
  test("an entry is reported once its path appears in knownPaths", () => {
    const entry = PATH_ALLOW_LIST[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    expect(staleAllowListEntries(new Set([entry.path])).map((e) => e.path)).toEqual([entry.path]);
  });

  test("nothing is reported when no allow-listed path exists", () => {
    // The steady state, and the one the repo must hold at.
    expect(staleAllowListEntries(new Set(["docs", "packages", "no/such/path"]))).toEqual([]);
  });

  test("the rule is uniform across every reason, not special-cased to planned", () => {
    // All six stale entries found in practice were `planned`, which makes it
    // tempting to check only that reason. `fiction` asserts the path will
    // NEVER exist, so a fiction entry whose path exists is a sharper
    // contradiction, not a lesser one.
    const reasons = new Set(PATH_ALLOW_LIST.map((e) => e.reason));
    expect(reasons.size).toBeGreaterThan(1);

    for (const reason of reasons) {
      const sample = PATH_ALLOW_LIST.find((e) => e.reason === reason);
      expect(sample).toBeDefined();
      if (sample === undefined) continue;
      expect(
        staleAllowListEntries(new Set([sample.path])).map((e) => e.path),
        `reason "${reason}" must be reported when its path exists`,
      ).toEqual([sample.path]);
    }
  });

  test("the real repo has no stale entries, over a non-zero denominator", () => {
    // ASSERT THE DENOMINATOR — as a SHAPE, not a literal floor.
    //
    // This read `toBeGreaterThan(30)` until S2.1. That is a magic number on a
    // list whose own header states it is meant to SHRINK as planned paths come
    // into existence (issue #277). S2.1 retires twelve `references/` entries and
    // takes the list from 37 to 25, so the literal floor breaks at the THIRD of
    // five document tasks — a guard failing because the thing it guards is
    // working as designed. Lowering the number would re-arm the identical trap
    // for the next Story that retires a family.
    //
    // The property the floor was reaching for is "the stale check ran over a
    // non-empty, non-degenerate corpus". Every declared `AllowReason` still
    // being represented expresses that, and it survives any single family
    // draining to zero: `planned` outlives the `references/` family via the
    // `packages/`, `skills/` and `docs/parity/` entries.
    //
    // An emptied or gutted list cannot satisfy it, which is the whole point.
    const reasonsPresent = new Set(PATH_ALLOW_LIST.map((e) => e.reason));
    expect(
      [...reasonsPresent].sort(),
      "every AllowReason must still be represented, or the corpus is degenerate",
    ).toEqual(["defective", "external", "fiction", "historical", "planned"]);
    expect(PATH_ALLOW_LIST.length).toBeGreaterThanOrEqual(reasonsPresent.size);

    // Read via import.meta.dir, never a bare relative path.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const repoRoot = path.join(import.meta.dir, "../../..");

    const existing = new Set(
      PATH_ALLOW_LIST.map((e) => e.path).filter((p) => fs.existsSync(path.join(repoRoot, p))),
    );
    expect(staleAllowListEntries(existing).map((e) => e.path)).toEqual([]);
  });

  test("every allow-listed path is genuinely absent from the tree", () => {
    // The converse of the case above, stated positively so it fails loudly
    // rather than by an empty array that could also mean "nothing was checked".
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const repoRoot = path.join(import.meta.dir, "../../..");

    const present = PATH_ALLOW_LIST.map((e) => e.path).filter((p) =>
      fs.existsSync(path.join(repoRoot, p)),
    );
    expect(present).toEqual([]);
  });
});

// The header count was wrong by five for three milestones because it was prose.
// Parsing it turns the comment into an assertion.
describe("path-allowlist — the stated counts match the real entries", () => {
  function source(): string {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    return fs.readFileSync(path.join(import.meta.dir, "../src/guards/path-allowlist.ts"), "utf8");
  }

  test("the header's total matches PATH_ALLOW_LIST.length", () => {
    const m = /(\w+) families, (\d+) entries\./.exec(source());
    expect(m).not.toBeNull();
    expect(Number(m?.[2])).toBe(PATH_ALLOW_LIST.length);
  });

  test("the header's family count matches the number of family sections", () => {
    const WORDS: Record<string, number> = { Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9 };
    const text = source();
    const m = /(\w+) families, (\d+) entries\./.exec(text);
    const sections = [...text.matchAll(/^\s*\/\/ --- .+? -+$/gm)].length;

    expect(sections).toBeGreaterThan(0);
    expect(WORDS[m?.[1] ?? ""]).toBe(sections);
  });

  test("each family header's own count matches the entries beneath it", () => {
    // The per-family numbers drift the same way the total did. `packages/**`
    // said 9 while holding 3 after #277's retirements.
    const lines = source().split("\n");
    const mismatches: string[] = [];
    let current: { name: string; stated: number } | null = null;
    let seen = 0;

    const flush = (): void => {
      if (current !== null && current.stated !== seen) {
        mismatches.push(`${current.name}: header says ${String(current.stated)}, found ${String(seen)}`);
      }
    };

    for (const line of lines) {
      const header = /^\s*\/\/ --- (.+?) — (\d+) paths?/.exec(line);
      if (header !== null) {
        flush();
        current = { name: header[1] ?? "?", stated: Number(header[2]) };
        seen = 0;
        continue;
      }
      if (/^\s*path: "/.test(line)) seen += 1;
    }
    flush();

    expect(mismatches).toEqual([]);
  });
});
