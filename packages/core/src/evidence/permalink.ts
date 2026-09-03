// SHA-pinned permalinks (issue #29, CLAIM-26.5).
//
// "Permalinks are pinned to a commit SHA, never to a branch name. A
//  `blob/main/...` link rots the moment the file moves; a `blob/4f2a1c9e/...`
//  link is permanent and is what makes the evidence trail auditable months
//  later." — docs/design/03-workflow.md:428-430
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Note in particular that NOTHING here resolves a SHA. Resolving `HEAD` is
// I/O; the SHA is an input the caller already holds, which is the same
// Decision 1 shape the rest of this Story uses.
import { evFail, evOk, safeOwnString, type EvidenceResult } from "./types";

// The contract the repository states about itself, at
// docs/milestones/M1.md:175-176 (CLAIM-26.5).
//
// `{7,40}` and not a fixed 40, because short SHAs are in real use:
// docs/design/03-workflow.md:425 carries an 8-hex form (`blob/4f2a1c9e/`)
// while docs/test-plans/9-plan.md:8 carries the 40-hex form.
//
// THIS PATTERN ALREADY EXISTS AT packages/core/src/guards/path-refs.ts:48,
// where claim-lint uses it to exclude permalink targets from its
// dangling-path check. The two must not drift: if this Story emitted a form
// path-refs did not recognise, every permalink iAI writes would start failing
// claim-lint as a dangling path. A test asserts the two agree rather than
// trusting that a future edit keeps them aligned.
export const BLOB_SHA_PATTERN = "/blob/[0-9a-f]{7,40}/";

const BLOB_SHA_RE = /\/blob\/[0-9a-f]{7,40}\//;

// Anchored, for validating a SHA on its own rather than inside a URL.
const SHA_RE = /^[0-9a-f]{7,40}$/;

export interface PermalinkInput {
  readonly owner: string;
  readonly repo: string;
  readonly sha: string;
  readonly path: string;
}

// True when the string carries a SHA-pinned blob segment.
//
// Deliberately a SEARCH and not a full-URL match: CLAIM-26.5 says "every
// permalink emitted matches `/blob/[0-9a-f]{7,40}/`", which is a statement
// about the segment. No document in the tree specifies the full permalink
// grammar — not the scheme, not the host, not a `#L` line anchor — so
// asserting one here would be inventing a rule the Design did not author.
export function isShaPinnedPermalink(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return BLOB_SHA_RE.test(value);
}

// The named failure a branch link produces. `blob/main/`, `blob/HEAD/` and
// `blob/story-26/` all land here, and the message says which rule they broke
// rather than reporting a generic parse error — the same reasoning that gives
// each of #27's five producer rules its own message.
function describeUnpinned(value: string): string {
  const segment = /\/blob\/([^/]+)\//.exec(value);
  if (segment === null) {
    return `permalink carries no /blob/<sha>/ segment: "${value}"`;
  }
  const ref = segment[1] ?? "";
  if (SHA_RE.test(ref)) return `permalink is malformed: "${value}"`;
  return (
    `permalink is pinned to "${ref}", which is not a commit SHA; a branch-named ` +
    "link rots the moment the file moves, so it must match " +
    `${BLOB_SHA_PATTERN} (lowercase hex, 7 to 40 characters)`
  );
}

export function requireShaPinnedPermalink(value: unknown): EvidenceResult<string> {
  if (typeof value !== "string" || value.length === 0) {
    return evFail("permalink is not a non-empty string");
  }
  if (!isShaPinnedPermalink(value)) return evFail(describeUnpinned(value));
  return evOk(value);
}

// Assembles a permalink from parts. Every part is validated, because a
// silently wrong permalink is worse than none: it looks auditable and is not.
//
// Total over hostile input (NEVER-26.8): a non-object, a throwing getter or a
// missing field yields a typed failure rather than a throw.
export function makePermalink(input: unknown): EvidenceResult<string> {
  const owner = safeOwnString(input, "owner");
  const repo = safeOwnString(input, "repo");
  const sha = safeOwnString(input, "sha");
  const path = safeOwnString(input, "path");

  if (owner === undefined || owner.length === 0) return evFail("permalink owner is missing");
  if (repo === undefined || repo.length === 0) return evFail("permalink repo is missing");
  if (sha === undefined || sha.length === 0) return evFail("permalink sha is missing");
  if (path === undefined || path.length === 0) return evFail("permalink path is missing");

  if (owner.includes("/") || repo.includes("/")) {
    return evFail(`permalink owner and repo may not contain "/": "${owner}/${repo}"`);
  }
  if (!SHA_RE.test(sha)) {
    return evFail(
      `permalink sha "${sha}" is not a commit SHA; it must be lowercase hex, ` +
        "7 to 40 characters. A branch name is never acceptable — " +
        "docs/design/03-workflow.md:428-430",
    );
  }
  if (path.startsWith("/")) {
    return evFail(`permalink path must be repo-relative, not absolute: "${path}"`);
  }

  const url = `https://github.com/${owner}/${repo}/blob/${sha}/${path}`;
  // Belt and braces: the assembled value is checked against the same predicate
  // a caller would use. A constructor whose output fails its own validator is
  // the defect this line exists to make impossible.
  if (!isShaPinnedPermalink(url)) {
    return evFail(`assembled permalink failed its own validation: "${url}"`);
  }
  return evOk(url);
}
