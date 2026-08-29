import { describe, expect, test } from "bun:test";
import { extractPathRefs, lintPathRefs } from "../src/guards/path-refs";
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
    ["references/gh-operations.md", "planned"],
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

