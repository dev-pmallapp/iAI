// #320, build target 4 of docs/design/stories/293.md.
// Cases 8, 9 and 20 of docs/test-plans/293-plan.md.
//
// CASE 9 IS PARTIAL AT THIS COMMIT AND CLAIM-293.6 IS NOT MET. Case 9's
// "Passes when" is two independent conjuncts and its Command column names
// `bun run skill-harness --inject`, a script that does not exist in any
// package.json in this tree. Half (i) -- all five modes injectable, each
// distinct -- is this task's, and is met below. Half (ii) -- "the truncated
// list mode makes at least one SKILL's run 2 issue a duplicate create" --
// needs a transcribed skill body and a runner, which are build targets 5, 6
// and 7 (#321, #322, #323). Recording case 9 as PASS here would be the G2
// mechanism (docs/design/stories/293.md:504-511) one layer down: a green read
// off a rung that never ran the thing the claim is about.
//
// Corpus: `synthetic` throughout for the forge -- a real forge cannot be made
// to rate-limit on demand, which is case 9's own stated reason. `real` for the
// git in case 8's fourth identity key: that is a real repository with real
// commits.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { classifyRateLimit, shouldRetryResponse } from "iai-core";
import { createRealPort, createRecordingPort, REFUSED_EXIT_CODE } from "iai-exec";
import {
  createFakeForge,
  createFixtureRepo,
  createTempDirs,
  FAILURE_MODES,
  FAKE_UNMODELLED_EXIT_CODE,
  isMutatingGhArgv,
  RATE_LIMIT_HEADERS_LOWER_CASE,
  RATE_LIMIT_HEADERS_MIXED_CASE,
  type FailureMode,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");
const skillsDir = join(repoRoot, "skills");
const temps = createTempDirs();
afterAll(() => temps.cleanup());

/** Pinned, and asserted equal to what is on disk. Both halves are needed:
 *  reading the directory alone would score 0 of 0 as "all of them". */
const PINNED_SKILL_COUNT = 4;

function skillBodies(): { readonly name: string; readonly text: string }[] {
  return readdirSync(skillsDir)
    .filter((name) => statSync(join(skillsDir, name)).isDirectory())
    .map((name) => ({ name, text: readFileSync(join(skillsDir, name, "SKILL.md"), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ===========================================================================
// The denominators, read off disk
// ===========================================================================

describe("the skill corpus is read off disk and pinned", () => {
  test("the skill count is non-zero and equals the pinned count", () => {
    const bodies = skillBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.length).toBe(PINNED_SKILL_COUNT);
  });
});

// The phrase every one of the four opens the hazard sentence with. Detecting
// the SENTENCE and not the word "rate" is the same posture
// packages/core/src/gh/errors.ts:194-196 takes about the secondary-limit
// phrase: "a whole documented phrase, not a heuristic on the word 'rate'".
const HAZARD_RE = /A rate-limited \*?read\*?/;

describe("4 of 4 skill bodies name the rate-limited-read-as-absence hazard", () => {
  test("the count is read off disk, is non-zero, and is 4 of 4", () => {
    const bodies = skillBodies();
    expect(bodies.length).toBeGreaterThan(0);

    const naming = bodies.filter((b) => HAZARD_RE.test(b.text)).map((b) => b.name);
    // ASSERT THE LIST, NOT THE COUNT. `toBe(4)` would pass if one body lost
    // the sentence and a fifth skill gained it, which is precisely the
    // regression CLAIM-293.6's denominator exists to catch.
    expect(naming).toEqual(bodies.map((b) => b.name));
    expect(naming.length).toBe(PINNED_SKILL_COUNT);
  });

  test("every one of the four ties the hazard to absence keying a create", () => {
    const bodies = skillBodies();
    expect(bodies.length).toBeGreaterThan(0);
    // The hazard is not "reads can fail". It is that a failed read is read as
    // ABSENCE, and absence is the thing every create step branches on. A body
    // that named the first without the second would not motivate this fake.
    const tying = bodies.filter((b) => /absen(ce|t)/i.test(b.text) && HAZARD_RE.test(b.text));
    expect(tying.map((b) => b.name)).toEqual(bodies.map((b) => b.name));
  });
});

// ===========================================================================
// Case 8's key list, enumerated from the four bodies as a PARTITION
// ===========================================================================

// Case 8 names four identity keys. Enumerating the `## Re-entry` "Read first"
// column off disk yields SIXTEEN rows, not four -- `docs/test-plans/{n}-plan.md`
// alone is a fifth path-shaped key the plan's prose does not list. So the four
// are read as KEY CLASSES, and every row is mapped to exactly one class.
//
// THIS IS A PARTITION AND NOT A CARVE-OUT. The tempting shape was
// `if (!isIdentityRow(row)) continue;`, which is the derived, uncounted
// exemption #307 spent a bug removing from this repository. Both populations
// are named, both are counted, and their sum is asserted equal to the whole --
// so a NEW Re-entry row that fits no class fails loudly instead of being
// silently ignored.

const IDENTITY_CLASSES = [
  "forge-object-title",
  "forge-list-row",
  "sentinel-identity",
  "worktree-path",
] as const;
type IdentityClass = (typeof IDENTITY_CLASSES)[number];

const NON_IDENTITY_CLASSES = ["precondition", "amend-in-place", "report-only"] as const;
type NonIdentityClass = (typeof NON_IDENTITY_CLASSES)[number];

/** Every `## Re-entry` "Read first" cell in the repository, mapped by its
 *  exact text. Keyed on the literal so a reworded row fails rather than
 *  drifting into the wrong class. */
const ROW_CLASS: Readonly<Record<string, IdentityClass | NonIdentityClass>> = {
  // goal-create
  "Does a milestone with this title exist?": "forge-object-title",
  "Does its description already carry the feature table?": "amend-in-place",
  "Did the goal resolve at all?": "precondition",
  // story-create
  "Does a Story already exist for this row?": "forge-list-row",
  "Does the declared domain resolve to a binding?": "precondition",
  "Is the existing Story assigned to this milestone?": "amend-in-place",
  "Are there Stories with no row?": "report-only",
  // story-design
  "Does `docs/design/stories/{n}.md` exist?": "worktree-path",
  "Does the Story already carry a design sentinel?": "sentinel-identity",
  "Does the pinned commit resolve on the remote?": "precondition",
  "Do the registered claims already exist?": "amend-in-place",
  // story-test-plan
  "Does the plan file exist?": "worktree-path",
  "Which claims have no case?": "amend-in-place",
  "Which cases anchor to a claim that is gone?": "report-only",
  "Does every case already declare a `Corpus`?": "amend-in-place",
  "Is a test-plan sentinel already posted?": "sentinel-identity",
};

const PINNED_REENTRY_ROWS = 16;

function reentryRows(): { readonly skill: string; readonly read: string }[] {
  const rows: { skill: string; read: string }[] = [];
  for (const body of skillBodies()) {
    const lines = body.text.split("\n");
    const start = lines.findIndex((l) => l.trim() === "## Re-entry");
    if (start === -1) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if ((lines[i] as string).startsWith("## ")) {
        end = i;
        break;
      }
    }
    const tableLines = lines.slice(start, end).filter((l) => l.startsWith("|"));
    // Drop the header row and the `|---|---|` separator.
    for (const line of tableLines.slice(2)) {
      const cell = (line.split("|")[1] ?? "").trim();
      if (cell.length > 0) rows.push({ skill: body.name, read: cell });
    }
  }
  return rows;
}

describe("case 8: the identity keys are enumerated from the four bodies", () => {
  test("every skill body carries a Re-entry table, and the row total is pinned", () => {
    const bodies = skillBodies();
    const withTable = bodies.filter((b) => b.text.includes("\n## Re-entry\n"));
    expect(withTable.map((b) => b.name)).toEqual(bodies.map((b) => b.name));

    const rows = reentryRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBe(PINNED_REENTRY_ROWS);
  });

  test("the mapping is a partition: zero unmapped rows, and the halves sum to the whole", () => {
    const rows = reentryRows();
    expect(rows.length).toBeGreaterThan(0);

    // Name the offenders. A count would report "15 of 16" and leave the reader
    // grepping for which row a `SKILL.md` edit just introduced.
    const unmapped = rows
      .filter((r) => ROW_CLASS[r.read] === undefined)
      .map((r) => `${r.skill}: ${r.read}`);
    expect(unmapped).toEqual([]);

    const identity = rows.filter((r) =>
      IDENTITY_CLASSES.includes(ROW_CLASS[r.read] as IdentityClass),
    );
    const other = rows.filter((r) =>
      NON_IDENTITY_CLASSES.includes(ROW_CLASS[r.read] as NonIdentityClass),
    );

    expect(identity.length).toBeGreaterThan(0);
    expect(other.length).toBeGreaterThan(0);
    expect(identity.length + other.length).toBe(rows.length);
  });

  test("there are exactly four identity key classes and each has at least one row", () => {
    const rows = reentryRows();
    expect(rows.length).toBeGreaterThan(0);

    const present = IDENTITY_CLASSES.filter((cls) => rows.some((r) => ROW_CLASS[r.read] === cls));
    // Four, and each one actually occupied -- a class listed but never walked
    // is mutation N2's shape, where a scope entry existed and nothing read it.
    expect(present).toEqual([...IDENTITY_CLASSES]);
    expect(present.length).toBe(4);
  });
});

// ===========================================================================
// Case 8: driven directly, the fake ACCEPTS the duplicate
// ===========================================================================

const REPO_FLAG = ["--repo", "OWNER/REPO"] as const;
const MILESTONE_LIST_ARGV = [
  "gh",
  "api",
  "--paginate",
  "repos/OWNER/REPO/milestones?state=all&per_page=100",
] as const;

function parse(stdout: string): unknown {
  return JSON.parse(stdout) as unknown;
}

describe("case 8: the fake accepts a duplicate-creating argv, per identity key class", () => {
  // ACCEPTANCE IS NOT AN EXIT CODE. `silent-no-op-mutation` returns exit 0 and
  // writes nothing, so a test asserting `exitCode === 0` would score a fake
  // that dropped every mutation on the floor as fully compliant. Each case
  // below asserts THREE things: not refused, two attempts recorded, and the
  // state grew -- read back through a list argv, never through a private
  // field. references/verification.md:125, assert the reason not the verdict.

  test("forge-object-title: two milestones with the same title", async () => {
    const forge = createFakeForge();
    const port = createRecordingPort(forge);
    const title = "M9 — the universal lifecycle";
    const argv = [
      "gh",
      "api",
      "--method",
      "POST",
      "repos/OWNER/REPO/milestones",
      "-f",
      `title=${title}`,
    ];

    const first = await port.run(argv);
    const second = await port.run(argv);

    for (const result of [first, second]) {
      expect(result.exitCode).not.toBe(REFUSED_EXIT_CODE);
      expect(result.exitCode).not.toBe(FAKE_UNMODELLED_EXIT_CODE);
    }
    expect(port.calls.filter((c) => c.argv.join(" ") === argv.join(" ")).length).toBe(2);

    const listed = await port.run([...MILESTONE_LIST_ARGV]);
    const rows = parse(listed.stdout) as { title: string }[];
    // GitHub answers 422 here (docs/design/stories/293.md:150-153). The fake
    // must not, or run 2's silence would be the double's decision.
    expect(rows.filter((m) => m.title === title).length).toBe(2);
  });

  test("forge-list-row: two issues with the same feature-row description", async () => {
    const forge = createFakeForge();
    const port = createRecordingPort(forge);
    const title = "S9.1 — the seam rung";
    const argv = ["gh", "issue", "create", ...REPO_FLAG, "--title", title, "--body", "Refs #293"];

    await port.run(argv);
    await port.run(argv);

    expect(port.calls.filter((c) => c.argv.join(" ") === argv.join(" ")).length).toBe(2);
    for (const call of port.calls) expect(call.exitCode).not.toBe(REFUSED_EXIT_CODE);

    const listed = await port.run(["gh", "issue", "list", ...REPO_FLAG, "--json", "number,title"]);
    const rows = parse(listed.stdout) as { title: string }[];
    expect(rows.filter((i) => i.title === title).length).toBe(2);
  });

  test("sentinel-identity: two comments carrying the same sentinel", async () => {
    const forge = createFakeForge();
    const port = createRecordingPort(forge);
    await port.run(["gh", "issue", "create", ...REPO_FLAG, "--title", "S9.1", "--body", "b"]);

    const sentinel = "## iai-" + "design\n\nPinned at 0123456789abcdef";
    const argv = ["gh", "issue", "comment", "1", ...REPO_FLAG, "--body", sentinel];
    await port.run(argv);
    await port.run(argv);

    expect(port.calls.filter((c) => c.argv.join(" ") === argv.join(" ")).length).toBe(2);

    const viewed = await port.run(["gh", "issue", "view", "1", ...REPO_FLAG, "--json", "comments"]);
    const view = parse(viewed.stdout) as { comments: { body: string }[] };
    // "One sentinel, one comment" is skills/story-design/SKILL.md:79 -- the
    // SKILL's contract. A fake that upserted on the skill's behalf would score
    // a skill that never read the comment list as compliant.
    expect(view.comments.filter((c) => c.body === sentinel).length).toBe(2);
  });

  test("worktree-path: two commits touching the same Design path", async () => {
    // THE FOURTH KEY IS ON THE OTHER SURFACE, and that is why it does not
    // collapse into the third. Expressed as a `gh` argv it would be
    // `gh issue comment --body "<permalink to the Design>"` -- byte-identical
    // in shape to the sentinel case above and differing only in the string
    // inside --body. Two argv that differ only in the value they quote are one
    // argv (references/verification.md:127-129). Its argv[0] is `git`, which
    // packages/exec/src/port.ts:58 admits, so it is still "driven directly
    // through the port" exactly as NEVER-293.7 words it.
    const real = createRealPort();
    const port = createRecordingPort(real);
    const root = temps.create("iai-fx-320-design");
    const repo = await createFixtureRepo(port, root, {
      name: "design-path",
      files: [{ path: "docs/milestones/M9.md", contents: "# M9\n" }],
    });

    const designPath = "docs/design/stories/9999.md";
    const full = join(root, designPath);
    let commits = 0;
    for (const contents of ["# Story 9999\n\n## Problem\n", "# Story 9999\n\n## Problem\n\n## Goal\n"]) {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents, "utf8");
      const add = await repo.run(["git", "-C", root, "add", "-A"]);
      const commit = await repo.run([
        "git",
        "-C",
        root,
        "commit",
        "-q",
        "-m",
        `#320: write ${designPath}`,
      ]);
      expect(add.exitCode).toBe(0);
      expect(commit.exitCode).toBe(0);
      commits += 1;
    }
    expect(commits).toBe(2);

    // Read the state back out of git, not out of a counter this test kept.
    // The tree hash cannot be the measure here: case 10 requires an
    // identical-bytes rewrite to count as a mutation, and that leaves the hash
    // unchanged.
    const counted = await repo.run([
      "git",
      "-C",
      root,
      "rev-list",
      "--count",
      "HEAD",
      "--",
      designPath,
    ]);
    expect(counted.exitCode).toBe(0);
    expect(Number(counted.stdout.trim())).toBe(2);

    // Both attempts are on the ONE seam, alongside every `gh` attempt above.
    const commitAttempts = port.calls.filter((c) => c.argv.includes("commit"));
    expect(commitAttempts.length).toBe(3); // the seed commit, plus the two writes
  });
});

// ===========================================================================
// Case 9, half (i): five modes, injectable, and each lie is causally a lie
// ===========================================================================

describe("case 9 (i): all five failure modes are injectable and distinct", () => {
  test("the mode roster is non-zero, five, and has no duplicates", () => {
    expect(FAILURE_MODES.length).toBeGreaterThan(0);
    expect(FAILURE_MODES.length).toBe(5);
    // Cardinality, not length: a roster listing one mode twice would satisfy
    // `length === 5` and inject four things.
    expect(new Set(FAILURE_MODES).size).toBe(FAILURE_MODES.length);
  });

  test("each mode changes an observable the honest fake does not produce", async () => {
    let exercised = 0;
    const observed = new Map<FailureMode, string>();

    for (const mode of FAILURE_MODES) {
      const forge = createFakeForge({ milestones: [{ title: "M9", description: "" }] });
      const honest = await forge.run([...MILESTONE_LIST_ARGV]);
      expect(honest.exitCode).toBe(0);

      forge.inject(mode);
      const read = await forge.run([...MILESTONE_LIST_ARGV]);
      const create = await forge.run([
        "gh",
        "api",
        "--method",
        "POST",
        "repos/OWNER/REPO/milestones",
        "-f",
        "title=M8",
      ]);
      forge.inject(null);
      const after = await forge.run([...MILESTONE_LIST_ARGV]);

      // The signature is what the mode actually changed, not the name of the
      // mode -- so two modes wired to the same branch collapse visibly.
      //
      // THE CLASSIFICATION IS IN THE SIGNATURE BECAUSE WITHOUT IT THIS
      // ASSERTION FAILS, AND THAT FAILURE IS THE POINT. Measured while writing
      // this file: on exit code and row counts alone the five modes produce
      // THREE distinct signatures, not five -- the zeroed budget, the
      // header-absent 403 and the transient error are indistinguishable,
      // because all three are "the read exited 1 and returned no rows". They
      // differ only in the REASON, which is what `classifyRateLimit` exists to
      // extract and what case 20 requires be asserted. A caller branching on
      // the verdict cannot tell them apart; one branching on the
      // classification can.
      const readResponse = forge.responses[1];
      observed.set(
        mode,
        [
          `read.exit=${String(read.exitCode)}`,
          `read.rows=${read.exitCode === 0 ? String((parse(read.stdout) as unknown[]).length) : "n/a"}`,
          `read.class=${readResponse === undefined ? "none" : classifyRateLimit(readResponse)}`,
          `read.retry=${readResponse === undefined ? "none" : String(shouldRetryResponse(readResponse).retry)}`,
          `create.exit=${String(create.exitCode)}`,
          `state.rows=${String((parse(after.stdout) as unknown[]).length)}`,
        ].join(" "),
      );
      exercised += 1;
    }

    expect(exercised).toBe(FAILURE_MODES.length);
    // 5 of 5 injectable means 5 DISTINCT observable effects. A `length` check
    // counts what you collected; a cardinality check counts what is distinct.
    expect(new Set(observed.values()).size).toBe(FAILURE_MODES.length);
  });

  test("the truncated-list mode omits an object that is in the fake's own state", async () => {
    const forge = createFakeForge({
      milestones: [
        { title: "M8", description: "" },
        { title: "M9", description: "" },
      ],
    });

    const honest = await forge.run([...MILESTONE_LIST_ARGV]);
    const honestTitles = (parse(honest.stdout) as { title: string }[]).map((m) => m.title);
    expect(honestTitles).toEqual(["M8", "M9"]);

    forge.inject("truncated-list");
    const lied = await forge.run([...MILESTONE_LIST_ARGV]);
    const liedTitles = (parse(lied.stdout) as { title: string }[]).map((m) => m.title);

    // THE LIE IS CAUSALLY A LIE: exit 0, well-formed JSON, and an object the
    // fake is holding is simply not in it. That is the shape a caller cannot
    // tell from absence, which is the whole hazard.
    expect(lied.exitCode).toBe(0);
    expect(liedTitles).toEqual(["M8"]);
    expect(liedTitles).not.toContain("M9");

    // AND IT TRUNCATES DESPITE `--paginate`.
    // packages/core/src/gh/milestones.ts:34-36 added that flag because "the
    // milestone is missing" is indistinguishable from "the milestone is on
    // page two". A fake that honoured the flag could never reproduce the
    // hazard the flag exists to prevent.
    expect(MILESTONE_LIST_ARGV).toContain("--paginate");
  });

  test("the transient error spends itself: the identical argv succeeds on retry", async () => {
    const forge = createFakeForge({ milestones: [{ title: "M9", description: "" }] });
    forge.inject("transient-connection-error");
    const first = await forge.run([...MILESTONE_LIST_ARGV]);
    const second = await forge.run([...MILESTONE_LIST_ARGV]);

    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(0);
    // references/gh-error-handling.md:130 -- "retry once before believing a
    // failure". A mode that failed for ever would be a fatal error wearing a
    // transient one's name, and that instruction would be untestable.
    expect(first.stderr).not.toBe(second.stderr);
  });

  test("the silent no-op returns success and writes nothing", async () => {
    const forge = createFakeForge();
    forge.inject("silent-no-op-mutation");
    const create = await forge.run([
      "gh",
      "api",
      "--method",
      "POST",
      "repos/OWNER/REPO/milestones",
      "-f",
      "title=M9",
    ]);
    forge.inject(null);
    const listed = await forge.run([...MILESTONE_LIST_ARGV]);

    expect(create.exitCode).toBe(0);
    // The verdict says it worked and the state says it did not. `gh pr ready`
    // has done exactly this for real (references/gh-error-handling.md:126),
    // and it is why case 8 above may not read acceptance off an exit code.
    expect(parse(listed.stdout)).toEqual([]);
  });
});

// ===========================================================================
// Case 9, half (ii): the hazard, demonstrated -- and NOT a skill
// ===========================================================================

describe("case 9 (ii): a truncated read makes a second run create a duplicate", () => {
  // THIS IS NOT A TRANSCRIPTION OF `goal-create` AND MUST NOT BE CITED AS ONE.
  //
  // It implements exactly one sentence -- skills/goal-create/SKILL.md:107-110,
  // "a rate-limited read ... must never be treated as 'no such milestone' ...
  // because absence is what the create step keys on" -- in six lines, to show
  // the fake's truncation reaches a create. Problem 4 of
  // docs/design/stories/293.md calls a hand-written procedure standing in for
  // a skill "the category error at its fifth occurrence", and CLAIM-293.11
  // requires every transcription to be audited one row per Re-entry row.
  //
  // So it is deliberately NOT exported from packages/harness/src/index.ts and
  // lives only in this file. #322 and #323 must build their runner on a
  // transcription that goes through that audit, not on this.
  async function readThenCreate(driver: { run(argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> }, title: string): Promise<void> {
    const listed = await driver.run([...MILESTONE_LIST_ARGV]);
    const rows = listed.exitCode === 0 ? (parse(listed.stdout) as { title: string }[]) : [];
    if (!rows.some((m) => m.title === title)) {
      await driver.run([
        "gh",
        "api",
        "--method",
        "POST",
        "repos/OWNER/REPO/milestones",
        "-f",
        `title=${title}`,
      ]);
    }
  }

  test("run 1 creates, run 2 is silent, and run 2 under the lie is not", async () => {
    const title = "M9 — the universal lifecycle";
    const forge = createFakeForge();
    const port = createRecordingPort(forge);

    await readThenCreate(port, title);
    const run1Mutations = port.calls.filter((c) => isMutatingGhArgv(c.argv));
    // THE `> 0` HALF, EVALUATED FIRST. docs/design/stories/293.md:424-426:
    // "run 2 made zero mutations" is meaningless alone.
    expect(run1Mutations.length).toBeGreaterThan(0);

    port.reset();
    await readThenCreate(port, title);
    expect(port.calls.filter((c) => isMutatingGhArgv(c.argv))).toEqual([]);

    port.reset();
    forge.inject("truncated-list");
    await readThenCreate(port, title);
    forge.inject(null);

    const lieMutations = port.calls.filter((c) => isMutatingGhArgv(c.argv));
    // The harness sees it because the recorder records the ATTEMPT
    // (packages/exec/src/recording.ts:10-16) -- no second capture mechanism.
    expect(lieMutations.length).toBe(1);
    expect(lieMutations[0]?.argv).toContain(`title=${title}`);

    const listed = await forge.run([...MILESTONE_LIST_ARGV]);
    expect(
      (parse(listed.stdout) as { title: string }[]).filter((m) => m.title === title).length,
    ).toBe(2);
  });
});

// ===========================================================================
// Case 20: the reasons are pairwise distinct, asserted by ABSENCE
// ===========================================================================

describe("case 20: the two rate-limit lies differ by REASON, not by verdict", () => {
  async function respond(mode: FailureMode | null) {
    const forge = createFakeForge({ milestones: [{ title: "M9", description: "" }] });
    forge.inject(mode);
    await forge.run([...MILESTONE_LIST_ARGV]);
    const last = forge.responses.at(-1);
    if (last === undefined) throw new Error("the fake recorded no response");
    return last;
  }

  test("both lies share the verdict, so the verdict cannot be the discriminator", async () => {
    const zeroed = await respond("rate-limit-zeroed-budget");
    const headerless = await respond("forbidden-no-budget-header");
    expect(zeroed.exitCode).toBe(headerless.exitCode);
    expect(zeroed.exitCode).not.toBe(0);
  });

  test("the classifier separates them into three states, each asserted against the other two", async () => {
    const zeroed = await respond("rate-limit-zeroed-budget");
    const headerless = await respond("forbidden-no-budget-header");
    // NEGATIVE CONTROL. Without it, a classifier returning "rate-limited"
    // whenever ANY header key is present satisfies the two-way distinction
    // perfectly. An unmodelled operation is a genuine failure that is not a
    // rate limit, so it is the honest third fixture.
    const forge = createFakeForge();
    await forge.run(["gh", "workflow", "run", "nothing.yml"]);
    const control = forge.responses.at(-1);
    if (control === undefined) throw new Error("the fake recorded no response");

    expect(classifyRateLimit(zeroed)).toBe("rate-limited");
    expect(classifyRateLimit(zeroed)).not.toBe("possibly-rate-limited");
    expect(classifyRateLimit(zeroed)).not.toBe("not-rate-limited");

    expect(classifyRateLimit(headerless)).toBe("possibly-rate-limited");
    expect(classifyRateLimit(headerless)).not.toBe("rate-limited");
    expect(classifyRateLimit(headerless)).not.toBe("not-rate-limited");

    expect(classifyRateLimit(control)).toBe("not-rate-limited");
    expect(shouldRetryResponse(control).retry).toBe(false);
    expect(control.exitCode).toBe(FAKE_UNMODELLED_EXIT_CODE);
  });

  test("the third state is reached by the ABSENCE of the header, not by its value", async () => {
    const headerless = await respond("forbidden-no-budget-header");
    // references/gh-error-handling.md:56-60: the third state exists because
    // `gh api --include` appears nowhere in this repository, so the common
    // case is that no headers were captured at all.
    expect(headerless.headers).toBeUndefined();

    const zeroed = await respond("rate-limit-zeroed-budget");
    expect(zeroed.headers).toBeDefined();
  });

  test("the header-absent fixture does not contain the secondary-limit phrase", async () => {
    const headerless = await respond("forbidden-no-budget-header");
    // packages/core/src/gh/errors.ts:226-228 tests SECONDARY_RATE_LIMIT_RE
    // FIRST and short-circuits. A stray "secondary rate limit" in this string
    // would classify it `rate-limited` and silently collapse the two modes
    // into one -- and both assertions above would still pass.
    expect(/secondary rate limit/i.test(headerless.stderr)).toBe(false);
    expect(/secondary rate limit/i.test(headerless.stdout)).toBe(false);
  });

  test("the modes produce pairwise-distinct stderr, each excluding the others' phrase", async () => {
    // The phrase that belongs to exactly one mode. Asserting only that each
    // message CONTAINS its own phrase is the pair of positive assertions
    // mutation M3 of #319 walked straight through; each must also assert the
    // ABSENCE of the others'.
    const OWN_PHRASE: Readonly<Record<string, string>> = {
      "rate-limit-zeroed-budget": "API rate limit exceeded",
      "forbidden-no-budget-header": "Resource not accessible by integration",
      "transient-connection-error": "error connecting to api.github.com",
    };
    const modes = Object.keys(OWN_PHRASE);
    expect(modes.length).toBeGreaterThan(0);

    let checked = 0;
    for (const mode of modes) {
      const response = await respond(mode as FailureMode);
      const own = OWN_PHRASE[mode] as string;
      expect(response.stderr).toContain(own);
      for (const other of modes) {
        if (other === mode) continue;
        expect(response.stderr).not.toContain(OWN_PHRASE[other] as string);
      }
      checked += 1;
    }
    expect(checked).toBe(modes.length);
  });

  test("both header casings classify identically", () => {
    const base = { exitCode: 1, stdout: "", stderr: "gh: HTTP 403: API rate limit exceeded" };
    // packages/core/src/gh/errors.ts:153-158 records that
    // getHeaderCaseInsensitive exists because a literal lowercase lookup
    // "would silently miss X-RateLimit-Remaining". Emitting only one casing
    // anywhere in the corpus leaves a mutation collapsing it to a literal
    // lookup alive.
    expect(classifyRateLimit({ ...base, headers: RATE_LIMIT_HEADERS_MIXED_CASE })).toBe(
      "rate-limited",
    );
    expect(classifyRateLimit({ ...base, headers: RATE_LIMIT_HEADERS_LOWER_CASE })).toBe(
      "rate-limited",
    );
    const mixedKeys = Object.keys(RATE_LIMIT_HEADERS_MIXED_CASE);
    expect(mixedKeys.length).toBeGreaterThan(0);
    // The two fixtures must actually differ in case, or this proves nothing.
    expect(mixedKeys).not.toEqual(Object.keys(RATE_LIMIT_HEADERS_LOWER_CASE));
    expect(mixedKeys.map((k) => k.toLowerCase())).toEqual(
      Object.keys(RATE_LIMIT_HEADERS_LOWER_CASE),
    );
  });
});

// ===========================================================================
// The header-capture gap, published rather than hidden
// ===========================================================================

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFilesUnder(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("the header-capture gap is a published measurement, not a hidden divergence", () => {
  // READ THIS BEFORE "FIXING" THE TEST BELOW.
  //
  // The fake hands out a structured `headers` map. `createRealPort` never can:
  // nothing in this repository passes `gh api --include`, which is the exact
  // reason the third rate-limit state exists at all
  // (packages/core/src/gh/errors.ts:212-216). That divergence is real, and the
  // choice made here is the one NEVER-293.5 makes -- turn it into a PUBLISHED
  // NUMBER instead of a silence. The PASS condition below is an ABSENCE, so
  // the first person to read it will be tempted to delete it as vacuous, and
  // deleting it deletes the only measurement of the gap.
  //
  // OWNER: #324, the live rung -- the first thing in this repository that will
  // meet a real 403 and can confirm or refute both the capture gap and the
  // `assumed` 403 format at errors.ts:199-206.

  test("no argv anywhere in the tree captures headers, so production never has them", () => {
    const files = sourceFilesUnder(join(repoRoot, "packages"));
    expect(files.length).toBeGreaterThan(0); // denominator first

    const capturing = files
      .map((f) => f.slice(repoRoot.length + 1))
      .filter((rel) => /["']--include["']/.test(readFileSync(join(repoRoot, rel), "utf8")));
    expect(capturing).toEqual([]);
  });

  test("the real port's result shape has no header channel at all", async () => {
    const port = createRealPort();
    const result = await port.run(["git", "--version"]);
    expect(result.exitCode).toBe(0);
    // Not `expect(result.headers).toBeUndefined()` -- a missing property and a
    // property set to undefined read the same that way. The key must be
    // absent, because the point is that packages/exec/src/port.ts:34-38 was
    // never widened for the fake's benefit.
    expect(Object.keys(result).sort()).toEqual(["exitCode", "stderr", "stdout"]);
  });
});

// ===========================================================================
// The mutation classifier is single, and shared
// ===========================================================================

describe("isMutatingGhArgv is the one classifier, and it is not vacuous", () => {
  const MUTATIONS: readonly (readonly string[])[] = [
    ["gh", "api", "--method", "POST", "repos/OWNER/REPO/milestones", "-f", "title=M9"],
    ["gh", "api", "--method", "PATCH", "repos/OWNER/REPO/issues/comments/1000", "-f", "body=x"],
    ["gh", "issue", "create", "--repo", "OWNER/REPO", "--title", "t", "--body", "b"],
    ["gh", "issue", "comment", "1", "--repo", "OWNER/REPO", "--body", "b"],
    ["gh", "issue", "edit", "1", "--repo", "OWNER/REPO", "--body", "b"],
    ["gh", "issue", "close", "1", "--repo", "OWNER/REPO"],
    ["gh", "pr", "ready", "1", "--repo", "OWNER/REPO"],
    ["gh", "label", "create", "iai", "--repo", "OWNER/REPO", "--color", "24292f"],
  ];
  const READS: readonly (readonly string[])[] = [
    ["gh", "api", "--paginate", "repos/OWNER/REPO/milestones?state=all&per_page=100"],
    ["gh", "issue", "list", "--repo", "OWNER/REPO", "--json", "number"],
    ["gh", "issue", "view", "1", "--repo", "OWNER/REPO", "--json", "comments"],
    ["gh", "pr", "list", "--repo", "OWNER/REPO", "--json", "number"],
    ["gh", "label", "list", "--repo", "OWNER/REPO", "--limit", "200"],
    ["git", "-C", "/tmp/x", "commit", "-m", "#0: not a gh argv"],
  ];

  test("both populations are non-empty and classified correctly, named on failure", () => {
    expect(MUTATIONS.length).toBeGreaterThan(0);
    expect(READS.length).toBeGreaterThan(0);
    // A classifier answering `true` to everything passes the first list and
    // fails the second; one answering `false` to everything does the reverse.
    // Neither direction alone is a check.
    expect(MUTATIONS.filter((a) => !isMutatingGhArgv(a)).map((a) => a.join(" "))).toEqual([]);
    expect(READS.filter((a) => isMutatingGhArgv(a)).map((a) => a.join(" "))).toEqual([]);
  });
});
