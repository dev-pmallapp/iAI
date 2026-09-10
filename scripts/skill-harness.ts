// The anti-vacuity harness CLI. Step C of #322.
//
// A THIN WRAPPER, in the shape scripts/skill-lint.ts's own `main()` uses:
// `repoRoot` from `import.meta.dir`, args sliced off `process.argv`, an
// existence check with its own distinct exit-1 message, then a report
// printed and `process.exit(...)`.
//
// THIS IS THE ONLY PLACE A FILE IS WRITTEN. packages/harness/src/runner.ts's
// own header says `renderArtifact` "RETURNS a string" and that writing it is
// "a `scripts/` wrapper's job, in a later step" -- this is that step, and
// `packages/harness/src` may not gain a fourth writer for it (the recorder's
// `writeFile`, `fixture-repo.ts`'s git plumbing, and now this file's single
// `writeFileSync` call are the only three byte-writing sites in this whole
// harness).
//
// THE VERDICT CANNOT BE LAUNDERED HERE. `decideVerdict` (runner.ts) is the
// one pure function that turns typed observations into an exit code; this
// wrapper reads `verdict.exitCode` and passes it straight to `process.exit`.
// There is no branch, no recomputation, no grepping of `renderReport`'s own
// output for a success phrase -- that would be exactly the shape case 22 of
// packages/harness/test/runner.test.ts exists to catch. This wrapper's only
// jobs are I/O: build the roster's temp dirs, run it, write the artifact,
// print the report, exit with the number the pure function already decided.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRealPort } from "../packages/exec/src/index";
import { createTempDirs, renderArtifact, renderReport, runHarness, SCENARIO_ROSTER } from "../packages/harness/src/index";

const DEFAULT_OUT_RELATIVE = join(".harness", "skill-harness-report.json");

interface ParsedArgs {
  readonly skillsDir: string;
  readonly out: string;
}

function parseArgs(argv: readonly string[], repoRoot: string): ParsedArgs {
  let skillsDir = join(repoRoot, "skills");
  let out = join(repoRoot, DEFAULT_OUT_RELATIVE);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skills-dir") {
      const value = argv[i + 1];
      if (value === undefined) {
        console.error("skill-harness: --skills-dir requires a path argument");
        process.exit(1);
      }
      skillsDir = resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined) {
        console.error("skill-harness: --out requires a path argument");
        process.exit(1);
      }
      out = resolve(value);
      i += 1;
      continue;
    }
  }

  return { skillsDir, out };
}

async function main(): Promise<void> {
  const repoRoot = join(import.meta.dir, "..");
  const args = parseArgs(process.argv.slice(2), repoRoot);

  if (!existsSync(args.skillsDir)) {
    console.error(`skill-harness: skills directory does not exist: ${args.skillsDir}`);
    process.exit(1);
  }

  const temps = createTempDirs();
  let exitCode: 0 | 1;
  try {
    const verdict = await runHarness({
      roster: SCENARIO_ROSTER,
      skillsDir: args.skillsDir,
      temps,
      makePort: () => createRealPort(),
    });

    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, renderArtifact(verdict), "utf8");

    console.log(renderReport(verdict));
    console.log(`skill-harness: artifact written to ${args.out}`);

    exitCode = verdict.exitCode;
  } finally {
    // `process.exit` below is called AFTER this finally has run -- calling
    // it from inside the try, as an earlier draft of this file did, meant
    // `finally` never ran at all: `process.exit` does not unwind through
    // pending `finally` blocks, so `temps.cleanup()` would silently never
    // fire and every real run would leak its temp directories.
    temps.cleanup();
  }
  process.exit(exitCode);
}

if (import.meta.main) {
  await main();
}
