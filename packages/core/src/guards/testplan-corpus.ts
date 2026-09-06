// The test-plan corpus guard. Implements the ruling on issue #289, taken by
// the repository owner on 2026-09-06: option 2 (a `Corpus` column, checked
// mechanically) with option 3 (refusal at authoring time, inside
// `story-test-plan`) layered on in S2.2. The doctrine this enforces is owned
// by references/verification.md, which already owns "assert the denominator".
//
// The gap, in one line:
//
//   A denominator guard proves the corpus is non-empty. It does not prove the
//   corpus is REPRESENTATIVE.
//
// #280 shipped `reference-citation-count` as a required CI check with sixty
// passing tests. Every one of its fixtures was invented — `references/a.md`,
// `references/over0.md` — and the rule rejected seven of nine real Tier-1
// verbs. Same rule, real roster: seven failures. The mechanism is that a
// synthetic name is never a baseline member, so no synthetic fixture could
// ever exercise the exemption under test. Recorded at
// docs/evidence/287-20260906T111141Z.md.
//
// This module is PURE: no fs, no path, no process, no Bun globals. Issue #204
// is the standing decision — guards take strings and return data, the file
// walking lives in scripts/. Enforced by `bun run lint`.
//
// SCOPE, stated because it is narrower than the doctrine. This rule checks
// that every case DECLARES a corpus and that the declaration is well formed.
// It cannot check that a declaration is TRUE: a case whose fixtures are
// invented may still write `real`. That is not a defect to be regexed away —
// a rule that tried would be judging fixture realism from a prose cell. The
// declaration is the deliverable; making it a required, visible, machine-read
// column is what stops it being forgotten, which is the failure #289 records.

import { TEST_PLAN_RE, isSeparatorRow, splitRow, type ClaimDoc, type ClaimViolation } from "./claim-lint";

/** The three declarable corpus kinds.
 *
 *  `synthetic` is DELIBERATELY legal. The ruling on #289 mandates the
 *  carve-out: references/model-routing-notes.md exists precisely to name a
 *  file that does not exist, proving the model-ID exemption is an exact-path
 *  match rather than a prefix (case 7 of docs/test-plans/35-plan.md). A
 *  blanket ban on synthetic fixtures would delete that case. What is banned is
 *  an UNDECLARED or UNREASONED synthetic corpus, not a synthetic one. */
export const CORPUS_KINDS = ["real", "synthetic", "none"] as const;

export type CorpusKind = (typeof CORPUS_KINDS)[number];

/** The column heading a case table must carry. */
export const CORPUS_COLUMN = "Corpus";

/** A case table is identified by these two headings appearing together.
 *
 *  Both are required. `anchors_to` alone also appears in a Coverage table
 *  (`| Claim | Cases | Priority |` keyed the other way round in some plans),
 *  and `Case` alone would match a Standing-checks table. Requiring the pair
 *  is what keeps the population exactly the case tables. */
const CASE_TABLE_HEADINGS = ["Case", "anchors_to"] as const;

/** `<kind>` then a dash then the detail. Em dash, en dash and hyphen are all
 *  accepted as the separator because all three occur in this repository's
 *  prose and an author should not have to remember which. The kind itself is
 *  matched case-insensitively and normalised, so `Real` is not a violation —
 *  reporting a capital letter as a defect would train people to ignore the
 *  rule. */
const CORPUS_CELL_RE = /^([A-Za-z]+)\s*(?:[\u2014\u2013-]\s*(.*))?$/;

/** Minimum characters of detail. A locator or a reason, not an acknowledgement.
 *
 *  Chosen so that "n/a", "none", "-" and "see above" all fail while the
 *  shortest honest locator in the real roster — a bare path such as
 *  `references/` plus a word — passes. */
export const MIN_CORPUS_DETAIL = 12;

export interface TestPlanCorpusReport {
  /** Test-plan documents seen. The first half of the denominator. */
  plans: number;
  /** Case tables seen across those documents. */
  tables: number;
  /** Case rows seen across those tables. The half that matters: a plan with a
   *  Corpus column and no rows under it passes every rule below, and the count
   *  is the only thing that shows it. */
  cases: number;
  violations: ClaimViolation[];
}

const FENCE_RE = /^\s*(```|~~~)/;

const RULE = "testplan-corpus" as const;

function violation(file: string, line: number, message: string): ClaimViolation {
  return { file, line, rule: RULE, severity: "error", message };
}

function isCaseTableHeader(cells: string[]): boolean {
  return CASE_TABLE_HEADINGS.every((heading) =>
    cells.some((cell) => cell.replace(/[*`]/g, "").trim() === heading),
  );
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

/** The case number, for the message. Falls back to the row's line number when
 *  column 1 is not a number, because a message that says "case ???" is still
 *  more useful than one that says nothing. */
function caseLabel(cells: string[], line: number): string {
  const first = (cells[0] ?? "").replace(/[*`]/g, "").trim();
  return /^\d+$/.test(first) ? `case ${first}` : `the case at line ${line}`;
}

function parseKind(raw: string): CorpusKind | null {
  const lowered = raw.toLowerCase();
  return (CORPUS_KINDS as readonly string[]).includes(lowered) ? (lowered as CorpusKind) : null;
}

/** Lint the `Corpus` declaration on every test-plan case row.
 *
 *  Four distinct failures, four distinct message phrases. The phrases are
 *  pairwise disjoint ON PURPOSE and each test asserts the ABSENCE of the other
 *  three, not merely the presence of its own. docs/evidence/33-*.md records a
 *  distinctness assertion that passed while the mutation survived, because two
 *  messages quoted different values through one template:
 *
 *    two messages that differ only in the value they quote are one message. */
export function lintTestPlanCorpus(docs: readonly ClaimDoc[]): TestPlanCorpusReport {
  const violations: ClaimViolation[] = [];
  let plans = 0;
  let tables = 0;
  let cases = 0;

  for (const doc of docs) {
    if (!TEST_PLAN_RE.test(doc.path)) continue;
    plans += 1;

    const lines = doc.source.split("\n");
    let inFence = false;
    // Column index of Corpus in the table currently being read; -1 when no
    // table is open, -2 when a case table is open but has no Corpus column
    // (already reported once at its header, never again per row).
    let corpusColumn = -1;
    let inCaseTable = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const lineNumber = index + 1;

      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        inCaseTable = false;
        corpusColumn = -1;
        continue;
      }
      if (inFence) continue;

      if (!isTableRow(line)) {
        inCaseTable = false;
        corpusColumn = -1;
        continue;
      }

      const cells = splitRow(line);

      if (!inCaseTable) {
        if (!isCaseTableHeader(cells)) continue;
        inCaseTable = true;
        tables += 1;
        const found = cells.findIndex((cell) => cell.replace(/[*`]/g, "").trim() === CORPUS_COLUMN);
        corpusColumn = found === -1 ? -2 : found;
        if (found === -1) {
          violations.push(
            violation(
              doc.path,
              lineNumber,
              `this case table has no ${CORPUS_COLUMN} column. Every case must declare whether ` +
                `its fixtures are ${CORPUS_KINDS.join(" / ")}, per the ruling on issue #289 and ` +
                `the doctrine in references/verification.md. A denominator guard proves a corpus ` +
                `is non-empty; it does not prove it is representative`,
            ),
          );
        }
        continue;
      }

      if (isSeparatorRow(cells)) continue;

      cases += 1;
      if (corpusColumn === -2) continue;

      const raw = (cells[corpusColumn] ?? "").replace(/[*`]/g, "").trim();
      const label = caseLabel(cells, lineNumber);

      if (raw.length === 0) {
        violations.push(
          violation(
            doc.path,
            lineNumber,
            `${label} declares no corpus. The ${CORPUS_COLUMN} cell is empty; it must read ` +
              `one of ${CORPUS_KINDS.join(" / ")} followed by a locator or a reason`,
          ),
        );
        continue;
      }

      const match = CORPUS_CELL_RE.exec(raw);
      const kind = match === null ? null : parseKind(match[1] ?? "");

      if (kind === null) {
        violations.push(
          violation(
            doc.path,
            lineNumber,
            `${label} declares corpus "${raw}", which is not one of ${CORPUS_KINDS.join(" / ")}. ` +
              `An invented fourth kind fails here rather than being silently ignored`,
          ),
        );
        continue;
      }

      const detail = (match?.[2] ?? "").trim();
      if (detail.length < MIN_CORPUS_DETAIL) {
        violations.push(
          violation(
            doc.path,
            lineNumber,
            `${label} declares corpus "${kind}" with no detail. ` +
              (kind === "real"
                ? `A real corpus must NAME the corpus — the path, directory or roster the ` +
                  `fixtures are read from. "real" on its own is the assertion, not the evidence`
                : `A ${kind} corpus must state WHY, so the carve-out is a reasoned exception ` +
                  `rather than a blanket one. references/model-routing-notes.md is the worked ` +
                  `example: it must not exist, which is the whole point of the case`),
          ),
        );
      }
    }
  }

  return { plans, tables, cases, violations };
}
