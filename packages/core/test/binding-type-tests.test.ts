import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Case 2 (P0, CLAIM-31.1), the type-level half. Decision 1 of
// docs/design/stories/31.md opens the `id` union so that `nullBinding` and a
// sixth domain are expressible; the risk of a widening is that it widens too
// far, and a runtime test cannot see that at all.
//
// The harness is the one already established by decision-type-tests.test.ts for
// docs/test-plans/15-plan.md's cases 30 and 31, and it runs `tsc` TWICE against
// each negative fixture for the reason recorded there: a bare
// `@ts-expect-error` is satisfied by ANY error on the next line, not only the
// one the case is naming. So each negative runs once with the directive
// stripped, to capture and assert the specific diagnostic, and once with it in
// place, to prove the fixture compiles only because that exact error was
// expected.
//
// `packages/core/type-tests` is excluded from packages/core/tsconfig.json
// (which includes only `src`) and from the root tsconfig.json, so none of this
// reaches the normal build.

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

describe("binding — case 2 (P0, CLAIM-31.1): the open union accepts what CLAIM-31.3 needs", () => {
  test(
    "an id outside the five compiles against DomainId",
    () => {
      // `nullBinding`'s id and a hypothetical sixth domain. Without Decision 1
      // neither is expressible, and CLAIM-31.3 is unsatisfiable.
      const result = runTsc(join(fixturesDir, "binding-valid-open-id.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );

  test(
    "every documented binding literal still compiles after the readonly narrowing",
    () => {
      // The worked example from docs/design/01-skill-hierarchy.md:238-331 as a
      // plain mutable literal, plus a gate with neither optional field. If a
      // future edit made any field invariant, this is what fails.
      const result = runTsc(join(fixturesDir, "binding-valid-documented-literal.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );
});

describe("binding — case 2 (P0, CLAIM-31.1): the widening does not widen too far", () => {
  test(
    "a non-member assigned to KnownDomainId is TS2820, and the compiler still suggests the right member",
    () => {
      const generated = stripDirective("binding-invalid-known-id.ts");
      const result = runTsc(generated);
      expect(result.exitCode).not.toBe(0);

      // TS2820 rather than the TS2322 this case was first written to expect,
      // and the difference is worth keeping. TS2820 is the "did you mean"
      // diagnostic tsc emits only for a CLOSED string-literal union — it is the
      // compiler demonstrating that it still knows the five members and can
      // suggest one. That is precisely the property Decision 1 claims survives
      // the widening ("an editor still completes the five"), and asserting the
      // suggestion proves it more directly than a plain assignability error
      // would.
      expect(result.output).toContain("TS2820");
      expect(result.output).toContain('"helth"');
      expect(result.output).toContain("KnownDomainId");
      expect(result.output).toContain(`Did you mean '"health"'`);
    },
    30000,
  );

  test(
    "that fixture with the directive in place compiles cleanly, proving the directive matches exactly that error",
    () => {
      const result = runTsc(join(fixturesDir, "binding-invalid-known-id.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );

  test(
    "evidenceRequired: false is TS2322 against the literal type true",
    () => {
      // This is the fixture that proves CLAIM-31.4's second half is unreachable
      // from well-typed code, which is why #33 must build its runtime fixture
      // through a cast (Decision 4). If someone widens the field to `boolean`
      // to make that check reachable, this case is what stops them.
      const generated = stripDirective("binding-invalid-evidence-required.ts");
      const result = runTsc(generated);
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain("TS2322");
      // The diagnostic names the types, not the field: "Type 'false' is not
      // assignable to type 'true'". Asserting the field name instead would
      // have passed on any TS2322 anywhere in the fixture, which is the same
      // over-broad matching the two-run harness exists to prevent.
      expect(result.output).toContain("Type 'false' is not assignable to type 'true'");
      expect(result.output).toContain("binding-invalid-evidence-required");
    },
    30000,
  );

  test(
    "that fixture with the directive in place compiles cleanly, proving the directive matches exactly that error",
    () => {
      const result = runTsc(join(fixturesDir, "binding-invalid-evidence-required.ts"));
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe("");
    },
    30000,
  );
});
