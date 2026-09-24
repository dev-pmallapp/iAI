import { isSeparatorRow, splitRow } from "./claim-lint";

// The Design's `## Build Targets` table, parsed.
//
// Build target 3 of docs/design/stories/47.md, and **CLAIM-47.1's real
// input**. The seeded wording said `task-create` opens one sub-issue per
// `binding.unitOfWork` item; that is a type error. `UnitSpec` is five
// `readonly string` fields (packages/core/src/binding/domain.ts:111-117),
// declared SINGULAR at :225 and validated with `isPlainObject`, not
// `Array.isArray` (validate.ts:70-76) — `for (const item of
// binding.unitOfWork)` throws. Restated at the gate as ruling G1.
//
// The table is not an optional convenience: `design-spine.ts`'s DESIGN_SPINE
// lists "Build Targets" as one of the ten sections EVERY Design must carry,
// and claim-lint enforces it. So this parser may assume the section exists on
// a valid Design, and must say so loudly when it does not.
//
// ============================================================================
// THE COLUMN IS FOUND BY NAME, NEVER BY POSITION
// ============================================================================
//
// Measured over the 12 Designs on disk, the table ships in THREE shapes:
//
//   | Target | Type | Touched |                            -- 9 Designs
//   | Target | Type | Build file | Source dirs |           -- stories/9.md
//   | # | Target | Work | Why the milestone table misses it |  -- 41, 293, 47
//
// The third puts `Target` in column 2, the others in column 1. A positional
// reader would silently return "1", "2", "3" for a third of the corpus — row
// numbers that look plausible enough to survive review, which is the failure
// mode that matters.
//
// This is #323's M5 one level on: a parser that TOLERATES the structure it
// depends on cannot report a violation of it. That mutation survived because
// the audit parser took "the first contiguous run" and read the right rows by
// ACCIDENT. So this parser asserts the structure instead of coping with it —
// header present, separator present, named column found, every data row the
// same width as its header.

export const BUILD_TARGETS_HEADING = "## Build Targets";

// The header cell naming the column that holds the unit of work. Exported so
// a caller — or a test — can never restate it and drift.
export const BUILD_TARGETS_COLUMN = "Target";

export interface BuildTargetRow {
  // 1-based position within the table, in document order. This is the
  // checklist order CLAIM-47.2's `Blocked by:` line must match, and
  // `sub-issues.ts:200-203` already refuses to sort for the same reason.
  readonly position: number;
  // The `Target` cell, trimmed, markdown intact.
  readonly target: string;
  // The whole row, so a caller can read another column without reparsing.
  readonly cells: readonly string[];
}

export class BuildTargetsParseError extends Error {}

function headingIndex(lines: readonly string[]): number {
  return lines.findIndex((line) => line.trim() === BUILD_TARGETS_HEADING);
}

/**
 * Parse a Design body's `## Build Targets` table.
 *
 * Throws `BuildTargetsParseError` rather than returning an empty list for a
 * malformed or missing table. An empty list and "the section is gone" are
 * different facts, and a caller that opens one sub-issue per row would treat
 * them identically — silently creating nothing and reporting success. Case 1
 * asserts a Design with the section removed FAILS.
 */
export function parseBuildTargets(body: string): readonly BuildTargetRow[] {
  const lines = body.split("\n");

  const start = headingIndex(lines);
  if (start === -1) {
    throw new BuildTargetsParseError(
      `no "${BUILD_TARGETS_HEADING}" section: it is one of the ten sections every Design must carry (DESIGN_SPINE)`,
    );
  }

  // The section ends at the next H2, so a later table elsewhere in the
  // document can never be read as this one's rows.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if ((lines[i] as string).startsWith("## ")) {
      end = i;
      break;
    }
  }

  // Only the LEADING contiguous run of table lines. Every Design in the
  // corpus follows its table with prose, and 47.md's "Sequencing." paragraph
  // is the live example; taking every `|` line in the section would splice
  // any later table into this one.
  const section = lines.slice(start + 1, end);
  const table: string[] = [];
  let seen = false;
  for (const line of section) {
    if (line.trimStart().startsWith("|")) {
      table.push(line);
      seen = true;
    } else if (seen && line.trim() !== "") {
      break;
    }
  }

  if (table.length === 0) {
    throw new BuildTargetsParseError(`"${BUILD_TARGETS_HEADING}" carries no table`);
  }
  if (table.length < 3) {
    throw new BuildTargetsParseError(
      `"${BUILD_TARGETS_HEADING}"'s table has ${String(table.length)} line(s): a header, a separator and at least one row are required`,
    );
  }

  const header = splitRow(table[0] as string);
  if (!isSeparatorRow(splitRow(table[1] as string))) {
    throw new BuildTargetsParseError(
      `"${BUILD_TARGETS_HEADING}"'s second table line is not a separator row — the header cannot be identified`,
    );
  }

  // BY NAME. See the header comment for why this is the whole point.
  const column = header.findIndex((cell) => cell.trim() === BUILD_TARGETS_COLUMN);
  if (column === -1) {
    throw new BuildTargetsParseError(
      `"${BUILD_TARGETS_HEADING}"'s table has no "${BUILD_TARGETS_COLUMN}" column; its header is [${header.join(" | ")}]`,
    );
  }

  const rows: BuildTargetRow[] = [];
  for (const line of table.slice(2)) {
    const cells = splitRow(line);

    // A ragged row means the column indices no longer line up, so the cell
    // read below would be some OTHER column's content. Refuse rather than
    // return a confident wrong answer.
    if (cells.length !== header.length) {
      throw new BuildTargetsParseError(
        `"${BUILD_TARGETS_HEADING}" row ${String(rows.length + 1)} has ${String(cells.length)} cells but the header has ${String(header.length)}`,
      );
    }

    const target = (cells[column] as string).trim();
    if (target === "") {
      throw new BuildTargetsParseError(
        `"${BUILD_TARGETS_HEADING}" row ${String(rows.length + 1)} has an empty "${BUILD_TARGETS_COLUMN}" cell`,
      );
    }

    rows.push({ position: rows.length + 1, target, cells });
  }

  // NOTE: there is deliberately no `rows.length === 0` guard here. Mutation
  // M5 of #48 deleted one and nothing went red, because it was UNREACHABLE:
  // the `table.length < 3` check above already rejects a header-and-separator
  // with nothing after it, and every remaining line becomes a row or throws.
  // A guard no fixture can reach is a comment that reads like a check.
  return rows;
}
