// The two-surface mutation recorder: argv attempts AND worktree writes,
// reported separately and never merged into one count.
//
// Build target 5 of docs/design/stories/293.md, CLAIM-293.8, cases 4 and 10 of
// docs/test-plans/293-plan.md.
//
// TWO SURFACES, AND WHY AN ARGV-ONLY RECORDER COVERS TWO OF FOUR SKILLS.
// Decision 6 (docs/design/stories/293.md:573-587) rules that the recorder
// spans both the `gh` argv surface and the worktree surface, each reported
// separately, because a scenario that trips only one surface must not be
// scored against a total that hides which one moved. Half of the shipped
// skills mutate only through `gh`; the other half write a Design file to the
// fixture worktree and never call `gh` at all. An argv-only recorder would
// therefore be blind to exactly the skills that do not touch `gh`, which is
// mutation N2's shape -- a scope entry listed but never walked -- arriving
// inside the very fix meant to catch it.
//
// WHY THE WRITE SEAM EXISTS AT ALL, RATHER THAN A TREE-HASH COMPARISON.
// An identical-bytes rewrite -- the same content written back over itself --
// leaves the tree hash, HEAD and `git status --porcelain` all unchanged, and
// it still happened. Case 10 of the test plan requires exactly this to be
// reported as a mutation. Every effect-sampling alternative -- diffing the
// tree, diffing the worktree, diffing HEAD -- is blind to it BY CONSTRUCTION,
// because the bytes on disk after the rewrite equal the bytes before it. The
// only place the event is visible is the write call itself, so this module
// intercepts writes rather than inferring them from state.
//
// WHY THREE WORKTREE OBSERVABLES, NOT ONE.
// `git commit --allow-empty` after an identical-bytes rewrite moves HEAD
// while leaving `HEAD^{tree}` byte-identical to what it was. A recorder that
// sampled only the tree hash could not tell a committed identical-bytes
// rewrite from an uncommitted one -- two different worktree states collapsing
// onto one observable. HEAD, tree and dirty-status are sampled independently
// so each can move (or not) on its own.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO. No exit code on the recorded
// argv -- see the comment on `attemptedMutations` in `end()`. No
// `process.exit`, no JSON artifact, no serializer, no run-1/run-2 pairing, and
// no `commit()` or `writeDesign()` convenience helper: those belong to #322's
// and #323's call sites, and a `commit()` helper living here would be the
// first line of a transcription (references/verification.md) sitting in the
// wrong package.

import type { Argv, GhPlan } from "iai-core";
import { createRecordingPort, type Port, type RecordedCall } from "iai-exec";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { isMutatingGhArgv } from "./fake-forge";
import type { FixtureRepo } from "./fixture-repo";

export interface RecordedWrite {
  readonly path: string;
  readonly byteLength: number;
  readonly existedBefore: boolean;
  readonly identical: boolean;
  readonly trackedAtBegin: boolean;
}

export interface WorktreeSample {
  readonly head: string;
  readonly tree: string;
  readonly dirty: boolean;
}

export interface MutationReport {
  readonly scenario: string;
  readonly attemptedMutations: GhPlan;
  readonly calls: readonly RecordedCall[];
  readonly writes: readonly RecordedWrite[];
  readonly before: WorktreeSample;
  readonly after: WorktreeSample;
}

export interface MutationRecorder {
  readonly port: Port;
  writeFile(relPath: string, contents: string): void;
  begin(repo: FixtureRepo): Promise<void>;
  end(): Promise<MutationReport>;
}

export type WritePathRefusalKind = "not-a-string" | "absolute-path" | "escapes-fixture";

export type WriteCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: { readonly kind: WritePathRefusalKind; readonly message: string } };

/** Validate a write path before touching the filesystem. PURE -- no I/O, same
 *  discipline as `checkArgv` (packages/exec/src/port.ts:74): testable without
 *  a fixture, and every refusal reason has its own distinct phrase so a
 *  caller never has to parse a value out of the message to tell two apart. */
export function checkWritePath(relPath: unknown): WriteCheck {
  if (typeof relPath !== "string") {
    return {
      ok: false,
      refusal: {
        kind: "not-a-string",
        message: "a write path must already be a string; the recorder never stringifies its argument",
      },
    };
  }
  if (isAbsolute(relPath)) {
    return {
      ok: false,
      refusal: {
        kind: "absolute-path",
        message:
          `the recorder takes a repo-relative path and refuses the absolute path "${relPath}", ` +
          "because an absolute path could name anywhere on disk, not just the fixture",
      },
    };
  }
  const normalised = normalize(relPath);
  if (normalised === ".." || normalised.startsWith("../")) {
    return {
      ok: false,
      refusal: {
        kind: "escapes-fixture",
        message:
          `the path "${relPath}" climbs above the fixture root via ".."; the recorder refuses to write ` +
          "outside the worktree it is observing",
      },
    };
  }
  return { ok: true };
}

export class MutationRecorderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutationRecorderError";
  }
}

function probeFailure(argv: readonly string[], exitCode: number, stderr: string): MutationRecorderError {
  return new MutationRecorderError(
    `mutation recorder probe failed: \`${argv.join(" ")}\` exited ${exitCode}` +
      (stderr.trim().length > 0 ? ` -- ${stderr.trim()}` : ""),
  );
}

export function createMutationRecorder(options: { readonly port: Port }): MutationRecorder {
  const raw = options.port;
  // The wrapper is what the recorder hands OUT, but the recorder's OWN git
  // probes run on `raw`, never on `recording`. If a probe ran through the
  // wrapper, the act of observing would itself populate `report.calls`, and a
  // subject that issued nothing would still show a non-empty call list --
  // the observer entering its own observation.
  const recording = createRecordingPort(raw);

  let root: string | undefined;
  let scenario: string | undefined;
  let trackedAtBegin: Set<string> | undefined;
  let before: WorktreeSample | undefined;
  let writes: RecordedWrite[] = [];

  async function mustRun(argv: readonly string[]): Promise<string> {
    const result = await raw.run(argv);
    if (result.exitCode !== 0) throw probeFailure(argv, result.exitCode, result.stderr);
    return result.stdout;
  }

  async function sample(currentRoot: string): Promise<WorktreeSample> {
    const git = (...args: string[]): string[] => ["git", "-C", currentRoot, ...args];
    const head = (await mustRun(git("rev-parse", "HEAD"))).trim();
    const tree = (await mustRun(git("rev-parse", "HEAD^{tree}"))).trim();
    const status = await mustRun(git("status", "--porcelain"));
    return { head, tree, dirty: status.trim().length > 0 };
  }

  return {
    port: recording,

    async begin(repo: FixtureRepo): Promise<void> {
      root = repo.root;
      scenario = repo.name;
      // The seed's own git commands ran before this window opens and are not
      // the subject's; dropping them keeps `report.calls` scoped to the run
      // under observation.
      recording.reset();
      const listing = await mustRun(["git", "-C", root, "ls-files"]);
      trackedAtBegin = new Set(listing.split("\n").filter((line) => line.length > 0));
      writes = [];
      before = await sample(root);
    },

    writeFile(relPath: string, contents: string): void {
      if (root === undefined || trackedAtBegin === undefined) {
        throw new MutationRecorderError(
          "the write window is not open: writeFile was called before begin(), so there is no fixture root " +
            "to write into",
        );
      }
      const check = checkWritePath(relPath);
      if (!check.ok) throw new MutationRecorderError(check.refusal.message);

      const full = join(root, relPath);
      const existedBefore = existsSync(full);
      const identical = existedBefore && readFileSync(full, "utf8") === contents;

      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents, "utf8");

      // Pushed UNCONDITIONALLY, identical bytes included. This is the entire
      // reason the seam is a write interceptor and not a tree-hash diff --
      // docs/test-plans/293-plan.md:123 requires an identical-bytes rewrite to
      // be reported, and a tree-hash comparison would score it as nothing.
      //
      // `trackedAtBegin` is RECORDED here, never filtered on. A brand-new
      // Design file is untracked at the moment it is written -- that is what
      // makes it a creation -- and scoring "untracked" as "not a mutation"
      // would zero out exactly the case this module exists to catch: the
      // argv-only defect this fix reproduces inside itself if tracked-ness is
      // ever used as a filter rather than a fact.
      writes.push({
        path: relPath,
        byteLength: Buffer.byteLength(contents, "utf8"),
        existedBefore,
        identical,
        trackedAtBegin: trackedAtBegin.has(normalize(relPath)),
      });
    },

    async end(): Promise<MutationReport> {
      if (root === undefined || before === undefined || scenario === undefined) {
        throw new MutationRecorderError("end() was called before begin(): there is no window to close");
      }
      const after = await sample(root);
      const report: MutationReport = {
        scenario,
        // The exit code is DELIBERATELY DROPPED. A reader holding an exit
        // code writes `... && c.exitCode === 0`, which scores run 2 clean for
        // the fake's reason (it refused) rather than the skill's (it declined
        // to try) -- packages/exec/src/recording.ts:10-16 and
        // docs/evidence/320-20260908T074833Z.md's M9 finding, where exactly
        // that substitution survived a mutation it should have killed. Typing
        // this as `GhPlan` -- an argv array with no verdict field -- makes the
        // shortcut a type error instead of a code-review miss.
        attemptedMutations: recording.calls
          .filter((call) => isMutatingGhArgv(call.argv))
          .map((call): Argv => call.argv),
        calls: [...recording.calls],
        writes: [...writes],
        before,
        after,
      };
      return Object.freeze(report);
    },
  };
}

/** Why `report` is not zero-mutation, one phrase per condition that holds.
 *
 *  A `string[]`, NEVER A BOOLEAN. `ghOk([])` (packages/core/src/gh/labels.ts
 *  :96-101) already models a legitimate zero-mutation outcome as an empty
 *  collection rather than a sentinel, and this mirrors it: empty means zero
 *  mutations. A boolean -- an `isClean()` getter -- is the assertion shape
 *  under which a caller writes `expect(clean).toBe(true)` and every one of
 *  the surface-unwiring mutations this module exists to catch still passes,
 *  because the boolean has no diagnostic content to grep for a scenario name
 *  or an argv in. */
export function mutationEvidence(report: MutationReport): readonly string[] {
  const evidence: string[] = [];

  if (report.attemptedMutations.length > 0) {
    const argvList = report.attemptedMutations.map((argv) => argv.join(" ")).join("; ");
    evidence.push(`attempted mutating gh argv: ${argvList}`);
  }

  const identicalWrites = report.writes.filter((w) => w.identical);
  if (identicalWrites.length > 0) {
    evidence.push(`rewrote identical bytes at: ${identicalWrites.map((w) => w.path).join(", ")}`);
  }

  const differingWrites = report.writes.filter((w) => !w.identical);
  if (differingWrites.length > 0) {
    evidence.push(`wrote differing bytes at: ${differingWrites.map((w) => w.path).join(", ")}`);
  }

  if (report.after.head !== report.before.head) {
    evidence.push(`HEAD moved from "${report.before.head}" to "${report.after.head}"`);
  }

  if (report.after.tree !== report.before.tree) {
    evidence.push(
      `the committed tree hash changed from "${report.before.tree}" to "${report.after.tree}"`,
    );
  }

  if (report.after.dirty && !report.before.dirty) {
    evidence.push("uncommitted changes remain in the worktree");
  }

  // THE BYPASS CLAUSE. If the worktree moved and no write was recorded, some
  // path other than `writeFile` touched the fixture -- the runtime detector
  // for a bypassed seam. Stated honestly: this CANNOT see an identical-bytes
  // bypass, because an identical-bytes write leaves HEAD, tree and dirty
  // status all unchanged -- the same blindness clause 3's write interceptor
  // exists to cover, and no worktree-observable check can close it.
  const worktreeMoved =
    report.after.head !== report.before.head ||
    report.after.tree !== report.before.tree ||
    report.after.dirty !== report.before.dirty;
  if (report.writes.length === 0 && worktreeMoved) {
    evidence.push(
      "the worktree changed with no recorded write, so something wrote outside the recorder's seam",
    );
  }

  return evidence;
}
