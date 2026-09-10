// Tests for scripts/skill-harness.ts, the anti-vacuity harness CLI. Step C
// of #322. Mirrors test/skill-lint.test.ts's spawn helper exactly -- capture
// stdout, stderr and `proc.exited`, and assert the EXIT CODE first.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTempDirs } from "../packages/harness/src/tempdir";

const repoRoot = join(import.meta.dir, "..");

const temps = createTempDirs();
afterAll(() => temps.cleanup());

interface Spawned {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function spawnHarness(args: readonly string[]): Promise<Spawned> {
  const proc = Bun.spawn(["bun", join(repoRoot, "scripts", "skill-harness.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

interface HarnessArtifact {
  readonly schemaVersion: number;
  readonly verdict: "pass" | "fail";
  readonly exitCode: 0 | 1;
  readonly failures: readonly unknown[];
  readonly denominators: {
    readonly skillsOnDisk: readonly string[];
    readonly rosterLength: number;
    readonly scenariosExecuted: number;
    readonly scenariosPerSkill: Readonly<Record<string, number>>;
    readonly reEntryRows: Readonly<Record<string, number>>;
    readonly seedTreeHashes: readonly string[];
  };
  readonly notVerified: readonly string[];
}

describe("skill-harness CLI over the real roster", () => {
  test("1. exits 0, and the artifact is a passing verdict with zero failures", async () => {
    const outPath = join(temps.create("iai-skill-harness-out-"), "report.json");
    const spawned = await spawnHarness(["--out", outPath]);

    // THE EXIT CODE FIRST.
    expect(spawned.exitCode).toBe(0);

    expect(existsSync(outPath)).toBe(true);
    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as HarnessArtifact;
    expect(artifact.verdict).toBe("pass");
    expect(artifact.exitCode).toBe(0);
    expect(artifact.failures).toEqual([]);
  });

  test("2. the artifact's exitCode and the observed process exitCode agree", async () => {
    // A verdict that disagreed with its own artifact is the defect this
    // pins -- #323's CI job may read this file rather than the process's
    // own exit code, so the two must never diverge.
    const outPath = join(temps.create("iai-skill-harness-out-"), "report.json");
    const spawned = await spawnHarness(["--out", outPath]);
    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as HarnessArtifact;
    expect(artifact.exitCode).toBe(spawned.exitCode);
  });

  test("3. every denominator in the artifact is non-zero, and any zero-valued one is named", async () => {
    const outPath = join(temps.create("iai-skill-harness-out-"), "report.json");
    await spawnHarness(["--out", outPath]);
    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as HarnessArtifact;
    const d = artifact.denominators;

    const zero: string[] = [];
    if (d.skillsOnDisk.length === 0) zero.push("skillsOnDisk");
    if (d.rosterLength === 0) zero.push("rosterLength");
    if (d.scenariosExecuted === 0) zero.push("scenariosExecuted");
    for (const [skill, count] of Object.entries(d.scenariosPerSkill)) {
      if (count < 1) zero.push(`scenariosPerSkill.${skill}`);
    }
    for (const [skill, rows] of Object.entries(d.reEntryRows)) {
      if (rows <= 0) zero.push(`reEntryRows.${skill}`);
    }
    if (new Set(d.seedTreeHashes).size !== d.scenariosExecuted) zero.push("seedTreeHashes (cardinality mismatch)");

    // ASSERT THE LIST, NOT THE COUNT. A failure must name the denominator.
    expect(zero).toEqual([]);
  });

  test("4. notVerified is present, non-empty, and mentions CLAIM-41.8", async () => {
    // A FUTURE READER WILL WANT TO DELETE THIS ASSERTION AS NOISE. Do not:
    // this is the published measurement of the transcription gap
    // (runner.ts's own NOT_VERIFIED block) -- a harness whose green silently
    // stopped saying what it does not verify would be exactly the failure
    // mode NEVER-293.5 exists to publish against.
    const outPath = join(temps.create("iai-skill-harness-out-"), "report.json");
    await spawnHarness(["--out", outPath]);
    const artifact = JSON.parse(readFileSync(outPath, "utf8")) as HarnessArtifact;
    expect(artifact.notVerified.length).toBeGreaterThan(0);
    expect(artifact.notVerified.some((s) => s.includes("CLAIM-41.8"))).toBe(true);
  });
});

describe("skill-harness CLI error paths, each with its own distinct message", () => {
  test("5. an empty skills directory exits 1 with the skills-denominator phrase, not the roster phrase", async () => {
    const dir = temps.create("iai-skill-harness-empty-skills-");
    const outPath = join(temps.create("iai-skill-harness-out-"), "report.json");
    const spawned = await spawnHarness(["--skills-dir", dir, "--out", outPath]);

    expect(spawned.exitCode).toBe(1);
    const combined = spawned.stdout + spawned.stderr;
    expect(combined).toContain("no-skills-on-disk");
    expect(combined).not.toContain("empty-roster: the scenario roster passed to runHarness has zero entries");
  });

  test("6. a nonexistent --skills-dir exits 1 with its own distinct message", async () => {
    const missing = join(tmpdir(), "iai-skill-harness-does-not-exist-xyz");
    const spawned = await spawnHarness(["--skills-dir", missing]);

    expect(spawned.exitCode).toBe(1);
    const combined = spawned.stdout + spawned.stderr;
    expect(combined).toContain("skill-harness: skills directory does not exist");
    // Distinct from the empty-directory message (case 5): a directory that
    // does not exist is not the same defect as one that exists and is empty.
    expect(combined).not.toContain("no-skills-on-disk");
  });
});

// ===========================================================================
// Case 21, the static half.
// ===========================================================================
//
// Copied from packages/exec/test/port.test.ts:110-111, the house detector
// for a spawn CAPABILITY rather than a call shape (that file's own comment
// explains why: a call-shape regex matched `RegExp.prototype.exec(` and
// reported a provably pure file as a launcher).
const SPAWN_RE =
  /from\s+["']node:child_process["']|from\s+["']child_process["']|require\(\s*["']node:child_process["']|require\(\s*["']child_process["']|\bBun\.spawn(Sync)?\b|\bBun\.\$/;

// A verdict decided by scanning a spawned process's own stdout/stderr text
// (rather than the typed `RecordedCall`/`Denominators` shapes `decideVerdict`
// takes) is exactly the laundering this CLI's own header refuses. Neither of
// the two files that decide or emit the verdict may construct a `Response`
// over a child's stdout or stderr.
const STDOUT_RESPONSE_RE = /new Response\(\s*\w+\.(stdout|stderr)/;

describe("case 21: neither the wrapper nor the runner spawns a process or reads a child's raw stdout", () => {
  const scannedFiles = [
    join(repoRoot, "scripts", "skill-harness.ts"),
    join(repoRoot, "packages", "harness", "src", "runner.ts"),
  ];

  test("the scanned file count is non-zero, so the assertions below are not vacuous", () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
    for (const file of scannedFiles) expect(existsSync(file)).toBe(true);
  });

  // packages/exec/test/port.test.ts's own population is `packages/*/src/`
  // (its `isProductionSource` predicate), which does not reach `scripts/` at
  // all. This closes that gap for exactly the two files that decide this
  // harness's verdict.
  test("neither file matches the spawn-capability regex", () => {
    const offenders = scannedFiles.filter((file) => SPAWN_RE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  test("neither file constructs a Response over a child's raw stdout or stderr", () => {
    const offenders = scannedFiles.filter((file) => STDOUT_RESPONSE_RE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
