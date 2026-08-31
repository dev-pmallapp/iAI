import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Cases 30 and 31 assert that two programs do not compile, per
// docs/design/stories/15.md's Decision 3 and the Q2 gate ruling. A bare
// `@ts-expect-error` is not enough: the directive is satisfied by *any*
// error on the next line, not only the one the case is naming — see note 1
// of docs/test-plans/15-plan.md. So each case here runs `tsc --noEmit`
// twice against the fixture: once with the directive stripped, to capture
// and assert the specific diagnostic (its TS code and the field it names);
// and once with the directive left in place, to prove the fixture compiles
// only because that exact error is expected, not because it is silent
// about something else. `packages/core/type-tests` is excluded from
// `packages/core/tsconfig.json` (which includes only `src`) and from the
// root `tsconfig.json` (which does not reference `type-tests` at all), so
// none of this reaches the normal build.

const repoRoot = join(import.meta.dir, "../../..");
const tscPath = join(repoRoot, "node_modules/.bin/tsc");
const fixturesDir = join(import.meta.dir, "../type-tests/fixtures");

const TSC_FLAGS = [
  "--noEmit",
  "--ignoreConfig",
  "--strict",
  "--target",
  "ESNext",
  "--module",
  "ESNext",
  "--moduleResolution",
  "bundler",
  "--esModuleInterop",
  "--forceConsistentCasingInFileNames",
  "--skipLibCheck",
  "--resolveJsonModule",
  "--isolatedModules",
  "--verbatimModuleSyntax",
];

function runTsc(file: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync([tscPath, ...TSC_FLAGS, file], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    output: proc.stdout.toString("utf8") + proc.stderr.toString("utf8"),
  };
}

const generatedFiles: string[] = [];

/** Writes a copy of `fixture` with every `@ts-expect-error` line removed, so
 *  the underlying error tsc would otherwise suppress becomes visible. The
 *  copy lives alongside the original so its relative import still resolves. */
function stripDirective(fixture: string): string {
  const source = readFileSync(join(fixturesDir, fixture), "utf8");
  const stripped = source
    .split("\n")
    .filter((line) => !line.includes("@ts-expect-error"))
    .join("\n");
  const generatedPath = join(fixturesDir, fixture.replace(/\.ts$/, ".no-directive.generated.ts"));
  writeFileSync(generatedPath, stripped, "utf8");
  generatedFiles.push(generatedPath);
  return generatedPath;
}

afterAll(() => {
  for (const file of generatedFiles) unlinkSync(file);
});

describe("case 30 (P1, NEVER-15.7): a warn EgressDecision does not compile", () => {
  test(
    "the specific diagnostic is TS2322 naming the warn literal against the allow|block union",
    () => {
      const generated = stripDirective("invalid-warn.ts");
      const result = runTsc(generated);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("TS2322");
      expect(result.output).toContain('"warn"');
      expect(result.output).toContain('"allow" | "block"');
    },
    30000,
  );

  test(
    "the fixture with the directive in place compiles cleanly, proving the directive matches exactly that error",
    () => {
      const result = runTsc(join(fixturesDir, "invalid-warn.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );
});

describe("case 31 (P1, NEVER-15.7 + CLAIM-15.3): a block carrying redacted does not compile", () => {
  test(
    "the specific diagnostic is TS2353 naming the excess 'redacted' property",
    () => {
      const generated = stripDirective("invalid-block-redacted.ts");
      const result = runTsc(generated);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("TS2353");
      expect(result.output).toContain("'redacted'");
    },
    30000,
  );

  test(
    "the fixture with the directive in place compiles cleanly, proving the directive matches exactly that error",
    () => {
      const result = runTsc(join(fixturesDir, "invalid-block-redacted.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );
});

describe("positive controls: the fixture setup can also pass", () => {
  test(
    "an allow decision carrying redacted compiles cleanly",
    () => {
      const result = runTsc(join(fixturesDir, "valid-allow-redacted.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );

  test(
    "a plain block decision with no redacted continuation compiles cleanly",
    () => {
      const result = runTsc(join(fixturesDir, "valid-block.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );
});
