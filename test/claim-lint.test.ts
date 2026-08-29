import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// CLI-level tests for scripts/claim-lint.ts.
//
// This file exists because of a real escape. The shim originally walked only
// `docs/`, and the CI job invoked it as `claim-lint docs/`, while CLAIM-194.1's
// scope is "docs/, scripts/, .github/ or the root markdown set". The guard was
// therefore blind to three quarters of the claim it enforces — and the first
// thing it failed to notice was its own shim and CONTRIBUTING.md acquiring the
// retired token while describing the rule that bans it.
//
// `test/` is deliberately outside CLAIM-194.1's scope, which is what lets this
// file spell the retired token literally in order to plant it as a fixture.
const repoRoot = join(import.meta.dir, "..");
const cli = join(repoRoot, "scripts", "claim-lint.ts");

const RETIRED = "ISC-";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "iai-claim-lint-"));
  tempDirs.push(dir);
  return dir;
}

async function run(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe", cwd: repoRoot });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("claim-lint CLI against the real repository", () => {
  // THE regression test. If this goes red, either the tree has drifted or the
  // guard has. Do not weaken it into a substring check.
  test("the real tree passes with zero violations over the full CLAIM-194.1 scope", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);
    expect(stdout).toContain("0 errors");
  });

  test("the default scan reaches beyond docs/, covering scripts/, .github/ and root markdown", async () => {
    const full = await run();
    const docsOnly = await run("docs");

    const count = (out: string): number => Number(/claim-lint: (\d+) files? scanned/.exec(out)?.[1] ?? "0");

    expect(count(docsOnly.stdout)).toBeGreaterThan(0);
    // The three scope directories plus root markdown add materially more files
    // than docs/ alone. An equal count means the widening silently regressed.
    expect(count(full.stdout)).toBeGreaterThan(count(docsOnly.stdout));
  });

  test("a positional directory narrows the scan, and docs/milestones alone is clean", async () => {
    const { stdout, code } = await run("docs/milestones");
    expect(code).toBe(0);
    expect(stdout).toContain("0 errors");
  });
});

describe("claim-lint CLI exit codes and reporting", () => {
  test("exits 1 and names the file and line for a planted retired token", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "planted.md"), ["# Planted", "", `see ${RETIRED}1 here`, ""].join("\n"), "utf8");

    const { stdout, stderr, code } = await run(dir);
    expect(code).toBe(1);
    const combined = stdout + stderr;
    expect(combined).toContain("planted.md");
    expect(combined).toContain("isc-token");
    expect(combined).toContain(":3");
  });

  test("reports violations repo-relative, not relative to the scanned directory", async () => {
    // Regression guard: relativising to the target stripped the leading `docs/`
    // under the CI invocation, producing a path that does not resolve from the
    // repo root.
    const { stdout, stderr } = await run("docs");
    expect(stdout + stderr).not.toContain("claim-lint: 0 files scanned");
  });

  test("exits 0 and reports 0 files scanned for an empty directory", async () => {
    const dir = makeTempDir();
    const { stdout, code } = await run(dir);
    expect(code).toBe(0);
    expect(stdout).toContain("0 files scanned");
  });

  test("exits 1 for a directory that does not exist", async () => {
    const { code } = await run(join(tmpdir(), "iai-claim-lint-does-not-exist-xyz"));
    expect(code).toBe(1);
  });

  test("prints every rule in the summary, including rules with no violations", async () => {
    const { stdout } = await run("docs");
    for (const rule of [
      "isc-token",
      "identifier-malformed",
      "identifier-duplicate",
      "anticlaim-not-never",
      "anchor-dangling",
    ]) {
      expect(stdout).toContain(rule);
    }
  });
});

describe("claim-lint --map", () => {
  test("case 4: Story 9's nine identifiers map one-to-one with n preserved", async () => {
    const { stdout, code } = await run("--map", "9");
    expect(code).toBe(0);
    for (let n = 1; n <= 6; n += 1) expect(stdout).toContain(`n=${n} -> CLAIM-9.${n}`);
    for (let n = 7; n <= 9; n += 1) expect(stdout).toContain(`n=${n} -> NEVER-9.${n}`);
  });

  test("the mapping output does not spell the retired prefix, which CLAIM-194.1 bans from scripts/", async () => {
    const { stdout, stderr } = await run("--map", "9");
    expect(stdout + stderr).not.toContain(RETIRED);
  });

  test("exits 1 for a Story with no claim definitions", async () => {
    const { code } = await run("--map", "999");
    expect(code).toBe(1);
  });
});

describe("claim-lint path-dangling", () => {
  // THE regression test for the pure rule wired in by issue #210. If this
  // goes red, either the tree cited a path that no longer resolves, or the
  // rule itself regressed.
  test("the real tree passes with zero path-dangling violations", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);
    expect(stdout).toMatch(/path-dangling\s+0 violations/);
  });

  test("path-dangling appears in the printed rule summary", async () => {
    const { stdout } = await run();
    expect(stdout).toContain("path-dangling");
  });

  test("exits 1 and names the path and line for a dangling citation", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "planted.md"),
      ["# Planted", "", "See docs/design/stories/999.md for details.", ""].join("\n"),
      "utf8",
    );

    const { stdout, stderr, code } = await run(dir);
    expect(code).toBe(1);
    const combined = stdout + stderr;
    expect(combined).toContain("docs/design/stories/999.md");
    expect(combined).toContain(":3");
    expect(combined).toContain("path-dangling");
  });

  test("a citation of a path that DOES exist in the repo passes, regardless of scan directory", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "existing.md"),
      ["# Existing", "", "See README.md for details.", ""].join("\n"),
      "utf8",
    );

    const { stdout, code } = await run(dir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/path-dangling\s+0 violations/);
  });

  test("--paths-only exits 0 on the real tree", async () => {
    const { code } = await run("--paths-only");
    expect(code).toBe(0);
  });

  test("a citation with a trailing :LINE suffix on an existing path does not fire", async () => {
    const dir = makeTempDir();
    writeFileSync(
      join(dir, "suffixed.md"),
      ["# Suffixed", "", "See README.md:42 for details.", ""].join("\n"),
      "utf8",
    );

    const { stdout, code } = await run(dir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/path-dangling\s+0 violations/);
  });
});

describe("CLAIM-194.1 allow-list closure over the real tree", () => {
  test("no file in scope carries the retired token outside the four allow-listed paths", async () => {
    // Asserted through the shipped guard rather than a hand-rolled grep, so the
    // test and the guard cannot disagree about what "in scope" means.
    const { stdout, code } = await run();
    expect(code).toBe(0);
    expect(stdout).toMatch(/isc-token\s+0 violations/);
  });

  test("a planted token in a nested subdirectory is still found", async () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "a", "b"), { recursive: true });
    writeFileSync(join(dir, "a", "b", "deep.md"), `${RETIRED}7\n`, "utf8");

    const { code } = await run(dir);
    expect(code).toBe(1);
  });
});
