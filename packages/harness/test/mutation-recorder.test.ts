// #321, build target 5 of docs/design/stories/293.md, CLAIM-293.8.
// Cases 4 and 10 of docs/test-plans/293-plan.md.
//
// Corpus: `real` for the git seam -- `createRealPort` and a real fixture
// repository with real commits -- and `synthetic` for the `gh` answers, which
// come from the stateful fake forge (packages/harness/src/fake-forge.ts).
//
// OUT OF SCOPE, DELIBERATELY, AND NOT WRITTEN HERE: `bun run skill-harness`,
// any exit code or `process.exit`, any JSON artifact or serializer, the
// empty-roster refusal (case 5), the skill-roster denominator and
// `PINNED_SKILL_COUNT` (cases 3 and 6), and any assertion anchored to
// `CLAIM-293.3`'s run-1-then-run-2 ordering. Those are #322's and #323's.
// #321's non-vacuity comes from scenario N below, not from an exit code.

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRealPort, type Port } from "iai-exec";
import {
  checkWritePath,
  createFakeForge,
  createFixtureRepo,
  createMutationRecorder,
  createTempDirs,
  isMutatingGhArgv,
  mutationEvidence,
  MutationRecorderError,
  type FailureMode,
  type FakeForge,
  type FixtureRepo,
  type MutationRecorder,
  type MutationReport,
  type RecordedWrite,
} from "../src/index";

const repoRoot = join(import.meta.dir, "../../..");
const temps = createTempDirs();
afterAll(() => temps.cleanup());

const SEED_PATH = "docs/milestones/M9.md";
const SEED_BYTES = "# M9\n\n| Feature | Description |\n|---|---|\n| A | first |\n";
const DIFFERENT_BYTES = "# M9\n\n| Feature | Description |\n|---|---|\n| A | changed |\n";
const NEW_PATH = "docs/design/stories/999.md";
const NEW_BYTES = "# Story 999\n\n## Problem\n\nDesign for #321.\n";

const REPO_FLAG = ["--repo", "OWNER/REPO"] as const;
const N_READ_ARGV = ["gh", "issue", "list", ...REPO_FLAG] as const;
const COMMENT_ARGV = ["gh", "issue", "comment", "1", ...REPO_FLAG, "--body", "## iai-design pinned"] as const;

// ===========================================================================
// The wiring every scenario uses
// ===========================================================================

interface ScenarioContext {
  readonly port: Port;
  readonly recorder: MutationRecorder;
  readonly repo: FixtureRepo;
  readonly forge: FakeForge;
}

interface ScenarioResult {
  readonly report: MutationReport;
  readonly repo: FixtureRepo;
  readonly forge: FakeForge;
}

/** Run one scenario end to end: a fresh fixture repo seeded with `SEED_PATH`,
 *  the recorder's window opened and closed around the subject. The subject
 *  issues every git and `gh` call through `recorder.port` -- never through the
 *  raw port and never through `repo.run` -- so every mutation it attempts is
 *  inside the window this test asserts on. */
async function runScenario(
  name: string,
  subject: (ctx: ScenarioContext) => Promise<void>,
): Promise<ScenarioResult> {
  const rawPort = createRealPort();
  const forge = createFakeForge({ delegate: rawPort });
  const recorder = createMutationRecorder({ port: forge });
  const root = temps.create(`iai-321-${name}`);
  const repo = await createFixtureRepo(recorder.port, root, {
    name,
    files: [{ path: SEED_PATH, contents: SEED_BYTES }],
  });
  await recorder.begin(repo);
  await subject({ port: recorder.port, recorder, repo, forge });
  const report = await recorder.end();
  return { report, repo, forge };
}

async function runGit(ctx: ScenarioContext, args: readonly string[]): Promise<void> {
  const result = await ctx.port.run(["git", "-C", ctx.repo.root, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`scenario git command failed: git ${args.join(" ")} -- ${result.stderr}`);
  }
}

/** Scenario F's shape, parameterised on the lie so #320's finding-1 test can
 *  reuse the exact same subject with only the double's behaviour changed. */
function forgeOnlySubject(mode: FailureMode | null): (ctx: ScenarioContext) => Promise<void> {
  return async (ctx) => {
    await ctx.port.run([...N_READ_ARGV]);
    ctx.forge.inject(mode);
    await ctx.port.run([...COMMENT_ARGV]);
    ctx.forge.inject(null);
  };
}

// ===========================================================================
// The six scenarios and their full expected matrix
// ===========================================================================

interface ScenarioMatrix {
  readonly name: string;
  readonly description: string;
  readonly subject: (ctx: ScenarioContext) => Promise<void>;
  readonly expectedAttempts: readonly (readonly string[])[];
  readonly expectedWrites: readonly RecordedWrite[];
  readonly headChanged: boolean;
  readonly treeChanged: boolean;
  readonly dirty: boolean;
}

const SCENARIOS: readonly ScenarioMatrix[] = [
  {
    name: "N",
    description: "control: a read on each surface, nothing mutated",
    subject: async (ctx) => {
      await ctx.port.run([...N_READ_ARGV]);
      await runGit(ctx, ["status", "--porcelain"]);
    },
    expectedAttempts: [],
    expectedWrites: [],
    headChanged: false,
    treeChanged: false,
    dirty: false,
  },
  {
    name: "F",
    description: "forge only: the same read, then a gh mutation",
    subject: forgeOnlySubject(null),
    expectedAttempts: [COMMENT_ARGV],
    expectedWrites: [],
    headChanged: false,
    treeChanged: false,
    dirty: false,
  },
  {
    name: "W",
    description: "worktree only: a differing-bytes write, left uncommitted",
    subject: async (ctx) => {
      ctx.recorder.writeFile(SEED_PATH, DIFFERENT_BYTES);
    },
    expectedAttempts: [],
    expectedWrites: [
      {
        path: SEED_PATH,
        byteLength: Buffer.byteLength(DIFFERENT_BYTES, "utf8"),
        existedBefore: true,
        identical: false,
        trackedAtBegin: true,
      },
    ],
    headChanged: false,
    treeChanged: false,
    dirty: true,
  },
  {
    name: "I",
    description: "case 10: a byte-identical rewrite is still recorded",
    subject: async (ctx) => {
      ctx.recorder.writeFile(SEED_PATH, SEED_BYTES);
    },
    expectedAttempts: [],
    expectedWrites: [
      {
        path: SEED_PATH,
        byteLength: Buffer.byteLength(SEED_BYTES, "utf8"),
        existedBefore: true,
        identical: true,
        trackedAtBegin: true,
      },
    ],
    headChanged: false,
    treeChanged: false,
    dirty: false,
  },
  {
    name: "C",
    description: "a differing-bytes write, committed",
    subject: async (ctx) => {
      ctx.recorder.writeFile(SEED_PATH, DIFFERENT_BYTES);
      await runGit(ctx, ["add", "-A"]);
      await runGit(ctx, ["commit", "-q", "-m", "#321: commit the change"]);
    },
    expectedAttempts: [],
    expectedWrites: [
      {
        path: SEED_PATH,
        byteLength: Buffer.byteLength(DIFFERENT_BYTES, "utf8"),
        existedBefore: true,
        identical: false,
        trackedAtBegin: true,
      },
    ],
    headChanged: true,
    treeChanged: true,
    dirty: false,
  },
  {
    name: "E",
    description: "an empty commit after a byte-identical rewrite: HEAD moves, the tree does not",
    subject: async (ctx) => {
      ctx.recorder.writeFile(SEED_PATH, SEED_BYTES);
      await runGit(ctx, ["commit", "-q", "--allow-empty", "-m", "#321: an empty commit"]);
    },
    expectedAttempts: [],
    expectedWrites: [
      {
        path: SEED_PATH,
        byteLength: Buffer.byteLength(SEED_BYTES, "utf8"),
        existedBefore: true,
        identical: true,
        trackedAtBegin: true,
      },
    ],
    headChanged: true,
    treeChanged: false,
    dirty: false,
  },
];

/** Memoised per scenario name: every test below that needs scenario X's
 *  report awaits the SAME run rather than re-executing its git and gh calls. */
const scenarioResults = new Map<string, Promise<ScenarioResult>>();

function resultOf(spec: ScenarioMatrix): Promise<ScenarioResult> {
  const cached = scenarioResults.get(spec.name);
  if (cached !== undefined) return cached;
  const promise = runScenario(spec.name, spec.subject);
  scenarioResults.set(spec.name, promise);
  return promise;
}

function findScenario(name: string): ScenarioMatrix {
  const spec = SCENARIOS.find((s) => s.name === name);
  if (spec === undefined) throw new Error(`scenario "${name}" is missing from the roster`);
  return spec;
}

// ===========================================================================
// Roster hygiene
// ===========================================================================

describe("roster hygiene", () => {
  test("the scenario roster is non-empty, and its names are pairwise distinct", () => {
    expect(SCENARIOS.length).toBeGreaterThan(0);
    // Cardinality, not length: two scenarios sharing a name would silently
    // collapse into one memoised run above.
    expect(new Set(SCENARIOS.map((s) => s.name)).size).toBe(SCENARIOS.length);
  });
});

// ===========================================================================
// Case 4 and case 10: the full matrix, per scenario
// ===========================================================================

describe("case 4: both mutation surfaces are recorded and reported separately", () => {
  test("each surface is tripped by at least one scenario, and by NOT the other -- naming which", async () => {
    const withAttempts: string[] = [];
    const withWrites: string[] = [];
    for (const spec of SCENARIOS) {
      const { report } = await resultOf(spec);
      if (report.attemptedMutations.length > 0) withAttempts.push(spec.name);
      if (report.writes.length > 0) withWrites.push(spec.name);
    }
    // THE DENOMINATOR, ASSERTED BEFORE THE PARTITION IS TRUSTED: both surfaces
    // must be provably non-zero somewhere in the roster.
    expect(withAttempts.length).toBeGreaterThan(0);
    expect(withWrites.length).toBeGreaterThan(0);
    // ASSERT THE LIST. A count would report "1 of 6" and leave the reader
    // guessing which scenario tripped which surface.
    expect(withAttempts).toEqual(["F"]);
    expect(withWrites).toEqual(["W", "I", "C", "E"]);
  });

  for (const spec of SCENARIOS) {
    test(`scenario ${spec.name} (${spec.description}): the full matrix`, async () => {
      const { report } = await resultOf(spec);
      // Both counters, every time, including the zeros: the zeros prove the
      // two surfaces are independent, which is what kills a recorder with one
      // counter fed by both inputs.
      expect(report.attemptedMutations).toEqual(spec.expectedAttempts);
      expect(report.writes).toEqual(spec.expectedWrites);

      if (spec.headChanged) expect(report.after.head).not.toBe(report.before.head);
      else expect(report.after.head).toBe(report.before.head);

      if (spec.treeChanged) expect(report.after.tree).not.toBe(report.before.tree);
      else expect(report.after.tree).toBe(report.before.tree);

      expect(report.after.dirty).toBe(spec.dirty);
    });
  }

  test("scenario N: report.calls.length > 0 -- a run with no reads did not run at all", async () => {
    const { report } = await resultOf(findScenario("N"));
    expect(report.calls.length).toBeGreaterThan(0);
  });

  test("scenario N: mutationEvidence(report) is empty -- the anti-vacuity control", async () => {
    const { report } = await resultOf(findScenario("N"));
    expect(mutationEvidence(report)).toEqual([]);
  });

  test("scenario E is the one where HEAD moves and the tree does not", async () => {
    const { report } = await resultOf(findScenario("E"));
    // THIS IS WHAT MAKES THE `head` OBSERVABLE LOAD-BEARING. A recorder
    // sampling only the tree hash cannot distinguish a committed
    // identical-bytes rewrite (scenario E) from an uncommitted one (scenario
    // I): both leave the tree byte-identical, and only HEAD tells them apart.
    expect(report.after.head).not.toBe(report.before.head);
    expect(report.after.tree).toBe(report.before.tree);
  });
});

// ===========================================================================
// The evidence phrases, per scenario, asserted by presence AND absence
// ===========================================================================
//
// The seven phrases below are the whole vocabulary `mutationEvidence` can
// emit (packages/harness/src/mutation-recorder.ts:251-309). Several scenarios
// legitimately share a phrase -- C and W both wrote differing bytes; C and E
// both moved HEAD; E and I both rewrote identical bytes -- because the
// conditions are independent and a scenario can satisfy more than one. So
// membership is checked per PHRASE against the scenario's own ground truth
// (already asserted above), not by a single "owner" per scenario: asserting
// "scenario E must lack I's phrase" would be asserting something false about
// a correctly working recorder, since E's write really is byte-identical too.

const ALL_EVIDENCE_PHRASES = [
  "attempted mutating gh argv",
  "rewrote identical bytes",
  "wrote differing bytes",
  "HEAD moved",
  "the committed tree hash changed",
  "uncommitted changes remain",
  "wrote outside the recorder's seam",
] as const;

function expectedEvidencePhrases(spec: ScenarioMatrix): ReadonlySet<string> {
  const phrases = new Set<string>();
  if (spec.expectedAttempts.length > 0) phrases.add("attempted mutating gh argv");
  if (spec.expectedWrites.some((w) => w.identical)) phrases.add("rewrote identical bytes");
  if (spec.expectedWrites.some((w) => !w.identical)) phrases.add("wrote differing bytes");
  if (spec.headChanged) phrases.add("HEAD moved");
  if (spec.treeChanged) phrases.add("the committed tree hash changed");
  if (spec.dirty) phrases.add("uncommitted changes remain");
  return phrases;
}

describe("mutationEvidence names exactly the conditions that hold, per scenario", () => {
  for (const spec of SCENARIOS) {
    if (spec.name === "N") continue; // covered above: N's evidence is toEqual([])

    test(`scenario ${spec.name} (${spec.description}): evidence is non-empty and names only its own conditions`, async () => {
      const { report } = await resultOf(spec);
      const evidence = mutationEvidence(report);
      expect(evidence.length).toBeGreaterThan(0);

      const expected = expectedEvidencePhrases(spec);
      for (const phrase of ALL_EVIDENCE_PHRASES) {
        const present = evidence.some((line) => line.includes(phrase));
        expect(present).toBe(expected.has(phrase));
      }
    });
  }
});

// ===========================================================================
// The observer is absent from its own observation
// ===========================================================================

describe("the observer is absent from its own observation", () => {
  test("scenario N: report.calls is EXACTLY the two argv the subject issued", async () => {
    const { report, repo } = await resultOf(findScenario("N"));
    // The recorder's own git probes (`ls-files` in begin(); `rev-parse`
    // HEAD/tree and `status` in end()) run on the RAW port, never through
    // `recording` -- precisely so this list is never padded by the
    // recorder's own observation of the worktree it is observing.
    expect(report.calls.map((c) => c.argv.join(" "))).toEqual([
      N_READ_ARGV.join(" "),
      ["git", "-C", repo.root, "status", "--porcelain"].join(" "),
    ]);
  });
});

// ===========================================================================
// One classifier, not two
// ===========================================================================

describe("one classifier, not two", () => {
  test("report.attemptedMutations equals ROSTER filtered by the shared isMutatingGhArgv", async () => {
    let roster: readonly (readonly string[])[] = [];
    const { report } = await runScenario("classifier", async (ctx) => {
      roster = [
        ["gh", "api", "--method", "POST", "repos/OWNER/REPO/milestones", "-f", "title=M9", "-f", "description=d"],
        [...N_READ_ARGV],
        [...COMMENT_ARGV],
        ["git", "-C", ctx.repo.root, "status", "--porcelain"],
      ];
      for (const argv of roster) await ctx.port.run(argv);
    });

    expect(roster.length).toBeGreaterThan(0);
    // A recorder that forked the classifier into anything simpler goes red
    // here: this is the SAME function fake-forge.ts:216 exports, imported
    // rather than restated.
    expect(report.attemptedMutations).toEqual(roster.filter(isMutatingGhArgv));
  });
});

// ===========================================================================
// The recorder is indifferent to what the double decided (#320 finding 1)
// ===========================================================================

describe("the recorder is indifferent to what the double decided", () => {
  test("attemptedMutations is identical whether the fake honestly accepts or silently no-ops; only the fake's own state differs", async () => {
    const honest = await runScenario("indifference-honest", forgeOnlySubject(null));
    const lied = await runScenario("indifference-lied", forgeOnlySubject("silent-no-op-mutation"));

    // (a) The verdict the recorder reports is unchanged by the lie.
    expect(honest.report.attemptedMutations).toEqual(lied.report.attemptedMutations);
    expect(honest.report.attemptedMutations).toEqual([COMMENT_ARGV]);

    // (b) The fake's OWN state differs -- a double that accepts and one that
    // silently no-ops return the same verdict and differ only in state, so
    // the recorder must read the ATTEMPT, never the answer.
    const honestLast = honest.forge.responses.at(-1);
    const liedLast = lied.forge.responses.at(-1);
    if (honestLast === undefined || liedLast === undefined) {
      throw new Error("the fake recorded no response");
    }
    expect(honestLast.stdout).toContain("#issuecomment-");
    expect(liedLast.stdout).toBe("");
  });

  test("a mutating argv that FAILS is still an attempt, and is still recorded", async () => {
    // THE MUTATION THIS KILLS is a recorder that filters
    // `... && call.exitCode === 0`. The silent-no-op test above cannot kill
    // it -- that lie exits 0 -- so the failing case is required, and it is
    // the whole content of packages/exec/src/recording.ts:10-16: a refusal
    // and a failure are both attempts. Without this, run 2 would score clean
    // because the forge refused, not because the skill declined to try.
    const { report, forge } = await runScenario(
      "attempt-not-success",
      forgeOnlySubject("transient-connection-error"),
    );

    expect(report.attemptedMutations).toEqual([COMMENT_ARGV]);

    const answered = forge.responses.at(-1);
    if (answered === undefined) throw new Error("the fake recorded no response");
    // The state half: the forge really did refuse this one.
    expect(answered.exitCode).toBe(1);
    expect(answered.stdout).toBe("");

    const recordedCall = report.calls.find((c) => c.argv.join(" ") === COMMENT_ARGV.join(" "));
    if (recordedCall === undefined) throw new Error("the failing mutation is absent from report.calls");
    expect(recordedCall.exitCode).toBe(1);
  });
});

// ===========================================================================
// Tracked-ness is recorded, never filtered
// ===========================================================================

describe("tracked-ness is recorded, never filtered", () => {
  test("a write to a brand-new, untracked path is recorded with trackedAtBegin false and existedBefore false", async () => {
    const { report } = await runScenario("new-design-path", async (ctx) => {
      ctx.recorder.writeFile(NEW_PATH, NEW_BYTES);
    });
    // A recorder filtering on tracked-ness would score the creation of a
    // Design as zero mutations. It must not: the write is here regardless.
    expect(report.writes).toEqual([
      {
        path: NEW_PATH,
        byteLength: Buffer.byteLength(NEW_BYTES, "utf8"),
        existedBefore: false,
        identical: false,
        trackedAtBegin: false,
      },
    ]);
  });
});

// ===========================================================================
// The write-seam enforcement lint
// ===========================================================================

describe("the write-seam enforcement lint", () => {
  // Flat on purpose -- the same population packages/harness/test/fixture-repo.test.ts:212-214
  // already uses -- so it grows automatically when #322 and #323 add modules.
  const SANCTIONED_WRITERS = [
    "fixture-repo.ts", // seeds the repository BEFORE the recorder's window opens
    "mutation-recorder.ts", // IS the seam this file exists to test
    "tempdir.ts", // creates and removes the disposable temp roots
  ] as const;

  // DETECT THE CAPABILITY, NOT THE CALL SHAPE.
  //
  // The first version of this regex matched the bare words -- `writeFile`,
  // `mkdirSync` and the rest -- anywhere in the source. #322's `runner.ts`
  // exposes a `writeFile(relPath, contents)` method on its scenario context
  // that does nothing but delegate to `recorder.writeFile`, and the bare-word
  // form scored that delegation as a filesystem write. It was RED AGAINST
  // CORRECT CODE, over a module that imports no fs at all.
  //
  // The repository had already recorded this exact lesson in the opposite
  // direction: packages/exec/test/port.test.ts:93-111 rewrote its own
  // launcher detector from a call shape to an import after
  // `RegExp.prototype.exec(` false-positived, and the standing rule is that
  // for an ASSERTION -- as opposed to a ban -- a false positive is red against
  // correct code and must be fixed rather than tolerated.
  //
  // So the capability is read off the IMPORT LIST: a module has the ability to
  // write only if it binds a writing function out of `node:fs`, or reaches for
  // `Bun.write`. A method named `writeFile` on some other object is not the
  // capability, and a module importing only `readFileSync`/`readdirSync` from
  // `node:fs` -- as `re-entry.ts` does -- is a reader, not a writer.
  const FS_WRITE_NAMES =
    "writeFileSync|writeFile|appendFileSync|mkdirSync|mkdtempSync|rmSync|rmdirSync|unlinkSync|renameSync|cpSync|copyFileSync|createWriteStream";
  const FS_WRITE_RE = new RegExp(
    `import\\s*\\{[^}]*\\b(${FS_WRITE_NAMES})\\b[^}]*\\}\\s*from\\s*["']node:fs["']|\\bBun\\.write\\b`,
    "s",
  );

  test("every .ts file under packages/harness/src partitions into writers and non-writers, summing to the whole", () => {
    const dir = join(repoRoot, "packages/harness/src");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0); // denominator first

    const writers: string[] = [];
    const nonWriters: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      if (FS_WRITE_RE.test(source)) writers.push(file);
      else nonWriters.push(file);
    }

    expect(writers.length).toBeGreaterThan(0);
    expect(nonWriters.length).toBeGreaterThan(0); // if this empties, the ban is hiding something
    expect(writers.length + nonWriters.length).toBe(files.length); // exhaustive

    // THE CLOSURE IS THE CLAIM. A fourth writer must be a deliberate edit to
    // this list, in front of a reviewer -- packages/exec/src/port.ts:51-57's
    // doctrine for a closed executable allow-list applies here to writers.
    expect(writers.sort()).toEqual([...SANCTIONED_WRITERS]);
  });

  test("a module that only DELEGATES to recorder.writeFile is a non-writer, and the file proving it is named", () => {
    // The regression this pins. `runner.ts` contains the literal text
    // `writeFile` and imports nothing from `node:fs`; under the bare-word form
    // of the regex it was a fourth writer, which is a false positive against
    // correct code. Both halves are asserted: the text really is there, and
    // the classification is still non-writer.
    const dir = join(repoRoot, "packages/harness/src");
    const runner = join(dir, "runner.ts");
    const source = readFileSync(runner, "utf8");
    expect(source).toContain("writeFile");
    expect(source).not.toContain('from "node:fs"');
    expect(FS_WRITE_RE.test(source)).toBe(false);
  });
});

// ===========================================================================
// The runtime bypass detector
// ===========================================================================

describe("the runtime bypass detector", () => {
  test("a write that bypasses writeFile and lands directly on repo.root is invisible to `writes` but visible as a worktree change", async () => {
    const { report } = await runScenario("bypass", async (ctx) => {
      // Legal HERE: the lint population above is packages/*/src/, so a test
      // file writing directly is not a seam violation of that lint -- it is
      // the deliberate bypass this detector exists to catch.
      writeFileSync(join(ctx.repo.root, SEED_PATH), DIFFERENT_BYTES, "utf8");
    });

    expect(report.writes).toEqual([]);
    expect(report.after.dirty).toBe(true);

    const evidence = mutationEvidence(report);
    expect(evidence.some((line) => line.includes("wrote outside the recorder's seam"))).toBe(true);

    // STATED HONESTLY: this detector CANNOT see an identical-bytes bypass. A
    // bypass writing the SAME bytes back leaves head, tree and dirty status
    // all unchanged -- the exact blindness `recorder.writeFile` exists to
    // cover, and no worktree-observable check can close it.
  });
});

// ===========================================================================
// checkWritePath refuses for three distinct, separately identifiable reasons
// ===========================================================================

describe("checkWritePath refuses for three distinct, separately identifiable reasons", () => {
  const cases = [
    { kind: "not-a-string", path: 42 },
    { kind: "absolute-path", path: "/etc/passwd" },
    { kind: "escapes-fixture", path: "../outside.md" },
  ] as const;

  test("all three refusal kinds are exercised, and the roster is non-empty", () => {
    expect(cases.length).toBeGreaterThan(0);
    const kinds = new Set(cases.map((c) => c.kind));
    expect(kinds.size).toBe(cases.length); // no duplicate coverage
  });

  for (const c of cases) {
    test(`"${c.kind}" is reported as itself and not as any other kind`, () => {
      const check = checkWritePath(c.path);
      expect(check.ok).toBe(false);
      if (check.ok) return;
      expect(check.refusal.kind).toBe(c.kind);

      // Distinctness: the message must not be reachable from another kind.
      const others = cases.filter((o) => o.kind !== c.kind);
      for (const other of others) {
        const otherCheck = checkWritePath(other.path);
        if (otherCheck.ok) continue;
        expect(otherCheck.refusal.message).not.toBe(check.refusal.message);
      }
    });
  }
});

// ===========================================================================
// The window is a state machine with distinct refusals
// ===========================================================================

describe("the window is a state machine with distinct refusals", () => {
  test("writeFile before begin() and end() before begin() throw MutationRecorderError, with two different messages", async () => {
    const recorder = createMutationRecorder({ port: createFakeForge() });

    let writeCaught: unknown;
    try {
      recorder.writeFile(SEED_PATH, SEED_BYTES);
    } catch (error) {
      writeCaught = error;
    }
    expect(writeCaught).toBeInstanceOf(MutationRecorderError);
    const writeMessage = (writeCaught as Error).message;

    let endCaught: unknown;
    try {
      await recorder.end();
    } catch (error) {
      endCaught = error;
    }
    expect(endCaught).toBeInstanceOf(MutationRecorderError);
    const endMessage = (endCaught as Error).message;

    expect(writeMessage).not.toBe(endMessage);

    // Distinctness: each refusal's own phrase is absent from the other's
    // message -- two messages that differ only in the value they quote are
    // one message (references/verification.md:123-129).
    const WRITE_PHRASE = "the write window is not open";
    const END_PHRASE = "end() was called before begin()";
    expect(writeMessage).toContain(WRITE_PHRASE);
    expect(endMessage).toContain(END_PHRASE);
    expect(writeMessage).not.toContain(END_PHRASE);
    expect(endMessage).not.toContain(WRITE_PHRASE);
  });
});
