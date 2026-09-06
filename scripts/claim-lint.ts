import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  lintClaimDocs,
  lintDesignSpine,
  lintPathRefs,
  lintTestPlanCorpus,
  staleAllowListEntries,
  mapStory,
  formatClaimId,
  type ClaimDoc,
  type ClaimViolation,
  type ClaimRuleId,
  type DesignSpineReport,
  type TestPlanCorpusReport,
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

// claim-lint's own scope — the directories this shim walks in full, plus the
// root-markdown pseudo-scope handled separately below. CLAIM-194.1's scope
// ("No file under `docs/`, `scripts/`, `.github/` or the root markdown set")
// is a SUBSET of this list, not the whole of it: `docs`, `scripts`, `.github`
// and root markdown are what that one claim governs, but SCOPE_DIRS is what
// every rule in this file gets to see. Note the claim says *file*, not
// *markdown file* — the retired token is banned from shell scripts and
// workflow YAML too, which is where it had been hiding.
//
// `skills` was added by Build Target 7 of docs/design/stories/41.md (task
// #296) and is NOT part of CLAIM-194.1's four. It is in claim-lint's scope
// anyway because, before this change, a SKILL.md could carry a malformed
// claim identifier, a duplicate identifier, an anti-claim missing `NEVER-`, a
// dangling `anchors_to`, or a dangling path citation, and every one of
// `identifier-malformed`, `identifier-duplicate`, `anticlaim-not-never`,
// `anchor-dangling` and `path-dangling` would have missed it — nothing
// cross-checked `skills/` against the linter that is supposed to cover it.
// That gap is also why `CONTRIBUTING.md:128-129` was false for four Stories:
// the document describing the linter was never itself linted. Decision 5 of
// docs/design/stories/41.md names the failure mode directly: "nobody thought
// about it" is how the sentence survived, and it must not be the reason a
// second directory goes unchecked.
export const SCOPE_DIRS = ["docs", "scripts", ".github", "skills"];

function discoverFiles(dir: string, markdownOnly: boolean): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...discoverFiles(join(dir, entry.name), markdownOnly));
      continue;
    }
    if (!markdownOnly || entry.name.endsWith(".md")) files.push(join(dir, entry.name));
  }
  return files;
}

// The root-markdown pseudo-scope's label in the per-scope breakdown printed by
// `printReport`. It is a pseudo-scope, not a member of SCOPE_DIRS: there is no
// `<root>` directory to walk, only the loose markdown files sitting beside
// this repo's directories (README, CONTRIBUTING, PLAN, ARCHITECTURE). Named
// once, exported, and imported by test/claim-lint.test.ts and referenced by
// CONTRIBUTING.md's claim-lint scope table, so the breakdown and that
// documentation cannot drift apart from a re-typed literal.
export const ROOT_SCOPE_LABEL = "<root>";

// One entry of the per-scope breakdown: a scope's label (a member of
// SCOPE_DIRS, or ROOT_SCOPE_LABEL) paired with the files discovered under it.
type ScopeGroup = { readonly scope: string; readonly files: string[] };

function flattenScopeFiles(groups: readonly ScopeGroup[]): string[] {
  return groups.flatMap((group) => group.files);
}

/** Every file CLAIM-194.1 governs, plus `skills/` (Build Target 7 of
 *  docs/design/stories/41.md, task #296): each SCOPE_DIRS entry in full, plus
 *  markdown sitting at the repo root (README, CONTRIBUTING, PLAN, ARCHITECTURE)
 *  under ROOT_SCOPE_LABEL.
 *
 *  Scanning only `docs/` — which is what this shim did when it shipped, and
 *  what the CI job invoked — under-implements the claim by three quarters. It
 *  also made the guard unable to see its own violation: the first thing the
 *  widened scope caught was this file and CONTRIBUTING.md, both of which had
 *  acquired the retired token while describing the rule that bans it.
 *
 *  Returns one group PER scope, in SCOPE_DIRS order with the root pseudo-scope
 *  last, rather than a flat list. `printReport`'s per-scope breakdown and the
 *  flat file list handed to the guards are both derived from this same
 *  return value (see `flattenScopeFiles`), so the two cannot disagree about
 *  what was scanned — there is exactly one traversal, not one for the total
 *  and a second for the breakdown that could drift out of step with it. */
function discoverScopeFiles(repoRoot: string): ScopeGroup[] {
  // Every SCOPE_DIRS entry — `skills` included — is walked with
  // `markdownOnly: false`, same as `docs`, `scripts` and `.github` always
  // were. Treating all four the same way needs no justification; carving out
  // `skills` to scan only `SKILL.md` would, and there is no such reason: a
  // shell script or workflow file could hide the retired token same as any
  // other, and a non-`.md` file under `skills/` is exactly as much in scope
  // as one under `scripts/`.
  const groups: ScopeGroup[] = SCOPE_DIRS.map((name) => {
    const dir = join(repoRoot, name);
    return { scope: name, files: existsSync(dir) ? discoverFiles(dir, false) : [] };
  });

  const rootFiles: string[] = [];
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) rootFiles.push(join(repoRoot, entry.name));
  }
  groups.push({ scope: ROOT_SCOPE_LABEL, files: rootFiles });

  return groups;
}

function toRepoRelative(repoRoot: string, absoluteFile: string): string {
  return relative(repoRoot, absoluteFile).split(sep).join("/");
}

function toDocs(repoRoot: string, files: string[]): ClaimDoc[] {
  return files.map((file) => ({
    path: toRepoRelative(repoRoot, file),
    source: readFileSync(file, "utf8"),
  }));
}

// path-dangling (CLAIM path-dangling, issue #210) needs to know every path
// that actually exists in the repo. `git ls-files` — not a recursive
// readdir — is the source of truth here: tracked files only, so an
// file that exists but is deliberately ignored -- USER/ is a symlink into a
// private repo -- cannot make a cited path resolve.
//
// `--cached --others --exclude-standard` is tracked files PLUS untracked ones
// git is not ignoring. Tracked-only was wrong: a path added in the same commit
// as the document citing it is untracked until `git add`, so the guard failed
// on correct work-in-progress and would have taught people to ignore it. In CI
// everything is committed, so the two forms agree there.
function buildKnownPaths(repoRoot: string): ReadonlySet<string> {
  const proc = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
  });
  if (proc.exitCode !== 0) {
    console.error("claim-lint: `git ls-files` failed; is this a git working tree?");
    process.exit(1);
  }

  const known = new Set<string>();
  const stdout = proc.stdout.toString("utf8");
  for (const rawLine of stdout.split("\n")) {
    const file = rawLine.trim();
    if (file.length === 0) continue;
    known.add(file);

    // A cited path can name a directory, not just a file (e.g.
    // `packages/core/src/binding`), so every directory prefix of every
    // tracked file must resolve too.
    let dir = dirname(file);
    while (dir !== "." && dir !== "/" && !known.has(dir)) {
      known.add(dir);
      dir = dirname(dir);
    }
  }
  return known;
}

// path-dangling's exclusion 8: gitignored prefixes (e.g. `USER/`, a symlink
// into a private repo, .gitignore:8) are never resolvable from a tree
// listing and must not be treated as dangling. Only PLAIN directory
// prefixes are picked up here — lines ending in `/` with no glob character
// — which is exactly what .gitignore:8 is; anything glob-shaped is out of
// scope for this simple prefix match.
function buildIgnoredPrefixes(repoRoot: string): string[] {
  const gitignorePath = join(repoRoot, ".gitignore");
  if (!existsSync(gitignorePath)) return [];

  const prefixes: string[] = [];
  const lines = readFileSync(gitignorePath, "utf8").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("!")) continue;
    if (!line.endsWith("/")) continue;
    if (/[*?[]/.test(line)) continue;

    const normalized = line.startsWith("/") ? line.slice(1) : line;
    prefixes.push(normalized);
  }
  return prefixes;
}

// The allow-list source, as its own repo-relative path. Named once so the
// violation location and the file actually read cannot drift apart.
const ALLOW_LIST_PATH = "packages/core/src/guards/path-allowlist.ts";

// The I/O half of the `allowlist-stale` rule (issue #277).
//
// `staleAllowListEntries` is pure and returns ENTRIES, not locations, because
// `packages/core/src/guards` may not read a file. A violation needs a line
// somebody can jump to, so the line is resolved HERE by searching the
// allow-list source for the entry's own `path:` field.
//
// The search is for the exact quoted literal rather than a substring, so
// `packages/core/src/binding` does not match the line declaring
// `packages/core/src/binding/registry.ts`. Line 1 is the honest fallback if
// the declaration cannot be located — a violation reported at the wrong line
// is worse than one reported at the top of the right file, and this is a
// four-line file-local search, not a parser.
function lintStaleAllowList(repoRoot: string, knownPaths: ReadonlySet<string>): ClaimViolation[] {
  const stale = staleAllowListEntries(knownPaths);
  if (stale.length === 0) return [];

  const sourcePath = join(repoRoot, ALLOW_LIST_PATH);
  const lines = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8").split("\n") : [];

  return stale.map((entry) => {
    const needle = `path: "${entry.path}"`;
    const index = lines.findIndex((line) => line.includes(needle));
    const milestone = entry.milestone === undefined ? "" : ` (milestone ${entry.milestone})`;
    return {
      file: ALLOW_LIST_PATH,
      line: index === -1 ? 1 : index + 1,
      rule: "allowlist-stale" as const,
      severity: "error" as const,
      message:
        `"${entry.path}" now exists, so its allow-list entry is stale and must be removed. ` +
        `It is recorded as reason "${entry.reason}"${milestone}, which asserts the path does ` +
        `not resolve in this tree. The allow-list is meant to shrink: an entry kept past its ` +
        `purpose permanently exempts the path from path-dangling, even if it is later deleted`,
    };
  });
}

const RULE_IDS: ClaimRuleId[] = [
  "isc-token",
  "identifier-malformed",
  "identifier-duplicate",
  "anticlaim-not-never",
  "anchor-dangling",
  "path-dangling",
  "allowlist-stale",
  "testplan-corpus",
  "design-spine",
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function printReport(
  violations: ClaimViolation[],
  fileCount: number,
  corpus: TestPlanCorpusReport,
  spine: DesignSpineReport,
  scopeGroups: readonly ScopeGroup[],
): void {
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
    "path-dangling": 0,
    "allowlist-stale": 0,
    "testplan-corpus": 0,
    "design-spine": 0,
  };
  for (const violation of violations) byRule[violation.rule] += 1;

  const padded = Math.max(...RULE_IDS.map((id) => id.length));
  for (const ruleId of RULE_IDS) {
    const count = byRule[ruleId];
    console.log(
      `claim-lint: ${ruleId.padEnd(padded)}  ${count} ${pluralize(count, "violation", "violations")}`,
    );
  }

  // The per-scope breakdown, printed unconditionally for the same reason
  // `testplan-corpus` and `design-spine` print their denominators below:
  // one conflated `N files scanned` cannot distinguish "`skills/` is in scope
  // but its four `SKILL.md` files have not landed yet" from "`skills/` was
  // silently dropped from SCOPE_DIRS" — both look like zero contribution to
  // a total that stays large either way. A scope that goes empty says so on
  // its own line instead of hiding inside a total that remains plausible
  // without it.
  //
  // The counts come from `scopeGroups`, the SAME return value `flattenScopeFiles`
  // built the flat file list from (see `discoverScopeFiles`), so this block
  // and the `N files scanned` line below are two views of one traversal and
  // cannot disagree about what was scanned.
  const scopeLabelWidth = Math.max(...scopeGroups.map((group) => group.scope.length));
  const scopeCountWidth = Math.max(...scopeGroups.map((group) => String(group.files.length).length));
  for (const group of scopeGroups) {
    const count = group.files.length;
    console.log(
      `claim-lint: scope ${group.scope.padEnd(scopeLabelWidth)}  ${String(count).padStart(scopeCountWidth)} ${pluralize(count, "file", "files")}`,
    );
  }

  // The denominator for testplan-corpus, printed unconditionally and as THREE
  // numbers rather than one. `skill-lint: 0 SKILL.md files scanned, 0 errors`
  // is this repository's standing example of a check that passes while
  // checking nothing; a single conflated total would let the case count go to
  // zero — a plan renamed out of docs/test-plans/, a header edited so no table
  // is recognised — while the rule kept reporting success.
  console.log(
    `claim-lint: testplan-corpus scanned ${corpus.plans} ${pluralize(corpus.plans, "plan", "plans")}, ` +
      `${corpus.tables} ${pluralize(corpus.tables, "case table", "case tables")}, ` +
      `${corpus.cases} ${pluralize(corpus.cases, "case", "cases")}`,
  );

  // The denominator for design-spine, printed for the same reason: a rule that
  // stopped recognising Design documents -- a renamed directory, a changed
  // filename shape -- would otherwise keep reporting 0 violations forever.
  // Both numbers are printed because a Design whose headings stopped parsing
  // has a non-zero document count and a zero section count.
  console.log(
    `claim-lint: design-spine scanned ${spine.designs} ${pluralize(spine.designs, "Design", "Designs")}, ` +
      `${spine.sections} ${pluralize(spine.sections, "section", "sections")}`,
  );

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.length - errorCount;
  console.log(
    `claim-lint: ${fileCount} ${pluralize(fileCount, "file", "files")} scanned, ${errorCount} ${pluralize(errorCount, "error", "errors")}, ${warningCount} ${pluralize(warningCount, "warning", "warnings")}`,
  );
}

function runMap(repoRoot: string, files: string[], storyArg: string | undefined): void {
  const story = Number(storyArg);
  if (storyArg === undefined || !Number.isInteger(story) || story <= 0) {
    console.error(`claim-lint: --map requires a positive integer Story number, got "${storyArg}"`);
    process.exit(1);
  }

  const docs = toDocs(repoRoot, files);
  const ids = mapStory(story, docs);

  if (ids.length === 0) {
    console.error(`claim-lint: Story ${story} has no claim definitions`);
    process.exit(1);
  }

  // The legacy number is printed bare, as `n=1`, rather than spelled with the
  // retired prefix it used to carry. CLAIM-194.1 bans that token from every
  // file under scripts/, and the allow-list is closed — "a fifth path is a
  // violation" — so this file cannot be exempted to describe the thing it
  // enforces. Same resolution #202 reached for M1.md: state the mapping
  // without naming the retired token. The mapping note at
  // docs/design/stories/194.md is where the old spelling legitimately lives.
  console.log(`claim-lint: Story ${story} — ${ids.length} identifiers, legacy n preserved`);
  for (const id of ids) {
    console.log(`claim-lint:   n=${id.n} -> ${formatClaimId(id)}`);
  }
  process.exit(0);
}

function main(): void {
  const repoRoot = join(import.meta.dir, "..");
  const args = process.argv.slice(2);

  const mapIndex = args.indexOf("--map");
  const mapValueIndex = mapIndex === -1 ? -1 : mapIndex + 1;
  const pathsOnly = args.indexOf("--paths-only") !== -1;
  const positional = args.find((arg, index) => !arg.startsWith("--") && index !== mapValueIndex);

  if (positional !== undefined && !existsSync(resolve(positional))) {
    console.error("claim-lint: target directory does not exist: " + resolve(positional));
    process.exit(1);
  }

  // With no positional argument the guard walks CLAIM-194.1's full scope, not
  // just docs/. A positional argument narrows it, which is what test case 20
  // (`claim-lint docs/milestones`) exercises.
  //
  // `scopeGroups` is always populated, even when narrowed: a single positional
  // argument becomes a single group named after the argument itself, so the
  // per-scope breakdown printed below is never skipped and its counts always
  // sum to the same total as the flat file list `files` derives from it.
  let files: string[];
  let scopeGroups: ScopeGroup[];
  if (positional === undefined) {
    scopeGroups = discoverScopeFiles(repoRoot);
    files = flattenScopeFiles(scopeGroups);
  } else {
    files = discoverFiles(resolve(positional), true);
    scopeGroups = [{ scope: positional, files }];
  }

  if (mapIndex !== -1) {
    runMap(repoRoot, files, args[mapIndex + 1]);
    return;
  }

  const docs = toDocs(repoRoot, files);

  // path-dangling (CLAIM path-dangling, issue #210) is scanned regardless of
  // --paths-only, over the markdown subset of whatever scope was resolved
  // above; --paths-only just suppresses the other, unrelated claim-lint
  // rules from the report.
  const knownPaths = buildKnownPaths(repoRoot);
  const ignoredPrefixes = buildIgnoredPrefixes(repoRoot);
  const markdownDocs = docs.filter((doc) => doc.path.endsWith(".md"));
  const pathViolations = lintPathRefs(markdownDocs, { knownPaths, ignoredPrefixes });

  // allowlist-stale (issue #277). Reuses the SAME knownPaths set the rule above
  // was already given, so the guard costs no extra filesystem work and cannot
  // disagree with `path-dangling` about what exists.
  const staleViolations = lintStaleAllowList(repoRoot, knownPaths);

  // testplan-corpus (issue #289). Scanned over the same markdown subset as
  // path-dangling; the rule selects docs/test-plans/ itself, so narrowing the
  // CLI to another directory yields a zero denominator rather than a silent
  // pass — which is why the counts are printed even when they are zero.
  const corpus = lintTestPlanCorpus(markdownDocs);

  // design-spine (CLAIM-41.3, gate rulings G1a and G1b). Same markdown subset;
  // the rule selects docs/design/stories/ itself.
  const spine = lintDesignSpine(markdownDocs);

  const violations = pathsOnly
    ? [...pathViolations, ...staleViolations, ...corpus.violations, ...spine.violations]
    : [
        ...lintClaimDocs(docs),
        ...pathViolations,
        ...staleViolations,
        ...corpus.violations,
        ...spine.violations,
      ];
  printReport(violations, docs.length, corpus, spine, scopeGroups);

  const hasError = violations.some((v) => v.severity === "error");
  process.exit(hasError ? 1 : 0);
}

if (import.meta.main) {
  main();
}
