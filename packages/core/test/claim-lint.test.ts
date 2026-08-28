import { describe, expect, test } from "bun:test";
import {
  ISC_ALLOWED_PATHS,
  formatClaimId,
  isIscAllowed,
  lintClaimDocs,
  mapStory,
  parseClaimId,
} from "../src/guards/claim-lint";

const doc = (path: string, ...lines: string[]) => ({ path, source: lines.join("\n") });
const claims = (...bullets: string[]) => ["# Story", "", "## Claims", "", ...bullets, "", "## Build Targets"];
const CASE_HEADER = "| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |";
const CASE_SEP = "|---|------|------------|--------|----------|----------|---------|-------------|";

describe("parseClaimId", () => {
  test("case 17: CLAIM-194.10 parses as Story 194 claim 10, not 194.1 followed by 0", () => {
    expect(parseClaimId("CLAIM-194.10")).toEqual({ kind: "CLAIM", story: 194, n: 10 });
  });

  test("CLAIM-9.1 parses to Story 9 claim 1", () => {
    expect(parseClaimId("CLAIM-9.1")).toEqual({ kind: "CLAIM", story: 9, n: 1 });
  });

  test("NEVER-9.9 parses to Story 9 claim 9 of kind NEVER", () => {
    expect(parseClaimId("NEVER-9.9")).toEqual({ kind: "NEVER", story: 9, n: 9 });
  });

  test.each([
    ["CLAIM-9-4"],
    ["CLAIM-{story}.{n}"],
    ["claim-9.1"],
    ["CLAIM-09.1"],
    ["CLAIM-9.01"],
    ["CLAIM-9.1.2"],
    ["CLAIMS-9.1"],
    ["CLAIM-9."],
    ["CLAIM-"],
    ["CLAIM-9"],
    [""],
  ])("parseClaimId(%j) returns null", (token) => {
    expect(parseClaimId(token)).toBeNull();
  });

  test("formatClaimId round-trips through parseClaimId", () => {
    const id = parseClaimId("NEVER-194.7");
    expect(id).not.toBeNull();
    expect(formatClaimId(id!)).toBe("NEVER-194.7");
  });
});

describe("isIscAllowed", () => {
  test.each([
    ["docs/evidence/10-x.md"],
    ["docs/evidence/a/b/deep.md"],
    ["docs/design/stories/194.md"],
    ["docs/test-plans/194-plan.md"],
    ["docs/design/verification-pass.md"],
  ])("isIscAllowed(%j) is true", (path) => {
    expect(isIscAllowed(path)).toBe(true);
  });

  test("case 16: docs/design/verification-pass-2.md is not allow-listed; the list is closed, not a prefix match", () => {
    expect(isIscAllowed("docs/design/verification-pass-2.md")).toBe(false);
  });

  test.each([
    ["docs/design/01-skill-hierarchy.md"],
    ["docs/design/stories/9.md"],
    ["docs/evidence.md"],
  ])("isIscAllowed(%j) is false", (path) => {
    expect(isIscAllowed(path)).toBe(false);
  });

  test("ISC_ALLOWED_PATHS has exactly four entries", () => {
    expect(ISC_ALLOWED_PATHS.length).toBe(4);
  });
});

describe("lintClaimDocs isc-token rule", () => {
  test("case 12: a planted ISC- token in a non-allow-listed doc fires isc-token at the offending line", () => {
    const docs = [doc("docs/design/01-skill-hierarchy.md", "prose", "see ISC-1 here")];
    const violations = lintClaimDocs(docs);
    const v = violations.find((x) => x.rule === "isc-token");
    expect(v).toBeDefined();
    expect(v?.line).toBe(2);
    expect(v?.message).toContain("ISC-");
  });

  test.each([
    ["docs/evidence/10-x.md"],
    ["docs/design/stories/194.md"],
    ["docs/test-plans/194-plan.md"],
    ["docs/design/verification-pass.md"],
  ])("ISC- token in the allow-listed path %j produces no violation", (path) => {
    const docs = [doc(path, "see ISC-1 here")];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a fenced ISC- token in a non-allow-listed doc still fires isc-token", () => {
    const docs = [doc("docs/design/01-skill-hierarchy.md", "```", "ISC-1", "```")];
    const v = lintClaimDocs(docs).find((x) => x.rule === "isc-token");
    expect(v).toBeDefined();
  });
});

describe("lintClaimDocs identifier-malformed rule", () => {
  test("case 3: an unqualified CLAIM-9 bullet in a Story design fires identifier-malformed", () => {
    const docs = [doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9: unqualified"))];
    const v = lintClaimDocs(docs).find((x) => x.rule === "identifier-malformed");
    expect(v).toBeDefined();
  });

  test("a placeholder bullet CLAIM-{story}.{n} produces no violation", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-{story}.{n}: placeholder text")),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a malformed token in an anchors_to cell fires identifier-malformed", () => {
    const docs = [
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | some case | CLAIM-9-4 | iai-core | P0 | tool-checked | `x` | y |",
      ),
    ];
    const v = lintClaimDocs(docs).find((x) => x.rule === "identifier-malformed");
    expect(v).toBeDefined();
  });
});

describe("lintClaimDocs identifier-duplicate rule", () => {
  test("case 13: CLAIM-9.1 defined in the Claims of both stories/9.md and stories/12.md fires identifier-duplicate mentioning both files", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: original definition")),
      doc("docs/design/stories/12.md", ...claims("- [ ] CLAIM-9.1: planted duplicate")),
    ];
    const violations = lintClaimDocs(docs).filter((x) => x.rule === "identifier-duplicate");
    expect(violations.length).toBeGreaterThanOrEqual(1);
    const messages = violations.map((v) => v.message).join(" ");
    expect(messages).toContain("docs/design/stories/9.md");
    expect(messages).toContain("docs/design/stories/12.md");
  });

  test("case 21: a seed bullet in a milestone and a design definition for the same identifier are not a duplicate", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: design definition")),
      doc(
        "docs/milestones/M1.md",
        "# Milestone",
        "",
        "**Acceptance criteria** (these seed the Design claims):",
        "",
        "- [ ] CLAIM-9.1: seed text",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a bullet naming a foreign Story inside a Story design fires identifier-duplicate mentioning Story ownership", () => {
    const docs = [doc("docs/design/stories/12.md", ...claims("- [ ] CLAIM-77.1: x"))];
    const v = lintClaimDocs(docs).find((x) => x.rule === "identifier-duplicate");
    expect(v).toBeDefined();
    expect(v?.message).toContain("Story");
  });
});

describe("lintClaimDocs anticlaim-not-never rule", () => {
  test("case 14: an anti-claim written as CLAIM- with an Anti: marker fires anticlaim-not-never naming NEVER-9.7", () => {
    const docs = [doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.7: Anti: never x"))];
    const v = lintClaimDocs(docs).find((x) => x.rule === "anticlaim-not-never");
    expect(v).toBeDefined();
    expect(v?.message).toContain("NEVER-9.7");
  });

  test("case 5: an anti-claim correctly written as NEVER- with an Anti: marker produces no violation", () => {
    const docs = [doc("docs/design/stories/9.md", ...claims("- [ ] NEVER-9.7: Anti: never x"))];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a NEVER- bullet without an Anti: marker produces no violation; the marker is sufficient, not necessary", () => {
    const docs = [doc("docs/design/stories/194.md", ...claims("- [ ] NEVER-194.6: no marker here"))];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("case 20: a milestone seed carrying CLAIM- for a prohibition is out of scope for anticlaim-not-never", () => {
    const docs = [
      doc(
        "docs/milestones/M1.md",
        "# Milestone",
        "",
        "**Acceptance criteria** (these seed the Design claims):",
        "",
        "- [ ] CLAIM-15.6: No file under packages/core performs I/O",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });
});

describe("lintClaimDocs anchor-dangling rule", () => {
  test("case 15: a dangling anchors_to reference fires anchor-dangling naming CLAIM-9.99", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: the only definition")),
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | some case | CLAIM-9.99 | iai-core | P0 | tool-checked | `x` | y |",
      ),
    ];
    const v = lintClaimDocs(docs).find((x) => x.rule === "anchor-dangling");
    expect(v).toBeDefined();
    expect(v?.message).toContain("CLAIM-9.99");
  });

  test("case 6: an anchors_to reference that resolves to an existing definition produces no violation", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: the only definition")),
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | some case | CLAIM-9.1 | iai-core | P0 | tool-checked | `x` | y |",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a multi-value anchors_to cell with both identifiers defined produces no violation", () => {
    const docs = [
      doc(
        "docs/design/stories/9.md",
        ...claims("- [ ] CLAIM-9.1: def one", "- [ ] NEVER-9.9: def two"),
      ),
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | some case | CLAIM-9.1, NEVER-9.9 | iai-core | P0 | tool-checked | `x` | y |",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a multi-value anchors_to cell with only one identifier defined fires exactly one anchor-dangling", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: def one")),
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | some case | CLAIM-9.1, NEVER-9.9 | iai-core | P0 | tool-checked | `x` | y |",
      ),
    ];
    const violations = lintClaimDocs(docs).filter((x) => x.rule === "anchor-dangling");
    expect(violations.length).toBe(1);
  });

  test("case 7: a Coverage table row that resolves to a defined identifier produces no violation", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: the only definition")),
      doc(
        "docs/test-plans/9-plan.md",
        "| Claim | Cases | Priority |",
        "|-------|-------|----------|",
        "| CLAIM-9.1 | 1, 2 | P0 |",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("case 7: a Coverage table row that does not resolve fires anchor-dangling", () => {
    const docs = [
      doc(
        "docs/test-plans/9-plan.md",
        "| Claim | Cases | Priority |",
        "|-------|-------|----------|",
        "| CLAIM-9.1 | 1, 2 | P0 |",
      ),
    ];
    const v = lintClaimDocs(docs).find((x) => x.rule === "anchor-dangling");
    expect(v).toBeDefined();
  });

  test("identifiers in the Command/Passes-when columns are fixtures, not anchors: a valid anchors_to alongside a planted anchors_to token in Command produces no violation", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: the only definition")),
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | some case | CLAIM-9.1 | iai-core | P0 | tool-checked | plant `anchors_to: CLAIM-9.99` | y |",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("an escaped pipe in the Case column before anchors_to does not shift the column read", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: the only definition")),
      doc(
        "docs/test-plans/9-plan.md",
        CASE_HEADER,
        CASE_SEP,
        "| 1 | a case naming `\\| Claims \\|` | CLAIM-9.1 | iai-core | P1 | human-attested | review | 43/43 |",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });
});

describe("lintClaimDocs tokenisation robustness", () => {
  test.each([
    ["possessive form CLAIM-9.6's", "CLAIM-9.6's reconciliation pass"],
    ["adjectival form CLAIM-950.4-style", "the CLAIM-950.4-style approach"],
    ["trailing period CLAIM-901.2.", "see CLAIM-901.2."],
    ["en-dash range `CLAIM-9.1`\u2013`CLAIM-9.6`", "spans `CLAIM-9.1`\u2013`CLAIM-9.6`"],
    ["asymmetric en-dash `CLAIM-9.1`\u20139.6", "spans `CLAIM-9.1`\u20139.6"],
    ["spaced range CLAIM-901.1 .. CLAIM-901.6", "spans CLAIM-901.1 .. CLAIM-901.6"],
    ["cross-prefix range CLAIM-9.1..NEVER-9.9", "spans CLAIM-9.1..NEVER-9.9"],
    ["abbreviated range CLAIM-9.1..6", "spans CLAIM-9.1..6"],
  ])("%s in prose produces no violation", (_name, proseLine) => {
    const docs = [doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: the only definition"), "", proseLine)];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("phantom negative example ISC-9 -> NEVER-9.9, not NEVER-9.1 in prose produces no violation", () => {
    // Placed in docs/design/stories/194.md, which is on the isc-token
    // allow-list, because the fixture line itself carries the literal
    // ISC- token this rule bans everywhere else.
    const docs = [
      doc(
        "docs/design/stories/194.md",
        ...claims("- [ ] CLAIM-194.1: the only definition"),
        "",
        "ISC-9 -> NEVER-9.9, not NEVER-9.1",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("an (after:) annotation on a definition line produces no violation", () => {
    const docs = [
      doc(
        "docs/design/stories/9.md",
        ...claims("- [ ] CLAIM-9.2: some prose that depends on it (after: CLAIM-9.1)"),
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });

  test("a CLAIM-9.4 line inside a fenced code block produces no definition and no violation", () => {
    const docs = [
      doc(
        "docs/design/stories/194.md",
        ...claims("- [ ] CLAIM-194.1: the only definition"),
        "",
        "```",
        "CLAIM-9.4    tool-checked   lint fails a core file importing an adapter",
        "```",
      ),
    ];
    expect(lintClaimDocs(docs)).toEqual([]);
  });
});

describe("mapStory", () => {
  test("case 4: mapStory returns Story 9's nine identifiers ascending by n, CLAIM for 1-6 and NEVER for 7-9", () => {
    const docs = [
      doc(
        "docs/design/stories/9.md",
        ...claims(
          "- [ ] CLAIM-9.1: a",
          "- [ ] CLAIM-9.2: b",
          "- [ ] CLAIM-9.3: c",
          "- [ ] CLAIM-9.4: d",
          "- [ ] CLAIM-9.5: e",
          "- [ ] CLAIM-9.6: f",
          "- [ ] NEVER-9.7: Anti: g",
          "- [ ] NEVER-9.8: Anti: h",
          "- [ ] NEVER-9.9: Anti: i",
        ),
      ),
    ];
    const ids = mapStory(9, docs);
    expect(ids.length).toBe(9);
    expect(ids.map((id) => id.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ids.slice(0, 6).every((id) => id.kind === "CLAIM")).toBe(true);
    expect(ids.slice(6).every((id) => id.kind === "NEVER")).toBe(true);
  });

  test("mapStory on a Story with no design document returns an empty array", () => {
    const docs = [doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: a"))];
    expect(mapStory(12, docs)).toEqual([]);
  });

  test("mapStory ignores bullets belonging to other Stories' files", () => {
    const docs = [
      doc("docs/design/stories/9.md", ...claims("- [ ] CLAIM-9.1: a")),
      doc("docs/design/stories/12.md", ...claims("- [ ] CLAIM-12.1: b")),
    ];
    const ids = mapStory(9, docs);
    expect(ids).toEqual([{ kind: "CLAIM", story: 9, n: 1 }]);
  });
});

describe("lintClaimDocs whole-corpus regression", () => {
  test("lintClaimDocs([]) returns no violations", () => {
    expect(lintClaimDocs([])).toEqual([]);
  });
});
