// The fixture repository: a real, disposable git tree a skill can be run
// against and torn down.
//
// IT RUNS GIT THROUGH THE PORT, and that is not incidental. #318's case 12
// asserts that exactly one production module in the whole workspace launches a
// process, and that it is packages/exec/src/real.ts. If this module imported
// node:child_process it would be the second, and the claim CLAIM-293.1 rests
// on would be false. Taking a `Port` keeps the property true AND makes every
// git command this module issues visible to the recording port -- which is how
// #321 sees the worktree surface without a second capture mechanism.
//
// GATE RULING G6, 2026-09-07: this is the ONE fixture repository. M4/S4.5's
// conformance suite (docs/milestones/M4.md:195, :215) consumes it rather than
// building a second. Two fixture repositories would be a coexistence problem
// arriving before either exists.
//
// PRIOR ART. packages/core/test/commit-prefix.test.ts:112-180 already built a
// real throwaway repository -- init, identity, an installed hook, a seed
// commit, rev-parse before/after, staged-diff before/after, teardown. That was
// 80% of the local half, inlined in one test. This generalises it.

import type { ExecResult, Port } from "iai-exec";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface FixtureFile {
  /** Repo-relative path. Parent directories are created. */
  readonly path: string;
  readonly contents: string;
}

export interface FixtureRepoSpec {
  /** Distinguishes one scenario's seed from another's. Case 2 asserts the
   *  resulting tree hashes are pairwise distinct, so two scenarios sharing a
   *  spec is a defect the harness must surface rather than tolerate. */
  readonly name: string;
  readonly files: readonly FixtureFile[];
}

export interface FixtureRepo {
  readonly root: string;
  readonly name: string;
  /** `git rev-parse HEAD^{tree}` -- the content hash of the worktree as
   *  committed. This is the WORKTREE MUTATION SURFACE #321 diffs. */
  treeHash(): Promise<string>;
  /** Uncommitted changes, so a run that writes without committing is still
   *  visible. A tree hash alone would miss it. */
  isDirty(): Promise<boolean>;
  run(argv: readonly string[]): Promise<ExecResult>;
}

/** Identity is set per-repository, never globally: a harness that wrote to the
 *  developer's global git config would be a mutation outside its own fixture,
 *  which is precisely what it exists to detect. */
const SEED_IDENTITY: readonly (readonly string[])[] = [
  ["git", "config", "user.email", "harness@iai.invalid"],
  ["git", "config", "user.name", "iAI harness"],
  // Deterministic: without this, a repository created on a machine whose
  // default branch name differs produces a different first ref, and scenario
  // comparisons drift for a reason unrelated to the skill.
  ["git", "config", "init.defaultBranch", "main"],
];

export class FixtureRepoError extends Error {
  constructor(
    readonly argv: readonly string[],
    readonly result: ExecResult,
  ) {
    // Name the command AND the stderr. A message that said only "git failed"
    // would be the collapsed message references/verification.md:123-129 bans.
    super(
      `fixture repository setup failed: \`${argv.join(" ")}\` exited ${result.exitCode}` +
        (result.stderr.trim().length > 0 ? ` -- ${result.stderr.trim()}` : ""),
    );
    this.name = "FixtureRepoError";
  }
}

/** Build a seeded repository at `root`. `root` must already exist and be empty;
 *  supply one from `createTempDirs()`. */
export async function createFixtureRepo(
  port: Port,
  root: string,
  spec: FixtureRepoSpec,
): Promise<FixtureRepo> {
  const run = async (argv: readonly string[]): Promise<ExecResult> => {
    const result = await port.run(argv);
    return result;
  };

  const mustRun = async (argv: readonly string[]): Promise<ExecResult> => {
    const result = await run(argv);
    if (result.exitCode !== 0) throw new FixtureRepoError(argv, result);
    return result;
  };

  // `-C <root>` rather than a cwd option: the argv carries the location, so a
  // recording port sees WHERE a command ran, not just what it was. Two
  // scenarios issuing identical argv in different repositories would otherwise
  // be indistinguishable in the record.
  const git = (...args: string[]): string[] => ["git", "-C", root, ...args];

  await mustRun(["git", "init", "-q", root]);
  for (const pair of SEED_IDENTITY) {
    await mustRun(git(...pair.slice(1)));
  }

  for (const file of spec.files) {
    const full = join(root, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.contents, "utf8");
  }

  await mustRun(git("add", "-A"));
  // The subject must satisfy this repository's own commit-msg contract, so a
  // fixture repository can be created inside a checkout whose hooks are
  // installed without the seed being rejected for an unrelated reason.
  await mustRun(git("commit", "-q", "-m", `#0: seed ${spec.name}`));

  return {
    root,
    name: spec.name,
    async treeHash(): Promise<string> {
      const result = await mustRun(git("rev-parse", "HEAD^{tree}"));
      return result.stdout.trim();
    },
    async isDirty(): Promise<boolean> {
      const result = await mustRun(git("status", "--porcelain"));
      return result.stdout.trim().length > 0;
    },
    run,
  };
}
