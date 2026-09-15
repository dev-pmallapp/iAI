// Tests for scripts/live-rung.ts, Task #324, build target 8 of
// docs/design/stories/293.md: the live rung, never required.
//
// HOUSE STYLE: denominators asserted non-zero before anything is measured
// against them, cardinality (a Set's size, an array's length after
// deduplication) rather than raw length where duplicates would lie, and
// every JSON.parse is followed by an assertion that the parse actually
// produced the shape expected -- mirrors test/skill-harness.test.ts's own
// spawn helper and CLI-testing conventions.
//
// OFFLINE AND DETERMINISTIC, BY CONSTRUCTION. Every `exec` below runs `git`
// against a LOCAL temp repository this file creates itself, or an
// executable this file already knows is refused before it would ever be
// launched (an executable outside ALLOWED_EXECUTABLES, or a mutating `gh`
// argv refused by the header check before the port is ever consulted). No
// test here reaches the network or a real forge.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDirs } from "../packages/harness/src/tempdir";

const repoRoot = join(import.meta.dir, "..");
const cli = join(repoRoot, "scripts", "live-rung.ts");

const temps = createTempDirs();
afterAll(() => temps.cleanup());

interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function run(args: readonly string[]): Promise<Spawned> {
  const proc = Bun.spawn(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe", cwd: repoRoot });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

interface SessionHeader {
  readonly repo: string;
  readonly fixtureRoot: string;
  readonly resolvedCommit: string;
  readonly startedAt: string;
  readonly host: string;
}

function headerPath(session: string): string {
  return join(session, "header.json");
}

function readHeader(session: string): SessionHeader {
  const raw = readFileSync(headerPath(session), "utf8");
  const parsed = JSON.parse(raw) as SessionHeader;
  // Every parse asserts it matched: a header.json that parsed but lacked
  // the fields this suite depends on would otherwise pass silently.
  expect(typeof parsed.repo).toBe("string");
  expect(typeof parsed.fixtureRoot).toBe("string");
  expect(typeof parsed.resolvedCommit).toBe("string");
  expect(typeof parsed.startedAt).toBe("string");
  expect(typeof parsed.host).toBe("string");
  return parsed;
}

/** A local git repo, never touched over the network -- created with plain
 *  `Bun.spawnSync` (not the CLI under test) so this helper cannot itself
 *  hide a defect in the CLI's own git handling. */
function makeLocalGitRepo(root: string): void {
  mkdirSync(root, { recursive: true });
  const runGit = (...args: string[]): void => {
    const proc = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${new TextDecoder().decode(proc.stderr)}`);
    }
  };
  runGit("init", "-q");
  runGit("config", "user.email", "live-rung-test@iai.invalid");
  runGit("config", "user.name", "live-rung test");
  runGit("config", "init.defaultBranch", "main");
  writeFileSync(join(root, "a.txt"), "seed\n", "utf8");
  runGit("add", "-A");
  runGit("commit", "-q", "-m", "seed");
}

// ===========================================================================
// init
// ===========================================================================

describe("live-rung init: the egress gate runs first", () => {
  test(
    "1. init refuses when the goals payload does not clear the gate (driven via the test-only " +
      "--force-private-goals-payload seam) and creates no session",
    async () => {
      const session = join(temps.create("iai-live-rung-init-refused-"), "session");
      const spawned = await run([
        "init",
        "--session",
        session,
        "--repo",
        "OWNER/REPO",
        "--host",
        "opencode",
        "--force-private-goals-payload",
      ]);

      expect(spawned.exitCode).toBe(1);
      const combined = spawned.stdout + spawned.stderr;
      expect(combined).toContain("REFUSED to start");
      expect(existsSync(session)).toBe(false);
      expect(existsSync(headerPath(session))).toBe(false);
    },
    120_000,
  );

  test(
    "2. init succeeds on the declared-synthetic fixture: writes a header containing the resolved " +
      "commit and the supplied host",
    async () => {
      const session = join(temps.create("iai-live-rung-init-ok-"), "session");
      const spawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);

      expect(spawned.exitCode).toBe(0);
      expect(existsSync(headerPath(session))).toBe(true);

      const header = readHeader(session);
      expect(header.repo).toBe("OWNER/REPO");
      expect(header.host).toBe("opencode");

      const commitProc = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "HEAD"], { stdout: "pipe" });
      const expectedCommit = new TextDecoder().decode(commitProc.stdout).trim();
      expect(expectedCommit.length).toBeGreaterThan(0);
      expect(header.resolvedCommit).toBe(expectedCommit);

      expect(existsSync(header.fixtureRoot)).toBe(true);
    },
    120_000,
  );

  test(
    "3. init also demonstrates the converse: it prints that a USER/-derived payload was refused",
    async () => {
      const session = join(temps.create("iai-live-rung-init-converse-"), "session");
      const spawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);

      expect(spawned.exitCode).toBe(0);
      expect(spawned.stdout).toContain("correctly REFUSED a USER/-derived payload");
    },
    120_000,
  );

  test("4. init errors when --host is absent, and creates no session", async () => {
    const session = join(temps.create("iai-live-rung-init-no-host-"), "session");
    const spawned = await run(["init", "--session", session, "--repo", "OWNER/REPO"]);

    expect(spawned.exitCode).toBe(1);
    expect(spawned.stdout + spawned.stderr).toContain("--host <name> is required");
    expect(existsSync(headerPath(session))).toBe(false);
  }, 120_000);
});

// ===========================================================================
// exec
// ===========================================================================

describe("live-rung exec: refusals", () => {
  test("5. exec refuses an executable outside ALLOWED_EXECUTABLES", async () => {
    const session = join(temps.create("iai-live-rung-exec-disallowed-"), "session");
    const initSpawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);
    expect(initSpawned.exitCode).toBe(0);

    const markSpawned = await run(["mark", "--session", session, "--run", "1"]);
    expect(markSpawned.exitCode).toBe(0);

    const spawned = await run(["exec", "--session", session, "--", "echo", "hello"]);
    expect(spawned.exitCode).not.toBe(0);
    expect(spawned.stdout + spawned.stderr).toContain("refusing to run");
  }, 120_000);

  test("6. exec refuses a mutating gh argv when the session header names no target repo", async () => {
    const session = temps.create("iai-live-rung-exec-no-repo-");
    // A header written directly, WITHOUT a `repo` field -- exercising this
    // refusal without touching the network requires exactly this: the
    // refusal must fire BEFORE the argv ever reaches the port.
    writeFileSync(
      headerPath(session),
      JSON.stringify({
        fixtureRoot: "/nonexistent",
        resolvedCommit: "deadbeef",
        startedAt: new Date().toISOString(),
        host: "opencode",
      }),
      "utf8",
    );
    writeFileSync(join(session, "log.jsonl"), "", "utf8");

    const markSpawned = await run(["mark", "--session", session, "--run", "1"]);
    expect(markSpawned.exitCode).toBe(0);

    const spawned = await run([
      "exec",
      "--session",
      session,
      "--",
      "gh",
      "issue",
      "create",
      "--title",
      "x",
      "--body",
      "y",
    ]);

    expect(spawned.exitCode).not.toBe(0);
    expect(spawned.stdout + spawned.stderr).toContain("names no target repo");

    // The refusal happened before any network call: the log records the
    // refused attempt, not a network outcome, so this assertion also proves
    // no call reached the port.
    const log = readFileSync(join(session, "log.jsonl"), "utf8");
    expect(log.includes("issue")).toBe(false);
  }, 120_000);

  test("7. exec refuses before any run has been marked", async () => {
    const session = join(temps.create("iai-live-rung-exec-no-mark-"), "session");
    const initSpawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);
    expect(initSpawned.exitCode).toBe(0);

    const spawned = await run(["exec", "--session", session, "--", "git", "--version"]);
    expect(spawned.exitCode).not.toBe(0);
    expect(spawned.stdout + spawned.stderr).toContain("no run has been marked");
  }, 120_000);
});

// ===========================================================================
// mark
// ===========================================================================

describe("live-rung mark: run index discipline", () => {
  test("8. mark refuses a run index that is not 1 or 2", async () => {
    const session = join(temps.create("iai-live-rung-mark-invalid-"), "session");
    const initSpawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);
    expect(initSpawned.exitCode).toBe(0);

    for (const bad of ["0", "3", "abc", "1.5"]) {
      const spawned = await run(["mark", "--session", session, "--run", bad]);
      expect(spawned.exitCode).not.toBe(0);
    }
  }, 120_000);

  test("9. mark refuses going backwards from 2 to 1", async () => {
    const session = join(temps.create("iai-live-rung-mark-backwards-"), "session");
    const initSpawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);
    expect(initSpawned.exitCode).toBe(0);

    const mark1 = await run(["mark", "--session", session, "--run", "1"]);
    expect(mark1.exitCode).toBe(0);
    const mark2 = await run(["mark", "--session", session, "--run", "2"]);
    expect(mark2.exitCode).toBe(0);
    const markBack = await run(["mark", "--session", session, "--run", "1"]);
    expect(markBack.exitCode).not.toBe(0);
    expect(markBack.stdout + markBack.stderr).toContain("backwards");
  }, 120_000);
});

// ===========================================================================
// exec + report: reads and mutations, counted right, over a LOCAL git repo.
// ===========================================================================

describe("live-rung exec + report: reads and mutations land under the right run index", () => {
  test(
    "10. run 1 has one read and one write, run 2 has two reads; report's counts agree, entirely offline",
    async () => {
      const session = join(temps.create("iai-live-rung-counts-"), "session");
      const localRepo = temps.create("iai-live-rung-local-git-");
      makeLocalGitRepo(localRepo);

      const initSpawned = await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"]);
      expect(initSpawned.exitCode).toBe(0);

      expect((await run(["mark", "--session", session, "--run", "1"])).exitCode).toBe(0);

      // Run 1: one read (status), one write (commit).
      expect((await run(["exec", "--session", session, "--", "git", "-C", localRepo, "status", "--porcelain"])).exitCode).toBe(
        0,
      );
      writeFileSync(join(localRepo, "b.txt"), "more\n", "utf8");
      expect((await run(["exec", "--session", session, "--", "git", "-C", localRepo, "add", "-A"])).exitCode).toBe(0);
      expect(
        (await run(["exec", "--session", session, "--", "git", "-C", localRepo, "commit", "-q", "-m", "run1 change"]))
          .exitCode,
      ).toBe(0);

      expect((await run(["mark", "--session", session, "--run", "2"])).exitCode).toBe(0);

      // Run 2: two reads.
      expect((await run(["exec", "--session", session, "--", "git", "-C", localRepo, "status", "--porcelain"])).exitCode).toBe(
        0,
      );
      expect((await run(["exec", "--session", session, "--", "git", "-C", localRepo, "log", "--oneline"])).exitCode).toBe(0);

      const outPath = join(temps.create("iai-live-rung-report-out-"), "report.json");
      const reportSpawned = await run(["report", "--session", session, "--out", outPath]);
      expect(reportSpawned.exitCode).toBe(0);
      expect(existsSync(outPath)).toBe(true);

      const artifact = JSON.parse(readFileSync(outPath, "utf8")) as {
        readonly runs: Readonly<
          Record<string, { readonly totalCalls: number; readonly reads: number; readonly kinds: Record<string, number> }>
        >;
        readonly overall: { readonly totalCalls: number; readonly reads: number };
      };

      // Denominator non-zero first: both runs must actually be present.
      const runKeys = Object.keys(artifact.runs);
      expect(runKeys.length).toBe(2);
      expect(new Set(runKeys)).toEqual(new Set(["1", "2"]));

      const run1 = artifact.runs["1"];
      const run2 = artifact.runs["2"];
      expect(run1).toBeDefined();
      expect(run2).toBeDefined();

      expect(run1?.totalCalls).toBe(3);
      expect(run1?.reads).toBe(1);
      expect(run1?.kinds["git-write"]).toBe(2); // `add` and `commit`

      expect(run2?.totalCalls).toBe(2);
      expect(run2?.reads).toBe(2);

      expect(artifact.overall.totalCalls).toBe(5);
      expect(artifact.overall.reads).toBe(3);
    },
    120_000,
  );
});

// ===========================================================================
// report: tokenCost and non-zero exits.
// ===========================================================================

describe("live-rung report: tokenCost is structurally null unless supplied", () => {
  async function sessionWithOneCall(): Promise<string> {
    const session = join(temps.create("iai-live-rung-report-session-"), "session");
    const localRepo = temps.create("iai-live-rung-report-local-git-");
    makeLocalGitRepo(localRepo);
    expect((await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"])).exitCode).toBe(0);
    expect((await run(["mark", "--session", session, "--run", "1"])).exitCode).toBe(0);
    expect((await run(["exec", "--session", session, "--", "git", "-C", localRepo, "status", "--porcelain"])).exitCode).toBe(
      0,
    );
    return session;
  }

  test("11. tokenCost is null without --token-cost, and the rendered summary says so in words", async () => {
    const session = await sessionWithOneCall();
    const outPath = join(temps.create("iai-live-rung-report-null-"), "report.json");
    const spawned = await run(["report", "--session", session, "--out", outPath]);
    expect(spawned.exitCode).toBe(0);
    expect(spawned.stdout).toContain("token cost: not supplied");

    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as { tokenCost: unknown };
    expect(artifact.tokenCost).toBeNull();
  }, 120_000);

  test("12. tokenCost is the supplied number with --token-cost", async () => {
    const session = await sessionWithOneCall();
    const outPath = join(temps.create("iai-live-rung-report-num-"), "report.json");
    const spawned = await run(["report", "--session", session, "--out", outPath, "--token-cost", "4242"]);
    expect(spawned.exitCode).toBe(0);
    expect(spawned.stdout).toContain("token cost: 4242");

    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as { tokenCost: unknown };
    expect(artifact.tokenCost).toBe(4242);
  }, 120_000);

  test("13. a negative --token-cost is rejected, exit non-zero, no artifact overwritten with a lie", async () => {
    const session = await sessionWithOneCall();
    const outPath = join(temps.create("iai-live-rung-report-neg-"), "report.json");
    const spawned = await run(["report", "--session", session, "--out", outPath, "--token-cost", "-1"]);
    expect(spawned.exitCode).not.toBe(0);
    expect(existsSync(outPath)).toBe(false);
  }, 120_000);

  test("14. a non-finite --token-cost (Infinity, NaN-shaped) is rejected", async () => {
    const session = await sessionWithOneCall();
    for (const bad of ["Infinity", "-Infinity", "not-a-number"]) {
      const outPath = join(temps.create("iai-live-rung-report-nonfinite-"), "report.json");
      const spawned = await run(["report", "--session", session, "--out", outPath, "--token-cost", bad]);
      expect(spawned.exitCode).not.toBe(0);
      expect(existsSync(outPath)).toBe(false);
    }
  }, 120_000);
});

describe("live-rung report: distinct non-zero-exit argvs", () => {
  test("15. a failing call is listed once, with its exit code, and a passing call is not listed", async () => {
    const session = join(temps.create("iai-live-rung-report-nonzero-"), "session");
    const localRepo = temps.create("iai-live-rung-report-nonzero-git-");
    makeLocalGitRepo(localRepo);

    expect((await run(["init", "--session", session, "--repo", "OWNER/REPO", "--host", "opencode"])).exitCode).toBe(0);
    expect((await run(["mark", "--session", session, "--run", "1"])).exitCode).toBe(0);

    const passing = await run(["exec", "--session", session, "--", "git", "-C", localRepo, "status", "--porcelain"]);
    expect(passing.exitCode).toBe(0);

    const failingArgs = ["exec", "--session", session, "--", "git", "-C", localRepo, "show", "does-not-exist-xyz"];
    const failing1 = await run(failingArgs);
    expect(failing1.exitCode).not.toBe(0);
    // Run the SAME failing argv twice, to prove the report lists it once
    // (DISTINCT argv), not once per attempt.
    const failing2 = await run(failingArgs);
    expect(failing2.exitCode).toBe(failing1.exitCode);

    const outPath = join(temps.create("iai-live-rung-report-nonzero-out-"), "report.json");
    const spawned = await run(["report", "--session", session, "--out", outPath]);
    expect(spawned.exitCode).toBe(0);

    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as {
      readonly nonZeroExits: readonly { readonly argv: readonly string[]; readonly exitCode: number }[];
    };

    expect(artifact.nonZeroExits.length).toBe(1);
    const entry = artifact.nonZeroExits[0];
    expect(entry).toBeDefined();
    expect(entry?.exitCode).toBe(failing1.exitCode);
    expect(entry?.argv).toEqual(["git", "-C", localRepo, "show", "does-not-exist-xyz"]);

    // The passing call's argv must not appear among the non-zero exits.
    const passingArgvJson = JSON.stringify(["git", "-C", localRepo, "status", "--porcelain"]);
    const anyMatchesPassing = artifact.nonZeroExits.some((e) => JSON.stringify(e.argv) === passingArgvJson);
    expect(anyMatchesPassing).toBe(false);
  }, 120_000);
});

// ===========================================================================
// The test-only --force-private-goals-payload seam: an argued safety
// property made MECHANICAL. Blanks the body of every line and block comment,
// preserving line count and offsets, so a comment that merely NAMES the flag
// in prose cannot be mistaken for a second use site -- mirrors `maskComments`
// at scripts/lint.ts:36 and packages/core/test/binding-types.test.ts's own
// copy of it, both citing the same prose-versus-code trap
// (docs/evidence/21-20260902T100227Z.md: an unanchored `grep` over real code
// returned false hits a masked scan does not).
// ===========================================================================

function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

describe("live-rung's test-only --force-private-goals-payload flag: the safety argument made mechanical", () => {
  // -------------------------------------------------------------------------
  // A. The flag can only tighten, never admit.
  // -------------------------------------------------------------------------

  test(
    "16A-behavioural. running init with the flag exits non-zero, names PRIVATE, and creates no " +
      "session directory content -- the gate runs before anything touches the filesystem",
    async () => {
      const session = join(temps.create("iai-live-rung-force-private-"), "session");
      const spawned = await run([
        "init",
        "--session",
        session,
        "--repo",
        "OWNER/REPO",
        "--host",
        "opencode",
        "--force-private-goals-payload",
      ]);

      expect(spawned.exitCode).not.toBe(0);
      const combined = spawned.stdout + spawned.stderr;
      expect(combined).toContain("PRIVATE");
      expect(combined).toContain("REFUSED to start");

      // No session directory content was created at all -- not the parent
      // temp dir (which existed already), the session dir itself, nor
      // header.json: the gate is the FIRST thing this command does.
      expect(existsSync(session)).toBe(false);
      expect(existsSync(headerPath(session))).toBe(false);
    },
    120_000,
  );

  test("16A-structural. the flag literal occurs exactly once in the file, and that one line also references userDerivedPayload", () => {
    const source = readFileSync(cli, "utf8");
    // Denominator first: a failed or empty read must not let the assertions
    // below pass vacuously.
    expect(source.length).toBeGreaterThan(0);

    const masked = maskComments(source);
    const flagLiteral = "--force-private-goals-payload";

    const occurrenceCount = masked.split(flagLiteral).length - 1;
    expect(occurrenceCount).toBe(1);

    const carryingLines = masked.split("\n").filter((line) => line.includes(flagLiteral));
    expect(carryingLines.length).toBe(1);
    expect(carryingLines[0]).toContain("userDerivedPayload");

    // If this flag ever gains a second use site, or stops selecting the
    // PRIVATE payload, it stops being a flag that can only refuse -- and the
    // argument that makes it safe collapses. This test is what makes that
    // collapse loud rather than silent.
  });

  // -------------------------------------------------------------------------
  // B. The recognised flag surface is a closed, enumerated set.
  // -------------------------------------------------------------------------

  // One line per flag: its purpose, and whether it is operator-facing or
  // test-only. This is a PARTITION, not a ban -- a new flag added to the
  // live rung fails the test below and must be classified deliberately here,
  // one way or the other. A carve-out (a denylist of "flags we know about")
  // cannot detect an unclassified new member; a partition must. This matters
  // more here than anywhere else in the repository: this is the one command
  // that talks to a real forge.
  const EXPECTED_FLAG_SURFACE: ReadonlySet<string> = new Set([
    "--session", // operator-facing: the session directory every subcommand (init/mark/exec/report) operates on
    "--repo", // operator-facing: the OWNER/NAME target repo, required by `init`, read by `exec`'s mutation guard
    "--host", // operator-facing: names the agent host driving the model, required by `init`, never guessed
    "--run", // operator-facing: the 1|2 run index passed to `mark`
    "--out", // operator-facing: optional report output path, passed to `report`
    "--token-cost", // operator-facing: optional measured token cost recorded into the report artifact
    "--help", // operator-facing: prints usage and exits 0 (also aliased -h, not itself a `--`-shaped flag)
    "--force-private-goals-payload", // TEST-ONLY: substitutes the PRIVATE USER/-derived payload for the synthetic goals fixture at the first egress gate, so the refusal path is exercisable without this script inventing a second, untested code path
  ]);

  test("16B. the recognised --flag surface is exactly this enumerated, closed set", () => {
    const source = readFileSync(cli, "utf8");
    expect(source.length).toBeGreaterThan(0);

    const masked = maskComments(source);
    const matches = masked.match(/--[a-zA-Z][a-zA-Z-]*/g) ?? [];
    // Denominator non-zero first: a masking bug that ate the whole file must
    // not let an empty-set comparison pass by accident.
    expect(matches.length).toBeGreaterThan(0);

    const actualFlagSurface = new Set(matches);
    expect(actualFlagSurface).toEqual(EXPECTED_FLAG_SURFACE);
  });

  // -------------------------------------------------------------------------
  // C. The goals payload cannot be pointed anywhere else.
  // -------------------------------------------------------------------------

  test("16C. renderGoalsFixture is called exactly once, and no enumerated flag accepts a goals path or directory", () => {
    const source = readFileSync(cli, "utf8");
    expect(source.length).toBeGreaterThan(0);
    const masked = maskComments(source);

    const renderCalls = masked.match(/\brenderGoalsFixture\(/g) ?? [];
    expect(renderCalls.length).toBe(1);

    // None of the flags enumerated in B is named for a goals path/directory/
    // file, and is therefore not a redirection seam.
    for (const flag of EXPECTED_FLAG_SURFACE) {
      expect(flag).not.toMatch(/goals?-?(path|dir|file|source)/i);
    }
    // The one flag that even mentions "goals" in its name
    // (--force-private-goals-payload) is a boolean presence check
    // (`argv.includes`, tested in 16A-structural above), never
    // `extractFlag`'d for a value -- so it cannot carry a path either.
    expect(masked).not.toMatch(/extractFlag\([^)]*"--force-private-goals-payload"/);

    // HONEST REASONING, stated here so no later reader assumes the egress
    // gate covers this: the egress gate is NOT what stops this command
    // running against the real goals source. A real goals document would
    // very likely classify INTERNAL (same `work_state` key,
    // packages/core/src/classify/recognisers.ts) and clear the gate exactly
    // as the synthetic fixture does -- the gate has never seen the
    // difference between a real and a synthetic goals document, only
    // between an INTERNAL-keyed payload and a PRIVATE one. What actually
    // stops it is narrower and duller: the payload is built from
    // `renderGoalsFixture` with no flag, argument or code path that can
    // redirect it to read a real file. These are two different protections
    // guarding two different things, and conflating them would leave a hole
    // nobody is watching.
  });
});
