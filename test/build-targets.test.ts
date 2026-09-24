import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BUILD_TARGETS_COLUMN,
  BUILD_TARGETS_HEADING,
  BuildTargetsParseError,
  parseBuildTargets,
} from "../packages/core/src/index";

const repoRoot = join(import.meta.dir, "..");
const DESIGNS_DIR = join(repoRoot, "docs", "design", "stories");

function designFiles(): readonly string[] {
  return readdirSync(DESIGNS_DIR).filter((f) => f.endsWith(".md"));
}

// ===========================================================================
// CASE 1 of docs/test-plans/47-plan.md — CLAIM-47.1, P0, tool-checked,
// corpus: real, every `docs/design/stories/*.md` on disk.
//
//   "Every Design parses and yields a row count, with the Design count read
//    at run time and asserted non-zero first. A Design with the section
//    removed fails."
//
// The claim this feeds was restated at the gate (G1). The seeded wording —
// one sub-issue per `binding.unitOfWork` item — is a TYPE ERROR: `UnitSpec`
// is five readonly string fields, declared singular, validated with
// `isPlainObject`. The Design's own table is the real input.
// ===========================================================================
describe("case 1 (CLAIM-47.1): the Build Targets table parses on every real Design", () => {
  // THE DENOMINATOR, FIRST AND ALONE. The plan's wording demands this
  // ordering, and it is not ceremony: every assertion below is inside a loop
  // over this corpus, and over an empty directory all of them pass while
  // proving nothing.
  test("the Design corpus is non-zero, so the loops below cannot pass vacuously", () => {
    expect(designFiles().length).toBeGreaterThan(0);
  });

  test("every Design on disk parses, and each yields at least one row", () => {
    const files = designFiles();
    expect(files.length).toBeGreaterThan(0);

    // Collected rather than asserted per-iteration, so a failure names EVERY
    // offending Design at once instead of stopping at the first. A loop that
    // throws on file 1 hides whether the problem is one Design or all twelve.
    const failures: string[] = [];
    const counts = new Map<string, number>();

    for (const file of files) {
      const body = readFileSync(join(DESIGNS_DIR, file), "utf8");
      try {
        const rows = parseBuildTargets(body);
        counts.set(file, rows.length);
      } catch (err) {
        failures.push(`${file}: ${(err as Error).message}`);
      }
    }

    expect(failures).toEqual([]);
    expect(counts.size).toBe(files.length);
    for (const [file, n] of counts) {
      expect(n, `${file} yielded no Build Targets rows`).toBeGreaterThan(0);
    }
  });

  // THE COLUMN IS FOUND BY NAME, AND THIS IS THE TEST THAT PROVES IT MATTERS.
  //
  // The corpus ships the table in more than one shape: most Designs lead with
  // `| Target | Type | Touched |`, while 41.md, 293.md and 47.md lead with a
  // `#` column, putting Target in position 2. A positional reader returns
  // "1", "2", "3" for that third of the corpus — row numbers plausible enough
  // to survive review.
  //
  // So this asserts BOTH shapes are present in the real corpus (otherwise the
  // by-name lookup is untested in practice) and that no parsed target is a
  // bare row number.
  test("both header shapes exist on disk, and no parsed target is a bare row number", () => {
    const files = designFiles();
    expect(files.length).toBeGreaterThan(0);

    let leadingHashColumn = 0;
    let targetFirst = 0;

    for (const file of files) {
      const body = readFileSync(join(DESIGNS_DIR, file), "utf8");
      const rows = parseBuildTargets(body);

      const headerLine = body
        .split("\n")
        .slice(body.split("\n").findIndex((l) => l.trim() === BUILD_TARGETS_HEADING))
        .find((l) => l.trimStart().startsWith("|")) as string;

      if (/^\|\s*#\s*\|/.test(headerLine.trim())) leadingHashColumn += 1;
      else targetFirst += 1;

      for (const row of rows) {
        expect(
          /^\d+$/.test(row.target),
          `${file} row ${String(row.position)} parsed the target as the bare number "${row.target}" — the column was read positionally`,
        ).toBe(false);
      }
    }

    // Both shapes must really be present, or the by-name lookup is only
    // exercised against one of them and the guard above is theatre.
    expect(leadingHashColumn, "no Design uses the leading-# header shape").toBeGreaterThan(0);
    expect(targetFirst, "no Design puts Target first").toBeGreaterThan(0);
  });

  test("positions are 1-based, dense, and in document order", () => {
    for (const file of designFiles()) {
      const rows = parseBuildTargets(readFileSync(join(DESIGNS_DIR, file), "utf8"));
      expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i + 1));
    }
  });
});

// ===========================================================================
// THE NEGATIVE HALF. Case 1's last sentence is "A Design with the section
// removed fails", and a parser that has never been observed to refuse is not
// a parser, it is an optimistic reader.
//
// Each fixture is derived from a REAL Design by one perturbation, so none of
// them can pass for a reason unrelated to the defect they name.
// ===========================================================================
describe("case 1 negative: a malformed Build Targets table is refused, not coped with", () => {
  function realDesign(): string {
    return readFileSync(join(DESIGNS_DIR, "47.md"), "utf8");
  }

  // Vacuity guard: the unperturbed source must parse, or every "throws"
  // assertion below could be firing on the baseline.
  test("the unperturbed Design parses, so the perturbations below are the only variable", () => {
    expect(parseBuildTargets(realDesign()).length).toBeGreaterThan(0);
  });

  // ANCHORED TO THE LINE, NOT THE SUBSTRING — and this test caught its own
  // first version doing the wrong thing. `String.replace` with a string
  // replaces the FIRST occurrence, and 47.md mentions "## Build Targets"
  // inside build target 3's own row long before the heading appears. The
  // perturbation silently edited prose, the heading survived, the Design
  // parsed, and the test read as a parser that refused to refuse.
  //
  // The `not.toBe` guard below is what turns that from a puzzle into a
  // one-line diagnosis, and it is why every perturbation in this block
  // carries one.
  test("the section removed entirely: refused", () => {
    const body = realDesign().replace(new RegExp(`^${BUILD_TARGETS_HEADING}$`, "m"), "## Something Else");
    expect(body).not.toBe(realDesign());
    expect(body).not.toContain(`\n${BUILD_TARGETS_HEADING}\n`);
    expect(() => parseBuildTargets(body)).toThrow(BuildTargetsParseError);
  });

  // THE DEFECT A TOLERANT PARSER WOULD ABSORB. Renaming the column leaves a
  // perfectly well-formed table that a positional reader parses happily and
  // silently wrong. Refusing is the whole point of looking it up by name.
  test("the Target column renamed: refused, and the message shows the header it found", () => {
    const body = realDesign().replace(`| # | ${BUILD_TARGETS_COLUMN} | Work |`, "| # | Thing | Work |");
    expect(body).not.toBe(realDesign()); // the perturbation really applied

    let message = "";
    try {
      parseBuildTargets(body);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain(BUILD_TARGETS_COLUMN);
    expect(message).toContain("Work");
  });

  test("a ragged row: refused rather than reading a neighbouring column", () => {
    const body = realDesign().replace(
      "| 3 | **A `## Build Targets` table parser**",
      "| 3 | **A `## Build Targets` table parser** | extra |",
    );
    expect(body).not.toBe(realDesign());
    expect(() => parseBuildTargets(body)).toThrow(BuildTargetsParseError);
  });

  test("the separator row removed: refused, because the header can no longer be identified", () => {
    const body = realDesign().replace("|---|---|---|---|\n", "");
    expect(body).not.toBe(realDesign());
    expect(() => parseBuildTargets(body)).toThrow(BuildTargetsParseError);
  });

  test("a header and separator with no rows: refused", () => {
    const body = `${BUILD_TARGETS_HEADING}\n\n| # | ${BUILD_TARGETS_COLUMN} |\n|---|---|\n\nprose\n`;
    expect(() => parseBuildTargets(body)).toThrow(BuildTargetsParseError);
  });

  // A LATER TABLE IN A LATER SECTION IS NOT THIS TABLE. Without the H2 stop
  // the parser would splice the Test Strategy table onto the end of this one
  // and report a row count nobody could explain.
  test("a table in the NEXT section is not absorbed into this one", () => {
    const body = [
      BUILD_TARGETS_HEADING,
      "",
      `| # | ${BUILD_TARGETS_COLUMN} |`,
      "|---|---|",
      "| 1 | only row |",
      "",
      "## Test Strategy",
      "",
      "| # | Other |",
      "|---|---|",
      "| 1 | not a build target |",
      "| 2 | nor this |",
      "",
    ].join("\n");

    const rows = parseBuildTargets(body);
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe("only row");
  });
});

// ===========================================================================
// THE H2 STOP, PINNED SEPARATELY — mutation M3 of #48 is why this exists.
//
// M3 deleted the "stop at the next `## ` heading" bound and the whole suite
// stayed green, because in every fixture above the LEADING-CONTIGUOUS-RUN
// scan happens to stop at the same place: a blank line and a heading both
// break the run.
//
// The two bounds only diverge in one shape, and it is the dangerous one: a
// `## Build Targets` section that carries NO table, followed by a later
// section that does. With the H2 stop the parser refuses, correctly. Without
// it, the section runs to the end of the document, the scan finds the FIRST
// table it meets — which belongs to another section entirely — and returns it
// as the build targets. A confident, wrong, entirely plausible answer.
//
// Same class as #323's M5: a bound that is never the binding one is
// indistinguishable from no bound at all.
// ===========================================================================
describe("case 1: the section bound is the next H2, not merely the next blank line (#48 M3)", () => {
  const EMPTY_SECTION_THEN_A_LATER_TABLE = [
    "# Story 1 Design",
    "",
    BUILD_TARGETS_HEADING,
    "",
    "This Story's targets are still being drafted.",
    "",
    "## Test Strategy",
    "",
    `| # | ${BUILD_TARGETS_COLUMN} |`,
    "|---|---|",
    "| 1 | a case, not a build target |",
    "",
  ].join("\n");

  test("a Build Targets section with no table is refused, even when a later section has one", () => {
    // The later table is real and parseable — that is the whole hazard.
    expect(EMPTY_SECTION_THEN_A_LATER_TABLE).toContain(`| # | ${BUILD_TARGETS_COLUMN} |`);

    expect(() => parseBuildTargets(EMPTY_SECTION_THEN_A_LATER_TABLE)).toThrow(BuildTargetsParseError);
  });

  test("and the refusal names the empty section rather than the borrowed table", () => {
    let message = "";
    try {
      parseBuildTargets(EMPTY_SECTION_THEN_A_LATER_TABLE);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("carries no table");
    // Never the other section's content: if this ever appears, the bound has
    // been lost and the parser is reading someone else's table.
    expect(message).not.toContain("a case, not a build target");
  });
});
