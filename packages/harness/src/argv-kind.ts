// The argv classifier: what KIND of call a recorded argv is, for #322's
// runner to count reads against.
//
// THIS IS A POSITIVE CLASSIFIER AND "unclassified" IS A NAMED POPULATION, NOT
// A SILENT DEFAULT -- a partition, not a carve-out. It exists because a read
// count may NOT be computed as `calls.length - attemptedMutations.length`.
// `isMutatingGhArgv` (packages/harness/src/fake-forge.ts:216-222) returns
// `false` for EVERY `git` argv by construction (fake-forge.ts:224: `if
// (argv[0] !== "gh") return false;`), so that subtraction scores `git add` and
// `git commit` as reads. A run 2 that committed four times and read nothing
// would satisfy `reads >= 4` under the subtraction and would not under
// `countReads` below, which is the entire reason this module exists rather
// than a one-line arithmetic fix at the call site.

import type { RecordedCall } from "iai-exec";
import { isMutatingGhArgv } from "./fake-forge";

export type ArgvKind = "forge-read" | "forge-mutation" | "git-read" | "git-write" | "unclassified";

/** A CLOSED SET. Adding a verb is a deliberate edit here, visible in review --
 *  the same doctrine packages/exec/src/port.ts:51-57 states for the port's
 *  own executable allow-list applied to the verbs of one of those executables. */
export const GIT_READ_VERBS: readonly string[] = [
  "rev-parse",
  "ls-files",
  "ls-remote",
  "status",
  "show",
  "cat-file",
  "log",
  "diff",
];

/** A CLOSED SET, same doctrine as `GIT_READ_VERBS` above. */
export const GIT_WRITE_VERBS: readonly string[] = [
  "init",
  "config",
  "add",
  "commit",
  "checkout",
  "tag",
  "push",
];

/** The verb of a `git` argv, skipping a leading `-C <path>` pair -- the same
 *  shape packages/harness/src/fixture-repo.ts:101 and
 *  packages/harness/src/mutation-recorder.ts:163 build their own `git(...)`
 *  argv with. */
function gitVerb(argv: readonly string[]): string | undefined {
  const index = argv[1] === "-C" ? 3 : 1;
  return argv[index];
}

/** Classify one argv. `gh` defers to the ONE mutation classifier
 *  (`isMutatingGhArgv`) rather than restating it; `git` is read positively
 *  against the two closed verb lists above; anything else, including an
 *  argv this port would refuse outright, is `"unclassified"`. */
export function classifyArgv(argv: readonly string[]): ArgvKind {
  if (argv[0] === "gh") return isMutatingGhArgv(argv) ? "forge-mutation" : "forge-read";
  if (argv[0] === "git") {
    const verb = gitVerb(argv);
    if (verb !== undefined && GIT_READ_VERBS.includes(verb)) return "git-read";
    if (verb !== undefined && GIT_WRITE_VERBS.includes(verb)) return "git-write";
    return "unclassified";
  }
  return "unclassified";
}

/** The number of recorded calls that were READS, on either surface.
 *
 *  NOT `calls.length - attemptedMutations.length` -- see the module header. */
export function countReads(calls: readonly RecordedCall[]): number {
  return calls.filter((call) => {
    const kind = classifyArgv(call.argv);
    return kind === "forge-read" || kind === "git-read";
  }).length;
}
