import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DESIGN_SPINE,
  METADATA_MARKERS,
  lintDesignSpine,
  type ClaimDoc,
} from "../src/index";

// Tests for the design-spine guard (task #294, CLAIM-41.3, gate rulings G1a
// and G1b).
//
// EVERY NEGATIVE FIXTURE IS A REAL SHIPPED DESIGN WITH ONE PERTURBATION.
//
// The rule under test exists because the seeded version of CLAIM-41.3 would
// have rejected 9 of 9 Designs — a rule written before anyone looked at the
// corpus it governs, which is the third instance of that defect after #287 and
// #289. Writing this rule's own fixtures as invented Design text would
// reproduce the defect inside the fix for it, so `perturb` below takes a real
// document off disk and changes exactly one thing.

const repoRoot = join(import.meta.dir, "../../..");
const designDirName = "docs/design/stories";
const designDir = join(repoRoot, designDirName);

function realRoster(): ClaimDoc[] {
  return readdirSync(designDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      path: `${designDirName}/${name}`,
      source: readFileSync(join(designDir, name), "utf8"),
    }));
}

function designNamed(name: string): ClaimDoc {
  const doc = realRoster().find((candidate) => candidate.path === `${designDirName}/${name}`);
  if (doc === undefined) throw new Error(`the real roster has no ${name}; the corpus moved`);
  return doc;
}

function perturb(doc: ClaimDoc, from: string, to: string): ClaimDoc {
  if (!doc.source.includes(from)) throw new Error(`${doc.path} does not contain ${from}`);
  return { path: doc.path, source: doc.source.replace(from, to) };
}

const errors = (docs: readonly ClaimDoc[]) =>
  lintDesignSpine(docs).violations.filter((v) => v.severity === "error");
const warnings = (docs: readonly ClaimDoc[]) =>
  lintDesignSpine(docs).violations.filter((v) => v.severity === "warning");

const PHRASES = {
  missing: "is missing the required section",
  order: "appears before",
  metadata: "carries no H1 title and metadata block",
  storyNumber: "does not match its filename",
} as const;

/** Assert a message carries its own phrase and NONE of the other three. A pair
 *  of positive assertions is not enough — docs/evidence/33-*.md records a
 *  distinctness assertion that passed while the mutation survived. */
function expectOnlyPhrase(message: string, key: keyof typeof PHRASES): void {
  expect(message).toContain(PHRASES[key]);
  for (const [other, phrase] of Object.entries(PHRASES)) {
    if (other === key) continue;
    expect(message).not.toContain(phrase);
  }
}

describe("design-spine over the real roster", () => {
  // THE regression test.
  test("every shipped Design satisfies the spine", () => {
    expect(errors(realRoster())).toEqual([]);
  });

  // Assert the denominator, both halves. A Design count that stayed non-zero
  // while the section count fell to zero would mean the heading parser had
  // stopped working, and every rule above would pass in silence.
  test("the denominator is non-zero in both dimensions", () => {
    const report = lintDesignSpine(realRoster());
    expect(report.designs).toBeGreaterThanOrEqual(10);
    expect(report.sections).toBeGreaterThanOrEqual(100);
  });

  // The constant is tied to the corpus rather than asserted against a second
  // copy of itself. This is what makes DESIGN_SPINE a measurement: if a section
  // were added to the constant that no Design carries, this fails.
  test("every spine member is present in every Design on disk", () => {
    const roster = realRoster();
    expect(roster.length).toBeGreaterThanOrEqual(10);
    for (const doc of roster) {
      for (const section of DESIGN_SPINE) {
        expect(doc.source).toContain(`## ${section}`);
      }
    }
  });

  // G1b, and the whole of it: exactly one Design predates the convention, and
  // it is RECORDED rather than failed. A rule that errored here would force
  // either a rewrite of a shipped historical document or a permanent exemption
  // that hides the outlier.
  test("the one metadata outlier warns, does not error, and is 9.md", () => {
    const warned = warnings(realRoster());
    expect(warned).toHaveLength(1);
    expect(warned[0]?.file).toBe("docs/design/stories/9.md");
    expect(warned[0]?.severity).toBe("warning");
    expectOnlyPhrase(warned[0]?.message ?? "", "metadata");

    // And it is genuinely the outlier, not a parser accident: 9.md opens with
    // YAML carrying seven keys where references/design-format.md:31 specifies
    // four, and its values went stale the day the Story shipped.
    const nine = designNamed("9.md");
    expect(nine.source.startsWith("---\n")).toBe(true);
    expect(nine.source).toContain("phase: scoping");
    expect(nine.source).toContain("progress: 0/9");
  });

  // The two additions in the entire nine-file corpus. A membership-equality
  // rule would reject both, which is why conformance is an ordering property.
  test("a Design carrying an extra section passes", () => {
    expect(designNamed("194.md").source).toContain("## Mapping");
    expect(designNamed("15.md").source).toContain("## Addendum");
    expect(errors([designNamed("194.md"), designNamed("15.md")])).toEqual([]);
  });

  test("every Design's declared Story number agrees with its filename", () => {
    const offenders = lintDesignSpine(realRoster()).violations.filter((v) =>
      v.message.includes(PHRASES.storyNumber),
    );
    expect(offenders).toEqual([]);
  });
});

describe("design-spine negative fixtures, each a real Design with one perturbation", () => {
  test("a missing spine section is reported, naming which, and only as missing", () => {
    const doc = perturb(designNamed("35.md"), "\n## Vision\n", "\n## Prospect\n");
    const found = errors([doc]);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('"## Vision"');
    expectOnlyPhrase(found[0]?.message ?? "", "missing");
  });

  // ORDER IS THE RULE. Both sections are present in this fixture; only their
  // positions are inverted. A presence-only check passes it.
  test("two transposed spine sections are reported, and only as out of order", () => {
    const original = designNamed("35.md");
    const swapped: ClaimDoc = {
      path: original.path,
      source: original.source
        .replace("\n## Problem\n", "\n## @@A@@\n")
        .replace("\n## Goal\n", "\n## Problem\n")
        .replace("\n## @@A@@\n", "\n## Goal\n"),
    };
    // Both are still present — this is not a missing-section fixture.
    expect(swapped.source).toContain("## Problem");
    expect(swapped.source).toContain("## Goal");

    const found = errors([swapped]);
    expect(found.length).toBeGreaterThanOrEqual(1);
    for (const v of found) expectOnlyPhrase(v.message, "order");
  });

  test("a Story number disagreeing with the filename is reported, and only as that", () => {
    const doc = perturb(designNamed("35.md"), "**Story:** #35", "**Story:** #36");
    const found = errors([doc]);
    expect(found).toHaveLength(1);
    expectOnlyPhrase(found[0]?.message ?? "", "storyNumber");
  });

  test("a Design that loses its metadata block warns, and only as metadata", () => {
    const doc = perturb(designNamed("35.md"), "**Unit of work:**", "Unit of work:");
    const found = warnings([doc]);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("**Unit of work:**");
    expectOnlyPhrase(found[0]?.message ?? "", "metadata");
    // and it must not have become an error
    expect(errors([doc])).toEqual([]);
  });

  test("the four messages are pairwise distinct across the whole rule", () => {
    const base = designNamed("35.md");
    const messages = [
      errors([perturb(base, "\n## Vision\n", "\n## Prospect\n")])[0]?.message ?? "",
      errors([
        {
          path: base.path,
          source: base.source
            .replace("\n## Problem\n", "\n## @@A@@\n")
            .replace("\n## Goal\n", "\n## Problem\n")
            .replace("\n## @@A@@\n", "\n## Goal\n"),
        },
      ])[0]?.message ?? "",
      warnings([perturb(base, "**Unit of work:**", "Unit of work:")])[0]?.message ?? "",
      errors([perturb(base, "**Story:** #35", "**Story:** #36")])[0]?.message ?? "",
    ];
    expect(messages.every((m) => m.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(4);
  });
});

describe("design-spine boundaries and vacuity", () => {
  // docs/design/stories/194.md:47-50 carries illustrative claim lines inside a
  // fence; the same hazard applies to headings. A section named only inside a
  // code block is an example, not a section.
  test("a spine heading inside a code fence does not count as present", () => {
    const doc = perturb(designNamed("35.md"), "\n## Vision\n", "\n```\n## Vision\n```\n");
    const found = errors([doc]);
    expect(found.some((v) => v.message.includes('"## Vision"'))).toBe(true);
  });

  test("a section carrying a trailing qualifier still satisfies the spine", () => {
    const doc = perturb(designNamed("35.md"), "\n## Decisions\n", "\n## Decisions \u2014 all eleven\n");
    expect(errors([doc])).toEqual([]);
  });

  test("a document outside docs/design/stories/ is not this rule's business", () => {
    const elsewhere: ClaimDoc = { path: "docs/milestones/M2.md", source: "# not a Design\n" };
    const report = lintDesignSpine([elsewhere]);
    expect(report.designs).toBe(0);
    expect(report.sections).toBe(0);
    expect(report.violations).toEqual([]);
  });

  test("an empty corpus yields a zero denominator rather than a silent pass", () => {
    const report = lintDesignSpine([]);
    expect(report.designs).toBe(0);
    expect(report.sections).toBe(0);
    expect(report.violations).toEqual([]);
  });

  test("the spine and the metadata markers are exported, not restated per call", () => {
    expect(DESIGN_SPINE).toHaveLength(10);
    expect(DESIGN_SPINE[0]).toBe("Problem");
    expect(DESIGN_SPINE[DESIGN_SPINE.length - 1]).toBe("Decisions");
    expect(METADATA_MARKERS).toHaveLength(3);
  });
});
