// Milestone command construction (issue #22, CLAIM-21.1, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// WHY THESE GO THROUGH `gh api` AND NOT A PORCELAIN SUBCOMMAND:
//
// No design document in this repository contains a single `gh` milestone
// command — this family had no specified form at all, which the #21 Design
// records as gap G10. `gh` has no `gh milestone` porcelain, so the REST API is
// not a preference here, it is the only route. Both shipped bootstrap scripts
// already take it (scripts/bootstrap-github.sh:425-463,
// scripts/bootstrap-stories.py:252-253).
//
// THE NUMBER/TITLE HAZARD:
//
// The REST API addresses a milestone by NUMBER. `gh issue create --milestone`
// takes a TITLE. scripts/bootstrap-github.sh:606-608 warns that a milestone's
// ordinal in a plan document and its real GitHub number "almost never line
// up", which is exactly the confusion that mismatch invites. The parameter
// names in this module and in issues.ts are chosen to make the two
// non-interchangeable at a call site: `milestoneNumber` here,
// `milestoneTitle` there.
import { repoApiPath, type GhRepo } from "./repo";
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  safeOwnValue,
  type Argv,
  type GhResult,
} from "./types";

// --paginate because a repository with more than one page of milestones would
// otherwise silently return a prefix, and "the milestone is missing" is
// indistinguishable from "the milestone is on page two".
export function milestoneList(repo: GhRepo): GhResult<Argv> {
  return ghOk([
    "gh",
    "api",
    "--paginate",
    `${repoApiPath(repo)}/milestones?state=all&per_page=100`,
  ]);
}

export interface MilestoneCreateInput {
  readonly title: string;
  readonly description?: string;
  readonly state?: "open" | "closed";
}

export function milestoneCreate(repo: GhRepo, input: MilestoneCreateInput): GhResult<Argv> {
  // Snapshot before validating, per NEVER-21.8.
  const title = safeOwnValue(input, "title");
  const description = safeOwnValue(input, "description");
  const state = safeOwnValue(input, "state");

  if (typeof title !== "string" || title.length === 0) {
    return ghFail("milestone create requires a non-empty title");
  }
  const argv: string[] = [
    "gh",
    "api",
    "--method",
    "POST",
    `${repoApiPath(repo)}/milestones`,
    "-f",
    `title=${title}`,
  ];
  if (description !== undefined) {
    if (typeof description !== "string") {
      return ghFail("milestone create description must be a string when supplied");
    }
    argv.push("-f", `description=${description}`);
  }
  if (state !== undefined) {
    if (state !== "open" && state !== "closed") {
      return ghFail(`invalid milestone state: ${String(state)}`);
    }
    argv.push("-f", `state=${state}`);
  }
  return ghOk(argv);
}

export function milestoneUpdate(
  repo: GhRepo,
  milestoneNumber: number,
  input: Partial<MilestoneCreateInput>,
): GhResult<Argv> {
  if (!isPositiveInteger(milestoneNumber)) {
    return ghFail(`invalid milestone number: ${String(milestoneNumber)}`);
  }
  const title = safeOwnValue(input, "title");
  const description = safeOwnValue(input, "description");
  const state = safeOwnValue(input, "state");
  const argv: string[] = [
    "gh",
    "api",
    "--method",
    "PATCH",
    `${repoApiPath(repo)}/milestones/${milestoneNumber}`,
  ];
  let fieldCount = 0;
  if (title !== undefined) {
    if (typeof title !== "string" || title.length === 0) {
      return ghFail("milestone update title must be a non-empty string when supplied");
    }
    argv.push("-f", `title=${title}`);
    fieldCount += 1;
  }
  if (description !== undefined) {
    if (typeof description !== "string") {
      return ghFail("milestone update description must be a string when supplied");
    }
    argv.push("-f", `description=${description}`);
    fieldCount += 1;
  }
  if (state !== undefined) {
    if (state !== "open" && state !== "closed") {
      return ghFail(`invalid milestone state: ${String(state)}`);
    }
    argv.push("-f", `state=${state}`);
    fieldCount += 1;
  }
  // A PATCH with no fields is a request that cannot mean anything. Emitting it
  // would spend a rate-limit token to achieve nothing, which matters inside a
  // batch that CLAIM-21.5 has to resume.
  if (fieldCount === 0) {
    return ghFail("milestone update requires at least one of title, description or state");
  }
  return ghOk(argv);
}
