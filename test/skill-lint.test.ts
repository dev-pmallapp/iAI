import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkillSource, lintSkillTree } from "../scripts/skill-lint";

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
      "  ISA. Read-only with respect to any broker.",
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
