// The dangling-repo-relative-path guard (CLAIM path-dangling, issue #210).
//
// This module is PURE: no fs, no path, no process, no Bun globals. Per the
// standing decision recorded for claim-lint.ts (issue #204), guards take
// strings and return data; the file-walking shim -- the thing that can
// actually ask "does this exist?" -- lives outside packages/ entirely. This
// module cannot check whether a path exists; it can only ask whether a path
// is IN `options.knownPaths`, a set the shim hands it. `bun run lint`
// enforces purity mechanically over packages/ via its no-host-import and
// no-process-cwd rules, exactly as it does for claim-lint.ts.
//
// The corpus is prose, and a bare "path-shaped string" is a spectacularly
// common false-positive magnet: skill IDs (`dev/code-review`), CIDR blocks
// (`10.0.0.0/8`), model IDs (`amd-anthropic/Claude-Opus-5`), units and
// fractions (`mg/dL`, `180/300`), branch names
// (`story/901-apob-protocol`), and ancestor/external trees (`tmp/LifeOS`)
// are all real, in-tree, slash-containing tokens that are not repo-relative
// paths. The single guard-rail that excludes essentially all of them is
// `isKnownTopLevelSegment`: a candidate's first path segment must be a real
// top-level entry of THIS repo. None of skill IDs, CIDRs, model IDs, units,
// branch names or ancestor trees have "dev", "10.0.0.0", "amd-anthropic",
// "mg", "story" or "tmp" as an actual top-level entry of this repository
// (packages/, docs/, skills/, references/, scripts/, .github/, ...), so
// they never reach the allow-list check at all.

import type { ClaimDoc, ClaimViolation } from "./claim-lint";
import { PATH_ALLOW_LIST, isPathAllowed, type AllowedPath } from "./path-allowlist";

export interface PathRefOptions {
  /** Every path that exists in the repo, repo-relative POSIX, files AND
   *  directories. Supplied by the shim from `git ls-files` plus dir prefixes. */
  knownPaths: ReadonlySet<string>;
  /** Paths git ignores (e.g. `USER/`). Prefix-matched. */
  ignoredPrefixes?: readonly string[];
}

const EVIDENCE_PREFIX = "docs/evidence/";
const VERIFICATION_PASS_PATH = "docs/design/verification-pass.md";

// A GitHub blob permalink pinned to a commit SHA resolves against THAT
// commit's tree, not the working tree, so the path trailing it can never be
// checked against knownPaths -- it may have existed, or been named, only at
// that SHA. The repo states its own contract as `/blob/[0-9a-f]{7,40}/` at
// docs/milestones/M1.md:170 (CLAIM-26.5): {7,40}, not a fixed 40, because
// docs/design/03-workflow.md:425 carries an 8-hex short SHA
// (`blob/4f2a1c9e/...`) alongside the 40-hex form used at
// docs/test-plans/9-plan.md:8,22.
const BLOB_SHA_RE = /\/blob\/[0-9a-f]{7,40}\/(.+)$/;

// `docs/design/03-workflow.md:462`, `ci.yml:16-19`.
const TRAILING_LINE_SUFFIX_RE = /:\d+(-\d+)?$/;

// Sentence and bracket punctuation that can trail or lead a candidate
// picked up from prose or a table cell (including a stray backtick left
// over from a code span this line's masking pass did not fully consume).
// Deliberately excludes `<`, `>`, `{` and `}` -- those are placeholder
// markers (exclusion 3) and must survive extraction so the placeholder
// check can see them.
function stripEdgePunctuation(value: string): string {
  let out = value;
  while (out.length > 0 && /[.,;:!?)\]`'"]/.test(out.charAt(out.length - 1))) {
    out = out.slice(0, -1);
  }
  while (out.length > 0 && /[(\[`'"]/.test(out.charAt(0))) {
    out = out.slice(1);
  }
  return out;
}

/** Clean one raw token (a link href, a code-span word, or a bare prose
 *  word) into a candidate path, or null if it is not path-shaped at all. */
function cleanCandidate(raw: string): string | null {
  let candidate = raw;

  if (candidate.includes("://")) {
    const blobMatch = BLOB_SHA_RE.exec(candidate);
    if (blobMatch === null) return null; // an ordinary URL is not a repo path
    candidate = blobMatch[1] ?? "";
  }

  candidate = stripEdgePunctuation(candidate);
  candidate = candidate.replace(TRAILING_LINE_SUFFIX_RE, "");
  candidate = stripEdgePunctuation(candidate);

  if (candidate.length === 0) return null;

  // A trailing slash is a directory reference (`skills/dev/`,
  // `packages/core/src/binding/`); normalise it away so it matches the bare
  // directory form used by knownPaths, the allow-list and ignoredPrefixes.
  if (candidate.endsWith("/")) candidate = candidate.slice(0, -1);

  // A candidate must contain `/` -- that is the definition of a
  // repo-relative path here, and it is what keeps bare filenames
  // (`loader.ts`, `Cargo.toml`, `Next.js`) out.
  if (candidate.length === 0 || !candidate.includes("/")) return null;

  return candidate;
}

function pushCandidate(into: string[], raw: string): void {
  const cleaned = cleanCandidate(raw);
  if (cleaned !== null) into.push(cleaned);
}

// A GFM code span is delimited by a run of N backticks and closed by the
// next run of exactly N backticks -- which is what lets
// docs/design/08-dual-target.md:433 write `` `!`cmd`` `` (a double-backtick
// span carrying a literal single backtick) without the naive "single
// backtick to single backtick" reading pairing the wrong marks and
// corrupting every candidate for the rest of the line.
const CODE_SPAN_RE = /(`+)([\s\S]*?)\1/g;

// `[text](target)`, optionally followed immediately by sentence
// punctuation with no intervening space (`...09-security.md).`), which is
// why this is masked out of the line as a whole unit rather than leaving
// the closing paren for the bare-prose pass to trip over.
const MD_LINK_RE = /\[[^\]]*\]\(([^)]*)\)/g;

/** Exported for testing. Returns the candidate paths a line cites.
 *
 *  Candidates appear in three shapes, all handled per line and regardless
 *  of whether the line sits inside a fenced code block: unlike
 *  claim-lint's structural walk, this rule does NOT skip fences, because
 *  CONTRIBUTING.md:141 cites `packages/installer/src/cli.ts` inside a
 *  ` ```bash ` block, and that citation is exactly the kind this rule
 *  exists to catch.
 *
 *  Shapes 1 and 2 are masked out of the line (replaced with spaces) as
 *  they are found, before shape 3 ever runs, so that a link or code span
 *  glued to surrounding punctuation with no whitespace is never also
 *  re-read, mangled, as a bare-prose token. */
export function extractPathRefs(line: string): string[] {
  const candidates: string[] = [];
  let masked = line;

  // Shape 1 -- markdown links `[text](target)`. The href is the cell
  // content up to the first whitespace, which discards a trailing
  // `"title"`.
  masked = masked.replace(MD_LINK_RE, (whole, target: string) => {
    pushCandidate(candidates, target.split(/\s+/)[0] ?? "");
    return " ".repeat(whole.length);
  });

  // Shape 2 -- inline code spans `` `content` ``. Split on whitespace in
  // case the span is a short command rather than a bare path.
  masked = masked.replace(CODE_SPAN_RE, (whole, _tick: string, content: string) => {
    for (const token of content.split(/\s+/)) {
      pushCandidate(candidates, token);
    }
    return " ".repeat(whole.length);
  });

  // Shape 3 -- bare in prose (and in fenced command lines, see above), read
  // from what is left once shapes 1 and 2 have been masked out.
  for (const token of masked.split(/\s+/)) {
    pushCandidate(candidates, token);
  }

  return candidates;
}

// Exclusion 1 -- citing file under docs/evidence/: immutable, historical by
// design, same rationale claim-lint.ts gives the ISC- token ban.
function isEvidenceDoc(path: string): boolean {
  return path.startsWith(EVIDENCE_PREFIX);
}

// Exclusion 2 -- cited TARGET under docs/evidence/: eight fictional example
// artifacts are cited from outside docs/evidence/ itself, e.g.
// docs/design/01-skill-hierarchy.md:440 and docs/design/verification-pass.md:248
// both cite `docs/evidence/41-20260825T1412Z.md`; docs/design/04-domain-dev.md:465,474,
// docs/design/05-domain-trading.md:538,543, docs/design/06-domain-health.md:562 and
// docs/design/07-domain-wealth-know.md:339 cite six more.
function isEvidenceTarget(candidate: string): boolean {
  return candidate.startsWith(EVIDENCE_PREFIX);
}

// Exclusion 3 -- template placeholders. The issue says "contains `{`...`}`",
// which is incomplete: CONTRIBUTING.md:297 cites
// `docs/design/NN-domain-<id>.md` and CONTRIBUTING.md:289 cites
// `packages/domain-<id>/src/binding.ts`, both using `<`...`>`.
function isPlaceholder(candidate: string): boolean {
  return (
    candidate.includes("{") ||
    candidate.includes("}") ||
    candidate.includes("<") ||
    candidate.includes(">")
  );
}

// Exclusion 4 -- globs.
function isGlob(candidate: string): boolean {
  return candidate.includes("*");
}

// Exclusion 5 -- range notation, e.g. `docs/milestones/M1..M8.md` at
// README.md:143.
function isRange(candidate: string): boolean {
  return candidate.includes("..");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Exclusion 6 -- SHA-pinned permalinks (see BLOB_SHA_RE above). extraction
// already pulled the trailing path out of the URL as a plain candidate, so
// the only way to recover "this came from a SHA-pinned permalink" here is
// to re-check the raw line for the marker immediately preceding the
// candidate. The two 40-hex cases at docs/test-plans/9-plan.md:8 and :22
// are correct precisely because their target (docs/design/9-isa.md, at
// that historical commit) no longer exists at HEAD; this predicate is what
// keeps them from ever being reported, regardless of whether
// docs/design/9-isa.md is separately allow-listed for other reasons.
function isShaPinnedPermalinkTarget(line: string, candidate: string): boolean {
  const marker = new RegExp(`/blob/[0-9a-f]{7,40}/${escapeRegExp(candidate)}`);
  return marker.test(line);
}

// Exclusion 7 -- the citing document is exempt as a whole, because naming a
// path that does not resolve is its job.
//
// Two files qualify, for two different reasons:
//
//   docs/design/verification-pass.md -- the largest exclusion class, 40 paths,
//   and the one the issue never names. That document reconciles iAI's design
//   against three ANCESTOR repositories (see its own :9-13: `~/tmp/LifeOS`,
//   `~/tmp/gh-workflow`, `~/tmp/oh-my-opencode`). Nearly every path it cites --
//   `agents/forge-coder.md`, `packages/omo-opencode/src/index.ts`,
//   `references/gh-api.md` -- is a path in one of THOSE trees, correct as
//   written, and not a claim about this one at all.
//
//   docs/test-plans/194-plan.md -- it must name a non-existent path in order to
//   specify a test for one. Cases 23 and 24 read "plant `.../888.md`" and
//   "plant `.../999.md`"; the guard cannot tell an instruction to create a
//   dangling citation from a dangling citation. This is the same reasoning, on
//   the same file, that CLAIM-194.1 already uses to allow-list it for the
//   retired token -- "which must name the token in order to test for its
//   absence". Eighth instance of: a document whose subject is the check must be
//   excluded from the check.
//
// Allow-listing the two example paths instead would be wrong. #210's done-when
// item 3 requires that a planted `docs/design/stories/999.md` FAILS, so that
// path must stay unresolvable everywhere except here.
const PATH_SCAN_EXEMPT_DOCS: readonly string[] = [
  VERIFICATION_PASS_PATH,
  "docs/test-plans/194-plan.md",
];

function isPathScanExemptDoc(path: string): boolean {
  return PATH_SCAN_EXEMPT_DOCS.includes(path);
}

// Exclusion 8 -- gitignored prefixes. `USER/` is a symlink into a private
// repo (.gitignore:8) and is never resolvable from a tree listing.
function isIgnoredPrefixTarget(candidate: string, ignoredPrefixes: readonly string[]): boolean {
  return ignoredPrefixes.some((prefix) => candidate.startsWith(prefix));
}

// The guard-rail described at the top of this file: a candidate's first
// path segment must be a real top-level entry of the repo, present in
// knownPaths as a bare segment.
function isKnownTopLevelSegment(candidate: string, knownPaths: ReadonlySet<string>): boolean {
  const first = candidate.split("/")[0] ?? "";
  return first.length > 0 && knownPaths.has(first);
}

// Every allow-list entry whose path NOW EXISTS in the tree (issue #277).
//
// THE ALLOW-LIST IS MEANT TO SHRINK, AND IT ONLY EVER GREW. An entry exists so
// that a path cited in docs but absent from the tree does not fail
// `path-dangling`. The moment the path is created the entry has done its job,
// and every reason it can carry becomes false or moot:
//
//   - `planned` with a milestone asserts "this does not exist and <M> will
//     create it". Once <M> has created it, the entry states something false,
//     and this file's own header calls a knowingly-false milestone on a
//     reviewed allow-list "the exact failure #209 warned about".
//   - `fiction` asserts the path will never exist. If it exists, the entry and
//     the tree contradict each other outright.
//   - `historical` asserts it existed at some past commit but not at HEAD.
//   - `defective` and `external` are both claims about a path that does not
//     resolve here.
//
// So the rule is uniform and needs no per-reason special case: **an entry whose
// path exists is stale, whatever its reason.**
//
// WHY THIS IS A FAIL-CLOSED CONCERN AND NOT TIDINESS. `path-dangling` stops
// checking a citation once its target is allow-listed. A stale entry is
// therefore a permanent hole: if the path is later deleted or renamed, every
// citation to it goes unchecked, because the allow-list still forgives it. The
// guard closes the hole by forcing the entry out once it is no longer needed.
//
// PURE. Existence is SUPPLIED via `knownPaths`, never read — this module states
// at its head that it "cannot check whether a path exists", and that is still
// true. The caller does the I/O; `scripts/claim-lint.ts` already builds exactly
// this set for `lintPathRefs`, so the guard costs no extra filesystem work.
export function staleAllowListEntries(
  knownPaths: ReadonlySet<string>,
): readonly AllowedPath[] {
  // A directory entry is present in `knownPaths` as its own repo-relative
  // prefix — `buildKnownPaths` adds directory prefixes as well as files — so
  // `packages/core/src/binding` matches without needing a trailing slash.
  return PATH_ALLOW_LIST.filter((entry) => knownPaths.has(entry.path));
}

export function lintPathRefs(
  docs: readonly ClaimDoc[],
  options: PathRefOptions,
): ClaimViolation[] {
  const violations: ClaimViolation[] = [];
  const ignoredPrefixes = options.ignoredPrefixes ?? [];

  for (const doc of docs) {
    // Only *.md docs are scanned.
    if (!doc.path.endsWith(".md")) continue;

    if (isEvidenceDoc(doc.path)) continue;
    if (isPathScanExemptDoc(doc.path)) continue;

    const lines = doc.source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const lineNumber = index + 1;

      // Dedupe within a line: the same candidate can legitimately surface
      // from more than one of the three shapes (e.g. a bare-prose word
      // that is also, coincidentally, inside a code span earlier in the
      // same line), and it should be reported at most once per line.
      const seenOnLine = new Set<string>();

      for (const candidate of extractPathRefs(line)) {
        if (seenOnLine.has(candidate)) continue;
        seenOnLine.add(candidate);

        if (isPlaceholder(candidate)) continue;
        if (isGlob(candidate)) continue;
        if (isRange(candidate)) continue;
        if (isShaPinnedPermalinkTarget(line, candidate)) continue;
        if (isIgnoredPrefixTarget(candidate, ignoredPrefixes)) continue;
        if (!isKnownTopLevelSegment(candidate, options.knownPaths)) continue;
        if (isEvidenceTarget(candidate)) continue;

        if (options.knownPaths.has(candidate)) continue;
        if (isPathAllowed(candidate)) continue;

        violations.push({
          file: doc.path,
          line: lineNumber,
          rule: "path-dangling",
          severity: "error",
          message:
            `repo-relative path "${candidate}" does not exist and is not on ` +
            "the PATH_ALLOW_LIST in packages/core/src/guards/path-allowlist.ts",
        });
      }
    }
  }

  return violations;
}
