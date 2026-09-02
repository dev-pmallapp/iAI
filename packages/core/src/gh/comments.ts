// Comment command construction (issue #22, CLAIM-21.1, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// SCOPE BOUNDARY, per Decision 10 of docs/design/stories/21.md:
//
// This module constructs the create and edit argv. It does NOT decide which
// comment to write, whether a sentinel already exists, or whether an upsert
// should create or edit. That is S1.4's — docs/milestones/M1.md:187 assigns
// "idempotent comment upsert keyed by sentinel" there.
//
// The split is along the pure/impure line rather than by feature: choosing
// between create and edit requires having READ the issue's comments, and this
// directory cannot read. S1.4 does the discovery and then calls one of these
// two functions with the answer.
//
// docs/design/01-skill-hierarchy.md:54 lists "comment upsert by sentinel"
// among the operations this layer's downstream reference document owns, which
// is what made the boundary ambiguous enough to need a decision.
//
// THE 60,000-CHARACTER BUDGET IS NOT ENFORCED HERE. GitHub's hard cap is
// 65,536 and docs/design/03-workflow.md:408-416 budgets 60,000, with the
// remainder reserved for the sentinel, metadata and permalinks. Enforcing it
// in this module would mean this layer deciding to truncate or to switch to a
// summary-plus-permalink rendering, and that rendering choice is the evidence
// engine's. S1.4 owns the budget; this module will construct whatever body it
// is handed.
import { repoApiPath, repoFlag, type GhRepo } from "./repo";
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  type Argv,
  type GhResult,
} from "./types";

export function commentCreate(repo: GhRepo, issue: number, body: string): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  if (typeof body !== "string" || body.length === 0) {
    return ghFail("comment create requires a non-empty body");
  }
  return ghOk(["gh", "issue", "comment", String(issue), ...repoFlag(repo), "--body", body]);
}

// Editing an existing comment has no porcelain form that takes a comment id —
// `gh issue comment --edit-last` exists but only addresses the most recent
// comment by the current user, which is not what a sentinel upsert needs: the
// sentinel comment is frequently not the last one. So the REST endpoint is the
// only route that can address an arbitrary comment.
//
// Note the endpoint is `issues/comments/{id}`, with no issue number in the
// path — comment ids are unique per repository, not per issue. Passing an
// issue number here is a common mistake and would address a different
// comment entirely, so this function does not take one.
export function commentEdit(repo: GhRepo, commentId: number, body: string): GhResult<Argv> {
  if (!isPositiveInteger(commentId)) return ghFail(`invalid comment id: ${String(commentId)}`);
  if (typeof body !== "string" || body.length === 0) {
    return ghFail("comment edit requires a non-empty body");
  }
  return ghOk([
    "gh",
    "api",
    "--method",
    "PATCH",
    `${repoApiPath(repo)}/issues/comments/${commentId}`,
    "-f",
    `body=${body}`,
  ]);
}

// Reads the comment list an upsert has to search. `--jq` is deliberately not
// applied here: the sentinel predicate is S1.4's, and baking one into the argv
// would put a rendering decision in the wrong Story.
export function commentList(repo: GhRepo, issue: number): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  return ghOk([
    "gh",
    "issue",
    "view",
    String(issue),
    ...repoFlag(repo),
    "--json",
    "comments",
  ]);
}
