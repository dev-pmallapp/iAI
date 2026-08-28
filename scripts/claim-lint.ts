import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  lintClaimDocs,
  mapStory,
  formatClaimId,
  type ClaimDoc,
  type ClaimViolation,
  type ClaimRuleId,
} from "../packages/core/src/index";

// claim-lint validates the claim-identifier rules described in
// docs/design/stories/194.md (the Story that retired the ISC/ISA acronym
// family) against the doc corpus. The rules themselves — CLAIM-194.1 through
// CLAIM-194.4 — are PURE and live in packages/core/src/guards/claim-lint.ts:
// no fs, no path, no process, no Bun globals over there. This file is only
// the filesystem shim: it walks the tree, reads files, builds ClaimDoc
// records, calls the pure guard, and reports.
//
// The one trap in this shim: ClaimDoc.path MUST be repo-relative with POSIX
// separators (e.g. "docs/design/stories/9.md"), regardless of which
// directory this CLI was pointed at. The guard's ISC allow-list and its
// Story-design predicate both key off that exact shape, so the path handed
// to lintClaimDocs is always computed relative to repoRoot, never relative
// to the target directory. Reported violation paths on stderr may still be
// relativised to the target directory for readability.

const SKIP_DIRS = new Set(["node_modules", "dist"]);

function discoverDocFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...discoverDocFiles(join(dir, entry.name)));
      continue;
    }
    if (entry.name.endsWith(".md")) files.push(join(dir, entry.name));
  }
  return files;
}

function toRepoRelative(repoRoot: string, absoluteFile: string): string {
  return relative(repoRoot, absoluteFile).split(sep).join("/");
}

function loadDocs(repoRoot: string, targetDir: string): ClaimDoc[] {
  const files = discoverDocFiles(targetDir);
  return files.map((file) => ({
    path: toRepoRelative(repoRoot, file),
    source: readFileSync(file, "utf8"),
  }));
}

const RULE_IDS: ClaimRuleId[] = [
  "isc-token",
  "identifier-malformed",
  "identifier-duplicate",
  "anticlaim-not-never",
  "anchor-dangling",
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function printReport(violations: ClaimViolation[], fileCount: number): void {
  const sorted = [...violations].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });

  for (const violation of sorted) {
    // Reported repo-relative, NOT relative to the target directory. skill-lint
    // relativises to its target, but here that would strip the `docs/` prefix
    // from every path under the CI invocation `bun run claim-lint docs/`,
    // leaving a location that does not resolve from the repo root and cannot
    // be pasted into an editor. CLAIM-194.1's test case 12 asks the guard to
    // name the file; an unambiguous name is worth the four extra characters.
    const ruleLabel = violation.severity === "warning" ? `warning:${violation.rule}` : violation.rule;
    console.error(`${violation.file}:${violation.line}  ${ruleLabel}  ${violation.message}`);
  }

  const byRule: Record<ClaimRuleId, number> = {
    "isc-token": 0,
    "identifier-malformed": 0,
    "identifier-duplicate": 0,
    "anticlaim-not-never": 0,
    "anchor-dangling": 0,
  };
  for (const violation of violations) byRule[violation.rule] += 1;

  const padded = Math.max(...RULE_IDS.map((id) => id.length));
  for (const ruleId of RULE_IDS) {
    const count = byRule[ruleId];
    console.log(
      `claim-lint: ${ruleId.padEnd(padded)}  ${count} ${pluralize(count, "violation", "violations")}`,
    );
  }

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.length - errorCount;
  console.log(
    `claim-lint: ${fileCount} ${pluralize(fileCount, "file", "files")} scanned, ${errorCount} ${pluralize(errorCount, "error", "errors")}, ${warningCount} ${pluralize(warningCount, "warning", "warnings")}`,
  );
}

function runMap(repoRoot: string, targetDir: string, storyArg: string | undefined): void {
  const story = Number(storyArg);
  if (storyArg === undefined || !Number.isInteger(story) || story <= 0) {
    console.error(`claim-lint: --map requires a positive integer Story number, got "${storyArg}"`);
    process.exit(1);
  }

  const docs = loadDocs(repoRoot, targetDir);
  const ids = mapStory(story, docs);

  if (ids.length === 0) {
    console.error(`claim-lint: Story ${story} has no claim definitions`);
    process.exit(1);
  }

  console.log(`claim-lint: Story ${story} — ${ids.length} identifiers`);
  for (const id of ids) {
    console.log(`claim-lint:   ISC-${id.n} -> ${formatClaimId(id)}`);
  }
  process.exit(0);
}

function main(): void {
  const repoRoot = join(import.meta.dir, "..");
  const args = process.argv.slice(2);

  const mapIndex = args.indexOf("--map");
  const mapValueIndex = mapIndex === -1 ? -1 : mapIndex + 1;
  const positional = args.find((arg, index) => !arg.startsWith("--") && index !== mapValueIndex);
  const targetDir = positional ? resolve(positional) : join(repoRoot, "docs");

  if (!existsSync(targetDir)) {
    console.error("claim-lint: target directory does not exist: " + targetDir);
    process.exit(1);
  }

  if (mapIndex !== -1) {
    runMap(repoRoot, targetDir, args[mapIndex + 1]);
    return;
  }

  const docs = loadDocs(repoRoot, targetDir);
  const violations = lintClaimDocs(docs);
  printReport(violations, docs.length);

  const hasError = violations.some((v) => v.severity === "error");
  process.exit(hasError ? 1 : 0);
}

if (import.meta.main) {
  main();
}
