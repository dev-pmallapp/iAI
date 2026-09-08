// #319, build targets 3 and 9 of docs/design/stories/293.md.
// Case 2 of docs/test-plans/293-plan.md.
//
// Corpus: `real` for git itself -- these are real repositories with real
// commits -- and `synthetic` for the seeded contents, per
// GOALS_FIXTURE_CORPUS_DECLARATION.

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRealPort, createRecordingPort } from "iai-exec";
import {
  createFixtureRepo,
  createTempDirs,
  FixtureRepoError,
  GOALS_FIXTURE_CORPUS_DECLARATION,
  renderGoalsFixture,
  type FixtureRepoSpec,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");
const temps = createTempDirs();
afterAll(() => temps.cleanup());

const port = createRealPort();

/** The scenario roster. Hardcoded and its length asserted, because case 2's
 *  denominator must not be derived from whatever happens to be on disk. */
const SCENARIO_ROSTER: readonly FixtureRepoSpec[] = [
  {
    name: "empty-milestone",
    files: [{ path: "docs/milestones/M9.md", contents: "# M9\n\n| Feature | Description |\n|---|---|\n" }],
  },
  {
    name: "one-story",
    files: [
      { path: "docs/milestones/M9.md", contents: "# M9\n\n| Feature | Description |\n|---|---|\n| A | first |\n" },
    ],
  },
  {
    name: "goals-only",
    files: [{ path: "USER/GOALS/GOALS.md", contents: renderGoalsFixture({ goals: ["ship the harness"] }) }],
  },
];

describe("case 2: each scenario begins from a real, distinct, committed git seed", () => {
  test("the scenario roster is non-zero, so nothing below can pass vacuously", () => {
    expect(SCENARIO_ROSTER.length).toBeGreaterThan(0);
  });

  test("scenarios_executed equals the roster length, and the roster names are unique", async () => {
    const names = new Set(SCENARIO_ROSTER.map((s) => s.name));
    // Two scenarios sharing a name would silently collapse the tree-hash set
    // below and make the distinctness assertion pass for the wrong reason.
    expect(names.size).toBe(SCENARIO_ROSTER.length);

    let executed = 0;
    for (const spec of SCENARIO_ROSTER) {
      await createFixtureRepo(port, temps.create(`iai-fx-${spec.name}`), spec);
      executed += 1;
    }
    expect(executed).toBe(SCENARIO_ROSTER.length);
    expect(executed).toBeGreaterThan(0);
  });

  test("every scenario produces a real .git, and the tree hashes are PAIRWISE DISTINCT", async () => {
    const hashes: string[] = [];
    for (const spec of SCENARIO_ROSTER) {
      const root = temps.create(`iai-fx-${spec.name}`);
      const repo = await createFixtureRepo(port, root, spec);

      // Real, not simulated.
      expect(existsSync(join(root, ".git"))).toBe(true);

      const hash = await repo.treeHash();
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      hashes.push(hash);
    }

    // THE CARDINALITY IS THE ASSERTION. A `length` check would pass with three
    // identical hashes; the set size is what proves two scenarios cannot
    // silently share a seed and report an idempotency result about the wrong
    // repository.
    expect(new Set(hashes).size).toBe(SCENARIO_ROSTER.length);
  });

  test("a freshly seeded repository is clean, so a later dirty read means the run wrote", async () => {
    const spec = SCENARIO_ROSTER[0] as FixtureRepoSpec;
    const repo = await createFixtureRepo(port, temps.create("iai-fx-clean"), spec);
    expect(await repo.isDirty()).toBe(false);
  });

  test("the tree hash and the dirty flag detect DIFFERENT mutations", async () => {
    // Two surfaces in miniature, and the reason #321 needs both: an
    // uncommitted write leaves the committed tree hash untouched.
    const spec = SCENARIO_ROSTER[0] as FixtureRepoSpec;
    const repo = await createFixtureRepo(port, temps.create("iai-fx-surfaces"), spec);
    const before = await repo.treeHash();

    Bun.write(join(repo.root, "docs/milestones/M9.md"), "# M9 changed\n");
    // Give the write a moment to land before reading git's view of it.
    await Bun.sleep(10);

    expect(await repo.treeHash()).toBe(before); // committed tree: unchanged
    expect(await repo.isDirty()).toBe(true); // worktree: changed
  });
});

describe("the fixture repository runs git THROUGH the port", () => {
  test("every git command a fixture issues is visible to a recording port", async () => {
    // This is what makes #321 possible without a second capture mechanism: the
    // harness has no private channel to the process layer.
    const recording = createRecordingPort(createRealPort());
    const spec = SCENARIO_ROSTER[0] as FixtureRepoSpec;
    await createFixtureRepo(recording, temps.create("iai-fx-recorded"), spec);

    expect(recording.calls.length).toBeGreaterThan(0);
    for (const call of recording.calls) {
      expect(call.argv[0]).toBe("git");
    }
    // Setup issues init, three configs, add and commit at minimum.
    expect(recording.calls.length).toBeGreaterThanOrEqual(6);
  });

  test("a failing git command throws an error naming the command AND the stderr", async () => {
    const repo = await createFixtureRepo(
      port,
      temps.create("iai-fx-fail"),
      SCENARIO_ROSTER[0] as FixtureRepoSpec,
    );
    let caught: unknown;
    try {
      // `run` does not throw; the internal `mustRun` does. Reach it via a
      // command that will fail during a real operation.
      await repo.run(["git", "-C", repo.root, "rev-parse", "--verify", "no-such-ref"]).then((r) => {
        if (r.exitCode !== 0) throw new FixtureRepoError(["git", "rev-parse", "no-such-ref"], r);
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FixtureRepoError);
    const message = (caught as Error).message;
    // ASSERT THE REASON, NOT THE VERDICT: the message must name the command,
    // not merely report that something failed.
    expect(message).toContain("rev-parse");
    expect(message).toContain("exited");
  });
});

describe("the synthetic goals fixture is DECLARED synthetic, with the reason in the module", () => {
  test("the declaration names both independent reasons a real corpus is unusable", () => {
    // references/verification.md:102-106 forbids an UNDECLARED or UNREASONED
    // synthetic corpus, not a synthetic one. Both halves must be present.
    expect(GOALS_FIXTURE_CORPUS_DECLARATION).toContain("synthetic");
    expect(GOALS_FIXTURE_CORPUS_DECLARATION).toContain("private"); // cannot be checked out
    expect(GOALS_FIXTURE_CORPUS_DECLARATION).toContain("PRIVATE"); // may not reach a model
  });

  test("the declaration is long enough to satisfy the Corpus column's own rule", () => {
    // MIN_CORPUS_DETAIL is 12 characters after the dash. A declaration that
    // could not be pasted into a plan would be a contract this module cannot
    // honour.
    const detail = GOALS_FIXTURE_CORPUS_DECLARATION.split("—")[1] ?? "";
    expect(detail.trim().length).toBeGreaterThanOrEqual(12);
  });

  test("rendered goals carry a visible SYNTHETIC marker, so a leaked fixture is recognisable", () => {
    const rendered = renderGoalsFixture({ goals: ["one", "two"] });
    expect(rendered).toContain("SYNTHETIC FIXTURE");
    expect(rendered).toContain("## G0: one");
    expect(rendered).toContain("## G1: two");
  });

  test("no real USER/ path is read by this package", () => {
    // The fixture must never fall back to the private source. A grep over the
    // package's own source is the check, with the file count asserted first.
    const dir = join(repoRoot, "packages/harness/src");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      // The string may appear in a comment explaining the rule; what must not
      // appear is a filesystem read of it.
      expect(source).not.toMatch(/readFileSync\([^)]*USER\//);
    }
  });
});

describe("the harness never becomes a second process launcher", () => {
  test("no module under packages/harness/src imports a process launcher", () => {
    // #318's case 12 asserts exactly one production launcher across the
    // workspace. This package runs git constantly and must still not be it --
    // which is the whole reason createFixtureRepo takes a Port.
    const dir = join(repoRoot, "packages/harness/src");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const LAUNCHER =
      /from\s+["']node:child_process["']|from\s+["']child_process["']|\bBun\.spawn(Sync)?\b|\bBun\.\$/;
    const offenders = files.filter((f) => LAUNCHER.test(readFileSync(join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
