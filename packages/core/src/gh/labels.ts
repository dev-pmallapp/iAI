// Label transition planning (issue #22, CLAIM-21.3, CLAIM-21.4, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// THE INVARIANT THIS MODULE EXISTS TO HOLD, from
// docs/design/03-workflow.md:167-169:
//
//   "Every transition is a single command. One `gh issue edit` with an
//    --add-label and a --remove-label in the same invocation. Never two
//    commands, so there is no window where the issue has zero or two statuses."
//
// The property is ATOMICITY. That matters because it is not the same property
// CLAIM-21.3 appears to demand, and Decision 2 of docs/design/stories/21.md
// resolved the difference.
//
// CLAIM-21.3 reads "exactly one `gh issue edit` carrying both --add-label and
// --remove-label". Taken literally that is unsatisfiable for an issue entering
// its FIRST status: there is nothing to remove, and
// docs/design/03-workflow.md:224 says so explicitly — "For an issue entering
// its first status, the --remove-label is simply omitted."
//
// Emitting a --remove-label anyway would mean asking `gh` to remove a label
// that is not there, which is a fabricated argument standing in for an honest
// absence. So the claim is read as governing the transition-WITH-a-predecessor
// case, and the first-status case emits one command with --add-label alone.
// Both emit exactly one command, which is the invariant that actually matters.
//
// The third case is CLAIM-21.4: the target is already present, so the correct
// number of commands is ZERO and the result is success, not an error.
import { repoFlag, type GhRepo } from "./repo";
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  safeOwnValue,
  type Argv,
  type GhPlan,
  type GhResult,
} from "./types";

// Label families where the tree states an exactly-one or at-most-one
// invariant, so a new member implies removing the incumbent:
//
//   status: "At most one status: label per issue"     (03-workflow.md:150, :165)
//   domain: "Exactly one domain:* on every Story"     (03-workflow.md:151)
//   rung:   "Every Story carries exactly one rung:*"  (03-workflow.md:152)
//
// gate:*, risk:*, class:* and `iai` are deliberately NOT here.
// docs/design/03-workflow.md:153 calls them "additive markers ... orthogonal
// and may coexist", so this module must not invent an exclusivity rule for
// them. A caller that wants gate:pending swapped for gate:approved passes an
// explicit `remove` — an intentional choice at the call site rather than a
// policy this module made up.
export const EXCLUSIVE_LABEL_PREFIXES: readonly string[] = ["status:", "domain:", "rung:"];

export interface LabelTransitionInput {
  readonly add: string;
  // The labels currently on the issue. A VALUE, per Decision 1 of
  // docs/design/stories/21.md: docs/design/03-workflow.md:225 says a no-op
  // transition is "skipped after reading current labels", and this module
  // cannot read anything.
  readonly current: readonly string[];
  // Overrides derivation. Used for families with no stated exclusivity rule.
  readonly remove?: string;
}

function exclusivePrefixOf(label: string): string | undefined {
  return EXCLUSIVE_LABEL_PREFIXES.find((prefix) => label.startsWith(prefix));
}

export function planLabelTransition(
  repo: GhRepo,
  issue: number,
  input: LabelTransitionInput,
): GhResult<GhPlan> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);

  // Snapshot before validating, per NEVER-21.8: a throwing getter on any of
  // these fields must become a typed failure rather than an exception.
  const add = safeOwnValue(input, "add");
  const current = safeOwnValue(input, "current");
  const explicitRemove = safeOwnValue(input, "remove");

  if (typeof add !== "string" || add.length === 0) {
    return ghFail("label transition requires a non-empty target label");
  }
  if (!Array.isArray(current)) {
    return ghFail("label transition requires the current label set as an array");
  }
  for (const label of current) {
    if (typeof label !== "string") {
      return ghFail("current labels must all be strings");
    }
  }

  // CLAIM-21.4. Already applied is success with no work, not an error: a
  // re-run of a transition skill must be a no-op, per
  // docs/design/03-workflow.md:170-172.
  if (current.includes(add)) {
    return ghOk([]);
  }

  let remove: string | undefined;
  if (explicitRemove !== undefined) {
    if (typeof explicitRemove !== "string" || explicitRemove.length === 0) {
      return ghFail("label transition remove must be a non-empty string when supplied");
    }
    // Removing a label that is not present is not an error, but it is also not
    // worth emitting: it would be the fabricated argument Decision 2 rejects.
    remove = current.includes(explicitRemove) ? explicitRemove : undefined;
  } else {
    const prefix = exclusivePrefixOf(add);
    if (prefix !== undefined) {
      const incumbents = current.filter((label: string) => label.startsWith(prefix));
      // Two labels from an exactly-one family is the corruption
      // docs/design/03-workflow.md:165-166 says "the conductor emits a hard
      // failure" for. This layer cannot emit that block, so it reports the
      // condition rather than silently removing one and leaving the other —
      // which would look like it worked.
      if (incumbents.length > 1) {
        return ghFail(
          `issue ${issue} carries ${incumbents.length} "${prefix}" labels (${incumbents.join(", ")}); ` +
            "at most one is permitted, so the transition is refused rather than guessing which to remove",
        );
      }
      remove = incumbents[0];
    }
  }

  const argv: string[] = ["gh", "issue", "edit", String(issue), ...repoFlag(repo)];
  argv.push("--add-label", add);
  if (remove !== undefined) argv.push("--remove-label", remove);

  // Exactly one command, always. CLAIM-21.3.
  const plan: GhPlan = [argv as Argv];
  return ghOk(plan);
}

export interface LabelCreateInput {
  readonly name: string;
  readonly color: string;
  readonly description?: string;
}

// `--force` is what makes label creation idempotent: it reconciles a drifted
// colour or description in place instead of failing with "label already
// exists". That is the behaviour docs/design/03-workflow.md:154 requires when
// it says "/iai:init corrects drifted hex values without recreating labels",
// and it is what scripts/bootstrap-github.sh:397-405 already relies on.
export function labelCreate(repo: GhRepo, input: LabelCreateInput): GhResult<Argv> {
  const name = safeOwnValue(input, "name");
  const color = safeOwnValue(input, "color");
  const description = safeOwnValue(input, "description");

  if (typeof name !== "string" || name.length === 0) {
    return ghFail("label create requires a non-empty name");
  }
  if (typeof color !== "string" || !/^[0-9a-fA-F]{6}$/.test(color)) {
    return ghFail(`invalid label colour "${String(color)}": expected six hex digits, no leading #`);
  }
  const argv: string[] = [
    "gh",
    "label",
    "create",
    name,
    ...repoFlag(repo),
    "--color",
    color,
  ];
  if (description !== undefined) {
    if (typeof description !== "string") {
      return ghFail("label create description must be a string when supplied");
    }
    argv.push("--description", description);
  }
  argv.push("--force");
  return ghOk(argv);
}

export function labelList(repo: GhRepo, limit = 200): GhResult<Argv> {
  if (!isPositiveInteger(limit)) return ghFail(`invalid label list limit: ${String(limit)}`);
  return ghOk([
    "gh",
    "label",
    "list",
    ...repoFlag(repo),
    "--limit",
    String(limit),
    "--json",
    "name,color,description",
  ]);
}
