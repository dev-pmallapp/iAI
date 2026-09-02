// Issue command construction (issue #22, CLAIM-21.1, NEVER-21.8).
//
// "Build every `gh` invocation iAI will ever make as a constructed argv plus a
// parser for the response." — docs/milestones/M1.md:122-123
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// Every constructor here takes the repository explicitly, per Decision 6 of
// docs/design/stories/21.md, and returns a GhResult rather than throwing, per
// NEVER-21.8. A throw inside a batch loses the resume position that
// CLAIM-21.5 exists to protect.
import { repoFlag, type GhRepo } from "./repo";
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  safeOwnValue,
  type Argv,
  type GhResult,
} from "./types";

export interface IssueCreateInput {
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
  // `gh issue create --milestone` takes a milestone TITLE, not a number, which
  // is the opposite of the REST API used in milestones.ts. Both forms exist in
  // the shipped bootstrap scripts and the mismatch is a documented hazard:
  // scripts/bootstrap-github.sh:606-608 warns that a milestone's ordinal and
  // its real GitHub number "almost never line up". Naming the field for what
  // the flag actually consumes is the cheapest way to stop that confusion
  // reaching a caller.
  readonly milestoneTitle?: string;
}

export function issueCreate(repo: GhRepo, input: IssueCreateInput): GhResult<Argv> {
  // Snapshot every field through safeOwnValue before validating any of it.
  // A hostile input can carry a throwing getter, and `input.title` would then
  // throw straight out of a constructor that NEVER-21.8 says cannot throw.
  // Reading first and validating locals afterwards is the same shape
  // guards/egress.ts uses for `Destination`, and it keeps the guarantee from
  // depending on anyone remembering to use a safe reader on a future field.
  const title = safeOwnValue(input, "title");
  const body = safeOwnValue(input, "body");
  const labels = safeOwnValue(input, "labels");
  const milestoneTitle = safeOwnValue(input, "milestoneTitle");

  if (typeof title !== "string" || title.length === 0) {
    return ghFail("issue create requires a non-empty title");
  }
  if (typeof body !== "string") {
    return ghFail("issue create requires a body string");
  }

  const argv: string[] = ["gh", "issue", "create", ...repoFlag(repo)];
  argv.push("--title", title, "--body", body);

  if (labels !== undefined) {
    if (!Array.isArray(labels)) return ghFail("issue create labels must be an array");
    // One --label per value. `gh` accepts a comma-joined string too, but a
    // label legitimately containing a comma would then split into two, and the
    // repository's own label set is prefix-structured ("status:", "domain:")
    // rather than comma-free by construction. Repeating the flag has no such
    // failure mode.
    for (const label of labels) {
      if (typeof label !== "string" || label.length === 0) {
        return ghFail("issue create labels must all be non-empty strings");
      }
      argv.push("--label", label);
    }
  }

  if (milestoneTitle !== undefined) {
    if (typeof milestoneTitle !== "string" || milestoneTitle.length === 0) {
      return ghFail("issue create milestoneTitle must be a non-empty string");
    }
    argv.push("--milestone", milestoneTitle);
  }

  return ghOk(argv);
}

export function issueEditBody(repo: GhRepo, issue: number, body: string): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  if (typeof body !== "string") return ghFail("issue edit requires a body string");
  return ghOk(["gh", "issue", "edit", String(issue), ...repoFlag(repo), "--body", body]);
}

export function issueClose(repo: GhRepo, issue: number, comment?: string): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  const argv: string[] = ["gh", "issue", "close", String(issue), ...repoFlag(repo)];
  if (comment !== undefined) {
    if (typeof comment !== "string" || comment.length === 0) {
      return ghFail("issue close comment must be a non-empty string when supplied");
    }
    argv.push("--comment", comment);
  }
  return ghOk(argv);
}

// `parent` is NOT a field on `gh issue view --json`, however often the design
// tree says otherwise. docs/design/01-skill-hierarchy.md:434 still asks for it;
// the reconciliation pass already recorded the verdict `corrected` at
// docs/design/verification-pass.md:246, and the valid form appears eleven lines
// earlier in that same document at :411.
//
// Rejecting it at construction rather than letting `gh` fail is the difference
// between a typed failure naming the real problem and an opaque non-zero exit
// midway through a batch. Sub-issue parentage is read through the GraphQL API
// or the `Parent: #N` body link, both of which are #23's.
const INVALID_ISSUE_VIEW_FIELDS: ReadonlySet<string> = new Set(["parent", "subIssues", "children"]);

export function issueView(repo: GhRepo, issue: number, fields: readonly string[]): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  if (!Array.isArray(fields) || fields.length === 0) {
    return ghFail("issue view requires at least one --json field");
  }
  for (const field of fields) {
    if (typeof field !== "string" || field.length === 0) {
      return ghFail("issue view fields must all be non-empty strings");
    }
    if (INVALID_ISSUE_VIEW_FIELDS.has(field)) {
      return ghFail(
        `"${field}" is not a gh issue view --json field; sub-issue parentage is read via the ` +
          "GraphQL sub-issue API or the Parent: #N body link, not via issue view",
      );
    }
  }
  return ghOk([
    "gh",
    "issue",
    "view",
    String(issue),
    ...repoFlag(repo),
    "--json",
    fields.join(","),
  ]);
}

export interface IssueListInput {
  readonly state?: "open" | "closed" | "all";
  readonly limit?: number;
  readonly labels?: readonly string[];
  readonly milestoneTitle?: string;
  readonly fields?: readonly string[];
}

export function issueList(repo: GhRepo, input: IssueListInput = {}): GhResult<Argv> {
  // Same snapshot-then-validate discipline as issueCreate, for the same
  // reason: a throwing getter must become a typed failure, not an exception.
  const state = safeOwnValue(input, "state");
  const limit = safeOwnValue(input, "limit");
  const labels = safeOwnValue(input, "labels");
  const milestoneTitle = safeOwnValue(input, "milestoneTitle");
  const fields = safeOwnValue(input, "fields");

  const argv: string[] = ["gh", "issue", "list", ...repoFlag(repo)];

  if (state !== undefined) {
    if (state !== "open" && state !== "closed" && state !== "all") {
      return ghFail(`invalid issue list state: ${String(state)}`);
    }
    argv.push("--state", state);
  }

  if (limit !== undefined) {
    if (!isPositiveInteger(limit)) {
      return ghFail(`invalid issue list limit: ${String(limit)}`);
    }
    argv.push("--limit", String(limit));
  }

  if (labels !== undefined) {
    if (!Array.isArray(labels)) return ghFail("issue list labels must be an array");
    for (const label of labels) {
      if (typeof label !== "string" || label.length === 0) {
        return ghFail("issue list labels must all be non-empty strings");
      }
      argv.push("--label", label);
    }
  }

  if (milestoneTitle !== undefined) {
    if (typeof milestoneTitle !== "string" || milestoneTitle.length === 0) {
      return ghFail("issue list milestoneTitle must be a non-empty string");
    }
    argv.push("--milestone", milestoneTitle);
  }

  if (fields !== undefined) {
    if (!Array.isArray(fields) || fields.length === 0) {
      return ghFail("issue list fields must be a non-empty array when supplied");
    }
    for (const field of fields) {
      if (typeof field !== "string" || field.length === 0) {
        return ghFail("issue list fields must all be non-empty strings");
      }
      if (INVALID_ISSUE_VIEW_FIELDS.has(field)) {
        return ghFail(`"${field}" is not a gh issue list --json field`);
      }
    }
    argv.push("--json", fields.join(","));
  }

  return ghOk(argv);
}
