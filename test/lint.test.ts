import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("lint — case 32 (P0, CLAIM-15.6): no-io-in-pure-modules", () => {
  test("importing node:fs under core/src/classify/ is a no-io-in-pure-modules violation citing CLAIM-15.6", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "classify/bad.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-io-in-pure-modules");
    expect(violations[0]?.message).toContain("CLAIM-15.6");
    expect(violations[0]?.message).toContain("node:fs");
  });

  test("requiring net under core/src/guards/ is a no-io-in-pure-modules violation", () => {
    const source = `const net = require("net");\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "guards/bad.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.length).toBe(1);
    expect(violations[0]?.rule).toBe("no-io-in-pure-modules");
    expect(violations[0]?.message).toContain("net");
  });

  test("importing every listed I/O specifier under core/src/classify/ is one violation each", () => {
    const specifiers = [
      "fs",
      "node:fs",
      "fs/promises",
      "net",
      "node:net",
      "path",
      "node:path",
      "os",
      "node:os",
      "child_process",
      "node:child_process",
      "http",
      "https",
      "crypto",
      "node:crypto",
      "worker_threads",
    ];
    for (const specifier of specifiers) {
      const source = `import x from "${specifier}";\n`;
      const filePath = writePackageFile(makeTempDir(), "core", `classify/bad-${specifier.replace(/[/:]/g, "-")}.ts`, source);
      const violations = lintSource(filePath, source, "core");
      expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBe(1);
    }
  });

  test("process. member access under core/src/classify/ is a no-io-in-pure-modules violation", () => {
    const source = "export function f(): string {\n  return process.cwd();\n}\n";
    const filePath = writePackageFile(makeTempDir(), "core", "classify/bad.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBe(1);
    expect(violations.find((v) => v.rule === "no-io-in-pure-modules")?.message).toContain("process.cwd");
  });

  test("Bun. member access under core/src/guards/ is a no-io-in-pure-modules violation", () => {
    const source = "export function f(): string {\n  return Bun.env.HOME ?? '';\n}\n";
    const filePath = writePackageFile(makeTempDir(), "core", "guards/bad.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBe(1);
    expect(violations.find((v) => v.rule === "no-io-in-pure-modules")?.message).toContain("Bun.env");
  });

  test("fetch( under core/src/classify/ is a no-io-in-pure-modules violation", () => {
    const source = "export async function f(): Promise<unknown> {\n  return fetch('https://example.com');\n}\n";
    const filePath = writePackageFile(makeTempDir(), "core", "classify/bad.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBe(1);
  });

  test("mentions of fs and process.cwd() inside comments under core/src/classify/ are 0 violations (the real classify/path.ts case)", () => {
    const source = [
      "// PURE STRING MATCHING ONLY -- no `fs`, no `path`, no `process.cwd()`, no",
      "// resolving against a real filesystem, and no Bun.file() either.",
      "export function classifyPath(path: string): string {",
      "  return path;",
      "}",
      "",
    ].join("\n");
    const filePath = writePackageFile(makeTempDir(), "core", "classify/path.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations).toEqual([]);
  });

  test("the real packages/core/src/classify/path.ts has 0 no-io-in-pure-modules violations", () => {
    const filePath = join(repoRoot, "packages", "core", "src", "classify", "path.ts");
    const source = readFileSync(filePath, "utf8");
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });

  test("a fs import under core/src/decision.ts (outside classify/, guards/ and gh/) is not flagged by this rule", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "decision.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });

  test("a fs import under a guards/ or gh/ directory of a non-core package is not flagged by this rule (scope is core-only)", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    const filePath = writePackageFile(makeTempDir(), "domain-dev", "guards/bad.ts", source);
    const violations = lintSource(filePath, source, "domain-dev");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });

  test("the real repo's packages tree has 0 no-io-in-pure-modules violations", () => {
    const violations = lintTree(join(repoRoot, "packages"));
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
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

// ---------------------------------------------------------------------------
// #253 — NEVER-21.9 and the banned-token half of CLAIM-21.1.
//
// Before #253, `no-io-in-pure-modules` matched only the path segments
// `classify` and `guards`. Any file under packages/core/src/gh could import
// node:child_process, call Bun.$ and call fetch with ZERO violations, so
// CLAIM-21.1 was enforced by nothing at all.
// ---------------------------------------------------------------------------

describe("no-io-in-pure-modules — case 18 (P0, NEVER-21.9): the rule covers packages/core/src/gh", () => {
  test("a file under core/src/gh is in scope for the rule", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "gh/issues.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBeGreaterThan(0);
  });

  test("the printed scope string names core/src/gh, since it is the user-visible contract", () => {
    const source = readFileSync(join(repoRoot, "scripts", "lint.ts"), "utf8");
    expect(source).toContain('"no-io-in-pure-modules": "core/src/classify, core/src/guards, core/src/gh"');
  });

  // The scope predicate matches a path SEGMENT, never a substring. "ghost" and
  // "guardsomething" must stay out, or widening the scope would silently pull
  // unrelated directories into a rule that forbids I/O.
  test("a directory merely starting with gh is not pulled into scope", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    for (const rel of ["ghost/thing.ts", "guardsomething/thing.ts"]) {
      const filePath = writePackageFile(makeTempDir(), "core", rel, source);
      const violations = lintSource(filePath, source, "core");
      expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
    }
  });
});

// Case 20 is the reason NEVER-21.9 carries three cases and not one. Cases 18
// and 19 prove the directory is in scope and is exercised. NEITHER PROVES THE
// RULE FIRES.
//
// That distinction is not hypothetical here: skill-lint is in CI, reports
// success on every run, and scans ZERO files because skills/ is empty. A purity
// rule that silently matched nothing would be the same failure with far worse
// consequences.
describe("no-io-in-pure-modules — case 20 (P0, NEVER-21.9): an I/O call introduced under core/src/gh is actually caught", () => {
  test("each of CLAIM-21.1's three banned tokens is reported when mutated in", () => {
    const mutations: Array<[string, string]> = [
      ["node:child_process import", `import { execFile } from "node:child_process";\n`],
      ["bare child_process import", `import { execFile } from "child_process";\n`],
      ["Bun.$ shell call", `export const run = () => Bun.$\`gh issue list\`;\n`],
      ["fetch call", `export const run = () => fetch("https://api.github.com");\n`],
      ["node:fs import", `import { readFileSync } from "node:fs";\n`],
    ];
    for (const [label, source] of mutations) {
      const filePath = writePackageFile(makeTempDir(), "core", "gh/mutated.ts", source);
      const violations = lintSource(filePath, source, "core").filter(
        (v) => v.rule === "no-io-in-pure-modules",
      );
      expect(violations.length, `${label} must be reported`).toBeGreaterThan(0);
    }
  });

  test("reverting the mutation restores 0 violations", () => {
    const clean = `export const argv = (n: number): readonly string[] => ["gh", "issue", "view", String(n)];\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "gh/clean.ts", clean);
    const violations = lintSource(filePath, clean, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });
});

// Case 2 (P0, CLAIM-21.1). NOTE THE VERIFIER.
//
// docs/test-plans/21-plan.md specifies "grep over the directory ... 0
// occurrences of all three tokens". A naive substring grep is WRONG and this
// Story tripped it three times on correct code:
//
//   - the prose word "fetched" in a comment          (gh/types.ts, #22)
//   - a verbatim quote of docs/design/09-security.md (gh/errors.ts, #25)
//   - the --json field name `mergeCommit`            (gh/pr.ts, #24)
//
// The lint rule is right in all three: FETCH_CALL_RE is /\bfetch\s*\(/ and
// NEVER-21.10 compares argv elements with ===. So this case is asserted
// against CALL forms via the real rule, not against substrings.
describe("no-io-in-pure-modules — case 2 (P0, CLAIM-21.1): no file under core/src/gh references child_process, Bun.$ or fetch", () => {
  // NOT lintTree(). lintTree expects a directory whose CHILDREN are packages;
  // packages/core/src/gh has no subdirectories, so passing it there scans zero
  // files and returns [] — a vacuous pass, in the very case that exists to
  // prevent vacuous passes. The file count is asserted for that reason.
  test("every real file under packages/core/src/gh has 0 no-io-in-pure-modules violations", () => {
    const ghDir = join(repoRoot, "packages", "core", "src", "gh");
    const files = readdirSync(ghDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => join(ghDir, e.name));

    // If this ever drops to 0 the rest of the test proves nothing.
    expect(files.length).toBeGreaterThanOrEqual(8);

    const violations = files.flatMap((filePath) =>
      lintSource(filePath, readFileSync(filePath, "utf8"), "core"),
    );
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });

  test("prose containing the word fetch is not a violation, but a fetch call is", () => {
    const prose = `// the response cannot be fetched here - it has to arrive\nexport const x = 1;\n`;
    const proseFile = writePackageFile(makeTempDir(), "core", "gh/prose.ts", prose);
    expect(lintSource(proseFile, prose, "core").filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);

    const call = `export const x = () => fetch("https://example.com");\n`;
    const callFile = writePackageFile(makeTempDir(), "core", "gh/call.ts", call);
    expect(
      lintSource(callFile, call, "core").filter((v) => v.rule === "no-io-in-pure-modules").length,
    ).toBeGreaterThan(0);
  });
});
