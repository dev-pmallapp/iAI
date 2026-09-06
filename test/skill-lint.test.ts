import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASELINE_REFERENCES,
  MAX_DISCRETIONARY_REFERENCES,
  MODEL_ID_EXEMPT_PATH,
  MODEL_ID_VENDORS,
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
    const v = lintBodyRules("skills/x/SKILL.md", cites.join(" "));
    expect(v.map((x) => x.rule)).toEqual(["reference-citation-count"]);
    expect(v[0]?.message).toContain(cites[cites.length - 1] ?? "!");
  });

  test("a SKILL exactly at the cap passes — the boundary is inclusive", () => {
    expect(lintBodyRules("skills/x/SKILL.md", atCap().join(" "))).toEqual([]);
  });

  test("the same reference cited repeatedly counts once", () => {
    const one = realDiscretionary()[0] ?? "";
    const body = new Array(MAX_DISCRETIONARY_REFERENCES + 3).fill(one).join(" ");
    expect(lintBodyRules("skills/x/SKILL.md", body)).toEqual([]);
  });

  test("a REFERENCE document over the cap is NOT capped", () => {
    // docs/design/01-skill-hierarchy.md:472 bounds "a SKILL", and Problem 4 of
    // stories/35.md says CLAIM-35.5 counts "per skill body". Capping a
    // reference would push the twelve toward restating each other, which is
    // backwards from the cite-don't-restate doctrine.
    const body = overCap(3).join(" ");
    // Same body, both populations — the pair is the case.
    expect(lintBodyRules("references/workflow-states.md", body, { isSkill: false })).toEqual([]);
    expect(lintBodyRules("skills/x/SKILL.md", body).map((v) => v.rule)).toEqual([
      "reference-citation-count",
    ]);
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
    const own = atCap();
    const extra = realDiscretionary()[MAX_DISCRETIONARY_REFERENCES] ?? "";
    const withBaseline = [...own, ...BASELINE_REFERENCES].join(" ");
    const withExtra = [...own, extra].join(" ");
    expect(lintBodyRules("skills/x/SKILL.md", withBaseline)).toEqual([]);
    expect(lintBodyRules("skills/x/SKILL.md", withExtra).map((v) => v.rule)).toEqual([
      "reference-citation-count",
    ]);
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
  // using `trade`, and CONTRIBUTING.md:304 uses `know` twice. THAT is what case
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
  // CASE 10.
  test("a Tier-1 body carrying a label routing form is reported, and only as that", () => {
    const v = lintBodyRules("skills/story-design/SKILL.md", "route when `domain:trade` is set");
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
    const v = lintBodyRules("skills/story-create/SKILL.md", "load `skills/health/domain.md`");
    expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
    expect(v[0]?.message).toContain("skills/health");
  });

  // CONTRIBUTING.md:303-304 exactly: "A leaf skill may know its own domain; a
  // Tier-1 verb may never know any." The carve-out is DERIVED from the path,
  // so no list of the fourteen verbs exists to go stale.
  test("a Tier-2 leaf skill may name its OWN domain but not another", () => {
    const own = lintBodyRules("skills/trade-backtest/SKILL.md", "this is `domain:trade` work");
    expect(own.filter((x) => x.rule === "domain-routing-form")).toEqual([]);

    const other = lintBodyRules("skills/trade-backtest/SKILL.md", "also `domain:health`");
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
    const v = lintBodyRules("skills/development-tools/SKILL.md", "route on `domain:dev`");
    expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
  });

  test("a longer word beginning with a domain id is not a routing form", () => {
    expect(routingForms("`domain:knowledge` and `skills/devops` and `domain:development`")).toEqual([]);
  });

  // CASE 22.
  test("the rule reads KNOWN_DOMAIN_IDS and does not restate the five ids", () => {
    // Every shipped id is enforced, derived from the export rather than listed.
    for (const id of KNOWN_DOMAIN_IDS) {
      const v = lintBodyRules("skills/goal-create/SKILL.md", `see \`domain:${id}\``);
      expect(v.map((x) => x.rule)).toEqual(["domain-routing-form"]);
    }
    // And no second copy of the list exists in the linter source.
    const source = readReal("scripts/skill-lint.ts");
    const literalList = KNOWN_DOMAIN_IDS.map((id) => `"${id}"`).join(", ");
    expect(source).not.toContain(literalList);
    expect(source).toContain("KNOWN_DOMAIN_IDS");
  });
});

describe("domain-routing-form vacuity, stated rather than hidden", () => {
  // NEVER-41.7 says "proved over the real four-skill corpus, not a fixture".
  // THE FOUR SKILLS DO NOT EXIST YET -- they are #42-#45. This rule ships
  // BEFORE its own skill corpus, which is the opposite of how #280 was
  // sequenced, and finding 36 of the S2.1 evidence is explicit that sequencing
  // a rule after its corpus is what stopped it shipping wrong and green.
  //
  // The trade is deliberate and it is recorded on #46: a rule that constrains
  // how the four verbs are WRITTEN is worth more before they are written than
  // after, which is the same preventive-beats-detective argument #289 settled.
  // What protects it is that the skill denominator is ASSERTED to be zero
  // today, so nobody can mistake a green run for a verified claim.
  test("the skill population is empty today, so NEVER-41.7 is NOT yet discharged", () => {
    const skillsDir = join(repoRootForDomains, "skills");
    const skillFiles = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => existsSync(join(skillsDir, e.name, "SKILL.md")));

    // When this goes red, the four verbs have landed and NEVER-41.7 becomes
    // provable over real bodies. Update it then; do not delete it.
    expect(skillFiles).toHaveLength(0);
  });

  test("the contract population is NOT empty, so the rule is not vacuous today", () => {
    expect(realReferenceDocs().length).toBeGreaterThanOrEqual(12);
  });
});
