// Pull-request command construction: branch naming, `gh pr create` and its
// small companion set, and the two body directives with opposite list rules
// (issue #24, CLAIM-21.1, NEVER-21.7, NEVER-21.10).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// Every constructor here takes the repository explicitly, per Decision 6 of
// docs/design/stories/21.md, and returns a GhResult rather than throwing, per
// NEVER-21.8. Same posture as issues.ts and sub-issues.ts.
//
// THERE IS NO FIRST-PARTY `gh pr create` ARGV IN THIS REPOSITORY.
//
// The only one quoted anywhere is attributed to forge, not to iAI:
// `gh pr create --draft --base "story/{story}-{slug}"` —
// docs/design/verification-pass.md:281. Everything past `--draft --base` in
// this file's `prCreate` — `--head`, `--title`, `--body`, `--repo` — is this
// Story's own decision, made because a PR cannot be opened from those two
// flags alone. This file is therefore the record of that decision, not a
// transcription of one that already existed.
//
// THE `pr` `merge` SUBCOMMAND IS NOT HERE, ANYWHERE, ON PURPOSE. (Spelled
// apart in this sentence so a literal grep for the two words joined finds
// zero matches in the one file that talks about why.)
//
// docs/design/04-domain-dev.md:250 denies it to iAI outright and
// docs/design/09-security.md:357 puts it on the bash deny-list. NEVER-21.10
// requires it to be unconstructible, not merely unused, so there is no
// "merge" option on any exported function to guard against — the only way to
// guarantee the token never appears is to never write a code path that can
// produce it.
import { repoFlag, type GhRepo } from "./repo";
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  safeOwnValue,
  type Argv,
  type GhResult,
} from "./types";

// ---------------------------------------------------------------------------
// The slug rule — docs/design/03-workflow.md:302-309, CONTRIBUTING.md:169-173.
// Four steps, in order, and step 4 is two operations, not one: truncate,
// THEN strip a trailing hyphen a truncation may have just created.
// ---------------------------------------------------------------------------

const SLUG_MAX_LENGTH = 40;
const NON_ALNUM_RUN_RE = /[^a-z0-9]+/g;
const LEADING_TRAILING_HYPHENS_RE = /^-+|-+$/g;
const TRAILING_HYPHENS_RE = /-+$/;

export function branchSlug(title: unknown): GhResult<string> {
  if (typeof title !== "string" || title.length === 0) {
    return ghFail("branch slug requires a non-empty title");
  }
  // Step 1 + 2: lowercase, then collapse every run of non-alphanumerics to
  // one hyphen.
  const collapsed = title.toLowerCase().replace(NON_ALNUM_RUN_RE, "-");
  // Step 3: strip leading and trailing hyphens BEFORE truncation, so a title
  // that opens or closes with punctuation does not leave a hyphen sitting at
  // position 0 for step 4 to truncate around.
  const trimmed = collapsed.replace(LEADING_TRAILING_HYPHENS_RE, "");
  // Step 4: truncate to 40, then strip a trailing hyphen truncation may have
  // just exposed mid-word.
  const truncated = trimmed.slice(0, SLUG_MAX_LENGTH).replace(TRAILING_HYPHENS_RE, "");
  if (truncated.length === 0) {
    return ghFail(`title "${title}" collapses to an empty slug`);
  }
  return ghOk(truncated);
}

function kindBranch(prefix: string, n: unknown, title: unknown): GhResult<string> {
  if (!isPositiveInteger(n)) return ghFail(`invalid issue number: ${String(n)}`);
  const slug = branchSlug(title);
  if (!slug.ok) return slug;
  return ghOk(`${prefix}/${n}-${slug.value}`);
}

// Cut from the default branch, targets the default branch via the
// integration PR. docs/design/03-workflow.md:296-300, CONTRIBUTING.md:169-173.
export function storyBranch(n: unknown, title: unknown): GhResult<string> {
  return kindBranch("story", n, title);
}

// Cut from the STORY branch, targets the story branch. Never the default
// branch — that refusal lives in `prCreate` below, at construction, because
// this function alone cannot see what a caller intends to target.
export function taskBranch(n: unknown, title: unknown): GhResult<string> {
  return kindBranch("task", n, title);
}

// Cut from the default branch, targets the default branch, same as a Story.
export function bugBranch(n: unknown, title: unknown): GhResult<string> {
  return kindBranch("bug", n, title);
}

// ---------------------------------------------------------------------------
// `gh pr create`
// ---------------------------------------------------------------------------

export interface PrCreateInput {
  readonly base: string;
  readonly head: string;
  readonly title: string;
  readonly body: string;
  // The default branch name, e.g. "main". This layer cannot discover it —
  // that is Phase 0 context discovery, docs/milestones/M4.md:74-76, owned by
  // the adapter — so it arrives as a value, same shape as Decision 1 of
  // docs/design/stories/21.md. Its purpose here is narrow: knowing it is the
  // only way construction can refuse a task PR aimed at it
  // (docs/milestones/M4.md:122-123, docs/milestones/M2.md:126-128).
  readonly defaultBranch: string;
}

// A task branch is named `task/{n}-{slug}` by this file's own `taskBranch`,
// so the prefix is the one signal available here for "this is a task PR"
// without a caller-supplied kind flag that could disagree with the branch
// it actually names.
const TASK_BRANCH_PREFIX = "task/";

export function prCreate(repo: GhRepo, input: PrCreateInput): GhResult<Argv> {
  // Snapshot every field via safeOwnValue before validating, per NEVER-21.8:
  // a throwing getter on any field must become a typed failure, not an
  // exception. Same discipline as issueCreate in issues.ts.
  const base = safeOwnValue(input, "base");
  const head = safeOwnValue(input, "head");
  const title = safeOwnValue(input, "title");
  const body = safeOwnValue(input, "body");
  const defaultBranch = safeOwnValue(input, "defaultBranch");

  if (typeof base !== "string" || base.length === 0) {
    return ghFail("pr create requires a non-empty base branch");
  }
  if (typeof head !== "string" || head.length === 0) {
    return ghFail("pr create requires a non-empty head branch");
  }
  if (typeof title !== "string" || title.length === 0) {
    return ghFail("pr create requires a non-empty title");
  }
  if (typeof body !== "string") {
    return ghFail("pr create requires a body string");
  }
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    return ghFail(
      "pr create requires the repository's default branch name, so a task PR " +
        "targeting it can be refused here rather than opened and left wrong",
    );
  }

  // docs/milestones/M4.md:122-123 and docs/milestones/M2.md:126-128: a task
  // PR targeting the default branch is refused before creation.
  if (head.startsWith(TASK_BRANCH_PREFIX) && base === defaultBranch) {
    return ghFail(
      `a task PR ("${head}") must target its story branch, never the default ` +
        `branch "${defaultBranch}" — only the integration PR touches it`,
    );
  }

  // `--draft` is unconditional. There is no field on PrCreateInput that
  // disables it, which is the whole mechanism: CONTRIBUTING.md:335 and
  // docs/design/02-roles.md:183 require every PR to open as a draft, and the
  // only way to guarantee that is to never accept a caller override.
  return ghOk([
    "gh",
    "pr",
    "create",
    ...repoFlag(repo),
    "--draft",
    "--base",
    base,
    "--head",
    head,
    "--title",
    title,
    "--body",
    body,
  ]);
}

export function prReady(repo: GhRepo, number: unknown): GhResult<Argv> {
  if (!isPositiveInteger(number)) return ghFail(`invalid PR number: ${String(number)}`);
  return ghOk(["gh", "pr", "ready", String(number), ...repoFlag(repo)]);
}

// `merged` is not a `gh pr view --json` field. The equivalent information is
// three separate fields: `state` (OPEN/CLOSED/MERGED), `mergedAt` (null until
// merged) and `mergeCommit` (the merge commit object once one exists).
// Refusing the wrong name here is the same shape issues.ts uses for the
// nonexistent issue-view `parent` field — a typed failure naming the real
// fields, not a `gh` error midway through a batch.
const INVALID_PR_VIEW_FIELDS: ReadonlySet<string> = new Set(["merged"]);

export function prView(repo: GhRepo, number: unknown, fields: readonly string[]): GhResult<Argv> {
  if (!isPositiveInteger(number)) return ghFail(`invalid PR number: ${String(number)}`);
  if (!Array.isArray(fields) || fields.length === 0) {
    return ghFail("pr view requires at least one --json field");
  }
  for (const field of fields) {
    if (typeof field !== "string" || field.length === 0) {
      return ghFail("pr view fields must all be non-empty strings");
    }
    if (INVALID_PR_VIEW_FIELDS.has(field)) {
      return ghFail(
        `"${field}" is not a gh pr view --json field; use "state", "mergedAt" or ` +
          '"mergeCommit" instead',
      );
    }
  }
  return ghOk([
    "gh",
    "pr",
    "view",
    String(number),
    ...repoFlag(repo),
    "--json",
    fields.join(","),
  ]);
}

export interface PrListInput {
  readonly head: string;
}

// `--state all` is deliberate: a caller checking whether a task already has a
// PR (CLAIM-47.4's re-run-creates-zero-duplicates requirement) needs to find
// one regardless of whether it is open, closed or merged, not only the open
// default `gh pr list` would return.
export function prList(repo: GhRepo, input: PrListInput): GhResult<Argv> {
  const head = safeOwnValue(input, "head");
  if (typeof head !== "string" || head.length === 0) {
    return ghFail("pr list requires a non-empty head branch");
  }
  return ghOk([
    "gh",
    "pr",
    "list",
    ...repoFlag(repo),
    "--head",
    head,
    "--state",
    "all",
    "--json",
    "number,state,headRefName,baseRefName",
  ]);
}

// ---------------------------------------------------------------------------
// Body directives — Decision 8 of docs/design/stories/21.md.
//
// `Closes` and `Refs` are one directive per line each; `Blocked by:` is a
// single comma-separated line. `docs/milestones/M1.md:148` says "comma-
// separated lists are rejected at construction" in the generic case, but
// applying that generically breaks `Blocked by: #931, #932`
// (docs/design/04-domain-dev.md:449, docs/design/05-domain-trading.md:525),
// which is comma-separated AND correct. So the rejection below is per-
// directive: `closes` and `refs` each emit one line per issue; `blockedBy`
// emits exactly one line, comma-joined, never split.
// ---------------------------------------------------------------------------

export interface PrBodyInput {
  // Which merge target this body is for. `Closes` only ever fires on an
  // integration PR (docs/design/03-workflow.md:320-331, CONTRIBUTING.md:336);
  // a task PR never merges into the default branch, so `Closes` there would
  // never fire (docs/design/03-workflow.md:341's table row) and is refused
  // here rather than silently emitted and silently doing nothing.
  readonly kind: "integration" | "task";
  readonly closes?: readonly number[];
  readonly refs?: readonly number[];
  readonly blockedBy?: readonly number[];
  readonly body?: string;
}

function directiveLines(
  field: "closes" | "refs",
  keyword: "Closes" | "Refs",
  values: unknown,
): GhResult<readonly string[]> {
  if (!Array.isArray(values) || values.length === 0) {
    return ghFail(`pr body ${field} must be a non-empty array of issue numbers when supplied`);
  }
  const lines: string[] = [];
  for (const issue of values) {
    if (!isPositiveInteger(issue)) {
      return ghFail(`invalid issue number in pr body ${field}: ${String(issue)}`);
    }
    // One directive per line, always — the property NEVER-21.7 exists to
    // hold. Never comma-joined, never merged with another issue's line.
    lines.push(`${keyword} #${issue}`);
  }
  return ghOk(lines);
}

export function renderPrBody(input: PrBodyInput): GhResult<string> {
  const kind = safeOwnValue(input, "kind");
  const closes = safeOwnValue(input, "closes");
  const refs = safeOwnValue(input, "refs");
  const blockedBy = safeOwnValue(input, "blockedBy");
  const body = safeOwnValue(input, "body");

  if (kind !== "integration" && kind !== "task") {
    return ghFail(`pr body requires kind "integration" or "task", got ${String(kind)}`);
  }

  const lines: string[] = [];

  if (closes !== undefined) {
    if (kind === "task") {
      return ghFail(
        "Closes never fires on a task PR — it targets the story branch, not the " +
          "default branch — so it is refused here rather than emitted and silently " +
          "doing nothing; use refs instead",
      );
    }
    const closesLines = directiveLines("closes", "Closes", closes);
    if (!closesLines.ok) return closesLines;
    lines.push(...closesLines.value);
  }

  if (refs !== undefined) {
    const refsLines = directiveLines("refs", "Refs", refs);
    if (!refsLines.ok) return refsLines;
    lines.push(...refsLines.value);
  }

  if (blockedBy !== undefined) {
    if (!Array.isArray(blockedBy) || blockedBy.length === 0) {
      return ghFail("pr body blockedBy must be a non-empty array of issue numbers when supplied");
    }
    const numbers: number[] = [];
    for (const issue of blockedBy) {
      if (!isPositiveInteger(issue)) {
        return ghFail(`invalid issue number in pr body blockedBy: ${String(issue)}`);
      }
      numbers.push(issue);
    }
    // Exactly one line, comma-joined. This is the directive Decision 8 says
    // must NOT be split per-line: docs/design/04-domain-dev.md:449 shows
    // "Blocked by: #931, #932" as the correct, comma-separated form.
    lines.push(`Blocked by: ${numbers.map((n) => `#${n}`).join(", ")}`);
  }

  if (body !== undefined) {
    if (typeof body !== "string") {
      return ghFail("pr body's free-text body must be a string when supplied");
    }
    if (lines.length > 0 && body.length > 0) lines.push("");
    if (body.length > 0) lines.push(body);
  }

  if (lines.length === 0) {
    return ghFail("pr body requires at least one directive or a non-empty body string");
  }

  return ghOk(lines.join("\n"));
}
