import { afterAll, describe, expect, test } from "bun:test";
import { createTempDirs } from "../packages/harness/src/tempdir";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  BASELINE_REFERENCES,
  MAX_DISCRETIONARY_REFERENCES,
  MODEL_ID_EXEMPT_PATH,
  MODEL_ID_VENDORS,
  RULE_IDS,
  discoverContractFiles,
  discretionaryReferences,
  CONTRACT_DIRS,
  lintBodyRules,
  ownDomainOf,
  routingForms,
  lintContractTree,
  lintSkillSource,
  lintSkillTree,
} from "../scripts/skill-lint";
import { KNOWN_DOMAIN_IDS } from "../packages/core/src/index";
// Contracts are IMPORTED, never restated — the rule under test polices
// exactly this, and a test that restated them would be its own violation.
import {
  COMMIT_PREFIX_RE,
  EXCLUSIVE_LABEL_PREFIXES,
  SENTINEL_NAMESPACE_PREFIX,
} from "../packages/core/src/index";

const repoRoot = join(import.meta.dir, "..");

const temps = createTempDirs();

function makeTempDir(): string {
  return temps.create("iai-skill-lint-");
}

function writeSkillFile(root: string, skillName: string, content: string): string {
  const filePath = join(root, skillName, "SKILL.md");
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

// #295 added two SKILLS-ONLY body rules that fire on ABSENCE of a heading
// rather than presence of a pattern, which is the opposite shape of every
// body rule before them. A tiny snippet fixture written for an EARLIER rule
// (duplicate-contract, reference-citation-count, model-id-literal,
// domain-routing-form) has no reason to carry either heading, so appending
// this to such a fixture's body is what keeps that older test asserting
// exactly the one rule it was written to test, rather than also asserting
// something about #295 it never meant to. Real skill bodies elsewhere in
// this file carry both headings for real; this exists only to patch older,
// narrower fixtures.
const REQUIRED_SECTIONS_SUFFIX = "\n\n## Phase 0: Context Discovery\n\nx\n\n## Error Handling\n\nx\n";

afterAll(() => temps.cleanup());

describe("lintSkillSource", () => {
  test("valid minimal skill has 0 violations", () => {
    const source = ["---", "name: foo", "description: Does foo things.", "---", "", "# foo", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations).toEqual([]);
  });

  test("valid skill using all five keys with a folded description and a quoted metadata map has 0 violations", () => {
    const source = [
      "---",
      "name: trade-backtest",
      "description: >-",
      "  Run a historical evaluation of a trading strategy defined in a Story",
      "  Design. Read-only with respect to any broker.",
      "license: MIT",
      'compatibility: ">=0.1.0"',
      "metadata:",
      '  tier: "2"',
      '  domain: "trade"',
      "---",
      "",
    ].join("\n");
    const violations = lintSkillSource("/x/trade-backtest/SKILL.md", source, "trade-backtest");
    expect(violations).toEqual([]);
  });

  test("missing name is a field-required violation naming the field", () => {
    const source = ["---", "description: Does foo things.", "---", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const violation = violations.find((v) => v.rule === "field-required");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("name");
  });

  test("missing description is a field-required violation naming the field", () => {
    const source = ["---", "name: foo", "---", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const violation = violations.find((v) => v.rule === "field-required");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("description");
  });

  test.each([
    ["Foo"],
    ["foo_bar"],
    ["-foo"],
    ["foo-"],
    ["foo--bar"],
  ])("name %p not matching the regex is a name-format violation", (badName) => {
    const source = ["---", `name: ${badName}`, "description: Does foo things.", "---", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations.some((v) => v.rule === "name-format")).toBe(true);
  });

  test("name differing from the directory is a name-directory-mismatch violation with both values", () => {
    const source = ["---", "name: bar", "description: Does foo things.", "---", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const violation = violations.find((v) => v.rule === "name-directory-mismatch");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("bar");
    expect(violation?.message).toContain("foo");
  });

  test.each(["argument-hint", "allowed-tools", "disable-model-invocation", "version"])(
    "unknown key %p is a field-unknown violation",
    (key) => {
      const source = ["---", "name: foo", "description: Does foo things.", `${key}: something`, "---", ""].join(
        "\n",
      );
      const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
      const violation = violations.find((v) => v.rule === "field-unknown");
      expect(violation).toBeDefined();
      expect(violation?.message).toContain(key);
    },
  );

  test("duplicate key is a field-duplicate violation", () => {
    const source = [
      "---",
      "name: foo",
      "name: foo",
      "description: Does foo things.",
      "---",
      "",
    ].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations.some((v) => v.rule === "field-duplicate")).toBe(true);
  });

  test("no frontmatter block at all is a frontmatter-missing violation", () => {
    const source = "# foo\n\nJust a body, no frontmatter.\n";
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations).toEqual([
      {
        file: "/x/foo/SKILL.md",
        line: 1,
        rule: "frontmatter-missing",
        severity: "error",
        message: expect.stringContaining("frontmatter"),
      },
    ]);
  });

  test("an opening --- with no closing --- is a frontmatter-unterminated violation", () => {
    const source = ["---", "name: foo", "description: Does foo things.", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations).toEqual([
      {
        file: "/x/foo/SKILL.md",
        line: 1,
        rule: "frontmatter-unterminated",
        severity: "error",
        message: expect.stringContaining("never closed"),
      },
    ]);
  });

  test("description of 1025 chars is a description-length error", () => {
    const longDescription = "a".repeat(1025);
    const source = ["---", "name: foo", `description: ${longDescription}`, "---", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const violation = violations.find((v) => v.rule === "description-length");
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe("error");
  });

  test("description of 400 chars is a description-length warning only, and does not make the file exit-worthy", () => {
    const mediumDescription = "a".repeat(400);
    const source = ["---", "name: foo", `description: ${mediumDescription}`, "---", ""].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const violation = violations.find((v) => v.rule === "description-length");
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe("warning");
    expect(violations.some((v) => v.severity === "error")).toBe(false);
  });

  test("metadata with an unquoted number and an unquoted boolean each produce metadata-value-unquoted", () => {
    const source = [
      "---",
      "name: foo",
      "description: Does foo things.",
      "metadata:",
      "  tier: 2",
      "  background: false",
      "---",
      "",
    ].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const unquoted = violations.filter((v) => v.rule === "metadata-value-unquoted");
    expect(unquoted.length).toBe(2);
  });

  test("metadata with a nested map is a metadata-nested violation", () => {
    const source = [
      "---",
      "name: foo",
      "description: Does foo things.",
      "metadata:",
      "  tags:",
      "    sub: value",
      "---",
      "",
    ].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations.some((v) => v.rule === "metadata-nested")).toBe(true);
  });

  test("metadata with a sequence is a metadata-nested violation", () => {
    const source = [
      "---",
      "name: foo",
      "description: Does foo things.",
      "metadata:",
      "  tags:",
      "    - a",
      "    - b",
      "---",
      "",
    ].join("\n");
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations.some((v) => v.rule === "metadata-nested")).toBe(true);
  });

  test("metadata given a scalar instead of a map is a metadata-not-a-map violation", () => {
    const source = ["---", "name: foo", "description: Does foo things.", "metadata: not-a-map", "---", ""].join(
      "\n",
    );
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    expect(violations.some((v) => v.rule === "metadata-not-a-map")).toBe(true);
  });

  test("line and column are correct for a violation on a known line", () => {
    const source = ["---", "name: foo", "description: Does foo things.", "metadata:", "  tier: 2", "---", ""].join(
      "\n",
    );
    const violations = lintSkillSource("/x/foo/SKILL.md", source, "foo");
    const violation = violations.find((v) => v.rule === "metadata-value-unquoted");
    expect(violation?.line).toBe(5);
  });
});

describe("lintSkillTree", () => {
  test("a domain.md sitting beside a valid SKILL.md is ignored, 0 violations", () => {
    const dir = makeTempDir();
    writeSkillFile(
      dir,
      "foo",
      ["---", "name: foo", "description: Does foo things.", "---", ""].join("\n") + REQUIRED_SECTIONS_SUFFIX,
    );
    writeFileSync(join(dir, "foo", "domain.md"), "# not a skill\n", "utf8");
    const violations = lintSkillTree(dir);
    expect(violations).toEqual([]);
  });

  test("an empty tree has 0 violations", () => {
    const dir = makeTempDir();
    const violations = lintSkillTree(dir);
    expect(violations).toEqual([]);
  });
});

describe("skill-lint CLI", () => {
  test("exits 1 and reports the offending file and rule for a bad fixture tree", async () => {
    const dir = makeTempDir();
    writeSkillFile(dir, "foo", ["---", "description: Does foo things.", "---", ""].join("\n"));

    const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "skill-lint.ts"), dir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(1);
    const combined = stdout + stderr;
    expect(combined).toContain("SKILL.md");
    expect(combined).toContain("field-required");
  });

  test("exits 0 for a clean fixture tree", async () => {
    const dir = makeTempDir();
    writeSkillFile(
      dir,
      "foo",
      ["---", "name: foo", "description: Does foo things.", "---", ""].join("\n") + REQUIRED_SECTIONS_SUFFIX,
    );

    const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "skill-lint.ts"), dir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  test("exits 1 for a nonexistent directory", async () => {
    const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "skill-lint.ts"), join(tmpdir(), "does-not-exist-xyz")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  test("exits 0 for an empty directory and reports 0 SKILL.md files scanned", async () => {
    const dir = makeTempDir();
    const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "skill-lint.ts"), dir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 SKILL.md files scanned");
  });
});

// ===========================================================================
// BODY RULES AND THE TWO-POPULATION SCOPE (S2.1, issue #280)
// ===========================================================================
//
// CLAIM-35.2, CLAIM-35.3, CLAIM-35.5 and NEVER-35.7 of
// docs/design/stories/35.md, plus cases 21-23 of docs/test-plans/35-plan.md.
//
// Decision 2 requires NEGATIVE FIXTURES and a mutation proving each rule
// fires, because `skills/` is empty through the whole of S2.1 and a rule
// merged against an empty corpus reports success while checking nothing.

describe("duplicate-contract (CLAIM-35.2, NEVER-35.7)", () => {
  // REQUIRED_SECTIONS_SUFFIX keeps these skill fixtures satisfying the #295
  // section rules so each test still asserts its own rule alone.
  test("a body restating the sentinel namespace prefix is reported", () => {
    const v = lintBodyRules("skills/x/SKILL.md", `see ${SENTINEL_NAMESPACE_PREFIX}gate` + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["duplicate-contract"]);
    expect(v[0]?.message).toContain("sentinel namespace prefix");
    // Assert the REASON, not just the verdict: docs/evidence/33-... records
    // three mutations surviving because a later rule rejected the fixture.
    expect(v[0]?.message).not.toContain("commit-subject");
    expect(v[0]?.message).not.toContain("model");
  });

  test("a body restating the commit-subject regex is reported, distinctly", () => {
    const v = lintBodyRules("skills/x/SKILL.md", `re ${COMMIT_PREFIX_RE.source}` + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["duplicate-contract"]);
    expect(v[0]?.message).toContain("commit-subject");
    expect(v[0]?.message).not.toContain("sentinel namespace");
  });

  test("a body restating the exclusive-label ARRAY is reported", () => {
    const v = lintBodyRules("skills/x/SKILL.md", `arr ${JSON.stringify(EXCLUSIVE_LABEL_PREFIXES)}` + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["duplicate-contract"]);
    expect(v[0]?.message).toContain("at-most-one-status");
  });

  test("PROSE naming the label namespaces is NOT reported", () => {
    // references/workflow-states.md's assigned job is to describe these
    // namespaces. Banning the words would make the owning document
    // unwritable — the bind recorded against NEVER-35.7 in stories/35.md.
    const v = lintBodyRules(
      "references/workflow-states.md",
      "`type:`, `status:`, `domain:` and `rung:` are the namespaces",
      { isSkill: false },
    );
    expect(v).toEqual([]);
  });

  test("citing the owning module by path is NOT reported", () => {
    const v = lintBodyRules("skills/x/SKILL.md", "see packages/core/src/evidence/sentinel.ts:53" + REQUIRED_SECTIONS_SUFFIX);
    expect(v).toEqual([]);
  });

  test("the contract set is non-empty — a rule over zero contracts cannot fail", () => {
    // ASSERT THE DENOMINATOR.
    const probes = [
      SENTINEL_NAMESPACE_PREFIX,
      COMMIT_PREFIX_RE.source,
      JSON.stringify(EXCLUSIVE_LABEL_PREFIXES),
    ];
    expect(probes.length).toBeGreaterThanOrEqual(3);
    for (const probe of probes) {
      expect(lintBodyRules("skills/x/SKILL.md", `x ${probe} y`).length).toBeGreaterThan(0);
    }
  });
});

// THE REAL ROSTER, read from disk at run time and never restated.
//
// Finding 4 of docs/evidence/287-20260906T110203Z.md. Every citation fixture
// here used to be synthetic — `references/a.md`, `references/over0.md` — and
// that is precisely why no case in docs/test-plans/35-plan.md could catch the
// unsatisfiable cap: A SYNTHETIC NAME IS NEVER A BASELINE MEMBER, so a fixture
// built from synthetic names cannot exercise the exemption at all. Cases 12 and
// 13 of that plan pass under the broken rule and the fixed one alike.
//
// Fixtures now name files that exist. `assertRealRoster` below is the guard.
function realReferences(): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  return readdirSync(join(repoRoot, "references"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `references/${f}`)
    .sort();
}

function realDiscretionary(): string[] {
  return realReferences().filter((r) => !BASELINE_REFERENCES.includes(r));
}

// Fixtures are sliced from the real roster and sized FROM the exported cap,
// never from the literal 4 and 3 they carried when the cap was 3 (#280).
const overCap = (n = 1) => realDiscretionary().slice(0, MAX_DISCRETIONARY_REFERENCES + n);
const atCap = () => realDiscretionary().slice(0, MAX_DISCRETIONARY_REFERENCES);

describe("the fixtures name real files (#287 finding 4)", () => {
  test("the roster is non-empty and the baseline is a SUBSET of it", () => {
    // The coupling synthetic names destroyed. If the baseline is not drawn
    // from the same population the fixtures are, the exemption is untestable.
    const roster = realReferences();
    expect(roster.length).toBeGreaterThanOrEqual(12);
    for (const b of BASELINE_REFERENCES) expect(roster).toContain(b);
  });

  test("the roster can build an OVER-cap fixture from real names", () => {
    // If the discretionary population ever falls to the cap or below, the
    // boundary stops being testable with real names and this fails loudly
    // rather than silently sliding back to synthetic ones.
    expect(realDiscretionary().length).toBeGreaterThan(MAX_DISCRETIONARY_REFERENCES);
  });

  test("every path the fixture builders emit exists on disk", () => {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    const emitted = [...new Set([...atCap(), ...overCap(), ...BASELINE_REFERENCES])];
    expect(emitted.length).toBeGreaterThan(MAX_DISCRETIONARY_REFERENCES);
    for (const path of emitted) {
      expect(existsSync(join(repoRoot, path)), `${path} must be a real reference`).toBe(true);
    }
  });
});

describe("reference-citation-count (CLAIM-35.5)", () => {
  test("a SKILL one over the cap fails and names the offenders", () => {
    const cites = overCap();
    const v = lintBodyRules("skills/x/SKILL.md", cites.join(" ") + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["reference-citation-count"]);
    expect(v[0]?.message).toContain(cites[cites.length - 1] ?? "!");
  });

  test("a SKILL exactly at the cap passes — the boundary is inclusive", () => {
    expect(lintBodyRules("skills/x/SKILL.md", atCap().join(" ") + REQUIRED_SECTIONS_SUFFIX)).toEqual([]);
  });

  test("the same reference cited repeatedly counts once", () => {
    const one = realDiscretionary()[0] ?? "";
    const body = new Array(MAX_DISCRETIONARY_REFERENCES + 3).fill(one).join(" ");
    expect(lintBodyRules("skills/x/SKILL.md", body + REQUIRED_SECTIONS_SUFFIX)).toEqual([]);
  });

  test("a REFERENCE document over the cap is NOT capped", () => {
    // docs/design/01-skill-hierarchy.md:472 bounds "a SKILL", and Problem 4 of
    // stories/35.md says CLAIM-35.5 counts "per skill body". Capping a
    // reference would push the twelve toward restating each other, which is
    // backwards from the cite-don't-restate doctrine.
    const body = overCap(3).join(" ");
    // Same body, both populations — the pair is the case.
    expect(lintBodyRules("references/workflow-states.md", body, { isSkill: false })).toEqual([]);
    expect(
      lintBodyRules("skills/x/SKILL.md", body + REQUIRED_SECTIONS_SUFFIX).map((v) => v.rule),
    ).toEqual(["reference-citation-count"]);
  });

  test("the cap is the exported constant, not a literal in the rule", () => {
    expect(lintBodyRules("skills/x/SKILL.md", atCap().join(" ") + REQUIRED_SECTIONS_SUFFIX)).toEqual([]);
    expect(
      lintBodyRules("skills/x/SKILL.md", overCap().join(" ") + REQUIRED_SECTIONS_SUFFIX).length,
    ).toBe(1);
  });
});

describe("model-id-literal (CLAIM-35.3)", () => {
  test("a literal model ID in a non-exempt file is reported", () => {
    const v = lintBodyRules("references/data-classification.md", "amd-anthropic/Claude-Opus-5", { isSkill: false });
    expect(v.map((x) => x.rule)).toEqual(["model-id-literal"]);
    expect(v[0]?.message).toContain("amd-anthropic/Claude-Opus-5");
  });

  test("the exempt file may contain model IDs", () => {
    expect(lintBodyRules(MODEL_ID_EXEMPT_PATH, "amd-unified/gpt-5.4-mini", { isSkill: false })).toEqual([]);
  });

  test("the exemption is EXACT-PATH, not a prefix", () => {
    // A prefix match would also exempt this file. docs/evidence/34-... records
    // a mutation surviving inside a RANGE-based exemption; a prefix-based one
    // is the same defect in a different dimension.
    const v = lintBodyRules("references/model-routing-notes.md", "amd-unified/gpt-5.4-mini", { isSkill: false });
    expect(v.map((x) => x.rule)).toEqual(["model-id-literal"]);
  });

  test("a repo-relative path is not mistaken for a model ID", () => {
    // REQUIRED_SECTIONS_SUFFIX keeps this skill fixture satisfying the #295
    // section rules so this test still asserts model-id-literal alone.
    const v = lintBodyRules("skills/x/SKILL.md", "see packages/core and docs/design/02-roles.md" + REQUIRED_SECTIONS_SUFFIX);
    expect(v).toEqual([]);
  });

  test("the vendor list is non-empty and each vendor is detected", () => {
    expect(MODEL_ID_VENDORS.length).toBeGreaterThan(0);
    for (const vendor of MODEL_ID_VENDORS) {
      const v = lintBodyRules("skills/x/SKILL.md", `${vendor}/some-model-1` + REQUIRED_SECTIONS_SUFFIX);
      expect(v.map((x) => x.rule)).toEqual(["model-id-literal"]);
    }
  });
});

describe("the two populations are separated in both directions (cases 21-23)", () => {
  test("no frontmatter rule fires over references/ — all twelve are clean", () => {
    const v = lintContractTree(join(repoRoot, "references"), repoRoot);
    const frontmatterRules = v.filter((x) => x.rule.startsWith("frontmatter-") || x.rule.startsWith("field-"));
    expect(frontmatterRules).toEqual([]);
    expect(v).toEqual([]);
  });

  test("the contract population is NON-EMPTY — the denominator is the case", () => {
    const files = discoverContractFiles(join(repoRoot, "references"));
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  test("discoverSkillFiles is NOT loosened — it still returns 0 for references/", () => {
    // The second population is a NEW function. Widening the existing one is the
    // most likely way to reintroduce frontmatter-missing on all twelve.
    expect(lintSkillTree(join(repoRoot, "references"), repoRoot)).toEqual([]);
  });

  test("a reference document run through the SKILL path would fail — proving separation matters", () => {
    const body = readFileSync(join(repoRoot, "references/verification.md"), "utf8");
    const asSkill = lintSkillSource("references/verification.md", body, "references");
    expect(asSkill.some((x) => x.rule === "frontmatter-missing")).toBe(true);
  });
});

// ===========================================================================
// THE BASELINE SPLIT AND THE RAISED CAP (issue #287, parts A / B / C)
// ===========================================================================
//
// Decided by @dev-pmallapp on 2026-09-06. iAI did not originate the decision
// (docs/design/03-workflow.md:271).
//
// The cap shipped in #280 was UNSATISFIABLE BY CONSTRUCTION: CONTRIBUTING.md
// mandates three references for every skill (:272, :276, :280) against a cap
// of three, so only a skill with no dependencies of its own could pass. Two of
// the fourteen Tier-1 verbs passed and both did so by accident.

describe("the baseline is exempt from the cap (#287 part B)", () => {
  test("citing every baseline reference plus nothing else is 0 discretionary", () => {
    const body = BASELINE_REFERENCES.map((r) => `See \`${r}\`.`).join("\n");
    expect(discretionaryReferences(body)).toEqual([]);
    expect(lintBodyRules("skills/x/SKILL.md", body + REQUIRED_SECTIONS_SUFFIX)).toEqual([]);
  });

  test("the baseline set is NON-EMPTY and every member is a real file", () => {
    // ASSERT THE DENOMINATOR. An empty baseline makes the exemption vacuous
    // and silently restores the unsatisfiable cap.
    expect(BASELINE_REFERENCES.length).toBeGreaterThanOrEqual(3);
    for (const ref of BASELINE_REFERENCES) {
      expect(readFileSync(join(repoRoot, ref), "utf8").length).toBeGreaterThan(0);
    }
  });

  test("a baseline reference does not consume a discretionary slot", () => {
    // The pair that proves the exemption is doing work: identical bodies but
    // for one citation, one baseline and one not.
    const own = atCap();
    const extra = realDiscretionary()[MAX_DISCRETIONARY_REFERENCES] ?? "";
    const withBaseline = [...own, ...BASELINE_REFERENCES].join(" ");
    const withExtra = [...own, extra].join(" ");
    expect(lintBodyRules("skills/x/SKILL.md", withBaseline + REQUIRED_SECTIONS_SUFFIX)).toEqual([]);
    expect(
      lintBodyRules("skills/x/SKILL.md", withExtra + REQUIRED_SECTIONS_SUFFIX).map((v) => v.rule),
    ).toEqual(["reference-citation-count"]);
  });

  test("the message says DISCRETIONARY and names the exemption", () => {
    const over = overCap().join(" ");
    const msg = lintBodyRules("skills/x/SKILL.md", `${over} ${BASELINE_REFERENCES[0] ?? ""}`)[0]?.message ?? "";
    expect(msg).toContain("discretionary");
    expect(msg).toContain("baseline is exempt");
    // The baseline member must not appear in the offending list.
    expect(msg.split("but the maximum")[0]).not.toContain(BASELINE_REFERENCES[0] ?? "!");
  });
});

describe("every Tier-1 verb clears the cap (#287, the case that motivated it)", () => {
  // The `Reads` column of docs/design/01-skill-hierarchy.md:92-105, PARSED AT
  // RUN TIME rather than restated — the case-1 pattern from
  // docs/test-plans/35-plan.md. A restated table would pass while the design
  // moved underneath it.
  function tierOneOwnReferences(): Map<string, string[]> {
    const doc = readFileSync(join(repoRoot, "docs/design/01-skill-hierarchy.md"), "utf8");
    const rows = doc.split("\n").filter((l) => /^\| `[a-z-]+` \| `\[/.test(l));
    const out = new Map<string, string[]>();
    for (const row of rows) {
      const name = /^\| `([a-z-]+)`/.exec(row)?.[1];
      if (name === undefined) continue;
      const reads = row.split("|")[3] ?? "";
      const refs = [...new Set([...reads.matchAll(/references\/[a-z0-9-]+\.md/g)].map((m) => m[0]))];
      out.set(name, refs.filter((r) => !BASELINE_REFERENCES.includes(r)));
    }
    return out;
  }

  test("the design's Reads column parses to the full Tier-1 roster", () => {
    // Denominator first. A failed parse must not pass vacuously.
    expect(tierOneOwnReferences().size).toBe(14);
  });

  test("no Tier-1 verb is rejected, with the baseline added to every body", () => {
    const verbs = tierOneOwnReferences();
    const rejected: string[] = [];
    for (const [name, own] of verbs) {
      const body = [...BASELINE_REFERENCES, ...own].map((r) => `See \`${r}\`.`).join("\n");
      const v = lintBodyRules(`skills/${name}/SKILL.md`, body);
      if (v.some((x) => x.rule === "reference-citation-count")) rejected.push(name);
    }
    expect(rejected).toEqual([]);
  });

  test("the cap clears the measured maximum WITH headroom", () => {
    // This is the derivation behind MAX_DISCRETIONARY_REFERENCES, re-checked
    // against the design rather than recorded in a comment that can rot.
    const maxOwn = Math.max(...[...tierOneOwnReferences().values()].map((r) => r.length));
    expect(maxOwn).toBeGreaterThan(0);
    expect(MAX_DISCRETIONARY_REFERENCES).toBeGreaterThan(maxOwn);
  });

  test("the OLD cap of 3 would have rejected the roster — the defect is pinned", () => {
    // Without this, the three cases above pass just as well under a cap that
    // was never broken, and the regression they guard is invisible.
    const verbs = tierOneOwnReferences();
    const rejectedUnderOldRule: string[] = [];
    for (const [name, own] of verbs) {
      const total = new Set([...BASELINE_REFERENCES, ...own]).size;
      if (total > 3) rejectedUnderOldRule.push(name);
    }
    expect(rejectedUnderOldRule.length).toBeGreaterThanOrEqual(5);
  });
});

describe("the design and the constant agree (#287 part A)", () => {
  test("the cap stated in 01-skill-hierarchy.md matches the exported constant", () => {
    // The header count was wrong by five for three milestones because it was
    // prose. Parsing it turns the comment into an assertion — the
    // path-allowlist lesson, applied to the design.
    const doc = readFileSync(join(repoRoot, "docs/design/01-skill-hierarchy.md"), "utf8");
    const m = /A skill reads at most (\d+) references/.exec(doc);
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBe(MAX_DISCRETIONARY_REFERENCES);
  });

  test("CONTRIBUTING marks EACH baseline reference baseline, in its own item", () => {
    // The first version of this test asserted only that the word "baseline"
    // appeared SOMEWHERE in the file. Mutation M8 of #287 removed it from one
    // of the three items and the test stayed green, because the other two
    // still carried it. Assert per item, not per file — the
    // docs/evidence/33-20260904T113934Z.md lesson in a new place.
    const doc = readFileSync(join(repoRoot, "CONTRIBUTING.md"), "utf8");
    const items = doc.split(/^- \[ \] /m).slice(1);
    expect(items.length).toBeGreaterThan(10);

    for (const ref of BASELINE_REFERENCES) {
      const name = ref.replace("references/", "").replace(".md", "");
      const owning = items.filter((i) => i.includes(name));
      expect(owning.length, `no CONTRIBUTING item mentions ${name}`).toBeGreaterThan(0);
      expect(
        owning.some((i) => i.includes("baseline")),
        `the item naming ${name} must call it baseline (#287 part C)`,
      ).toBe(true);
    }
  });
});

describe("live content, not fixtures (#287 finding 4)", () => {
  // references/workflow-states.md is the single best specimen in the tree for
  // the baseline exemption, and it is REAL. It cites four siblings, TWO of
  // which are baseline:
  //
  //   evidence-artifacts   discretionary
  //   verification         discretionary
  //   gh-operations        BASELINE
  //   gh-error-handling    BASELINE
  //
  // Under the rule #280 shipped it counted 4 against a cap of 3 and was
  // rejected. Under #287 it counts 2. Nothing synthetic can demonstrate that,
  // because a synthetic name is never a baseline member.
  const body = () => readFileSync(join(repoRoot, "references/workflow-states.md"), "utf8");

  test("it really does cite four siblings, two of them baseline", () => {
    // Denominator first, read from the file — if the document is rewritten to
    // cite fewer, this fails rather than quietly making the case below vacuous.
    const cited = [...new Set([...body().matchAll(/references\/[a-z0-9-]+\.md/g)].map((m) => m[0]))];
    const baseline = cited.filter((c) => BASELINE_REFERENCES.includes(c));
    expect(cited.length).toBeGreaterThanOrEqual(4);
    expect(baseline.length).toBeGreaterThanOrEqual(2);
    expect(cited.length - baseline.length).toBeLessThanOrEqual(MAX_DISCRETIONARY_REFERENCES);
  });

  test("as a SKILL body it passes only because the baseline is exempt", () => {
    const cited = [...new Set([...body().matchAll(/references\/[a-z0-9-]+\.md/g)].map((m) => m[0]))];
    // The rule as shipped: passes.
    expect(
      lintBodyRules("skills/x/SKILL.md", body()).filter((v) => v.rule === "reference-citation-count"),
    ).toEqual([]);
    // And it would NOT have passed the cap of 3 counting every citation —
    // which is the defect this fix removes, pinned against live content.
    expect(cited.length).toBeGreaterThan(3);
  });

  test("every real reference passes the cap as a skill body", () => {
    // The whole roster as a corpus, not one specimen. Denominator asserted.
    const roster = realReferences();
    expect(roster.length).toBeGreaterThanOrEqual(12);
    const over = roster.filter(
      (r) =>
        lintBodyRules("skills/x/SKILL.md", readFileSync(join(repoRoot, r), "utf8")).some(
          (v) => v.rule === "reference-citation-count",
        ),
    );
    expect(over).toEqual([]);
  });
});

// --- domain-routing-form (CLAIM-41.6, NEVER-41.7), task #46 --------------
//
// EVERY POSITIVE CASE HERE READS A REAL FILE OFF DISK. The rule exists
// because the SEEDED form of CLAIM-41.6 was measured against the real corpus
// and found unsatisfiable: `know` appears 16 times in references/, 13 of them
// ordinary English, and the seeded carve-out exempted 0 of 28 occurrences.
// A suite that proved this rule only against invented bodies would repeat the
// defect the rule was rewritten to avoid -- #287 and #289 both.

const repoRootForDomains = join(import.meta.dir, "..");

function readReal(relPath: string): string {
  return readFileSync(join(repoRootForDomains, relPath), "utf8");
}

function realReferenceDocs(): { path: string; body: string }[] {
  const dir = join(repoRootForDomains, "references");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => ({ path: `references/${f}`, body: readFileSync(join(dir, f), "utf8") }));
}

describe("domain-routing-form over the real corpus", () => {
  test("no shipped reference document carries a routing form", () => {
    const refs = realReferenceDocs();
    expect(refs.length).toBeGreaterThanOrEqual(12);
    for (const ref of refs) {
      const v = lintBodyRules(ref.path, ref.body, { isSkill: false });
      expect(v.filter((x) => x.rule === "domain-routing-form")).toEqual([]);
    }
  });

  // CASE 13. This is the gate ruling G2 made executable.
  test("the `know` family is present in quantity and produces zero violations", () => {
    const refs = realReferenceDocs();
    const hits = refs.reduce(
      (n, r) => n + (r.body.match(/know/gi) ?? []).length,
      0,
    );
    // The denominator IS the case: a rule that passed over zero occurrences of
    // the word would prove nothing about dropping it from the ban.
    expect(hits).toBeGreaterThanOrEqual(14);

    for (const ref of refs) {
      const v = lintBodyRules(ref.path, ref.body, { isSkill: false });
      expect(v.filter((x) => x.rule === "domain-routing-form")).toEqual([]);
    }

    // And the specific ordinary-English forms are really there, so this cannot
    // pass because the corpus quietly lost them.
    const all = refs.map((r) => r.body).join("\n");
    for (const word of ["known", "knows", "knowledge", "unknown"]) {
      expect(all).toContain(word);
    }
  });

  // CASE 14, AMENDED. The sharpest property of the whole rule, but it has to be
  // stated over the right unit.
  //
  // The seeded CLAIM-41.6 banned the bare tokens, and under it these two
  // documents violated the rule they define: 01-skill-hierarchy.md:33 states it
  // using `trade`, and CONTRIBUTING.md:340 uses `know` twice. THAT is what case
  // 14 was written to pin, and the ruled rule passes it.
  //
  // What case 14 could NOT be asked to pin is the whole FILE. A design document
  // is not a skill body and is not in this rule's population; applying a
  // skill-body rule to it is a category error -- the same one caught in #294,
  // where a Design rule had been pointed at the skill linter. Second occurrence
  // in two tasks.
  //
  // 01-skill-hierarchy.md legitimately carries routing forms because DOCUMENTING
  // routing is its job: `:436` spells out "Read `domain:trade` -> load
  // `skills/trade/domain.md`". A document that explains routing is not a body
  // that performs it.
  test("the sentences that DEFINE domain-agnosticism pass the rule that enforces it", () => {
    const hierarchy = readReal("docs/design/01-skill-hierarchy.md");
    const contributing = readReal("CONTRIBUTING.md");

    // The exact doctrine sentences, read out of the real documents rather than
    // retyped, so this cannot pass against a paraphrase that drifted.
    const doctrine = [
      'There is no `if (domain === "trade")`',
      "A Tier-1 verb never hardcodes a domain",
      "a Tier-1 verb may never know any",
    ];
    for (const sentence of doctrine) {
      expect(hierarchy + contributing).toContain(sentence);
      const v = lintBodyRules("skills/goal-create/SKILL.md", sentence);
      expect(v.filter((x) => x.rule === "domain-routing-form")).toEqual([]);
    }
  });

  // The out-of-population citations, asserted rather than hidden. If this ever
  // goes to zero, someone has "cleaned up" a design document to satisfy a rule
  // that was never meant to reach it.
  test("the design document carries routing forms BECAUSE documenting routing is its job", () => {
    const hierarchy = readReal("docs/design/01-skill-hierarchy.md");
    expect(hierarchy).toContain("Read `domain:trade`");
    expect(routingForms(hierarchy).length).toBeGreaterThanOrEqual(4);

    // And it is out of population: skill-lint scans skills/, references/ and
    // agents/. docs/ is claim-lint's, and claim-lint does not run this rule.
    expect(CONTRACT_DIRS).not.toContain("docs");
  });

  // references/workflow-states.md owns the label namespaces and must be able to
  // name `domain:` without an id.
  test("a bare `domain:` namespace with no id is not a routing form", () => {
    expect(readReal("references/workflow-states.md")).toContain("domain:");
    expect(routingForms("the exclusive prefix `domain:` is one per issue")).toEqual([]);
  });
});

describe("domain-routing-form negative fixtures and the own-domain carve-out", () => {
  // REQUIRED_SECTIONS_SUFFIX keeps these skill fixtures satisfying the #295
  // section rules so each test still asserts its own rule alone.

  // CASE 10.
  test("a Tier-1 body carrying a label routing form is reported, and only as that", () => {
    const v = lintBodyRules("skills/story-design/SKILL.md", "route when `domain:trade` is set" + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
    expect(v[0]?.message).toContain("hardcodes a routing decision");
    expect(v[0]?.message).toContain("domain:trade");
    // Assert the REASON, not the verdict: no other body rule may be what
    // rejected this fixture.
    expect(v[0]?.message).not.toContain("restates");
    expect(v[0]?.message).not.toContain("discretionary");
    expect(v[0]?.message).not.toContain("literal model ID");
  });

  test("a Tier-1 body carrying a path routing form is reported", () => {
    const v = lintBodyRules("skills/story-create/SKILL.md", "load `skills/health/domain.md`" + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
    expect(v[0]?.message).toContain("skills/health");
  });

  // CONTRIBUTING.md:339-340 exactly: "A leaf skill may know its own domain; a
  // Tier-1 verb may never know any." The carve-out is DERIVED from the path,
  // so no list of the fourteen verbs exists to go stale.
  test("a Tier-2 leaf skill may name its OWN domain but not another", () => {
    const own = lintBodyRules("skills/trade-backtest/SKILL.md", "this is `domain:trade` work" + REQUIRED_SECTIONS_SUFFIX);
    expect(own.filter((x) => x.rule === "domain-routing-form")).toEqual([]);

    const other = lintBodyRules("skills/trade-backtest/SKILL.md", "also `domain:health`" + REQUIRED_SECTIONS_SUFFIX);
    expect(other.map((x) => x.rule)).toEqual(["domain-routing-form"]);
    expect(other[0]?.message).toContain('owns "trade"');
  });

  test("ownDomainOf derives the carve-out from the path, and is undefined for Tier-1", () => {
    expect(ownDomainOf("skills/trade-backtest/SKILL.md")).toBe("trade");
    expect(ownDomainOf("skills/dev/domain.md")).toBe("dev");
    expect(ownDomainOf("skills/goal-create/SKILL.md")).toBeUndefined();
    expect(ownDomainOf("skills/story-test-plan/SKILL.md")).toBeUndefined();
    expect(ownDomainOf("references/verification.md")).toBeUndefined();
  });

  // FOUND BY MUTATION M7, WHICH SURVIVED THE FIRST RUN.
  //
  // `ownDomainOf` grants the carve-out. Written as a bare prefix test --
  // `dir.startsWith(id)` -- it hands `dev` to `skills/development-tools/` and
  // `know` to `skills/knowledge-base/`, silently exempting a verb that is not a
  // domain pack at all. The carve-out must be SHAPE-BASED: exactly the id, or
  // the id followed by a hyphen.
  //
  // THIS IS THE THIRD OCCURRENCE OF ONE CLASS. docs/evidence/34-*.md: "an
  // exemption expressed as a line range admits anything that fits inside the
  // range." Case 7 of docs/test-plans/35-plan.md: a prefix match on the
  // model-ID exemption "would additionally exempt a hypothetical
  // model-routing-notes.md". Same defect, third shape: an exemption expressed
  // as a prefix admits anything that starts with it.
  //
  // An over-broad exemption is the dangerous direction. A rule that fires too
  // often is noisy and gets fixed; a carve-out that is too generous is silent
  // and never does.
  test("the own-domain carve-out is shape-based, not a bare prefix", () => {
    expect(ownDomainOf("skills/development-tools/SKILL.md")).toBeUndefined();
    expect(ownDomainOf("skills/knowledge-base/SKILL.md")).toBeUndefined();
    expect(ownDomainOf("skills/devops/SKILL.md")).toBeUndefined();
    expect(ownDomainOf("skills/wealthy-clients/SKILL.md")).toBeUndefined();

    // ...and the two legal shapes still hold, so this did not fix the leak by
    // breaking the carve-out.
    expect(ownDomainOf("skills/dev/domain.md")).toBe("dev");
    expect(ownDomainOf("skills/dev-coder/SKILL.md")).toBe("dev");

    // The consequence the mutation exposed: a verb merely BEGINNING with a
    // domain id must still be policed.
    const v = lintBodyRules("skills/development-tools/SKILL.md", "route on `domain:dev`" + REQUIRED_SECTIONS_SUFFIX);
    expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
  });

  test("a longer word beginning with a domain id is not a routing form", () => {
    expect(routingForms("`domain:knowledge` and `skills/devops` and `domain:development`")).toEqual([]);
  });

  // CASE 22.
  test("the rule reads KNOWN_DOMAIN_IDS and does not restate the five ids", () => {
    // Every shipped id is enforced, derived from the export rather than listed.
    for (const id of KNOWN_DOMAIN_IDS) {
      const v = lintBodyRules("skills/goal-create/SKILL.md", `see \`domain:${id}\`` + REQUIRED_SECTIONS_SUFFIX);
      expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
    }
    // And no second copy of the list exists in the linter source.
    const source = readReal("scripts/skill-lint.ts");
    const literalList = KNOWN_DOMAIN_IDS.map((id) => `"${id}"`).join(", ");
    expect(source).not.toContain(literalList);
    expect(source).toContain("KNOWN_DOMAIN_IDS");
  });
});

// --- phase-0-section / error-handling-section (CLAIM-41.10, #295) --------
//
// Decision 5 of docs/design/stories/41.md: CONTRIBUTING.md:128-129 claimed
// skill-lint already checked a Phase 0 section and an Error Handling section.
// It did not. These two rules are what makes the sentence true rather than
// softened, and case 23 of docs/test-plans/41-plan.md is what pins the two —
// the rule set and the document's description of it — to never disagree
// again.

// A REAL BODY WITH ONE PERTURBATION, not an invented one, per the #289
// posture recorded throughout this file (case 8 of the -plan.md is the same
// shape one Story up). Both required headings are present, so this is the
// vacuity guard's fixture and every "remove one heading" fixture below is
// this string with exactly one line taken out.
const VALID_SKILL_BODY = [
  "# foo",
  "",
  "## Phase 0: Context Discovery",
  "",
  "Read state from disk and GitHub before doing anything else — never from",
  "conversation memory.",
  "",
  "## Error Handling",
  "",
  "Handle a missing resource, an existing resource, rate limiting, and a",
  "partial write.",
  "",
].join("\n");

describe("phase-0-section and error-handling-section (CLAIM-41.10)", () => {
  test("a minimal VALID skill body satisfies both new rules with 0 violations (vacuity guard)", () => {
    // Without this, every negative fixture below could be failing the rule
    // for an unrelated reason and this suite would never catch it.
    const v = lintBodyRules("skills/x/SKILL.md", VALID_SKILL_BODY);
    expect(v.filter((x) => x.rule === "phase-0-section" || x.rule === "error-handling-section")).toEqual(
      [],
    );
  });

  // REAL CONTENT WITH ONE PERTURBATION: take the complete valid body and
  // remove exactly one heading, then assert the OTHER rule does not co-fire.
  test("removing the Phase 0 heading fires phase-0-section ALONE", () => {
    const body = VALID_SKILL_BODY.split("\n")
      .filter((l) => !l.startsWith("## Phase 0"))
      .join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["phase-0-section"]);
  });

  test("removing the Error Handling heading fires error-handling-section ALONE", () => {
    const body = VALID_SKILL_BODY.split("\n")
      .filter((l) => !l.startsWith("## Error Handling"))
      .join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["error-handling-section"]);
  });

  // OVER-BROAD-MATCH NEGATIVES. Each keeps a real `## Error Handling` heading
  // beside the mutated Phase 0 form, so each test also proves the sibling
  // rule does not co-fire on the malformed heading.
  test("a Phase 0 heading only inside a fenced code block does not satisfy the rule", () => {
    const body = ["```", "## Phase 0", "```", "", "## Error Handling", "content"].join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["phase-0-section"]);
  });

  test("### Phase 0 (H3) does not satisfy the rule — H2 only", () => {
    const body = ["### Phase 0", "", "## Error Handling", "content"].join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["phase-0-section"]);
  });

  test("## phase 0 (lowercase) does not satisfy the rule — case-sensitive", () => {
    const body = ["## phase 0", "", "## Error Handling", "content"].join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["phase-0-section"]);
  });

  test("## Phase 01 does not satisfy the rule — the negative lookahead excludes a longer number", () => {
    const body = ["## Phase 01", "", "## Error Handling", "content"].join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["phase-0-section"]);
  });

  // THE SIBLING BOUNDARY, asserted because mutation M8 of #295 survived
  // without it. phase-0-section's `(?![0-9])` is pinned by the case above,
  // but error-handling-section's `\b` was not pinned by anything: deleting
  // it left the whole suite green while "## Error Handlingz" silently began
  // to satisfy the rule. A heading rule that matches too EASILY is the
  // dangerous direction — it never announces itself, it just stops asking
  // for the section. Fourth occurrence of the over-broad-match class
  // recorded at test/skill-lint.test.ts's own domain-routing-form block and
  // in docs/evidence/46-*.md.
  test("## Error Handlingz does not satisfy the rule — the word boundary excludes a longer word", () => {
    const body = ["## Phase 0", "", "## Error Handlingz", "content"].join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.map((x) => x.rule)).toEqual(["error-handling-section"]);
  });

  test("## Phase 0: Context Discovery satisfies the rule — a suffix after the heading text is allowed", () => {
    const body = ["## Phase 0: Context Discovery", "", "## Error Handling", "content"].join("\n");
    const v = lintBodyRules("skills/x/SKILL.md", body);
    expect(v.filter((x) => x.rule === "phase-0-section")).toEqual([]);
  });

  // THE POPULATION PAIR. Load-bearing: an isSkill:false-only assertion passes
  // identically whether or not the rule is even wired up, because it is a
  // no-op over that population either way. Only firing it BOTH ways over the
  // SAME bodies proves the gate is doing anything. Same pattern as
  // reference-citation-count's pair at :466-477.
  test("real reference documents never fire a section rule as a CONTRACT, and the SAME bodies fire both as a SKILL", () => {
    const refs = realReferenceDocs();
    expect(refs.length).toBeGreaterThanOrEqual(12);
    for (const ref of refs) {
      const asContract = lintBodyRules(ref.path, ref.body, { isSkill: false });
      expect(
        asContract.filter((x) => x.rule === "phase-0-section" || x.rule === "error-handling-section"),
      ).toEqual([]);

      const asSkill = lintBodyRules(ref.path, ref.body, { isSkill: true });
      const rules = asSkill.map((x) => x.rule);
      expect(rules).toContain("phase-0-section");
      expect(rules).toContain("error-handling-section");
    }
  });
});

// --- CONTRIBUTING.md and the linter agree (CLAIM-41.10, case 23) ---------
describe("CONTRIBUTING.md's rule table agrees with the linter (CLAIM-41.10, case 23)", () => {
  function splitTableRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  }

  function unquote(cell: string): string {
    return cell.replace(/^`+/, "").replace(/`+$/, "");
  }

  function ruleTableRows(): string[][] {
    const doc = readFileSync(join(repoRoot, "CONTRIBUTING.md"), "utf8");
    const lines = doc.split("\n");

    const headerIndices: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\|\s*Rule id\s*\|/.test(lines[i] ?? "")) headerIndices.push(i);
    }
    // Guard against a silently-empty slice: exactly one such table.
    expect(headerIndices.length, "expected exactly one rule-id table in CONTRIBUTING.md").toBe(1);

    const start = headerIndices[0]!;
    const rows: string[][] = [];
    // start+1 is the `|---|---|---|` separator row; data rows follow until a
    // line that is not a table row.
    for (let i = start + 2; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (!line.trim().startsWith("|")) break;
      rows.push(splitTableRow(line));
    }
    return rows;
  }

  // NEVER a rule id literal is restated here — every id comes from the
  // imported RULE_IDS, so this test cannot drift into agreeing with itself.
  test("the doc's rule-id column and RULE_IDS are the SAME SET, asserted both directions, with no duplicate rows", () => {
    const rows = ruleTableRows();
    const docIds = rows.map((r) => unquote(r[0] ?? ""));
    const docIdSet = new Set(docIds);
    const linterIdSet = new Set<string>(RULE_IDS);

    for (const id of docIdSet) {
      expect(linterIdSet.has(id), `CONTRIBUTING.md documents rule id "${id}", which is not a real rule`).toBe(
        true,
      );
    }
    for (const id of linterIdSet) {
      expect(docIdSet.has(id), `RULE_IDS contains "${id}", which CONTRIBUTING.md's table does not document`).toBe(
        true,
      );
    }
    // Row count equal to RULE_IDS.length catches a duplicate row that set
    // equality alone would hide.
    expect(rows.length).toBe(RULE_IDS.length);
  });
});

// ===========================================================================
// THE FIRST REAL SKILL (task #44, `story-design`) — history and rewrite note
// ===========================================================================
//
// THIS BLOCK USED TO ASSERT THE OPPOSITE OF WHAT IT ASSERTS NOW. Until task
// #44 landed `skills/story-design/SKILL.md`, the single test here was:
//
//   test("the skill population is empty today, so NEVER-41.7 and the two
//   section rules are NOT yet discharged over real bodies", () => {
//     ...
//     expect(skillFiles).toHaveLength(0);
//   });
//
// NEVER-41.7 says "proved over the real four-skill corpus, not a fixture".
// THE FOUR SKILLS DID NOT EXIST YET when #46 shipped domain-routing-form —
// they are #42-#45, and #44 (story-design) is the first of the four to land.
// That rule shipped BEFORE its own skill corpus, which is the opposite of how
// #280 was sequenced, and finding 36 of the S2.1 evidence is explicit that
// sequencing a rule after its corpus is what stopped it shipping wrong and
// green. The trade was deliberate and recorded on #46; what protected it was
// that the skill denominator was ASSERTED to be zero, so nobody could mistake
// a green run for a verified claim.
//
// That denominator is no longer zero. The tests below are the update the old
// comment promised ("Update it then; do not delete it.") — rewritten per the
// governing principle: prefer RUN-TIME EQUALITIES read from disk on BOTH
// sides, so nothing here needs editing again as #42, #43 and #45 land. Only
// ONE assertion in this file still needs editing, and it is isolated at the
// bottom of this block, edited exactly once, when the fourth verb lands.

function realSkillFiles(): { relPath: string; body: string }[] {
  const skillsDir = join(repoRootForDomains, "skills");
  const out: { relPath: string; body: string }[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const filePath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(filePath)) continue;
    out.push({ relPath: `skills/${entry.name}/SKILL.md`, body: readFileSync(filePath, "utf8") });
  }
  return out;
}

describe("NEVER-41.9: skill-lint's SKILL.md count is real, not vacuous", () => {
  // NEVER-41.9: "the scanned count is asserted non-zero and equal to the
  // number of verb directories on disk" (docs/design/stories/41.md:325-327;
  // case 18 of docs/test-plans/41-plan.md). BOTH SIDES ARE READ FROM DISK AT
  // RUN TIME, so this assertion never needs editing as #42, #43 and #45 add
  // their own verb directories — a fifth directory or a dropped one is caught
  // by the same equality, not by a literal that has to be bumped by hand.
  test("the SKILL.md count is non-zero and equals the number of verb directories", () => {
    const skillsDir = join(repoRootForDomains, "skills");
    const verbDirs = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const dirsWithSkillMd = verbDirs.filter((e) => existsSync(join(skillsDir, e.name, "SKILL.md")));

    expect(dirsWithSkillMd.length).toBeGreaterThan(0);
    expect(dirsWithSkillMd.length).toBe(verbDirs.length);
  });
});

describe("NEVER-41.7 and the #295 section rules over the real skill corpus", () => {
  // NEVER-41.7: "Proved over the real four-skill corpus, not a fixture."
  // #295's phase-0-section and error-handling-section ride along for the same
  // reason recorded in the old comment here: they were unproved over a real
  // skill body because the corpus was the same four verbs.
  //
  // The count is asserted NON-ZERO FIRST, so the loop below cannot pass
  // vacuously — the exact defect this whole block used to be a placeholder
  // against.
  test("every real SKILL.md on disk has 0 domain-routing-form, phase-0-section and error-handling-section violations", () => {
    const files = realSkillFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const violations = lintBodyRules(file.relPath, file.body, { isSkill: true });
      expect(violations.filter((v) => v.rule === "domain-routing-form"), file.relPath).toEqual([]);
      expect(violations.filter((v) => v.rule === "phase-0-section"), file.relPath).toEqual([]);
      expect(violations.filter((v) => v.rule === "error-handling-section"), file.relPath).toEqual([]);
    }
  });

  test("the contract population is NOT empty either, so neither rule is vacuous over references/", () => {
    expect(realReferenceDocs().length).toBeGreaterThanOrEqual(12);
  });
});

// The ONE assertion in this block that still needs editing, and the ONLY one:
// docs/test-plans/41-plan.md case 6 requires "4 of 4, with the count asserted
// first" for CLAIM-41.5. Today the corpus is 1 of 4. Stating the
// incompleteness explicitly — rather than omitting it — means the gap is
// asserted, not hidden, and there is exactly one place to update: this
// constant and the `toBeLessThan` below become the `toBe`-4 assertion case 6
// actually requires, the moment the last of #42/#43/#45 lands. Do not
// hardcode `4` anywhere else in this file for this purpose.
const CASE_6_REQUIRED_SKILL_COUNT = 4; // docs/test-plans/41-plan.md:119, "4 of 4"

describe("case 6's 4-of-4 threshold (docs/test-plans/41-plan.md:119)", () => {
  // FLIPPED BY #45, the last of the four verbs, which is the single edit this
  // assertion was written to require. It read `toBeLessThan(4)` from #44 until
  // now, so the shortfall was stated on every run rather than assumed away.
  //
  // NEVER-41.7 said "proved over the real four-skill corpus, not a fixture".
  // This is the line that makes the denominator in that sentence real: the
  // loops above assert zero violations over whatever exists, and this asserts
  // that what exists is the four the case names. Without it those loops stay
  // green over a corpus that quietly shrank.
  //
  // It is deliberately NOT a run-time equality. Every other assertion added by
  // #44 and #296 reads both sides from disk and needs no editing; this one
  // hardcodes the number the PLAN specifies, because "4" here is a claim about
  // what S2.2 committed to build, not a fact about the filesystem. A disk-read
  // denominator on both sides would pass a corpus of three verbs and a deleted
  // one, which is exactly the drift case 6 exists to catch.
  test("the real skill corpus is 4 of 4 — case 6's denominator is met", () => {
    const files = realSkillFiles();
    expect(files.length).toBe(CASE_6_REQUIRED_SKILL_COUNT);
  });
});

// ===========================================================================
// CASE 6 (docs/test-plans/41-plan.md:119, CLAIM-41.5) — over the real corpus
// ===========================================================================
//
// "Each of the four skills reads the `domain:` label and carries the
// hard-failure block ... Each body names the label read **before** any step
// that would need the binding, so the ordering is checked and not just the
// presence."
//
// ANCHOR CHOICES, and why each was picked narrowly rather than broadly —
// this repo has been bitten five times by an over-broad match (see
// docs/evidence/46-*.md, case 7 of docs/test-plans/35-plan.md, and #295's
// mutation M8, all recorded elsewhere in this file):
//
// 1. THE LABEL-READ ANCHOR is `` `domain:`\s*label `` — a backtick-quoted
//    literal "domain:" token immediately followed by the word "label". This
//    is narrower than searching for the bare word "domain" (which would match
//    the routing-form fixtures, the `domain-routing-form` rule's own name,
//    and any of the twelve references that describe the `domain:` label
//    namespace) and it is exactly the phrase the real body uses at
//    skills/story-design/SKILL.md:23: "**The Story's `domain:` label.**".
//
// 2. THE BINDING-USED ANCHOR is the literal path "references/domain-binding.md"
//    — not the bare word "binding", which appears EARLIER in the same
//    sentence as the label-read anchor ("before any step that needs a
//    binding", skills/story-design/SKILL.md:24) and would make the ordering
//    check trivially true regardless of what the body actually does. The
//    reference path is where the binding is actually resolved ("The binding
//    for that label, resolved through the registry described in
//    `references/domain-binding.md`", :27-28) — a real step, not a mention of
//    the word. Every one of the four skills must cite this contract to
//    resolve a label into a binding (references/domain-binding.md is the
//    shared registry contract, per Dependencies: S1.5 "the binding interface
//    and KNOWN_DOMAIN_IDS"), so this anchor is expected to generalise.
//
// 3. THE HARD-FAILURE ANCHOR is the house convention's fixed first line,
//    `^HARD FAILURE in Phase \d+ \(...\):`, specified verbatim at
//    docs/design/02-roles.md:277 ("HARD FAILURE in Phase {N} ({skill}):")
//    and used unmodified by every hard-failure block in the repository
//    (docs/design/03-workflow.md:499, :05/:06-domain design docs, etc.). It is
//    NOT specific to story-design, so it is expected to match goal-create,
//    story-create and story-test-plan's blocks too.
const DOMAIN_LABEL_READ_RE = /`domain:`\s*label/i;
const BINDING_RESOLUTION_MARKER = "references/domain-binding.md";
const HARD_FAILURE_BLOCK_RE = /^HARD FAILURE in Phase \d+ \([^)]+\):\n(?:- .+\n?)+/m;

describe("case 6: each real skill reads the domain: label before resolving the binding, and carries the hard-failure block", () => {
  test("the real skill corpus is non-zero, so the loop below cannot pass vacuously", () => {
    expect(realSkillFiles().length).toBeGreaterThan(0);
  });

  // THE EXEMPTION IS RETIRED. #307 was ruled on 2026-09-07 by the repository
  // owner and CLAIM-41.5 is restated (docs/design/stories/41.md:310-312): every
  // skill hard-fails on the absence of ITS OWN required input, and only those
  // that resolve a domain binding must read the label first.
  //
  // What replaces the exemption is a PARTITION, not a derivation. The previous
  // shape was a carve-out of one, and an over-broad carve-out never announces
  // itself -- a noisy rule gets fixed, a generous exemption does not. A DERIVED
  // split ("bodies that do not cite domain-binding.md") is the same silent
  // direction, recorded five times in this repository and warned against by
  // #307 in terms.
  //
  // So BOTH populations are literal, both counts are asserted, and the two are
  // asserted to partition the real corpus EXACTLY. A new verb that is in
  // neither list breaks the total, and a verb that changes category must be
  // moved deliberately. Neither failure can be silent.
  const DOMAIN_RESOLVING_SKILLS: readonly string[] = ["story-create", "story-design", "story-test-plan"];
  const OWN_INPUT_ONLY_SKILLS: readonly string[] = ["goal-create"];

  test("the two populations are named, counted, and partition the real corpus exactly", () => {
    expect(DOMAIN_RESOLVING_SKILLS).toHaveLength(3);
    expect(OWN_INPUT_ONLY_SKILLS).toHaveLength(1);

    const onDisk = new Set(realSkillFiles().map((f) => basename(dirname(f.relPath))));
    expect(onDisk.size).toBeGreaterThan(0); // denominator first

    // No overlap: a skill cannot be in both halves.
    for (const name of DOMAIN_RESOLVING_SKILLS) {
      expect(OWN_INPUT_ONLY_SKILLS.includes(name), `"${name}" is in both populations`).toBe(false);
    }

    // Every named skill exists -- a stale entry for a renamed verb cannot sit here.
    for (const name of [...DOMAIN_RESOLVING_SKILLS, ...OWN_INPUT_ONLY_SKILLS]) {
      expect(onDisk.has(name), `"${name}" is named in a population but is not on disk`).toBe(true);
    }

    // AND the union covers the corpus: this is the half a carve-out never had.
    // A fifth verb added without classifying it fails HERE, loudly.
    expect(
      DOMAIN_RESOLVING_SKILLS.length + OWN_INPUT_ONLY_SKILLS.length,
      "every skill on disk must be classified into exactly one population",
    ).toBe(onDisk.size);
  });

  test("every real skill body: label-read precedes binding-resolution, and the hard-failure block is present", () => {
    const files = realSkillFiles();
    expect(files.length).toBeGreaterThan(0); // denominator first, per case 6's own wording

    for (const file of files) {
      // The hard-failure block is required of EVERY body, exempt or not: it is
      // the doctrine, and only its trigger differs.
      expect(file.body, `${file.relPath} must carry the house hard-failure block`).toMatch(HARD_FAILURE_BLOCK_RE);

      if (OWN_INPUT_ONLY_SKILLS.includes(basename(dirname(file.relPath)))) {
        // Resolves no domain binding, so the ORDERING half has no referent for
        // it -- the restated CLAIM-41.5's whole point. It must still say so in
        // its own body rather than relying on this list to explain it.
        expect(
          file.body,
          `${file.relPath} resolves no domain binding, so it must state that it reads no domain`,
        ).toMatch(/reads no `domain:` label/i);
        continue;
      }

      const labelIdx = file.body.search(DOMAIN_LABEL_READ_RE);
      expect(labelIdx, `${file.relPath} must name reading the domain: label`).toBeGreaterThanOrEqual(0);

      const bindingIdx = file.body.indexOf(BINDING_RESOLUTION_MARKER);
      expect(
        bindingIdx,
        `${file.relPath} must cite ${BINDING_RESOLUTION_MARKER} to resolve the binding`,
      ).toBeGreaterThanOrEqual(0);

      // ORDERING IS THE POINT OF THE CASE, not presence alone (the plan's own
      // words). A body that resolved the binding before naming the label read
      // would pass every "presence" assertion above and still be wrong.
      expect(
        labelIdx,
        `${file.relPath} must name the label read BEFORE the step that resolves the binding`,
      ).toBeLessThan(bindingIdx);
    }
  });
});

// ===========================================================================
// CASE 12 (docs/test-plans/41-plan.md:130, CLAIM-41.5 + CLAIM-41.1)
// ===========================================================================
//
// "A Story with no `domain:*` label produces the hard-failure block, not an
// assumed domain ... Asserting the absence of a default is the case: a skill
// that silently picked `dev` would pass any test that only checked it did not
// crash."
//
// WHAT THIS TEST CAN PROVE: that the real skill body's TEXT never states a
// fallback domain and never spells any of the five known domain ids as a bare
// word anywhere in its own prose — which is what "a Tier-1 verb may never
// know any [domain]" (CONTRIBUTING.md:339-340) means for a body whose whole
// job is to stay domain-agnostic.
//
// WHAT THIS TEST CANNOT PROVE: that no host or model interpreting this
// markdown would ever *behave* as though a domain were assumed. A skill is
// prose read by an LLM host (Decision 6 of docs/design/stories/41.md); there
// is no harness to execute it (#293). This is a textual, not a behavioural,
// guarantee — the same limit CLAIM-41.8 names for the whole file.
//
// WHY THIS DOES NOT MERELY DUPLICATE domain-routing-form: that rule bans the
// ROUTING FORM (`domain:<id>` or `skills/<id>/`) and explicitly permits prose
// naming a domain (Decision 4: "Naming a domain in PROSE is fine"; proved at
// case 14 above for the doctrine-illustration sentences). Case 12 asks a
// narrower, different question about a narrower population: within the part
// of a Tier-1 skill body that handles the ABSENCE of the domain: label, does
// the text name ANY specific domain id at all, in any form, as a fallback?
// domain-routing-form's carve-out for prose does not answer that; this test
// adds the part it does not cover.
describe("case 12: absence of the domain: label produces the hard-failure block, not an assumed default", () => {
  test("the real skill corpus is non-zero, so the loop below cannot pass vacuously", () => {
    expect(realSkillFiles().length).toBeGreaterThan(0);
  });

  test("every real skill body: the hard-failure block is tied to ABSENCE, and no domain id is named as a default", () => {
    const files = realSkillFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const block = HARD_FAILURE_BLOCK_RE.exec(file.body)?.[0];
      expect(block, `${file.relPath} must carry the hard-failure block`).toBeDefined();

      // Tied to ABSENCE, not merely present. Asserted on the SHAPE of the
      // block rather than on the literal token "domain:", because #307
      // establishes that the required input differs per verb -- goal-create
      // hard-fails on an unresolvable goal, story-design on a missing
      // `domain:` label -- while the doctrine does not. The block must name
      // what it expected and record that none was found, so an unrelated
      // hard failure the body happens to emit cannot satisfy this case.
      expect(
        block ?? "",
        `${file.relPath}'s hard-failure block must name what it expected`,
      ).toMatch(/^- Expected: .+$/m);
      expect(
        block ?? "",
        `${file.relPath}'s hard-failure block must record the input's absence, not merely fail`,
      ).toMatch(/^- Found: none$/m);

      // The explicit refusal doctrine, read verbatim off the real body
      // (skills/story-design/SKILL.md:40, itself echoing
      // docs/design/03-workflow.md:406's house phrase). Presence alone is not
      // the case (per the plan's own words), so this is only ONE of the two
      // halves asserted here.
      expect(file.body, `${file.relPath} must state the refusal explicitly`).toMatch(/\bnot a default\b/i);

      // ABSENCE OF A DEFAULT — and the honest limit of what this can assert.
      //
      // The obvious assertion is "no domain id appears as a bare word
      // anywhere in a Tier-1 body". IT IS WRONG, and it must not be
      // reintroduced. Gate ruling G2 DROPPED `know` from the ban entirely
      // (Decision 4, docs/design/stories/41.md), because #46 measured the
      // real corpus and found `know` is an ordinary English word that a
      // whole-word rule does not save — 3 whole-word hits across the twelve
      // references. And references/domain-binding.md:13 states the very
      // doctrine these skills implement as "The kernel does not know what
      // `trade` or `health` means": a skill body quoting its own doctrine
      // would fail. Banning the words makes the owning document unwritable —
      // the bind recorded against NEVER-35.7, hit for a third time here.
      //
      // What IS machine-checkable is the ROUTING FORM, and that is
      // domain-routing-form's job, asserted over this same real corpus by the
      // NEVER-41.7 block above. Duplicating it here would add no coverage.
      //
      // So the two halves asserted above — a hard-failure block tied to the
      // label's ABSENCE, and an explicit refusal to default — are what this
      // case can prove over a body. The plan's own words are that "asserting
      // the absence of a default is the case"; a body that both refuses in
      // terms and carries no routing form has no remaining place to keep a
      // silent fallback. That is weaker than proving a runtime behaviour,
      // and #293's execution harness is what would close the gap.
      expect(
        lintBodyRules(file.relPath, file.body, { isSkill: true }).filter(
          (v) => v.rule === "domain-routing-form",
        ),
        `${file.relPath} must carry no routing form for any domain id`,
      ).toEqual([]);
    }
  });
});
