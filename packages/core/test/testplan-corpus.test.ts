import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CORPUS_COLUMN,
  CORPUS_KINDS,
  MIN_CORPUS_DETAIL,
  isSeparatorRow,
  lintTestPlanCorpus,
  splitRow,
  type ClaimDoc,
} from "../src/index";

// Tests for the testplan-corpus guard (issue #289).
//
// EVERY FIXTURE BELOW IS BUILT FROM THE REAL ROSTER OF TEST PLANS, READ OFF
// DISK, AND THAT IS THE POINT OF THIS FILE.
//
// #289 exists because #280 shipped a required CI check with sixty passing
// tests whose every fixture was invented — `references/a.md`, `over0.md` — and
// the rule rejected seven of nine real Tier-1 verbs. Same rule, real roster:
// seven failures. A synthetic name is never a baseline member, so no synthetic
// fixture could exercise the exemption under test, and the suite agreed with
// the rule perfectly while telling us nothing about the world.
//
// Writing this rule's own tests against invented plan text would reproduce
// that defect inside the fix for it. So the negative fixtures here are not
// authored: each is the REAL roster with ONE cell perturbed, which is the
// smallest possible distance from live content and the only construction that
// cannot drift away from the corpus it claims to police.
//
// docs/evidence/287-20260906T111141Z.md records the measurement.

const repoRoot = join(import.meta.dir, "../../..");
const planDirName = "docs/test-plans";
const planDir = join(repoRoot, planDirName);

function realRoster(): ClaimDoc[] {
  return readdirSync(planDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      path: `${planDirName}/${name}`,
      source: readFileSync(join(planDir, name), "utf8"),
    }));
}

function planNamed(name: string): ClaimDoc {
  const doc = realRoster().find((candidate) => candidate.path === `${planDirName}/${name}`);
  if (doc === undefined) throw new Error(`the real roster has no ${name}; the corpus moved`);
  return doc;
}

/** Locate the first case table in a real plan and return the header line index
 *  and the Corpus column index, so a perturbation can be applied to live text
 *  rather than to something invented. */
function firstCaseTable(doc: ClaimDoc): { header: number; corpus: number; firstRow: number } {
  const lines = doc.source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (!cells.includes("Case") || !cells.includes("anchors_to")) continue;
    const corpus = cells.indexOf(CORPUS_COLUMN);
    // The row after the separator row.
    let firstRow = index + 1;
    while (firstRow < lines.length && isSeparatorRow(splitRow(lines[firstRow] ?? ""))) firstRow += 1;
    return { header: index, corpus, firstRow };
  }
  throw new Error(`${doc.path} has no case table; the plan format moved`);
}

function replaceLine(doc: ClaimDoc, index: number, line: string): ClaimDoc {
  const lines = doc.source.split("\n");
  lines[index] = line;
  return { path: doc.path, source: lines.join("\n") };
}

/** Rewrite the Corpus cell of the first real case row. The rest of the roster
 *  is untouched, so any violation reported is attributable to this one cell. */
function perturbFirstCorpusCell(doc: ClaimDoc, value: string): ClaimDoc {
  const { corpus, firstRow } = firstCaseTable(doc);
  const lines = doc.source.split("\n");
  const cells = splitRow(lines[firstRow] ?? "");
  cells[corpus] = value;
  return replaceLine(doc, firstRow, `| ${cells.join(" | ")} |`);
}

/** Delete the Corpus heading from the first real case table, leaving its rows
 *  exactly as shipped. */
function dropCorpusHeading(doc: ClaimDoc): ClaimDoc {
  const { header, corpus } = firstCaseTable(doc);
  const lines = doc.source.split("\n");
  const cells = splitRow(lines[header] ?? "");
  cells.splice(corpus, 1);
  return replaceLine(doc, header, `| ${cells.join(" | ")} |`);
}

const PHRASES = {
  columnMissing: `no ${CORPUS_COLUMN} column`,
  undeclared: "declares no corpus",
  unknownKind: "is not one of",
  detailMissing: "with no detail",
} as const;

/** Assert a message carries its own rule's phrase and NONE of the other three.
 *
 *  A pair of positive assertions is not enough. docs/evidence/33-*.md records a
 *  distinctness assertion that passed while the mutation survived, because two
 *  messages quoted different values through one template: two messages that
 *  differ only in the value they quote are one message. */
function expectOnlyPhrase(message: string, key: keyof typeof PHRASES): void {
  expect(message).toContain(PHRASES[key]);
  for (const [other, phrase] of Object.entries(PHRASES)) {
    if (other === key) continue;
    expect(message).not.toContain(phrase);
  }
}

describe("testplan-corpus over the real roster", () => {
  // THE regression test, and the one that would have caught #280's defect.
  test("every case in every shipped test plan declares a corpus", () => {
    const report = lintTestPlanCorpus(realRoster());
    expect(report.violations).toEqual([]);
  });

  // Assert the denominator. references/verification.md: a check reporting
  // "0 violations" must report how many things it looked at, and something
  // must assert the number is non-zero. Three numbers, because one conflated
  // total lets any of the three silently go to zero.
  test("the denominator is non-zero in all three dimensions", () => {
    const report = lintTestPlanCorpus(realRoster());
    expect(report.plans).toBeGreaterThanOrEqual(8);
    expect(report.tables).toBeGreaterThanOrEqual(40);
    expect(report.cases).toBeGreaterThanOrEqual(190);
  });

  // The rule above is satisfiable by stamping one kind on all 194 rows. This
  // is the case that makes the column mean something: the roster must actually
  // discriminate. Without it, `none - not applicable` everywhere is a green
  // suite over a worthless column, which is #289's defect wearing a new hat.
  test("the roster discriminates: both real and synthetic corpora are declared", () => {
    const counts = new Map<string, number>();
    for (const doc of realRoster()) {
      const lines = doc.source.split("\n");
      let corpusColumn = -1;
      for (const line of lines) {
        if (!line.trim().startsWith("|")) {
          corpusColumn = -1;
          continue;
        }
        const cells = splitRow(line);
        if (cells.includes("Case") && cells.includes("anchors_to")) {
          corpusColumn = cells.indexOf(CORPUS_COLUMN);
          continue;
        }
        if (corpusColumn === -1 || isSeparatorRow(cells)) continue;
        const kind = (cells[corpusColumn] ?? "").split(/[\u2014\u2013-]/)[0]?.trim().toLowerCase() ?? "";
        if (kind.length > 0) counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }
    }

    expect(counts.get("real") ?? 0).toBeGreaterThan(0);
    expect(counts.get("synthetic") ?? 0).toBeGreaterThan(0);
    // Nothing outside the closed set ever reaches the roster.
    for (const kind of counts.keys()) expect(CORPUS_KINDS).toContain(kind as never);
  });

  // The mandated carve-out of the #289 ruling, pinned as a test rather than
  // left as a comment. references/model-routing-notes.md must NOT exist: the
  // case proves the model-ID exemption is an exact-path match rather than a
  // prefix. A blanket ban on synthetic fixtures would delete the case, so
  // `synthetic` is a legal declared value with a stated reason.
  test("the model-routing carve-out is declared synthetic, with its reason, and passes", () => {
    const plan = planNamed("35-plan.md");
    expect(plan.source).toContain("synthetic \u2014 model-routing-notes.md must not exist");
    expect(lintTestPlanCorpus([plan]).violations).toEqual([]);
  });

  // Coverage tables, Standing-checks tables and the prose tables in a plan are
  // NOT case tables. Proven against the real 35-plan, which carries all three
  // kinds, rather than against a constructed document that could be built to
  // agree with whatever the predicate happens to do.
  test("only case tables are counted, over a plan that carries three other table kinds", () => {
    const plan = planNamed("35-plan.md");
    expect(plan.source).toContain("| Claim | Cases | Priority |");
    expect(plan.source).toContain("| Check | Command | Passes when |");

    const report = lintTestPlanCorpus([plan]);
    expect(report.plans).toBe(1);
    expect(report.tables).toBe(6);
    expect(report.cases).toBe(23);
  });
});

describe("testplan-corpus negative fixtures, each one real content with one cell perturbed", () => {
  test("an empty Corpus cell is reported, and only as undeclared", () => {
    const report = lintTestPlanCorpus([perturbFirstCorpusCell(planNamed("9-plan.md"), "")]);
    expect(report.violations).toHaveLength(1);
    expectOnlyPhrase(report.violations[0]?.message ?? "", "undeclared");
    expect(report.violations[0]?.rule).toBe("testplan-corpus");
    expect(report.violations[0]?.severity).toBe("error");
  });

  test("an invented fourth kind is reported, and only as an unknown kind", () => {
    const report = lintTestPlanCorpus([
      perturbFirstCorpusCell(planNamed("9-plan.md"), "plausible \u2014 read from somewhere"),
    ]);
    expect(report.violations).toHaveLength(1);
    expectOnlyPhrase(report.violations[0]?.message ?? "", "unknownKind");
  });

  test("a bare `real` is reported, and the message demands the corpus be NAMED", () => {
    const report = lintTestPlanCorpus([perturbFirstCorpusCell(planNamed("9-plan.md"), "real")]);
    expect(report.violations).toHaveLength(1);
    const message = report.violations[0]?.message ?? "";
    expectOnlyPhrase(message, "detailMissing");
    expect(message).toContain("must NAME the corpus");
    // The two detail-missing messages must not collapse into one another.
    expect(message).not.toContain("must state WHY");
  });

  test("a bare `synthetic` is reported, and the message demands a REASON", () => {
    const report = lintTestPlanCorpus([perturbFirstCorpusCell(planNamed("9-plan.md"), "synthetic")]);
    expect(report.violations).toHaveLength(1);
    const message = report.violations[0]?.message ?? "";
    expectOnlyPhrase(message, "detailMissing");
    expect(message).toContain("must state WHY");
    expect(message).not.toContain("must NAME the corpus");
  });

  test("deleting the Corpus heading is reported once for the table, not once per row", () => {
    const report = lintTestPlanCorpus([dropCorpusHeading(planNamed("9-plan.md"))]);
    expect(report.violations).toHaveLength(1);
    expectOnlyPhrase(report.violations[0]?.message ?? "", "columnMissing");
    // The rows are still counted. A table the rule cannot check must not also
    // vanish from the denominator, or removing the column would look like
    // progress.
    expect(report.cases).toBe(lintTestPlanCorpus([planNamed("9-plan.md")]).cases);
  });

  test("the four messages are pairwise distinct across the whole rule", () => {
    const plan = planNamed("9-plan.md");
    const messages = [
      lintTestPlanCorpus([perturbFirstCorpusCell(plan, "")]),
      lintTestPlanCorpus([perturbFirstCorpusCell(plan, "plausible \u2014 read from somewhere")]),
      lintTestPlanCorpus([perturbFirstCorpusCell(plan, "real")]),
      lintTestPlanCorpus([dropCorpusHeading(plan)]),
    ].map((report) => report.violations[0]?.message ?? "");

    expect(new Set(messages).size).toBe(4);
  });
});

describe("testplan-corpus boundaries and vacuity", () => {
  // The threshold is read from the exported constant, not restated. Decision 11
  // of docs/design/stories/26.md exists to stop a second copy of a constant:
  // a test that hard-codes 12 here passes while the rule uses 5.
  test("the detail threshold is exactly MIN_CORPUS_DETAIL, read from the export", () => {
    const plan = planNamed("9-plan.md");
    const short = "x".repeat(MIN_CORPUS_DETAIL - 1);
    const exact = "x".repeat(MIN_CORPUS_DETAIL);

    expect(lintTestPlanCorpus([perturbFirstCorpusCell(plan, `real \u2014 ${short}`)])).toHaveProperty(
      "violations.length",
      1,
    );
    expect(lintTestPlanCorpus([perturbFirstCorpusCell(plan, `real \u2014 ${exact}`)]).violations).toEqual([]);
  });

  test("all three dash characters are accepted as the separator", () => {
    const plan = planNamed("9-plan.md");
    for (const dash of ["\u2014", "\u2013", "-"]) {
      const doc = perturbFirstCorpusCell(plan, `real ${dash} the roster on disk`);
      expect(lintTestPlanCorpus([doc]).violations).toEqual([]);
    }
  });

  test("a case table outside docs/test-plans/ is not this rule's business", () => {
    const plan = planNamed("9-plan.md");
    const elsewhere: ClaimDoc = { path: "docs/design/stories/9.md", source: dropCorpusHeading(plan).source };
    const report = lintTestPlanCorpus([elsewhere]);
    expect(report.plans).toBe(0);
    expect(report.cases).toBe(0);
    expect(report.violations).toEqual([]);
  });

  test("a case table inside a fenced block is illustration, not a case table", () => {
    const plan = planNamed("9-plan.md");
    const { header } = firstCaseTable(plan);
    const lines = dropCorpusHeading(plan).source.split("\n");
    lines.splice(header, 0, "```");
    lines.splice(header + 3, 0, "```");
    const report = lintTestPlanCorpus([{ path: plan.path, source: lines.join("\n") }]);

    expect(report.violations.some((v) => v.message.includes(PHRASES.columnMissing))).toBe(false);
  });

  // The rule cannot report success over nothing without saying so.
  test("an empty corpus yields a zero denominator rather than a silent pass", () => {
    const report = lintTestPlanCorpus([]);
    expect(report.plans).toBe(0);
    expect(report.tables).toBe(0);
    expect(report.cases).toBe(0);
    expect(report.violations).toEqual([]);
  });
});
