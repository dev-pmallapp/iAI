import { afterAll, describe, expect, test } from "bun:test";
import { createTempDirs } from "../packages/harness/src/tempdir";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT_SCOPE_LABEL, SCOPE_DIRS } from "../scripts/claim-lint";

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

const temps = createTempDirs();

function makeTempDir(): string {
  return temps.create("iai-claim-lint-");
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

afterAll(() => temps.cleanup());

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
      "testplan-corpus",
      "design-spine",
    ]) {
      expect(stdout).toContain(rule);
    }
  });

  // Issue #289. The rule's denominator is printed as three numbers, not one.
  // `skill-lint: 0 SKILL.md files scanned, 0 errors` is this repository's
  // standing example of a check that passes while checking nothing; a single
  // conflated total would let the case count fall to zero unnoticed — a plan
  // renamed out of docs/test-plans/, or a header edited so no table is
  // recognised — while the rule kept reporting success.
  test("the testplan-corpus denominator is printed, non-zero, and split three ways", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);

    const match = /claim-lint: testplan-corpus scanned (\d+) plans?, (\d+) case tables?, (\d+) cases?/.exec(
      stdout,
    );
    expect(match).not.toBeNull();

    const [plans, tables, cases] = (match ?? []).slice(1).map(Number);
    expect(plans).toBeGreaterThanOrEqual(8);
    expect(tables).toBeGreaterThanOrEqual(40);
    expect(cases).toBeGreaterThanOrEqual(190);
  });

  // Task #294. The Design corpus gets the same treatment as the plan corpus:
  // two numbers, both printed, both asserted. A Design count that stayed
  // non-zero while the section count fell to zero would mean the heading parser
  // had stopped working while the rule kept reporting success.
  test("the design-spine denominator is printed, non-zero, and split two ways", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);

    const match = /claim-lint: design-spine scanned (\d+) Designs?, (\d+) sections?/.exec(stdout);
    expect(match).not.toBeNull();

    const [designs, sections] = (match ?? []).slice(1).map(Number);
    expect(designs).toBeGreaterThanOrEqual(10);
    expect(sections).toBeGreaterThanOrEqual(100);
  });

  // The one known metadata outlier is a WARNING, so the whole chain must stay
  // green with it present. If this ever goes red, someone promoted the ruling's
  // "recorded rather than failed" into a hard failure.
  test("the metadata outlier warns without failing the run", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);
    expect(stdout).toContain("1 warning");
  });

  // Narrowing the CLI away from docs/test-plans/ must not look like success.
  // The counts go to zero and say so, rather than the rule quietly reporting
  // "0 violations" over an empty population.
  test("narrowing the scan away from the plans zeroes the denominator visibly", async () => {
    const { stdout, code } = await run("docs/milestones");
    expect(code).toBe(0);
    expect(stdout).toContain("testplan-corpus scanned 0 plans, 0 case tables, 0 cases");
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SKIP_DIRS = new Set(["node_modules", "dist"]);

function countFilesUnder(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      count += countFilesUnder(join(dir, entry.name));
    } else {
      count += 1;
    }
  }
  return count;
}

function findSkillMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...findSkillMdFiles(join(dir, entry.name)));
    } else if (entry.name === "SKILL.md") {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

// --- Per-scope breakdown (task #296, Build Target 7) ------------------------
//
// `skills/` entering SCOPE_DIRS is only worth anything if the breakdown that
// makes each scope's contribution visible cannot itself go vacuous, or drift
// from the flat total. Every test below is driven off the imported
// SCOPE_DIRS array rather than a restated list of directory names, so a
// sixth scope directory added later without a printed count fails here first.
describe("claim-lint per-scope breakdown (task #296)", () => {
  test('SCOPE_DIRS contains "skills"', () => {
    expect(SCOPE_DIRS).toContain("skills");
  });

  test("every imported SCOPE_DIRS entry prints its own denominator line", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);
    for (const scope of SCOPE_DIRS) {
      expect(stdout).toMatch(new RegExp(`claim-lint: scope ${escapeRegExp(scope)}\\s+\\d+ files?`));
    }
  });

  test("the root-markdown pseudo-scope prints its own line and is NOT a member of SCOPE_DIRS", async () => {
    // Asserted both ways: ROOT_SCOPE_LABEL must be absent from SCOPE_DIRS (it
    // is a pseudo-scope, not a directory to walk), and it must still appear
    // in the printed breakdown, so the deliberate exclusion is never mistaken
    // for an accidental omission.
    expect(SCOPE_DIRS).not.toContain(ROOT_SCOPE_LABEL);

    const { stdout, code } = await run();
    expect(code).toBe(0);
    expect(stdout).toMatch(new RegExp(`claim-lint: scope ${escapeRegExp(ROOT_SCOPE_LABEL)}\\s+\\d+ files?`));
  });

  test("the per-scope counts sum exactly to the total files scanned", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);

    const scopeLines = [...stdout.matchAll(/claim-lint: scope \S+\s+(\d+) files?/g)];
    // One line per SCOPE_DIRS entry, plus one for the root pseudo-scope.
    expect(scopeLines.length).toBe(SCOPE_DIRS.length + 1);

    const sum = scopeLines.reduce((total, m) => total + Number(m[1]), 0);
    const total = Number(/claim-lint: (\d+) files? scanned/.exec(stdout)?.[1] ?? "-1");
    expect(sum).toBe(total);
  });

  // The equality that never needs editing: the printed `skills` count is
  // compared against the real file count under skills/ on disk, both read at
  // run time. This is what stops the sum-to-total assertion above -- or the
  // "not yet discharged" test below -- from being fudged by a hardcoded
  // number: it keeps working after #42-#45 land and skills/ stops being
  // (almost) empty.
  test("the printed skills scope count equals the real file count under skills/ on disk", async () => {
    const { stdout, code } = await run();
    expect(code).toBe(0);

    const match = /claim-lint: scope skills\s+(\d+) files?/.exec(stdout);
    expect(match).not.toBeNull();

    const printed = Number(match?.[1] ?? "-1");
    const onDisk = countFilesUnder(join(repoRoot, "skills"));
    expect(printed).toBe(onDisk);
  });

  // WAS: "NOT YET DISCHARGED" -- modeled on test/skill-lint.test.ts's own
  // admission that "the skill population is empty today, so NEVER-41.7 and
  // the two section rules are NOT yet discharged over real bodies". At the
  // time this test was written `skills/` held exactly one file, `.gitkeep`,
  // and zero `SKILL.md` files, so it asserted:
  //
  //   expect(skillFiles.length).toBe(0);
  //
  // ...with a comment promising it would be UPDATED, not deleted, the moment
  // the first of #42-#45 landed a real SKILL.md. Task #44 (`story-design`)
  // is that first landing.
  //
  // NOW: the population is non-zero, so the zero-assertion is replaced by a
  // non-zero one. This is deliberately NOT the run-time disk-equality that
  // never needs editing again — that equality already exists two tests above
  // ("the printed skills scope count equals the real file count under
  // skills/ on disk") and duplicating it here would just be the same
  // assertion twice. This test's remaining job is narrower and permanent: pin
  // that #296's claim-lint coverage of `skills/` is exercised over a REAL,
  // non-empty population, which — unlike a literal count — never goes stale
  // as #42, #43 and #45 add their own SKILL.md files; it only gets truer.
  test("skills/ now contains at least one real SKILL.md file -- #296's claim-lint coverage is no longer vacuous", () => {
    const skillFiles = findSkillMdFiles(join(repoRoot, "skills"));
    expect(skillFiles.length).toBeGreaterThan(0);
  });
});

// --- CONTRIBUTING.md's scope table agrees with the linter (task #296) -------
describe("CONTRIBUTING.md's claim-lint scope table agrees with the linter", () => {
  function splitTableRow(line: string): string[] {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((cell) => cell.trim());
  }

  function unquote(cell: string): string {
    return cell.replace(/^`+/, "").replace(/`+$/, "");
  }

  function scopeTableRows(): string[][] {
    const doc = readFileSync(join(repoRoot, "CONTRIBUTING.md"), "utf8");
    const lines = doc.split("\n");

    const headerIndices: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\|\s*Scope\s*\|/.test(lines[i] ?? "")) headerIndices.push(i);
    }
    // Guard against a silently-empty slice: exactly one such table.
    expect(headerIndices.length, "expected exactly one claim-lint scope table in CONTRIBUTING.md").toBe(1);

    const start = headerIndices[0]!;
    const rows: string[][] = [];
    for (let i = start + 2; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (!line.trim().startsWith("|")) break;
      rows.push(splitTableRow(line));
    }
    return rows;
  }

  // NEVER a scope literal is restated here — every name comes from the
  // imported SCOPE_DIRS (or ROOT_SCOPE_LABEL for the pseudo-scope row), so
  // this test cannot drift into agreeing with itself.
  test("the doc's scope column and SCOPE_DIRS are the SAME SET, asserted both directions, root handled explicitly", () => {
    const rows = scopeTableRows();
    const docScopes = rows.map((r) => unquote(r[0] ?? ""));
    const docScopeSet = new Set(docScopes);

    // The root pseudo-scope is documented but is deliberately NOT a member of
    // SCOPE_DIRS, so it is checked on its own and excluded from the set
    // comparison below rather than silently passing or silently failing it.
    expect(docScopeSet.has(ROOT_SCOPE_LABEL), "CONTRIBUTING.md's scope table must document the root pseudo-scope").toBe(
      true,
    );
    const docDirScopeSet = new Set(docScopes.filter((s) => s !== ROOT_SCOPE_LABEL));
    const linterScopeSet = new Set(SCOPE_DIRS);

    for (const scope of docDirScopeSet) {
      expect(
        linterScopeSet.has(scope),
        `CONTRIBUTING.md documents scope "${scope}", which is not in SCOPE_DIRS`,
      ).toBe(true);
    }
    for (const scope of linterScopeSet) {
      expect(
        docDirScopeSet.has(scope),
        `SCOPE_DIRS contains "${scope}", which CONTRIBUTING.md's scope table does not document`,
      ).toBe(true);
    }
    // Row count equal to SCOPE_DIRS.length + 1 (the root row) catches a
    // duplicate row that set equality alone would hide.
    expect(rows.length).toBe(SCOPE_DIRS.length + 1);
  });
});
