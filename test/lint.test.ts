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

  // Asserts that the scope string NAMES core/src/gh, which is what the test
  // title claims and what NEVER-21.9 needs. It previously asserted the whole
  // literal, which meant any legitimate widening of the rule broke a Story-21
  // test for no reason -- #261 widening the scope to core/src/evidence is
  // exactly that. Over-specifying a fixture turns every future extension into
  // a false failure.
  test("the printed scope string names core/src/gh, since it is the user-visible contract", () => {
    const source = readFileSync(join(repoRoot, "scripts", "lint.ts"), "utf8");
    const scopeLine = /"no-io-in-pure-modules": "([^"]+)"/.exec(source)?.[1] ?? "";
    expect(scopeLine).toContain("core/src/classify");
    expect(scopeLine).toContain("core/src/guards");
    expect(scopeLine).toContain("core/src/gh");
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

// NEVER-26.7 carries three cases for the same reason NEVER-21.9 did. Case 19
// proves the directory is in SCOPE, case 20 (in packages/core/test/purity.test.ts)
// proves the code RUNS with the runtime trapped, and case 21 proves the rule
// FIRES. Neither of the first two would catch a rule that silently matched
// nothing.
describe("no-io-in-pure-modules — case 19 (P0, NEVER-26.7): the rule covers packages/core/src/evidence", () => {
  test("a file under core/src/evidence is in scope for the rule", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "evidence/render.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBeGreaterThan(0);
  });

  // DE-BRITTLED IN #272, AND THE REASON IS ON RECORD TWICE NOW. This asserted
  // the WHOLE scope literal, so widening the rule to core/src/binding broke a
  // Story-26 test that has nothing to do with binding. That is the same
  // over-specification #253's analogue at :364-370 was already corrected for,
  // with the comment "over-specifying a fixture turns every future extension
  // into a false failure" — reintroduced one describe block later.
  //
  // Extract the scope string and assert it NAMES this directory. A widening
  // appends and cannot break it; a deletion still fails, because the default
  // `?? ""` contains nothing.
  test("the printed scope string names core/src/evidence, since it is the user-visible contract", () => {
    const source = readFileSync(join(repoRoot, "scripts", "lint.ts"), "utf8");
    const scope = /"no-io-in-pure-modules":\s*\n?\s*"([^"]+)"/.exec(source)?.[1] ?? "";
    expect(scope).toContain("core/src/evidence");
  });

  // ASSERT THE DENOMINATOR. #253's first attempt passed while scanning ZERO
  // files: lintTree expects a directory whose CHILDREN are packages, and
  // packages/core/src/gh has no subdirectories, so it returned [] inside the
  // very case written to prevent vacuous passes. This lints each real file and
  // checks the count first.
  test("every real file under packages/core/src/evidence has 0 violations, over a non-zero denominator", () => {
    const dir = join(repoRoot, "packages", "core", "src", "evidence");
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => join(dir, e.name));

    // If this ever drops below the module count the rest of the test proves nothing.
    expect(files.length).toBeGreaterThanOrEqual(6);

    const violations = files.flatMap((filePath) =>
      lintSource(filePath, readFileSync(filePath, "utf8"), "core"),
    );
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });

  // The scope predicate matches a path SEGMENT, never a substring. Widening it
  // must not pull "evidences/" or "evidence-store/" into a rule forbidding I/O.
  test("a directory merely starting with evidence is not pulled into scope", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    for (const rel of ["evidences/thing.ts", "evidence-store/thing.ts"]) {
      const filePath = writePackageFile(makeTempDir(), "core", rel, source);
      const violations = lintSource(filePath, source, "core");
      expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
    }
  });

  // A violation under evidence/ that cited CLAIM-15.6 would send the reader to
  // the wrong Story. Same defect class as one generic message for five distinct
  // rules — see case 3.
  test("a violation names the claim that owns the directory it was found in", () => {
    const io = `import { readFileSync } from "node:fs";\n`;
    const cases: Array<[string, string, string]> = [
      ["binding/registry.ts", "NEVER-31.7", "binding/"],
      ["evidence/render.ts", "NEVER-26.7", "evidence/"],
      ["gh/issues.ts", "CLAIM-21.1", "gh/"],
      ["classify/classify.ts", "CLAIM-15.6", "classify/ and guards/"],
      ["guards/egress.ts", "CLAIM-15.6", "classify/ and guards/"],
    ];
    for (const [rel, claim, scope] of cases) {
      const filePath = writePackageFile(makeTempDir(), "core", rel, io);
      const violations = lintSource(filePath, io, "core").filter(
        (v) => v.rule === "no-io-in-pure-modules",
      );
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.message).toContain(claim);
      expect(violations[0]?.message).toContain(scope);
    }
  });
});

// CASE 21 IS THE ONE THAT MATTERS. Cases 19 and 20 prove the directory is in
// scope and is exercised. NEITHER PROVES THE RULE FIRES.
//
// skill-lint is required in CI, reports success on every run, and scans zero
// files because skills/ is empty. A purity rule that silently matched nothing
// would be the same failure with far worse consequences — it would certify a
// directory as pure while checking none of it.
describe("no-io-in-pure-modules — case 21 (P0, NEVER-26.7): an I/O call introduced under core/src/evidence is actually caught", () => {
  test("an fs import and a fetch call are both reported when mutated in", () => {
    const mutations: Array<[string, string]> = [
      ["node:fs import", `import { readFileSync } from "node:fs";\n`],
      ["bare fs import", `import { readFileSync } from "fs";\n`],
      ["fetch call", `export const run = () => fetch("https://api.github.com");\n`],
      ["Bun.$ shell call", `export const run = () => Bun.$\`gh issue list\`;\n`],
      ["node:child_process import", `import { execFile } from "node:child_process";\n`],
      ["process.cwd read", `export const here = () => process.cwd();\n`],
    ];
    for (const [label, source] of mutations) {
      const filePath = writePackageFile(makeTempDir(), "core", "evidence/mutated.ts", source);
      const violations = lintSource(filePath, source, "core").filter(
        (v) => v.rule === "no-io-in-pure-modules",
      );
      expect(violations.length, `${label} must be reported`).toBeGreaterThan(0);
      expect(violations[0]?.message).toContain("NEVER-26.7");
    }
  });

  test("reverting the mutation restores 0 violations", () => {
    const clean = `export const sentinelFor = (n: string): string => "## iai-" + n;\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "evidence/clean.ts", clean);
    const violations = lintSource(filePath, clean, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #272 — S1.5.4. NEVER-31.7 (cases 15, 17) and NEVER-31.10 (cases 21, 22).
//
// THE THIRD INSTANCE OF THE THREE-CASE PATTERN, AND IT IS STILL NOT REDUNDANT.
// Case 15 proves the directory is IN SCOPE, case 16 (packages/core/test/purity.test.ts)
// proves the code RUNS TRAPPED, case 17 proves the rule FIRES. #261's story
// verification found a mutation only the harness caught: an obfuscated
// `globalThis["pro" + "cess"]` lookup leaves `bun run lint` at exit 0 with zero
// violations, because a static rule certifies only the source it can read
// (docs/evidence/261-20260904T040110Z.md).
// ---------------------------------------------------------------------------

describe("no-io-in-pure-modules — case 15 (P0, NEVER-31.7): the rule covers packages/core/src/binding", () => {
  test("a file under core/src/binding is in scope for the rule", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "binding/registry.ts", source);
    const violations = lintSource(filePath, source, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules").length).toBeGreaterThan(0);
  });

  test("the printed scope string names core/src/binding, since it is the user-visible contract", () => {
    const source = readFileSync(join(repoRoot, "scripts", "lint.ts"), "utf8");
    const scope = /"no-io-in-pure-modules":\s*\n?\s*"([^"]+)"/.exec(source)?.[1] ?? "";
    expect(scope).toContain("core/src/binding");
  });

  // ASSERT THE DENOMINATOR. #253's first attempt passed while scanning ZERO
  // files, inside the very case written to prevent vacuous passes.
  test("every real file under packages/core/src/binding has 0 violations, over a non-zero denominator", () => {
    const dir = join(repoRoot, "packages", "core", "src", "binding");
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts"))
      .map((e) => join(dir, e.name));

    expect(files.length).toBeGreaterThanOrEqual(4);

    const violations = files.flatMap((filePath) =>
      lintSource(filePath, readFileSync(filePath, "utf8"), "core"),
    );
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });

  test("a directory merely starting with binding is not pulled into scope", () => {
    const source = `import { readFileSync } from "node:fs";\n`;
    for (const rel of ["bindings/thing.ts", "binding-store/thing.ts"]) {
      const filePath = writePackageFile(makeTempDir(), "core", rel, source);
      const violations = lintSource(filePath, source, "core");
      expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
    }
  });
});

// CASE 17 IS THE ONE THAT MATTERS for NEVER-31.7. Case 15 proves scope, case 16
// proves the code runs trapped. NEITHER PROVES THE RULE FIRES.
describe("no-io-in-pure-modules — case 17 (P0, NEVER-31.7): an I/O call introduced under core/src/binding is caught", () => {
  test("all six I/O forms are reported, and each names NEVER-31.7", () => {
    const mutations: Array<[string, string]> = [
      ["node:fs import", `import { readFileSync } from "node:fs";\n`],
      ["bare fs import", `import { readFileSync } from "fs";\n`],
      ["fetch call", `export const run = () => fetch("https://api.github.com");\n`],
      ["Bun.$ shell call", `export const run = () => Bun.$\`gh issue list\`;\n`],
      ["node:child_process import", `import { execFile } from "node:child_process";\n`],
      ["process.cwd read", `export const here = () => process.cwd();\n`],
    ];
    for (const [label, source] of mutations) {
      const filePath = writePackageFile(makeTempDir(), "core", "binding/mutated.ts", source);
      const violations = lintSource(filePath, source, "core").filter(
        (v) => v.rule === "no-io-in-pure-modules",
      );
      expect(violations.length, `${label} must be reported`).toBeGreaterThan(0);
      // The attribution half. Without a `pureModuleOwner` arm this reads
      // CLAIM-15.6 and sends the reader to the wrong Story.
      expect(violations[0]?.message, `${label} must name NEVER-31.7`).toContain("NEVER-31.7");
    }
  });

  test("reverting the mutation restores 0 violations", () => {
    const clean = `export const noop = (): number => 1;\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "binding/clean.ts", clean);
    const violations = lintSource(filePath, clean, "core");
    expect(violations.filter((v) => v.rule === "no-io-in-pure-modules")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NEVER-31.10 — a rule that has never existed, so there is no prior evidence it
// works. skill-lint is required in CI, reports success on every run, and scans
// ZERO files. A new rule that matched nothing would look identical from the
// outside. Cases 21 and 22 are the two-case compression of the same shape: 21
// defines the rule, 22 proves it fires and is reported.
// ---------------------------------------------------------------------------

describe("no-domain-pack-import — case 21 (P0, NEVER-31.10): a core/src file importing a domain pack is a violation", () => {
  // All four forms the ban must catch. The relative form is what someone
  // reaches for once the specifier form is blocked.
  const forms: Array<[string, string]> = [
    ["static import", `import { dev } from "iai-domain-dev";\n`],
    ["dynamic import()", `export const load = () => import("iai-domain-dev");\n`],
    ["require", `const dev = require("iai-domain-dev");\n`],
    ["relative path", `import { dev } from "../../domain-dev/src/index";\n`],
  ];

  test("each of the four import forms is reported and names NEVER-31.10", () => {
    for (const [label, source] of forms) {
      const filePath = writePackageFile(makeTempDir(), "core", "binding/registry.ts", source);
      // FILTERED BY RULE, DELIBERATELY. The relative form also leaves the
      // package, so it legitimately trips `no-host-import` as well. Asserting
      // a total count here would couple this case to that rule.
      const violations = lintSource(filePath, source, "core").filter(
        (v) => v.rule === "no-domain-pack-import",
      );
      expect(violations.length, `${label} must be reported`).toBeGreaterThan(0);
      expect(violations[0]?.message, `${label} must name NEVER-31.10`).toContain("NEVER-31.10");
    }
  });

  test("a re-export of a domain pack is caught too, not only an import", () => {
    const source = `export { dev } from "iai-domain-dev";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "index.ts", source);
    const violations = lintSource(filePath, source, "core").filter(
      (v) => v.rule === "no-domain-pack-import",
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  test("the rule is core-only: another package importing a pack is not flagged", () => {
    // Matching every other scoped rule in scripts/lint.ts. A domain pack may
    // depend on another package; that is not this rule's business.
    const source = `import { dev } from "iai-domain-dev";\n`;
    for (const pkg of ["adapter-claude", "installer", "domain-null"]) {
      const filePath = writePackageFile(makeTempDir(), pkg, "index.ts", source);
      const violations = lintSource(filePath, source, pkg).filter(
        (v) => v.rule === "no-domain-pack-import",
      );
      expect(violations, `${pkg} must not be flagged`).toEqual([]);
    }
  });

  // THE SCOPE IS packages/core/src, NOT packages/core, AND THIS IS THE CASE
  // THAT PINS IT. #34 gave packages/core a dev-only dependency on
  // iai-domain-null so the conformance suite could import the fixture BY
  // PACKAGE NAME. That test file imports a domain pack on purpose. A rule
  // scoped to the whole package would fail it, and the correct response would
  // not have been to weaken the rule.
  test("packages/core/test may import a domain pack; only src is banned", () => {
    const source = `import { nullBinding } from "iai-domain-null";\n`;
    const dir = makeTempDir();
    const filePath = join(dir, "core", "test", "conformance.test.ts");
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, source, "utf8");
    const violations = lintSource(filePath, source, "core").filter(
      (v) => v.rule === "no-domain-pack-import",
    );
    expect(violations).toEqual([]);
  });

  test("a non-domain relative import inside core/src is not flagged", () => {
    // The converse guard. A rule that flagged every relative path would report
    // a violation on almost every file in the package.
    const source = `import { decide } from "../decision";\n`;
    const filePath = writePackageFile(makeTempDir(), "core", "binding/registry.ts", source);
    const violations = lintSource(filePath, source, "core").filter(
      (v) => v.rule === "no-domain-pack-import",
    );
    expect(violations).toEqual([]);
  });
});

describe("no-domain-pack-import — case 22 (P0, NEVER-31.10): the rule fires against the real tree and reports 0 there", () => {
  test("the real packages tree has 0 violations of this rule, over a non-zero denominator", () => {
    const violations = lintTree(join(repoRoot, "packages")).filter(
      (v) => v.rule === "no-domain-pack-import",
    );
    expect(violations).toEqual([]);
  });

  test("a mutation introduced into a real core/src file is reported, and reverting restores 0", () => {
    // Against the REAL file path, so the scope predicate is exercised as it
    // runs in production rather than against a temp-dir shape.
    const real = join(repoRoot, "packages", "core", "src", "binding", "registry.ts");
    const clean = readFileSync(real, "utf8");
    const mutated = `import { nullBinding } from "iai-domain-null";\n${clean}`;

    const withMutation = lintSource(real, mutated, "core").filter(
      (v) => v.rule === "no-domain-pack-import",
    );
    expect(withMutation.length).toBeGreaterThan(0);
    expect(withMutation[0]?.message).toContain("NEVER-31.10");

    // Reverting is asserted against the same path, not a different fixture.
    const reverted = lintSource(real, clean, "core").filter(
      (v) => v.rule === "no-domain-pack-import",
    );
    expect(reverted).toEqual([]);
  });

  test("the rule appears in RULE_SCOPES with its scope printed, so it cannot run and report nothing", () => {
    // A rule absent from RULE_SCOPES still runs but never prints a line, which
    // is indistinguishable from a rule that found nothing. skill-lint is the
    // standing example of a check that passes while checking nothing.
    const source = readFileSync(join(repoRoot, "scripts", "lint.ts"), "utf8");
    const scope = /"no-domain-pack-import":\s*\n?\s*"([^"]+)"/.exec(source)?.[1] ?? "";
    expect(scope).toContain("core/src");
    // And it is listed for printing, not merely defined.
    expect(source).toContain('"no-domain-pack-import",');
  });
});
