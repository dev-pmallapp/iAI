import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export type RuleId =
  | "no-host-import"
  | "no-process-cwd"
  | "no-exec-template"
  | "no-io-in-pure-modules"
  | "no-domain-pack-import";

export interface Violation {
  file: string;
  line: number;
  column: number;
  rule: RuleId;
  message: string;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set(["node_modules", "dist"]);

const HOST_MODULES = [
  "opencode",
  "@opencode-ai/sdk",
  "@opencode-ai/plugin",
  "claude-code",
  "@anthropic-ai/claude-code",
  "@anthropic-ai/sdk",
];

const ADAPTER_SPECIFIER_RE = /^iai-adapter-[^/]+(\/.*)?$/;

// This masker tracks single-quote, double-quote and backtick strings but does
// not track regex literals, so a regex containing "/*" or "//" (e.g.
// /a\/*b/) can be misread as a comment opener. No file in packages/**
// currently contains such a literal.
function maskComments(source: string): string {
  const out = source.split("");
  const n = source.length;
  let i = 0;
  let state: "normal" | "line" | "block" | "string" = "normal";
  let quote = "";

  while (i < n) {
    const c = source[i];
    const next = i + 1 < n ? source[i + 1] : "";

    if (state === "normal") {
      if (c === "/" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        out[i] = " ";
        out[i + 1] = " ";
        state = "block";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = "string";
        quote = c;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "normal";
        i += 1;
        continue;
      }
      out[i] = " ";
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        state = "normal";
        i += 2;
        continue;
      }
      if (c !== "\n") out[i] = " ";
      i += 1;
      continue;
    }

    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) {
      state = "normal";
      i += 1;
      continue;
    }
    i += 1;
  }

  return out.join("");
}

function makeLocator(source: string): (index: number) => { line: number; column: number } {
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }
  return (index: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if ((lineStarts[mid] ?? 0) <= index) low = mid;
      else high = mid - 1;
    }
    const lineStart = lineStarts[low] ?? 0;
    return { line: low + 1, column: index - lineStart + 1 };
  };
}

interface SpecifierMatch {
  specifier: string;
  index: number;
}

const IMPORT_FROM_RE = /\bimport\b[^;'"`]*?\bfrom\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/gd;
const EXPORT_FROM_RE = /\bexport\b[^;'"`]*?\bfrom\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/gd;
const IMPORT_BARE_RE = /\bimport\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/gd;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(["'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/gd;
const REQUIRE_RE = /\brequire\s*\(\s*(["'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/gd;

function collectSpecifiers(masked: string, re: RegExp): SpecifierMatch[] {
  const matches: SpecifierMatch[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const indices = (m as unknown as { indices: Array<[number, number]> }).indices;
    const specifierRange = indices[2];
    const specifier = m[2];
    if (specifier === undefined || specifierRange === undefined) continue;
    matches.push({ specifier, index: specifierRange[0] });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return matches;
}

// Best-effort guess at the package boundary by finding the last path segment
// equal to packageName; used only when isOutsidePackage is not given an
// explicit packageDir, i.e. by direct 3-arg callers such as tests.
function guessPackageDir(filePath: string, packageName: string): string {
  const parts = filePath.split(sep);
  let boundaryIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === packageName) boundaryIndex = i;
  }
  if (boundaryIndex === -1) return dirname(filePath);
  return parts.slice(0, boundaryIndex + 1).join(sep) || sep;
}

function isHostSpecifier(specifier: string): boolean {
  if (ADAPTER_SPECIFIER_RE.test(specifier)) return true;
  for (const host of HOST_MODULES) {
    if (specifier === host || specifier.startsWith(`${host}/`)) return true;
  }
  return false;
}

function isOutsidePackage(
  filePath: string,
  packageName: string,
  specifier: string,
  packageDir: string | undefined,
): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const boundary = packageDir ?? guessPackageDir(filePath, packageName);
  const resolved = resolve(dirname(filePath), specifier);
  if (resolved === boundary || resolved.startsWith(`${boundary}${sep}`)) return null;
  return resolved;
}

function checkHostImport(
  filePath: string,
  masked: string,
  packageName: string,
  packageDir: string | undefined,
): Violation[] {
  const locate = makeLocator(masked);
  const violations: Violation[] = [];
  const allMatches = [
    ...collectSpecifiers(masked, IMPORT_FROM_RE),
    ...collectSpecifiers(masked, EXPORT_FROM_RE),
    ...collectSpecifiers(masked, IMPORT_BARE_RE),
    ...collectSpecifiers(masked, DYNAMIC_IMPORT_RE),
    ...collectSpecifiers(masked, REQUIRE_RE),
  ];

  for (const { specifier, index } of allMatches) {
    const { line, column } = locate(index);

    if (isHostSpecifier(specifier)) {
      violations.push({
        file: filePath,
        line,
        column,
        rule: "no-host-import",
        message: `packages/${packageName} must not import from a host adapter or SDK: "${specifier}"`,
      });
      continue;
    }

    const outsideResolved = isOutsidePackage(filePath, packageName, specifier, packageDir);
    if (outsideResolved !== null) {
      violations.push({
        file: filePath,
        line,
        column,
        rule: "no-host-import",
        message: `packages/${packageName} must not import outside its own package: "${specifier}" resolves to ${outsideResolved}`,
      });
    }
  }

  return violations;
}

const PROCESS_CWD_RE = /\bprocess\s*\.\s*cwd\s*\(/g;

function checkProcessCwd(filePath: string, masked: string, packageName: string): Violation[] {
  const locate = makeLocator(masked);
  const violations: Violation[] = [];
  PROCESS_CWD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROCESS_CWD_RE.exec(masked)) !== null) {
    const { line, column } = locate(m.index);
    violations.push({
      file: filePath,
      line,
      column,
      rule: "no-process-cwd",
      message: `process.cwd() is banned in packages/${packageName}; take the working directory as an explicit parameter`,
    });
  }
  return violations;
}

// RegExp.prototype.exec called with a template literal as its first argument
// will also match here; accepted as a deliberately strict, low-frequency
// false positive rather than special-casing the regex-vs-child_process
// ambiguity.
const EXEC_CALL_RE = /\bexec(Sync)?\s*\(\s*(`)/g;

function checkExecTemplate(filePath: string, masked: string, packageName: string): Violation[] {
  const locate = makeLocator(masked);
  const violations: Violation[] = [];
  EXEC_CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXEC_CALL_RE.exec(masked)) !== null) {
    const { line, column } = locate(m.index);
    violations.push({
      file: filePath,
      line,
      column,
      rule: "no-exec-template",
      message: `exec() with a template literal is banned in packages/${packageName}; use execFile with an argument array instead`,
    });
  }
  return violations;
}

// Four claims share this rule, and all four are load-bearing:
//
//   CLAIM-15.6 — no file under packages/core/src/classify or
//   packages/core/src/guards may perform I/O.
//
//   CLAIM-21.1 — no file under packages/core/src/gh may reference
//   child_process, Bun.$ or fetch. ARCHITECTURE.md:90 puts it plainly: the
//   gh layer "never shells out itself". Those three banned tokens map
//   one-for-one onto detections this rule already implements
//   (IO_MODULE_SPECIFIERS, BUN_MEMBER_RE, FETCH_CALL_RE), so #253 widened the
//   SCOPE rather than adding a rule.
//
//   NEVER-26.7 — no module under packages/core/src/evidence performs I/O.
//   Same widening again, in #261. S1.4 carried this task from the START rather
//   than discovering the gap mid-Story, which is what forced #253 into
//   existence net-new against M1.md's four-row table for S1.3.
//
//   NEVER-31.7 — no module under packages/core/src/binding performs I/O.
//   The third widening, in #272, and the third Story in a row whose milestone
//   table carries no enforcement row (Decision 9 of docs/design/stories/31.md).
//   S1.5 planned this task from the start rather than discovering the gap
//   mid-Story, as S1.4 did and S1.3 did not.
//
// THE VIOLATION MESSAGE NAMES THE OWNING CLAIM. A violation under evidence/
// reporting "CLAIM-15.6: classify/ and guards/ must perform no I/O" would send
// the reader to the wrong Story — the same defect class as one generic message
// standing in for five distinct rules, which case 3 of
// docs/test-plans/26-plan.md exists to exclude.
//
// `isPureModulePath` matches a path SEGMENT, never a substring, so
// "src/guardsomething.ts", "src/ghost.ts", "src/bindings.ts" and
// "src/binding-store.ts" do not fall into scope by accident. That distinction
// is the whole reason these are anchored regexes and not `includes()`.
function isPureModulePath(filePath: string): boolean {
  const normalized = filePath.split(sep).join("/");
  return (
    /(^|\/)classify(\/|$)/.test(normalized) ||
    /(^|\/)guards(\/|$)/.test(normalized) ||
    /(^|\/)gh(\/|$)/.test(normalized) ||
    /(^|\/)evidence(\/|$)/.test(normalized) ||
    /(^|\/)binding(\/|$)/.test(normalized)
  );
}

// The claim that owns the directory a violation was found in, and the
// human-readable scope to name alongside it. The five directories are
// disjoint, so order is not load-bearing; stating it makes that explicit.
//
// EVERY DIRECTORY ADDED TO `isPureModulePath` NEEDS AN ARM HERE. The final
// `return` is a fall-through default, not a match — so a directory widened into
// scope above without a corresponding arm below is silently attributed to
// CLAIM-15.6, which is precisely the mis-attribution the block above forbids.
// #261's mutation 4 confirmed this is reachable: making this function always
// report CLAIM-15.6 left the scope tests passing and broke only the
// attribution case.
function pureModuleOwner(filePath: string): { claim: string; scope: string } {
  const normalized = filePath.split(sep).join("/");
  if (/(^|\/)binding(\/|$)/.test(normalized)) {
    return { claim: "NEVER-31.7", scope: "binding/" };
  }
  if (/(^|\/)evidence(\/|$)/.test(normalized)) {
    return { claim: "NEVER-26.7", scope: "evidence/" };
  }
  if (/(^|\/)gh(\/|$)/.test(normalized)) {
    return { claim: "CLAIM-21.1", scope: "gh/" };
  }
  return { claim: "CLAIM-15.6", scope: "classify/ and guards/" };
}

// Runtime/I-O module specifiers banned from classify/ and guards/, per
// CLAIM-15.6. Both the bare and "node:"-prefixed spellings are listed
// because both resolve to the same module and either one is I/O.
const IO_MODULE_SPECIFIERS: ReadonlySet<string> = new Set([
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "net",
  "node:net",
  "path",
  "node:path",
  "os",
  "node:os",
  "child_process",
  "node:child_process",
  "http",
  "node:http",
  "https",
  "node:https",
  "crypto",
  "node:crypto",
  "worker_threads",
  "node:worker_threads",
]);

const PROCESS_MEMBER_RE = /\bprocess\s*\.\s*[A-Za-z_$][\w$]*/g;
const BUN_MEMBER_RE = /\bBun\s*\.\s*[A-Za-z_$][\w$]*/g;
const FETCH_CALL_RE = /\bfetch\s*\(/g;

function checkIoInPureModules(filePath: string, masked: string): Violation[] {
  const locate = makeLocator(masked);
  const owner = pureModuleOwner(filePath);
  const violations: Violation[] = [];

  const allMatches = [
    ...collectSpecifiers(masked, IMPORT_FROM_RE),
    ...collectSpecifiers(masked, EXPORT_FROM_RE),
    ...collectSpecifiers(masked, IMPORT_BARE_RE),
    ...collectSpecifiers(masked, DYNAMIC_IMPORT_RE),
    ...collectSpecifiers(masked, REQUIRE_RE),
  ];

  for (const { specifier, index } of allMatches) {
    if (!IO_MODULE_SPECIFIERS.has(specifier)) continue;
    const { line, column } = locate(index);
    violations.push({
      file: filePath,
      line,
      column,
      rule: "no-io-in-pure-modules",
      message:
        `${owner.claim}: ${owner.scope} must perform no I/O; "${specifier}" is a ` +
        "runtime/I-O module and must not be imported here",
    });
  }

  for (const globalsRe of [PROCESS_MEMBER_RE, BUN_MEMBER_RE, FETCH_CALL_RE]) {
    globalsRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = globalsRe.exec(masked)) !== null) {
      const { line, column } = locate(m.index);
      violations.push({
        file: filePath,
        line,
        column,
        rule: "no-io-in-pure-modules",
        message:
          `${owner.claim}: ${owner.scope} must perform no I/O; "${m[0]}" touches a ` +
          "runtime global and must not appear here",
      });
      if (m[0].length === 0) globalsRe.lastIndex += 1;
    }
  }

  return violations;
}

// NEVER-31.10 — no file under packages/core/src imports a domain pack.
//
// THE ABSTRACTION'S CENTRAL PROMISE, PREVIOUSLY ENFORCED BY NOTHING. Problem 8
// of docs/design/stories/31.md: docs/milestones/M1.md:237-238 and CLAIM-9.4
// name only the two ADAPTER packages; ARCHITECTURE.md:81 and
// docs/design/08-dual-target.md:497-499 say core imports no host and that packs
// never import each other — all four are silent on core importing a pack.
// CLAIM-31.6 forbids domain LITERALS in core, which implies the import ban
// without ever stating it. A Tier-1 verb that imported `iai-domain-trade` would
// be the `if (domain === "trade")` failure ARCHITECTURE.md:208 exists to
// prevent, and no rule would have said so.
//
// SCOPED TO packages/core/src, NOT TO packages/core, AND THAT IS DELIBERATE.
// #34 had to give packages/core a dev-only dependency on `iai-domain-null` so
// the conformance suite could import the fixture BY PACKAGE NAME — Bun resolves
// a workspace package by name only from a package that declares it as a
// dependency. `packages/core/test/binding-conformance.test.ts` therefore
// imports a domain pack on purpose, and it is the one place that may.
// docs/design/stories/31.md:229-230 words the claim as "No file under
// `packages/core/src`", so the scope predicate matches the claim exactly rather
// than being widened to the package and then punctured with an exemption. An
// exemption is a hole; a correctly drawn scope is not.
// Recorded at docs/evidence/34-20260905T031229Z.md:93-104.
const DOMAIN_PACK_SPECIFIER_RE = /^iai-domain-[^/]+(\/.*)?$/;

// A path SEGMENT match, in the same house style as `isPureModulePath`, so
// "packages/core/srcs/x.ts" and "packages/core/src-gen/x.ts" are not pulled
// into scope by a substring.
function isCoreSrcPath(filePath: string): boolean {
  const normalized = filePath.split(sep).join("/");
  return /(^|\/)src(\/|$)/.test(normalized);
}

// Both forms the ban has to catch. The specifier form is the one that matters
// in practice; the relative form is what someone reaches for when the specifier
// form is blocked, and it resolves to the same place.
//
// The relative form ALSO trips `no-host-import` (it leaves the package), so a
// single offending line yields two violations. That is correct — two rules are
// genuinely broken — but it means any test asserting on this rule must FILTER
// by `v.rule`, never assert `violations.length === 1`.
function checkDomainPackImport(
  filePath: string,
  masked: string,
  packageName: string,
): Violation[] {
  const locate = makeLocator(masked);
  const violations: Violation[] = [];
  const allMatches = [
    ...collectSpecifiers(masked, IMPORT_FROM_RE),
    ...collectSpecifiers(masked, EXPORT_FROM_RE),
    ...collectSpecifiers(masked, IMPORT_BARE_RE),
    ...collectSpecifiers(masked, DYNAMIC_IMPORT_RE),
    ...collectSpecifiers(masked, REQUIRE_RE),
  ];

  for (const { specifier, index } of allMatches) {
    const { line, column } = locate(index);

    if (DOMAIN_PACK_SPECIFIER_RE.test(specifier)) {
      violations.push({
        file: filePath,
        line,
        column,
        rule: "no-domain-pack-import",
        message:
          `NEVER-31.10: packages/${packageName}/src must not import a domain pack; ` +
          `"${specifier}" is one. A domain is resolved through its binding, never imported`,
      });
      continue;
    }

    // The relative form. Resolved first, because "../../domain-dev/src/index"
    // and "../domain-dev/src/index" are the same offence from different depths,
    // and only the resolved path says so.
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const resolved = resolve(dirname(filePath), specifier).split(sep).join("/");
      if (/(^|\/)domain-[^/]+(\/|$)/.test(resolved)) {
        violations.push({
          file: filePath,
          line,
          column,
          rule: "no-domain-pack-import",
          message:
            `NEVER-31.10: packages/${packageName}/src must not import a domain pack; ` +
            `"${specifier}" resolves to ${resolved}`,
        });
      }
    }
  }

  return violations;
}

export function lintSource(
  filePath: string,
  source: string,
  packageName: string,
  packageDir?: string,
): Violation[] {
  const masked = maskComments(source);
  const violations: Violation[] = [];

  if (packageName === "core") {
    violations.push(...checkHostImport(filePath, masked, packageName, packageDir));
  }
  if (packageName === "core" || packageName === "adapter-opencode") {
    violations.push(...checkProcessCwd(filePath, masked, packageName));
  }
  violations.push(...checkExecTemplate(filePath, masked, packageName));
  if (packageName === "core" && isPureModulePath(filePath)) {
    violations.push(...checkIoInPureModules(filePath, masked));
  }
  if (packageName === "core" && isCoreSrcPath(filePath)) {
    violations.push(...checkDomainPackImport(filePath, masked, packageName));
  }

  return violations;
}

function discoverSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...discoverSourceFiles(join(dir, entry.name)));
      continue;
    }
    const dotIndex = entry.name.lastIndexOf(".");
    const extension = dotIndex === -1 ? "" : entry.name.slice(dotIndex);
    if (SOURCE_EXTENSIONS.has(extension)) files.push(join(dir, entry.name));
  }
  return files;
}

export function lintTree(packagesDir: string): Violation[] {
  const violations: Violation[] = [];
  const packageEntries = readdirSync(packagesDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );

  for (const packageEntry of packageEntries) {
    const packageName = packageEntry.name;
    const packageDir = join(packagesDir, packageName);
    for (const filePath of discoverSourceFiles(packageDir)) {
      const source = readFileSync(filePath, "utf8");
      violations.push(...lintSource(filePath, source, packageName, packageDir));
    }
  }

  return violations;
}

const RULE_SCOPES: Record<RuleId, string> = {
  "no-host-import": "core",
  "no-process-cwd": "core, adapter-opencode",
  "no-exec-template": "all packages",
  // Kept on ONE line on purpose: test/lint.test.ts:367 and the case-19 sibling
  // both extract this value with a single-line regex. Wrapping it is a silent
  // way to break two tests in other Stories.
  "no-io-in-pure-modules": "core/src/classify, core/src/guards, core/src/gh, core/src/evidence, core/src/binding",
  "no-domain-pack-import": "core/src",
};

function countFiles(packagesDir: string): number {
  const packageEntries = readdirSync(packagesDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory(),
  );
  let total = 0;
  for (const packageEntry of packageEntries) {
    total += discoverSourceFiles(join(packagesDir, packageEntry.name)).length;
  }
  return total;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function printReport(violations: Violation[], dir: string): void {
  const sorted = [...violations].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  for (const violation of sorted) {
    const relativePath = relative(dir, violation.file);
    console.error(`${relativePath}:${violation.line}:${violation.column}  ${violation.rule}  ${violation.message}`);
  }

  const byRule: Record<RuleId, number> = {
    "no-host-import": 0,
    "no-process-cwd": 0,
    "no-exec-template": 0,
    "no-io-in-pure-modules": 0,
    "no-domain-pack-import": 0,
  };
  for (const violation of violations) byRule[violation.rule] += 1;

  const ruleIds: RuleId[] = [
    "no-host-import",
    "no-process-cwd",
    "no-exec-template",
    "no-io-in-pure-modules",
    "no-domain-pack-import",
  ];
  const padded = Math.max(...ruleIds.map((id) => id.length));
  for (const ruleId of ruleIds) {
    const count = byRule[ruleId];
    console.log(
      `lint: ${ruleId.padEnd(padded)}  ${count} ${pluralize(count, "violation", "violations")}  (scope: ${RULE_SCOPES[ruleId]})`,
    );
  }
  const fileCount = countFiles(dir);
  console.log(
    `lint: ${violations.length} ${pluralize(violations.length, "violation", "violations")} across ${fileCount} ${pluralize(fileCount, "file", "files")}`,
  );
}

function main(): void {
  const repoRoot = join(import.meta.dir, "..");
  const args = process.argv.slice(2);
  const targetDir = args[0] ? resolve(args[0]) : join(repoRoot, "packages");

  const violations = lintTree(targetDir);
  printReport(violations, targetDir);

  process.exit(violations.length > 0 ? 1 : 0);
}

if (import.meta.main) {
  main();
}
