// The repository parameter carried by every constructed command
// (issue #22, CLAIM-21.1, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// WHY EVERY CONSTRUCTOR TAKES A REPO EXPLICITLY (Decision 6 of
// docs/design/stories/21.md):
//
// Every executable `gh` call in scripts/ passes `--repo "${REPO}"`. Every
// doc-quoted invocation omits it — docs/design/03-workflow.md:221 and :399,
// docs/design/02-roles.md:45 and :120-121 all show a bare `gh issue view`.
// Neither form is wrong in isolation; the bare form relies on the process
// running inside the right git checkout, which is a fact about the ADAPTER's
// working directory that this layer cannot see and must not assume.
//
// Multi-repo settles it. docs/design/04-domain-dev.md:479-486 requires issues
// to live in a designated primary repo while branches live per-repo, so the
// repository a command targets is genuinely not always the one the process is
// standing in. An implicit repo is therefore not merely untestable, it is
// wrong. It is also impossible to write a golden-argv test against, because
// the expected argv would depend on the runner's cwd.
//
// So: explicit, always, on every family.
import { ghFail, ghOk, safeOwnString, type Argv, type GhResult } from "./types";

export interface GhRepo {
  readonly owner: string;
  readonly name: string;
}

// GitHub owner and repository names permit alphanumerics, hyphen, underscore
// and dot. The pattern is deliberately a whole-string match: a value like
// "owner/name --token x" must fail rather than be split into a flag. argv
// construction is not shell interpolation and the adapter uses execFile
// (docs/design/09-security.md:190), so this is defence in depth rather than
// the only barrier — but a repo slug carrying a space is a caller bug worth
// reporting at construction rather than passing to `gh`.
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export function makeRepo(owner: unknown, name: unknown): GhResult<GhRepo> {
  if (typeof owner !== "string" || !SEGMENT_RE.test(owner)) {
    return ghFail(`invalid repository owner: expected a non-empty name matching ${SEGMENT_RE.source}`);
  }
  if (typeof name !== "string" || !SEGMENT_RE.test(name)) {
    return ghFail(`invalid repository name: expected a non-empty name matching ${SEGMENT_RE.source}`);
  }
  return ghOk({ owner, name });
}

// Accepts "owner/name", the form `gh --repo` takes and the form
// `gh repo view --json nameWithOwner` returns. Exactly one separator: a value
// carrying two is ambiguous between a host-qualified slug and a nested path,
// and guessing which is how a command ends up pointed at the wrong repository.
export function parseRepo(slug: unknown): GhResult<GhRepo> {
  if (typeof slug !== "string") {
    return ghFail('invalid repository slug: expected a string of the form "owner/name"');
  }
  const parts = slug.split("/");
  if (parts.length !== 2) {
    return ghFail(`invalid repository slug "${slug}": expected exactly one "/" separator`);
  }
  return makeRepo(parts[0], parts[1]);
}

// Reads a repo out of an untrusted object without trusting its getters.
export function coerceRepo(source: unknown): GhResult<GhRepo> {
  if (typeof source === "string") return parseRepo(source);
  return makeRepo(safeOwnString(source, "owner"), safeOwnString(source, "name"));
}

export function formatRepo(repo: GhRepo): string {
  return `${repo.owner}/${repo.name}`;
}

export function repoFlag(repo: GhRepo): Argv {
  return ["--repo", formatRepo(repo)];
}

// The `repos/{owner}/{name}` path prefix used by every `gh api` REST call.
// Milestones and comment edits both need it because neither has a porcelain
// subcommand that does what this layer requires.
export function repoApiPath(repo: GhRepo): string {
  return `repos/${repo.owner}/${repo.name}`;
}
