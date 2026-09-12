// The live rung: build target 8 of docs/design/stories/293.md. Task #324.
//
// WHAT THIS SCRIPT IS, AND EQUALLY WHAT IT IS NOT.
//
// `bun run skill-harness` (scripts/skill-harness.ts) runs the OTHER
// population -- the harness's own TRANSCRIPTION of a skill, against a FAKE
// forge, never the model reading the markdown (gate ruling G2). This script
// is the live rung's population: a MODEL reads a `SKILL.md` and performs it,
// against a REAL forge. The model is driven by a human operator's agent
// host, NOT by this script. So this script's job is NOT to execute a skill;
// it is to be the RECORDING SEAM the operator drives every command through,
// so a real, model-driven run produces an honest, machine-checked artifact.
// That is why it is subcommand-shaped (init / mark / exec / report) rather
// than a single run: the operator drives it, one command at a time, over
// however long the model takes.
//
// THE SHAPE, MATCHING scripts/skill-harness.ts's OWN THIN-WRAPPER PATTERN.
// `repoRoot` from `import.meta.dir`, never `process.cwd()` (lint rule
// `no-process-cwd`, though scripts/ sits outside the linted project). Each
// subcommand computes an exit code and returns it; `main()` calls
// `process.exit(exitCode)` LAST, after any `finally` has already run --
// `process.exit` does not unwind a pending `finally` (skill-harness.ts's own
// header explains the leaked-temp-dir failure mode that shape prevents).
//
// A SESSION IS A DIRECTORY, NOT A PROCESS. Because a live run is driven by a
// human across many separate commands (the model calls `exec` once per tool
// call it makes), state cannot live in this process's memory: it must be a
// directory on disk holding a header file (`header.json`) and an append-only
// JSONL log (`log.jsonl`), so any of the four subcommands can be invoked as
// its own process at any time and still see the whole history so far.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Destination } from "../packages/core/src/index";
import { ALLOWED_EXECUTABLES, createRealPort, createRecordingPort, type RecordedCall } from "../packages/exec/src/index";
import {
  type ArgvKind,
  classifyArgv,
  countReads,
  createFixtureRepo,
  isMutatingGhArgv,
  LiveEgressRefusal,
  admitToLiveModel,
  renderGoalsFixture,
} from "../packages/harness/src/index";

// ---------------------------------------------------------------------------
// The egress gate's fixed inputs.
// ---------------------------------------------------------------------------

// A cloud destination -- the one a live model call actually reaches. Vendor
// name is illustrative only; `checkEgress` (packages/core/src/guards/
// egress.ts) does not branch on it, only on `locality` and the payload's own
// class.
const CLOUD_DESTINATION: Destination = { vendor: "live-rung-cloud-model", locality: "cloud" };

// The declared-synthetic goals fixture (#319, packages/harness/src/
// goals-fixture.ts) wrapped in a payload keyed `work_state` -- one of the
// INTERNAL_KEY_TOKENS packages/core/src/classify/recognisers.ts recognises,
// so this classifies INTERNAL (project code / work state), never PRIVATE,
// and clears the cloud gate. This is a DELIBERATE CHOICE OF KEY, not an
// accident: `classify()`'s own default rule is that an UNRECOGNISED key
// resolves PRIVATE (packages/core/src/classify/classify.ts's header), so a
// goals payload wrapped under some other, unrecognised key would be refused
// here for the wrong reason -- not because it is unsafe, but because this
// script picked a key the classifier has never heard of. `work_state` is the
// one INTERNAL key whose plain-English meaning ("work state") actually
// describes a goals document.
// Computed ONCE, here -- the payload the egress gate checks below and the
// file this script later writes into the fixture worktree (`cmdInit`'s own
// `USER/GOALS/GOALS.md`) are PROVABLY the same string, never two
// hand-authored `renderGoalsFixture({ goals: [...] })` literals that could
// drift apart. This is the exact same discipline `userDerivedPayload`'s own
// comment argues for below; test/live-rung.test.ts asserts
// `renderGoalsFixture` is called exactly once in this file for that reason.
const SYNTHETIC_GOALS_TEXT = renderGoalsFixture({ goals: ["ship the live rung's recording seam (Task #324)"] });

function syntheticGoalsPayload(): unknown {
  return { work_state: SYNTHETIC_GOALS_TEXT };
}

// A `USER/`-derived payload: PRIVATE by the fail-safe path rule
// (packages/core/src/classify/path.ts's `USER/` rule, CLAIM-15.2), built to
// the exact same shape packages/harness/test/live-egress.test.ts's own
// `USER_DERIVED_PAYLOAD` uses, so this script's demonstration and that
// suite's unit tests are provably the same fixture rather than two
// hand-authored strings that could drift apart. Synthetic, never a real
// private-repo path -- `USER/` cannot be committed to a public tree at all,
// so there is no real fixture this could be instead.
//
// `USER/`-derived content is `PRIVATE` by fail-safe default and reaches no
// cloud model **under any consent** (packages/core/src/guards/egress.ts's
// Decision 2 of docs/design/stories/243.md) -- PROVIDED IT REACHES THE GATE
// under a key `classify()` has never heard of, or one this table maps to
// PRIVATE/SECRET. THE EGRESS GATE IS NOT WHAT STOPS A LIVE RUN OF
// `goal-create` AGAINST THE REAL GOALS SOURCE: a real `USER/GOALS/GOALS.md`,
// wrapped in the exact same `work_state` key `syntheticGoalsPayload` above
// uses, would classify INTERNAL and clear the gate exactly as the synthetic
// fixture does -- `classify()` resolves purely by KEY NAME
// (packages/core/src/classify/recognisers.ts), it never inspects a string
// value's content for an embedded `USER/` path, so `classifyPath`'s own
// `USER/`-root rule (path.ts, CLAIM-15.2) is not even wired into `classify()`
// today. What actually stops a run against the real source is narrower and
// duller: the goals payload above is built from `renderGoalsFixture` with no
// flag, argument or code path that can redirect it to a real file. Two
// different protections guarding two different things -- conflating them
// would leave a hole nobody is watching.
function userDerivedPayload(): unknown {
  return { source_path: "USER/HEALTH/labs.yaml", contents: "synthetic-only, not a real record" };
}

// ---------------------------------------------------------------------------
// Session file shapes.
// ---------------------------------------------------------------------------

interface SessionHeader {
  readonly repo: string;
  readonly fixtureRoot: string;
  readonly resolvedCommit: string;
  readonly startedAt: string;
  readonly host: string;
}

interface MarkRecord {
  readonly kind: "mark";
  readonly run: 1 | 2;
  readonly at: string;
}

interface ExecRecord {
  readonly kind: "exec";
  readonly run: 1 | 2;
  readonly argv: readonly string[];
  readonly exitCode: number;
  readonly at: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
}

type LogRecord = MarkRecord | ExecRecord;

function headerPath(sessionDir: string): string {
  return join(sessionDir, "header.json");
}

function logPath(sessionDir: string): string {
  return join(sessionDir, "log.jsonl");
}

function loadHeader(sessionDir: string): SessionHeader {
  const path = headerPath(sessionDir);
  if (!existsSync(path)) {
    throw new Error(
      `session not initialized: no header.json found at ${sessionDir}; run \`bun run live-rung init\` first`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as SessionHeader;
}

function readLog(sessionDir: string): readonly LogRecord[] {
  const path = logPath(sessionDir);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogRecord);
}

function appendLog(sessionDir: string, record: LogRecord): void {
  appendFileSync(logPath(sessionDir), `${JSON.stringify(record)}\n`, "utf8");
}

/** The run every subsequent `exec` belongs to: the LAST `mark` record seen,
 *  scanned from the log itself rather than trusted from caller state, so
 *  `exec` and `report` can never disagree with what actually happened. */
function lastMarkedRun(records: readonly LogRecord[]): 1 | 2 | undefined {
  let last: 1 | 2 | undefined;
  for (const record of records) {
    if (record.kind === "mark") last = record.run;
  }
  return last;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

function extractFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

async function cmdInit(argv: readonly string[], repoRoot: string): Promise<number> {
  // ===========================================================================
  // THE EGRESS GATE RUNS HERE, FIRST, BEFORE ANYTHING ELSE -- before argument
  // validation, before touching the filesystem, before anything a caller
  // could construe as "the run has begun". A gate that ran after setup could
  // leave a half-built session behind it on refusal; this one leaves nothing.
  // ===========================================================================

  // TEST-ONLY SEAM. `--force-private-goals-payload` is not documented in
  // `printUsage()` and no operator should ever pass it: it substitutes the
  // USER/-derived (PRIVATE) payload for the declared-synthetic goals fixture
  // in THIS FIRST gate check only (the converse demonstration below is
  // unaffected), so test/live-rung.test.ts can drive the "the payload does
  // not clear the gate" branch without this script inventing a second,
  // untested code path to do it.
  const goalsPayload = argv.includes("--force-private-goals-payload") ? userDerivedPayload() : syntheticGoalsPayload();
  try {
    const admitted = admitToLiveModel(goalsPayload, CLOUD_DESTINATION);
    console.log(
      `live-rung init: egress gate ADMITTED the declared-synthetic goals fixture ` +
        `(class ${admitted.dataClass}, destination ${CLOUD_DESTINATION.locality}/${CLOUD_DESTINATION.vendor})`,
    );
  } catch (error) {
    if (!(error instanceof LiveEgressRefusal)) throw error;
    console.error(
      `live-rung init: REFUSED to start -- the egress gate blocked the declared-synthetic goals ` +
        `fixture itself (class ${error.dataClass}): ${error.message}. Creating nothing.`,
    );
    return 1;
  }

  // THE CONVERSE, DEMONSTRATED ON THE SAME LIVE PATH. A gate that cannot be
  // shown refusing something is not a gate -- it is an unexercised branch.
  const userPayload = userDerivedPayload();
  try {
    admitToLiveModel(userPayload, CLOUD_DESTINATION);
    // Reaching this line means the gate FAILED to refuse a USER/-derived,
    // PRIVATE-by-fail-safe-default payload against a cloud destination. That
    // is the security defect NEVER-293.10 exists to catch, and it is fatal
    // to the whole live rung: refuse to start rather than proceed under a
    // gate just shown not to work.
    console.error(
      "live-rung init: REFUSED to start -- the egress gate did NOT refuse a USER/-derived payload " +
        "against a cloud destination. A gate that cannot be shown refusing on the live path is not a " +
        "gate. Creating nothing.",
    );
    return 1;
  } catch (error) {
    if (!(error instanceof LiveEgressRefusal)) throw error;
    console.log(
      `live-rung init: egress gate correctly REFUSED a USER/-derived payload ` +
        `(class ${error.dataClass}): ${error.message}`,
    );
  }

  // ===========================================================================
  // Everything below this line only runs once both gate demonstrations above
  // have completed exactly as required.
  // ===========================================================================

  const session = extractFlag(argv, "--session");
  const repo = extractFlag(argv, "--repo");
  const host = extractFlag(argv, "--host");

  if (session === undefined) {
    console.error("live-rung init: --session <dir> is required");
    return 1;
  }
  if (repo === undefined) {
    console.error("live-rung init: --repo <OWNER/NAME> is required");
    return 1;
  }
  // `host` IS AN INPUT, NEVER DETECTED. It names the agent host driving the
  // model (e.g. "opencode", "claude-code" -- references/model-routing.md
  // :30-32's sense of "host"), not a machine hostname, and there is no
  // reliable way for this process to infer which agent host is calling it.
  // An omitted `--host` is refused rather than defaulted, so a session
  // header can never silently attribute a run to the wrong host.
  if (host === undefined) {
    console.error(
      "live-rung init: --host <name> is required (the AGENT HOST driving the model, e.g. " +
        '"opencode" -- references/model-routing.md:30-32 -- never a machine hostname, and never guessed)',
    );
    return 1;
  }

  if (existsSync(headerPath(session))) {
    console.error(`live-rung init: session already initialized at ${session} (header.json exists)`);
    return 1;
  }

  mkdirSync(session, { recursive: true });

  const adminPort = createRealPort();

  const resolvedCommitResult = await adminPort.run(["git", "-C", repoRoot, "rev-parse", "HEAD"]);
  if (resolvedCommitResult.exitCode !== 0) {
    console.error(
      `live-rung init: failed to resolve this repository's own HEAD commit: ${resolvedCommitResult.stderr.trim()}`,
    );
    return 1;
  }
  const resolvedCommit = resolvedCommitResult.stdout.trim();

  const fixtureRoot = mkdtempSync(join(tmpdir(), "iai-live-rung-fixture-"));
  await createFixtureRepo(adminPort, fixtureRoot, {
    name: "live-rung-init",
    files: [
      {
        path: "USER/GOALS/GOALS.md",
        contents: SYNTHETIC_GOALS_TEXT,
      },
    ],
  });

  const header: SessionHeader = {
    repo,
    fixtureRoot,
    resolvedCommit,
    startedAt: new Date().toISOString(),
    host,
  };
  writeFileSync(headerPath(session), `${JSON.stringify(header, null, 2)}\n`, "utf8");
  writeFileSync(logPath(session), "", "utf8");

  console.log(`live-rung init: session ready at ${session}`);
  console.log(`live-rung init: fixture worktree at ${fixtureRoot}`);
  console.log(`live-rung init: resolved commit ${resolvedCommit}`);
  console.log(`live-rung init: target repo ${repo}, host ${host}`);
  return 0;
}

// ---------------------------------------------------------------------------
// mark
// ---------------------------------------------------------------------------

function cmdMark(argv: readonly string[]): number {
  const session = extractFlag(argv, "--session");
  const runRaw = extractFlag(argv, "--run");

  if (session === undefined) {
    console.error("live-rung mark: --session <dir> is required");
    return 1;
  }
  if (runRaw === undefined) {
    console.error("live-rung mark: --run <1|2> is required");
    return 1;
  }
  if (runRaw !== "1" && runRaw !== "2") {
    console.error(`live-rung mark: --run must be exactly "1" or "2"; got "${runRaw}"`);
    return 1;
  }
  const run = runRaw === "1" ? 1 : 2;

  let header: SessionHeader;
  try {
    header = loadHeader(session);
  } catch (error) {
    console.error(`live-rung mark: ${(error as Error).message}`);
    return 1;
  }
  void header; // existence of the header is the only thing this needs to check.

  const records = readLog(session);
  const last = lastMarkedRun(records);
  if (last !== undefined && run < last) {
    console.error(
      `live-rung mark: refusing to go backwards -- run ${last} was already marked, cannot mark run ${run}`,
    );
    return 1;
  }

  appendLog(session, { kind: "mark", run, at: new Date().toISOString() });
  console.log(`live-rung mark: run ${run} begins`);
  return 0;
}

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------

async function cmdExec(argv: readonly string[]): Promise<number> {
  const sepIndex = argv.indexOf("--");
  if (sepIndex === -1) {
    console.error('live-rung exec: expected `--` separating flags from the argv to run, e.g. `exec --session S -- gh issue list`');
    return 1;
  }
  const flags = argv.slice(0, sepIndex);
  const childArgv = argv.slice(sepIndex + 1);

  const session = extractFlag(flags, "--session");
  if (session === undefined) {
    console.error("live-rung exec: --session <dir> is required");
    return 1;
  }
  if (childArgv.length === 0) {
    console.error("live-rung exec: no argv given to run after `--`");
    return 1;
  }

  let header: SessionHeader;
  try {
    header = loadHeader(session);
  } catch (error) {
    console.error(`live-rung exec: ${(error as Error).message}`);
    return 1;
  }

  const records = readLog(session);
  const run = lastMarkedRun(records);
  if (run === undefined) {
    console.error("live-rung exec: no run has been marked yet; run `live-rung mark --session <dir> --run 1` first");
    return 1;
  }

  // A mutating `gh` argv is refused unless the session header names a target
  // repo. REUSES `isMutatingGhArgv` (packages/harness/src/fake-forge.ts) --
  // the ONE mutation classifier this whole harness shares, never restated.
  if (childArgv[0] === "gh" && isMutatingGhArgv(childArgv) && (header.repo === undefined || header.repo === null || header.repo.length === 0)) {
    console.error(
      `live-rung exec: refusing to run \`${childArgv.join(" ")}\` -- this is a MUTATING gh argv and the ` +
        "session header names no target repo. A live mutation against an unnamed forge is exactly the " +
        "kind of accident this seam exists to prevent.",
    );
    return 1;
  }

  // THE REAL PORT. Executables outside packages/exec/src/port.ts's
  // `ALLOWED_EXECUTABLES` are refused by `checkArgv` inside `createRealPort`
  // itself (exit code `REFUSED_EXIT_CODE`, 126) -- this script does not
  // reimplement that check, it inherits it by routing every argv through the
  // real port rather than through a second launcher. `ALLOWED_EXECUTABLES`
  // is imported above only so this comment, and the reader, can name it.
  void ALLOWED_EXECUTABLES;

  const port = createRecordingPort(createRealPort());
  const result = await port.run(childArgv);

  // PASS STDOUT/STDERR THROUGH TO THE CALLER, UNCHANGED. The operator must
  // see exactly what a real `gh` (or `git`) said, including a rejection --
  // this is the first-contact record for #330, and a summarised or
  // reformatted echo would already be a lossy transcription of the one
  // thing this command exists to observe honestly.
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  // DO NOT LOG stdout/stderr CONTENTS. A real forge response can carry
  // content this repository has no classification for -- an issue body, a
  // PR diff, an error message quoting a private field name -- and this
  // script has no classifier in its own path (that is `packages/core/src/
  // classify`'s job, and it is not consulted here). Logging only the BYTE
  // LENGTH of each stream lets `report` show how much came back without
  // ever writing a byte of it to disk a second time.
  appendLog(session, {
    kind: "exec",
    run,
    argv: childArgv,
    exitCode: result.exitCode,
    at: new Date().toISOString(),
    stdoutBytes: Buffer.byteLength(result.stdout, "utf8"),
    stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
  });

  return result.exitCode;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const ARGV_KINDS: readonly ArgvKind[] = ["forge-read", "forge-mutation", "git-read", "git-write", "unclassified"];

interface RunStats {
  readonly totalCalls: number;
  readonly reads: number;
  readonly mutations: number;
  readonly kinds: Readonly<Record<ArgvKind, number>>;
}

function computeRunStats(calls: readonly RecordedCall[]): RunStats {
  const kinds: Record<ArgvKind, number> = {
    "forge-read": 0,
    "forge-mutation": 0,
    "git-read": 0,
    "git-write": 0,
    unclassified: 0,
  };
  for (const call of calls) {
    kinds[classifyArgv(call.argv)] += 1;
  }
  return {
    totalCalls: calls.length,
    // REUSES `countReads` (packages/harness/src/argv-kind.ts) rather than
    // `calls.length - mutations`, per that module's own header: a `git`
    // write call is neither a forge mutation nor a read, and the
    // subtraction would misscore it as a read.
    reads: countReads(calls),
    mutations: calls.filter((call) => isMutatingGhArgv(call.argv)).length,
    kinds,
  };
}

interface NonZeroExit {
  readonly argv: readonly string[];
  readonly exitCode: number;
}

interface LiveRungArtifact {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly session: SessionHeader;
  // `null` unless `--token-cost` was supplied. STRUCTURALLY IMPOSSIBLE for
  // this field to assert a cost nobody measured: there is exactly one
  // assignment site for this field (below) and it is guarded by the
  // presence of the flag, never inferred or defaulted to zero.
  readonly tokenCost: number | null;
  readonly runs: Readonly<Record<string, RunStats>>;
  readonly overall: RunStats;
  // The first-contact record for #330: every DISTINCT argv that exited
  // non-zero, with its exit code. This is the most valuable output of the
  // whole command -- the S2.1 precedent is sixty passing tests and 7 of 9
  // real verbs rejected on first contact, so a live session with zero
  // entries here is the surprising result, not the expected one.
  readonly nonZeroExits: readonly NonZeroExit[];
}

function renderRunStatsLine(label: string, stats: RunStats): string {
  const kindsText = ARGV_KINDS.map((kind) => `${kind}=${stats.kinds[kind]}`).join(", ");
  return `  ${label}: ${stats.totalCalls} calls, ${stats.reads} reads, ${stats.mutations} gh mutations (${kindsText})`;
}

function renderReportText(artifact: LiveRungArtifact): string {
  const lines: string[] = [];
  lines.push("live rung report");
  lines.push(`  session repo: ${artifact.session.repo}`);
  lines.push(`  session host: ${artifact.session.host}`);
  lines.push(`  fixture root: ${artifact.session.fixtureRoot}`);
  lines.push(`  resolved commit: ${artifact.session.resolvedCommit}`);
  lines.push(`  started at: ${artifact.session.startedAt}`);
  lines.push("");
  lines.push("per run:");
  const runKeys = Object.keys(artifact.runs).sort();
  if (runKeys.length === 0) {
    lines.push("  (no run has been marked yet)");
  } else {
    for (const key of runKeys) {
      lines.push(renderRunStatsLine(`run ${key}`, artifact.runs[key] as RunStats));
    }
  }
  lines.push(renderRunStatsLine("overall", artifact.overall));
  lines.push("");
  // `tokenCost` says so IN WORDS when null -- a bare `null` in prose reads
  // as a typo, not a deliberate absence.
  lines.push(
    artifact.tokenCost === null
      ? "token cost: not supplied (pass --token-cost <n> to record a measured cost)"
      : `token cost: ${artifact.tokenCost}`,
  );
  lines.push("");
  if (artifact.nonZeroExits.length === 0) {
    lines.push("non-zero exits: none recorded");
  } else {
    lines.push(`non-zero exits (${artifact.nonZeroExits.length} distinct argv):`);
    for (const entry of artifact.nonZeroExits) {
      lines.push(`  exit ${entry.exitCode}: ${entry.argv.join(" ")}`);
    }
  }
  return lines.join("\n");
}

async function cmdReport(argv: readonly string[]): Promise<number> {
  const session = extractFlag(argv, "--session");
  const out = extractFlag(argv, "--out");
  const tokenCostRaw = extractFlag(argv, "--token-cost");

  if (session === undefined) {
    console.error("live-rung report: --session <dir> is required");
    return 1;
  }

  let header: SessionHeader;
  try {
    header = loadHeader(session);
  } catch (error) {
    console.error(`live-rung report: ${(error as Error).message}`);
    return 1;
  }

  // `tokenCost` is `null` UNLESS `--token-cost` is supplied -- there is no
  // other way for this variable to become a number below, so the artifact
  // can never assert a cost nobody measured.
  let tokenCost: number | null = null;
  if (tokenCostRaw !== undefined) {
    const parsed = Number(tokenCostRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      console.error(
        `live-rung report: --token-cost must be a finite, non-negative number; got "${tokenCostRaw}"`,
      );
      return 1;
    }
    tokenCost = parsed;
  }

  const records = readLog(session);
  const execRecords = records.filter((record): record is ExecRecord => record.kind === "exec");

  const byRun = new Map<number, RecordedCall[]>();
  for (const record of execRecords) {
    const calls = byRun.get(record.run) ?? [];
    calls.push({ argv: record.argv, exitCode: record.exitCode });
    byRun.set(record.run, calls);
  }

  const runs: Record<string, RunStats> = {};
  for (const [run, calls] of [...byRun.entries()].sort((a, b) => a[0] - b[0])) {
    runs[String(run)] = computeRunStats(calls);
  }

  const allCalls: RecordedCall[] = execRecords.map((record) => ({ argv: record.argv, exitCode: record.exitCode }));
  const overall = computeRunStats(allCalls);

  // DISTINCT by argv, keeping the MOST RECENT exit code observed for it --
  // a live session where the operator retried the same command after fixing
  // something should report the latest outcome, not the first.
  const nonZeroByArgv = new Map<string, NonZeroExit>();
  for (const record of execRecords) {
    if (record.exitCode === 0) continue;
    nonZeroByArgv.set(JSON.stringify(record.argv), { argv: record.argv, exitCode: record.exitCode });
  }

  const artifact: LiveRungArtifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    session: header,
    tokenCost,
    runs,
    overall,
    nonZeroExits: [...nonZeroByArgv.values()],
  };

  const outPath = out ?? join(session, "report.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(renderReportText(artifact));
  console.log(`live-rung report: artifact written to ${outPath}`);

  // THE REPORT COMMAND'S EXIT CODE IS ABOUT REPORTING, NOT ABOUT WHETHER THE
  // RUN WAS CLEAN. It returns 0 whenever the artifact was produced, even
  // when `nonZeroExits` is non-empty or a run mutated nothing -- a future
  // reader will be tempted to make this fail on a rejection so CI "catches"
  // it, and that would DESTROY THE RECORD: the live rung is never a required
  // check (NEVER-293.10), and a report command that refuses to finish over
  // a rejected verb would make exactly the first-contact rejections this
  // command exists to surface disappear behind a nonzero exit nobody reads
  // past.
  return 0;
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`live-rung: the recording seam for a real, model-driven skill run against a real forge.

Never executes a skill itself -- a human operator's agent host drives the
model, and every command the model issues is routed through \`exec\` below so
it is recorded honestly. Never a required CI check (NEVER-293.10).

USAGE:
  bun run live-rung init   --session <dir> --repo <OWNER/NAME> --host <name>
  bun run live-rung mark   --session <dir> --run <1|2>
  bun run live-rung exec   --session <dir> -- <argv...>
  bun run live-rung report --session <dir> [--out <path>] [--token-cost <n>]

init    Runs the egress gate against the declared-synthetic goals fixture
        (must be admitted) and against a USER/-derived payload (must be
        refused), THEN creates a real git fixture worktree and writes the
        session header. Creates nothing if either gate check is wrong.

mark    Records a run boundary (1 or 2). Every subsequent \`exec\` belongs to
        that run until the next \`mark\`. Refuses a non-1/2 run index and
        refuses going backwards.

exec    Runs <argv...> through the REAL port (packages/exec/src/real.ts).
        Refuses an executable outside packages/exec/src/port.ts's
        ALLOWED_EXECUTABLES, and refuses a mutating \`gh\` argv when the
        session has no target repo. Passes the child's stdout/stderr through
        unchanged and exits with the child's exit code. Logs the argv, exit
        code, run index and byte lengths of stdout/stderr -- never their
        contents.

report  Reads the session log and emits a JSON artifact plus a human-readable
        summary: per-run and overall call/read/mutation counts, the measured
        token cost (or an explicit "not supplied"), and every DISTINCT argv
        that exited non-zero. Exits 0 whenever the artifact was produced,
        regardless of what it reports.
`);
}

async function main(): Promise<void> {
  const repoRoot = join(import.meta.dir, "..");
  const [subcommand, ...rest] = process.argv.slice(2);

  let exitCode: number;
  switch (subcommand) {
    case "init":
      exitCode = await cmdInit(rest, repoRoot);
      break;
    case "mark":
      exitCode = cmdMark(rest);
      break;
    case "exec":
      exitCode = await cmdExec(rest);
      break;
    case "report":
      exitCode = await cmdReport(rest);
      break;
    case "--help":
    case "-h":
      printUsage();
      exitCode = 0;
      break;
    case undefined:
      printUsage();
      exitCode = 1;
      break;
    default:
      console.error(`live-rung: unknown subcommand "${subcommand}"`);
      printUsage();
      exitCode = 1;
  }

  process.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
