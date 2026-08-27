import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSource, lintTree } from "../scripts/lint";

const repoRoot = join(import.meta.dir, "..");

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "iai-lint-"));
  tempDirs.push(dir);
  return dir;
}

function writePackageFile(root: string, packageName: string, relativePath: string, content: string): string {
  const filePath = join(root, packageName, "src", relativePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("lintSource", () => {
  test("clean core file has 0 violations", () => {
    const dir = makeTempDir();
    const source = "export function add(a: number, b: number): number {\n  return a + b;\n}\n";
    const filePath = writePackageFile(dir, "core", "clean.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations).toEqual([]);
  });

  test("core importing iai-adapter-opencode is a no-host-import violation naming the file and specifier", () => {
    const dir = makeTempDir();
    const source = `import { foo } from "iai-adapter-opencode";\n`;
    const filePath = writePackageFile(dir, "core", "bad.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
    expect(violations[0]?.file).toBe(filePath);
    expect(violations[0]?.message).toContain("iai-adapter-opencode");
  });

  test("core importing iai-adapter-claude is a no-host-import violation", () => {
    const source = `import { foo } from "iai-adapter-claude";\n`;
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
    expect(violations[0]?.message).toContain("iai-adapter-claude");
  });

  test("core doing import \"@opencode-ai/plugin\" is a no-host-import violation", () => {
    const source = `import "@opencode-ai/plugin";\n`;
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
    expect(violations[0]?.message).toContain("@opencode-ai/plugin");
  });

  test("core doing export { x } from \"iai-adapter-opencode\" is a no-host-import violation", () => {
    const source = `export { x } from "iai-adapter-opencode";\n`;
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
  });

  test("core importing ../../adapter-opencode/src/index is a no-host-import violation", () => {
    const filePath = join("/x/packages/core/src/bad.ts");
    const source = `import { foo } from "../../adapter-opencode/src/index";\n`;
    const violations = lintSource(filePath, source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
    expect(violations[0]?.message).toContain("../../adapter-opencode/src/index");
  });

  test("core importing ./sibling and node:path has 0 violations", () => {
    const source = `import { a } from "./sibling";\nimport { b } from "node:path";\n`;
    const violations = lintSource("/x/packages/core/src/ok.ts", source, "core");
    expect(violations).toEqual([]);
  });

  test("core calling process.cwd() is a no-process-cwd violation citing the rule", () => {
    const source = `export function f(): string {\n  return process.cwd();\n}\n`;
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-process-cwd");
    expect(violations[0]?.message).toContain("process.cwd()");
  });

  test("adapter-opencode calling process.cwd() is a no-process-cwd violation", () => {
    const source = `export function f(): string {\n  return process.cwd();\n}\n`;
    const violations = lintSource("/x/adapter-opencode/src/bad.ts", source, "adapter-opencode");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-process-cwd");
  });

  test("domain-dev calling process.cwd() has 0 violations (scope boundary)", () => {
    const source = `export function f(): string {\n  return process.cwd();\n}\n`;
    const violations = lintSource("/x/domain-dev/src/ok.ts", source, "domain-dev");
    expect(violations).toEqual([]);
  });

  test("adapter-claude importing iai-adapter-opencode has 0 no-host-import violations (rule is core-only)", () => {
    const source = `import { foo } from "iai-adapter-opencode";\n`;
    const violations = lintSource("/x/adapter-claude/src/ok.ts", source, "adapter-claude");
    expect(violations.filter((v) => v.rule === "no-host-import")).toEqual([]);
  });

  test("mentions of process.cwd() and iai-adapter-claude only inside comments produce 0 violations", () => {
    const source = [
      "// process.cwd() mentioned here, and iai-adapter-claude too",
      "/* another mention of process.cwd() and iai-adapter-claude */",
      "export function f(): number {",
      "  return 1;",
      "}",
      "",
    ].join("\n");
    const violations = lintSource("/x/core/src/ok.ts", source, "core");
    expect(violations).toEqual([]);
  });

  test("a non-import string literal containing \"iai-adapter-claude\" is 0 no-host-import violations", () => {
    const source = `export const label = "iai-adapter-claude";\n`;
    const violations = lintSource("/x/core/src/ok.ts", source, "core");
    expect(violations.filter((v) => v.rule === "no-host-import")).toEqual([]);
  });

  test("exec with a template literal is a no-exec-template violation in any package", () => {
    const source = "export function run(dir: string): void {\n  exec(`ls ${dir}`);\n}\n";
    const violations = lintSource("/x/domain-dev/src/bad.ts", source, "domain-dev");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-exec-template");
  });

  test("execSync with a template literal is a no-exec-template violation", () => {
    const source = "export function run(dir: string): void {\n  execSync(`ls ${dir}`);\n}\n";
    const violations = lintSource("/x/domain-dev/src/bad.ts", source, "domain-dev");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-exec-template");
  });

  test("core doing a dynamic import of iai-adapter-opencode is a no-host-import violation", () => {
    const source = `const m = await import("iai-adapter-opencode");\n`;
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
    expect(violations[0]?.message).toContain("iai-adapter-opencode");
  });

  test("core doing a require of iai-adapter-claude is a no-host-import violation", () => {
    const source = `const m = require("iai-adapter-claude");\n`;
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-host-import");
    expect(violations[0]?.message).toContain("iai-adapter-claude");
  });

  test("execFile with an argument array has 0 violations", () => {
    const source = 'export function run(dir: string): void {\n  execFile("ls", [dir]);\n}\n';
    const violations = lintSource("/x/domain-dev/src/ok.ts", source, "domain-dev");
    expect(violations).toEqual([]);
  });

  test("line and column are 1-based and correct for a violation on a known line", () => {
    const source = "export function f(): string {\n  return process.cwd();\n}\n";
    const violations = lintSource("/x/core/src/bad.ts", source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.line).toBe(2);
    expect(violations[0]?.column).toBe(10);
    expect(source.split("\n")[1]?.slice((violations[0]?.column ?? 1) - 1)).toStartWith("process.cwd(");
  });
});

describe("lintTree", () => {
  test("the real repo's packages tree has 0 violations", () => {
    const violations = lintTree(join(repoRoot, "packages"));
    expect(violations).toEqual([]);
  });

  test("core/src/core/deep.ts importing ../sibling stays inside the package boundary", () => {
    const dir = makeTempDir();
    writePackageFile(dir, "core", "sibling.ts", "export const sibling = 1;\n");
    writePackageFile(dir, "core", "core/deep.ts", 'import { sibling } from "../sibling";\n');
    const violations = lintTree(dir);
    expect(violations).toEqual([]);
  });
});

describe("lint CLI", () => {
  test("exits 1 and reports the offending file and rule for a bad tree", async () => {
    const dir = makeTempDir();
    writePackageFile(
      dir,
      "core",
      "bad.ts",
      'import { foo } from "iai-adapter-opencode";\nexport function f(): string {\n  return process.cwd();\n}\n',
    );

    const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "lint.ts"), dir], {
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
    expect(combined).toContain("bad.ts");
    expect(combined).toContain("no-host-import");
    expect(combined).toContain("no-process-cwd");
  });

  test("exits 0 for the real packages dir", async () => {
    const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "lint.ts"), join(repoRoot, "packages")], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
