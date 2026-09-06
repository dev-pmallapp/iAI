import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASELINE_REFERENCES,
  MAX_DISCRETIONARY_REFERENCES,
  MODEL_ID_EXEMPT_PATH,
  MODEL_ID_VENDORS,
  discoverContractFiles,
  discretionaryReferences,
  lintBodyRules,
  lintContractTree,
  lintSkillSource,
  lintSkillTree,
} from "../scripts/skill-lint";
// Contracts are IMPORTED, never restated — the rule under test polices
// exactly this, and a test that restated them would be its own violation.
import {
  COMMIT_PREFIX_RE,
  EXCLUSIVE_LABEL_PREFIXES,
  SENTINEL_NAMESPACE_PREFIX,
} from "../packages/core/src/index";

const repoRoot = join(import.meta.dir, "..");

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "iai-skill-lint-"));
  tempDirs.push(dir);
  return dir;
}

function writeSkillFile(root: string, skillName: string, content: string): string {
  const filePath = join(root, skillName, "SKILL.md");
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

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
      ["---", "name: foo", "description: Does foo things.", "---", ""].join("\n"),
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
      ["---", "name: foo", "description: Does foo things.", "---", ""].join("\n"),
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
  test("a body restating the sentinel namespace prefix is reported", () => {
    const v = lintBodyRules("skills/x/SKILL.md", `see ${SENTINEL_NAMESPACE_PREFIX}gate`);
    expect(v.map((x) => x.rule)).toEqual(["duplicate-contract"]);
    expect(v[0]?.message).toContain("sentinel namespace prefix");
    // Assert the REASON, not just the verdict: docs/evidence/33-... records
    // three mutations surviving because a later rule rejected the fixture.
    expect(v[0]?.message).not.toContain("commit-subject");
    expect(v[0]?.message).not.toContain("model");
  });

  test("a body restating the commit-subject regex is reported, distinctly", () => {
    const v = lintBodyRules("skills/x/SKILL.md", `re ${COMMIT_PREFIX_RE.source}`);
    expect(v.map((x) => x.rule)).toEqual(["duplicate-contract"]);
    expect(v[0]?.message).toContain("commit-subject");
    expect(v[0]?.message).not.toContain("sentinel namespace");
  });

  test("a body restating the exclusive-label ARRAY is reported", () => {
    const v = lintBodyRules("skills/x/SKILL.md", `arr ${JSON.stringify(EXCLUSIVE_LABEL_PREFIXES)}`);
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
    const v = lintBodyRules("skills/x/SKILL.md", "see packages/core/src/evidence/sentinel.ts:53");
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

// Fixtures are built FROM the exported cap, not from the literal 4 and 3 they
// carried when the cap was 3 (#280). Issue #287 raised it to 5, and a fixture
// written against the old number is a test that stops testing the boundary.
const overCap = (n = 1) =>
  Array.from({ length: MAX_DISCRETIONARY_REFERENCES + n }, (_, i) => `references/over${String(i)}.md`);
const atCap = () =>
  Array.from({ length: MAX_DISCRETIONARY_REFERENCES }, (_, i) => `references/at${String(i)}.md`);

describe("reference-citation-count (CLAIM-35.5)", () => {
  test("a SKILL one over the cap fails and names the offenders", () => {
    const cites = overCap();
    const v = lintBodyRules("skills/x/SKILL.md", cites.join(" "));
    expect(v.map((x) => x.rule)).toEqual(["reference-citation-count"]);
    expect(v[0]?.message).toContain(cites[cites.length - 1] ?? "!");
  });

  test("a SKILL exactly at the cap passes — the boundary is inclusive", () => {
    expect(lintBodyRules("skills/x/SKILL.md", atCap().join(" "))).toEqual([]);
  });

  test("the same reference cited repeatedly counts once", () => {
    const body = new Array(MAX_DISCRETIONARY_REFERENCES + 3).fill("references/a.md").join(" ");
    expect(lintBodyRules("skills/x/SKILL.md", body)).toEqual([]);
  });

  test("a REFERENCE document over the cap is NOT capped", () => {
    // docs/design/01-skill-hierarchy.md:472 bounds "a SKILL", and Problem 4 of
    // stories/35.md says CLAIM-35.5 counts "per skill body". Capping a
    // reference would push the twelve toward restating each other, which is
    // backwards from the cite-don't-restate doctrine.
    expect(lintBodyRules("references/z.md", overCap(4).join(" "), { isSkill: false })).toEqual([]);
  });

  test("the cap is the exported constant, not a literal in the rule", () => {
    expect(lintBodyRules("skills/x/SKILL.md", atCap().join(" "))).toEqual([]);
    expect(lintBodyRules("skills/x/SKILL.md", overCap().join(" ")).length).toBe(1);
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
    const v = lintBodyRules("skills/x/SKILL.md", "see packages/core and docs/design/02-roles.md");
    expect(v).toEqual([]);
  });

  test("the vendor list is non-empty and each vendor is detected", () => {
    expect(MODEL_ID_VENDORS.length).toBeGreaterThan(0);
    for (const vendor of MODEL_ID_VENDORS) {
      const v = lintBodyRules("skills/x/SKILL.md", `${vendor}/some-model-1`);
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
    expect(lintBodyRules("skills/x/SKILL.md", body)).toEqual([]);
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
    const own = Array.from({ length: MAX_DISCRETIONARY_REFERENCES }, (_, i) => `references/own${String(i)}.md`);
    const withBaseline = [...own, ...BASELINE_REFERENCES].map((r) => r).join(" ");
    const withExtra = [...own, "references/extra.md"].join(" ");
    expect(lintBodyRules("skills/x/SKILL.md", withBaseline)).toEqual([]);
    expect(lintBodyRules("skills/x/SKILL.md", withExtra).map((v) => v.rule)).toEqual([
      "reference-citation-count",
    ]);
  });

  test("the message says DISCRETIONARY and names the exemption", () => {
    const over = Array.from({ length: MAX_DISCRETIONARY_REFERENCES + 1 }, (_, i) => `references/o${String(i)}.md`).join(" ");
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
