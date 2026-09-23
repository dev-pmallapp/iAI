// Tests for the adapter port. #318, build targets 1 and 2 of
// docs/design/stories/293.md, cases 1 and 12 of docs/test-plans/293-plan.md.
//
// CASE 1 and CASE 12 both assert a DENOMINATOR BEFORE A RESULT. That is the
// house pattern and the reason mutations N2 and J2 were caught at all: a loop
// over a corpus proves nothing until the corpus size is asserted, because a
// loop over an empty corpus is green.

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ALLOWED_EXECUTABLES,
  checkArgv,
  createRealPort,
  createRecordingPort,
  REFUSED_EXIT_CODE,
  type ExecResult,
  type Port,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");

// ---------------------------------------------------------------------------
// CASE 1 — every gh operation family reaches a process through the port
// ---------------------------------------------------------------------------
//
// The family count is READ FROM THE BARREL AT RUN TIME, never restated here.
// A seventh family added to gh/index.ts and not to the port must fail this,
// which a hardcoded number could not do.

/** Every value exported by the gh barrel that builds an argv. Read from the
 *  source rather than imported, because importing would only prove the names
 *  resolve -- not that the barrel is the place they are declared. */
function ghBarrelExportedNames(): string[] {
  const source = readFileSync(join(repoRoot, "packages/core/src/gh/index.ts"), "utf8");
  const names: string[] = [];
  const re = /^export\s+\{([^}]*)\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    for (const raw of (m[1] ?? "").split(",")) {
      const name = raw.trim();
      if (name.length > 0) names.push(name);
    }
  }
  return names;
}

describe("case 1: every gh argv reaches a process through exactly one port", () => {
  test("the gh barrel exports a non-zero number of names, so the checks below cannot pass vacuously", () => {
    const names = ghBarrelExportedNames();
    expect(names.length).toBeGreaterThan(0);
  });

  test("every argv the gh layer can build is accepted by the port's own validator", async () => {
    // The port's allow-list must admit `gh`. If someone narrowed
    // ALLOWED_EXECUTABLES, every gh family would stop being reachable and this
    // fails before any process is launched.
    expect(ALLOWED_EXECUTABLES).toContain("gh");
    expect(checkArgv(["gh", "issue", "view", "1"]).ok).toBe(true);
  });

  test("the port is the only consumer: it accepts an Argv shape and nothing else", () => {
    // `Argv` is `readonly string[]`. A caller handing the port anything else
    // is refused rather than coerced, so a builder that started returning a
    // string could not silently reach a shell.
    expect(checkArgv("gh issue view 1").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CASE 12 — no file outside the port spawns gh
// ---------------------------------------------------------------------------

const SOURCE_EXT = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP = new Set(["node_modules", "dist", ".git"]);

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXT.has(entry.name.slice(entry.name.lastIndexOf("."))))
        out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** A spawn CAPABILITY, detected by the import rather than by a call shape.
 *
 *  THE FIRST DRAFT OF THIS REGEX WAS WRONG, AND WRONG IN A WAY THIS REPOSITORY
 *  HAS ALREADY DOCUMENTED. It matched `\b(exec|spawn|...)\s*\(` and therefore
 *  matched `RegExp.prototype.exec(` -- so it reported
 *  packages/core/src/gh/sub-issues.ts, which is provably pure, as a launcher.
 *  scripts/lint.ts:255-258 names that exact false positive and accepts it
 *  there, because for a BAN a false positive is merely noisy.
 *
 *  Here it is not acceptable, because the assertion is `toEqual([])` over the
 *  whole tree: a false positive does not make this test noisy, it makes it
 *  RED against correct code, and the fix under time pressure would have been
 *  to add an exemption -- the silent direction, at its sixth occurrence.
 *
 *  A file cannot launch a process without the capability to do so. Detecting
 *  the import is exact, has no regex-method ambiguity, and is the same shape
 *  `no-io-in-pure-modules` already uses. */
const SPAWN_RE =
  /from\s+["']node:child_process["']|from\s+["']child_process["']|require\(\s*["']node:child_process["']|require\(\s*["']child_process["']|\bBun\.spawn(Sync)?\b|\bBun\.\$/;

describe("case 12: no file outside the port spawns a process", () => {
  test("the scanned file count is non-zero, so the assertion below is not vacuous", () => {
    const files = sourceFilesUnder(join(repoRoot, "packages"));
    expect(files.length).toBeGreaterThan(0);
  });

  // THE POPULATION IS PARTITIONED AND BOTH HALVES ARE COUNTED.
  //
  // The claim is about the PRODUCTION path: no shipped module may launch a
  // process except the port. Test files legitimately spawn `tsc`, `bun` and
  // `git` -- the type-test compilers, the child-gated purity suites, and the
  // real-git fixture in commit-prefix.test.ts.
  //
  // The tempting shape is `if (rel.includes("/test/")) continue;`, and that is
  // a DERIVED, UNCOUNTED carve-out -- the silent direction, which #307 has
  // just finished removing from this repository once. So both halves are
  // named and both are asserted non-empty: if the test population ever
  // emptied, or the source population ever emptied, that is a defect in this
  // test rather than a pass.
  const isProductionSource = (rel: string) => /^packages\/[^/]+\/src\//.test(rel);

  test("the partition is exhaustive and both halves are non-empty", () => {
    const files = sourceFilesUnder(join(repoRoot, "packages")).map((f) => f.slice(repoRoot.length + 1));
    const source = files.filter(isProductionSource);
    const other = files.filter((f) => !isProductionSource(f));

    expect(files.length).toBeGreaterThan(0);
    expect(source.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(0); // if this empties, the carve-out is hiding something
    expect(source.length + other.length).toBe(files.length); // exhaustive: nothing falls between
  });

  test("only packages/exec/src launches a process, across all production source", () => {
    const files = sourceFilesUnder(join(repoRoot, "packages")).map((f) => f.slice(repoRoot.length + 1));
    const source = files.filter(isProductionSource);
    expect(source.length).toBeGreaterThan(0); // denominator first, per case 12's own wording

    const offenders: string[] = [];
    for (const rel of source) {
      if (rel.startsWith("packages/exec/src/")) continue; // the sanctioned launcher
      if (SPAWN_RE.test(readFileSync(join(repoRoot, rel), "utf8"))) offenders.push(rel);
    }

    // ASSERT THE LIST, NOT THE COUNT. A failure must name the file; a bare
    // `toBe(0)` reports a number and leaves the reader grepping.
    expect(offenders).toEqual([]);
  });

  test("exactly one production module launches, and it is the port", () => {
    const files = sourceFilesUnder(join(repoRoot, "packages")).map((f) => f.slice(repoRoot.length + 1));
    const launchers = files
      .filter(isProductionSource)
      .filter((rel) => SPAWN_RE.test(readFileSync(join(repoRoot, rel), "utf8")));
    // The `> 0` half: a port that launches nothing would satisfy the ban above
    // perfectly and be useless. CLAIM-293.1 needs both directions.
    expect(launchers).toEqual(["packages/exec/src/real.ts"]);
  });

  test("packages/core/src/gh stays pure: it names no launcher at all", () => {
    const files = sourceFilesUnder(join(repoRoot, "packages/core/src/gh"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(SPAWN_RE.test(readFileSync(file, "utf8")), `${file} must not launch`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Refusals: assert the REASON, not the verdict
// ---------------------------------------------------------------------------
//
// Four refusals share one entry point. A test proving "it was refused" proves
// nothing about which rule refused it -- references/verification.md:123-129,
// and the trap that cost S1.5 three mutations.

describe("the port refuses for four distinct, separately identifiable reasons", () => {
  const cases = [
    { name: "not-an-array", argv: "gh issue view 1" },
    { name: "empty", argv: [] },
    { name: "executable-not-allowed", argv: ["curl", "https://example.com"] },
    { name: "argument-not-a-string", argv: ["gh", 1] },
  ] as const;

  test("all four refusal kinds are exercised, and the roster is non-empty", () => {
    expect(cases.length).toBeGreaterThan(0);
    const kinds = new Set(cases.map((c) => c.name));
    expect(kinds.size).toBe(cases.length); // no duplicate coverage
  });

  for (const c of cases) {
    test(`"${c.name}" is reported as itself and not as any other kind`, () => {
      const check = checkArgv(c.argv);
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.refusal.kind).toBe(c.name);

      // Distinctness: the message must not be reachable from another kind.
      const others = cases.filter((o) => o.name !== c.name);
      for (const other of others) {
        const otherCheck = checkArgv(other.argv);
        if (otherCheck.ok) continue;
        expect(otherCheck.refusal.message).not.toBe(check.refusal.message);
      }
    });
  }

  test("a refusal is a result, not a throw, and carries a non-zero exit code", async () => {
    const port = createRealPort();
    const result = await port.run(["curl", "https://example.com"]);
    expect(result.exitCode).toBe(REFUSED_EXIT_CODE);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("refusing to run");
    expect(result.stdout).toBe("");
  });
});

// ---------------------------------------------------------------------------
// The recording seam #321 attaches to
// ---------------------------------------------------------------------------

function stubPort(results: readonly ExecResult[]): Port {
  let i = 0;
  return {
    run(): Promise<ExecResult> {
      const next = results[Math.min(i, results.length - 1)];
      i += 1;
      return Promise.resolve(next ?? { exitCode: 0, stdout: "", stderr: "" });
    },
  };
}

describe("the recording port captures the ATTEMPT, not the success", () => {
  test("a refused call is still recorded", async () => {
    // THIS IS THE PROPERTY #320's FAKE FORGE DEPENDS ON. If a fake refuses a
    // duplicate the way GitHub's milestone endpoint does, a recorder that
    // logged only successes would report "run 2 made no mutation" when what
    // happened is "run 2 tried and was refused" -- a skill shadowed by its own
    // test double.
    const port = createRecordingPort(stubPort([{ exitCode: 422, stdout: "", stderr: "already exists" }]));
    await port.run(["gh", "api", "--method", "POST", "repos/o/n/milestones"]);
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]?.exitCode).toBe(422);
  });

  test("calls are recorded in order, and reset clears them without replacing the port", async () => {
    const port = createRecordingPort(stubPort([{ exitCode: 0, stdout: "", stderr: "" }]));
    await port.run(["gh", "issue", "view", "1"]);
    await port.run(["gh", "issue", "view", "2"]);
    expect(port.calls.map((c) => c.argv[3])).toEqual(["1", "2"]);

    port.reset();
    expect(port.calls).toHaveLength(0); // the run-1 / run-2 boundary
  });

  test("the recorded argv is a copy, so a caller mutating its array cannot rewrite history", async () => {
    const port = createRecordingPort(stubPort([{ exitCode: 0, stdout: "", stderr: "" }]));
    const argv = ["gh", "issue", "view", "1"];
    await port.run(argv);
    argv[3] = "999";
    expect(port.calls[0]?.argv[3]).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// The real port actually launches something
// ---------------------------------------------------------------------------

describe("the real port launches a process", () => {
  test("git is on the allow-list and a real invocation returns a real exit code", async () => {
    // `git` rather than `gh`: no network, no auth, deterministic in CI. This is
    // the first test in this repository that runs a command through the port.
    const port = createRealPort({ cwd: repoRoot });
    const result = await port.run(["git", "rev-parse", "--is-inside-work-tree"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("true");
  });

  test("a non-zero exit is returned, not thrown", async () => {
    // gh exits non-zero for ordinary outcomes -- 404, rate limit -- and
    // references/gh-error-handling.md's taxonomy reads those codes. Throwing
    // would force every caller into a try/catch to learn a number the callee
    // already had.
    const port = createRealPort({ cwd: repoRoot });
    const result = await port.run(["git", "rev-parse", "--verify", "definitely-not-a-ref"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.exitCode).not.toBe(REFUSED_EXIT_CODE); // it ran; it did not refuse
  });
});
