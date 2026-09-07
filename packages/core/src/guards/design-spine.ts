// The Design-format guard. Implements CLAIM-41.3 of docs/design/stories/41.md,
// as ruled at the S2.2 design gate on 2026-09-06 (G1a and G1b).
//
// This module is PURE: no fs, no path, no process, no Bun globals. Issue #204
// is the standing decision — guards take strings and return data, the file
// walking lives in scripts/. Enforced by `bun run lint`.
//
// WHY THIS RULE IS NOT THE ONE THE MILESTONE ASKED FOR.
//
// docs/milestones/M2.md:85 seeds CLAIM-41.3 as "all seventeen body sections".
// Measured over docs/design/stories/, denominator 9 of 9:
//
//   Designs with seventeen H2 sections ........ 0
//   Maximum observed .......................... 11   (15.md, 194.md)
//   Modal and minimum ......................... 10   (7 of 9)
//
// And the rule is not merely unmet, it is UNIMPLEMENTABLE: the list of
// seventeen section names does not exist in this repository. All fourteen
// in-repo mentions restate the NUMBER; not one enumerates the NAMES. The only
// cited source is an upstream ISAFormat.md that is not vendored here. You
// cannot write a checker for a set whose members are unknown.
//
// The repository had already ruled against it. docs/design/verification-pass.md
// :515 (row 461) verdicts the "17 fixed" reading `corrected`, on the ground
// that the upstream spec itself says "Empty sections are excluded entirely".
// references/design-format.md:38-52 CARRIED the disagreement and :145 named
// CLAIM-41.3 as its owner. It was routed to S2.2 deliberately, and #297 has
// since discharged both: :38-52 now states this spine and cites this file for
// the ten names rather than restating them, and :145 reads `discharged`.
//
// What the corpus supports instead is stronger and checkable: a ten-section
// spine, identical in name and order in 9 of 9 files, with exactly two
// additions in the entire corpus (## Mapping at 194.md:57, ## Addendum at
// 15.md:425). Ruled G1a.
//
// ORDER IS THE RULE; MEMBERSHIP ALONE IS NOT. references/design-format.md:52
// defines conformance as preserving relative order and never as membership —
// "A conforming Design therefore preserves relative order; it does not pad."
// A check that only asserted presence would pass a Design whose Decisions
// preceded its Problem. Extra sections are permitted precisely because the
// contract is about order.

import type { ClaimDoc, ClaimViolation } from "./claim-lint";

/** The ten sections every shipped Design carries, in the order all nine carry
 *  them. Measured, not chosen. */
export const DESIGN_SPINE: readonly string[] = [
  "Problem",
  "Vision",
  "Out of Scope",
  "Constraints",
  "Dependencies",
  "Goal",
  "Claims",
  "Build Targets",
  "Test Strategy",
  "Decisions",
];

/** The metadata convention 8 of 9 shipped Designs use, ruled G1b.
 *
 *  references/design-format.md:31 specifies four YAML keys — `phase`,
 *  `progress`, `task`, `slug`. Exactly one Design carries YAML at all
 *  (docs/design/stories/9.md), and it carries SEVEN keys, not those four, with
 *  values that went stale the day the Story shipped (`phase: scoping`,
 *  `progress: 0/9`).
 *
 *  The other eight open with an H1 title followed by a bolded metadata block.
 *  That is the convention this rule describes. */
export const METADATA_MARKERS: readonly string[] = ["**Story:**", "**Milestone:**", "**Unit of work:**"];

const DESIGN_PATH_RE = /^docs\/design\/stories\/(\d+)\.md$/;
const FENCE_RE = /^\s*(```|~~~)/;
const H1_RE = /^#\s+\S/;
const H2_RE = /^##\s+(.+?)\s*$/;
const STORY_MARKER_RE = /\*\*Story:\*\*\s*#(\d+)/;

/** How far into the document the metadata block must appear. Generous: the
 *  furthest any shipped Design pushes `**Unit of work:**` is line 4. */
const METADATA_WINDOW = 12;

const RULE = "design-spine" as const;

export interface DesignSpineReport {
  /** Design documents seen. The denominator. */
  designs: number;
  /** H2 headings seen across them. A Design whose headings stopped being
   *  parsed would otherwise pass every rule below in silence. */
  sections: number;
  violations: ClaimViolation[];
}

function violation(
  file: string,
  line: number,
  message: string,
  severity: "error" | "warning" = "error",
): ClaimViolation {
  return { file, line, rule: RULE, severity, message };
}

interface Heading {
  name: string;
  line: number;
}

function headingsOf(source: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = H2_RE.exec(line);
    // `## Gate — RULED` and `## Addendum — ...` carry a trailing qualifier. The
    // spine member is the part before the first em dash, so a section may be
    // annotated without falling out of the spine. Nothing else is normalised:
    // a renamed section is a missing section, which is the point.
    if (match !== null) {
      const raw = (match[1] ?? "").trim();
      const name = (raw.split("\u2014")[0] ?? raw).trim().replace(/[*`]/g, "");
      headings.push({ name, line: index + 1 });
    }
  }
  return headings;
}

/** Lint every Design document against the ten-section spine and the metadata
 *  convention.
 *
 *  Four distinct failures, four pairwise-disjoint message phrases. Every test
 *  asserts the ABSENCE of the other three, not merely the presence of its own:
 *  docs/evidence/33-*.md records a distinctness assertion that passed while the
 *  mutation survived, because two messages quoted different values through one
 *  template. Two messages that differ only in the value they quote are one
 *  message. */
export function lintDesignSpine(docs: readonly ClaimDoc[]): DesignSpineReport {
  const violations: ClaimViolation[] = [];
  let designs = 0;
  let sections = 0;

  for (const doc of docs) {
    const pathMatch = DESIGN_PATH_RE.exec(doc.path);
    if (pathMatch === null) continue;
    designs += 1;

    const headings = headingsOf(doc.source);
    sections += headings.length;

    // --- presence -------------------------------------------------------
    const index = new Map<string, number>();
    for (const heading of headings) {
      if (!index.has(heading.name)) index.set(heading.name, heading.line);
    }

    const present: { name: string; line: number }[] = [];
    for (const required of DESIGN_SPINE) {
      const line = index.get(required);
      if (line === undefined) {
        violations.push(
          violation(
            doc.path,
            1,
            `this Design is missing the required section "## ${required}". The spine is ` +
              `${DESIGN_SPINE.join(" \u2192 ")}, measured over every Design in the tree and ruled ` +
              `at the S2.2 gate. Additional sections are permitted; these ten are not optional`,
          ),
        );
        continue;
      }
      present.push({ name: required, line });
    }

    // --- relative order -------------------------------------------------
    // Only over the sections actually present, so a missing section is
    // reported once as missing rather than a second time as misordered.
    for (let i = 1; i < present.length; i += 1) {
      const previous = present[i - 1];
      const current = present[i];
      if (previous === undefined || current === undefined) continue;
      if (current.line < previous.line) {
        violations.push(
          violation(
            doc.path,
            current.line,
            `"## ${current.name}" appears before "## ${previous.name}", which inverts the spine. ` +
              `Conformance is an ordering property, not a membership one — a Design carrying all ` +
              `ten sections in the wrong order is not conforming`,
          ),
        );
      }
    }

    // --- metadata convention (G1b) --------------------------------------
    const head = doc.source.split("\n").slice(0, METADATA_WINDOW);
    const firstMeaningful = head.find((line) => line.trim().length > 0) ?? "";
    const hasTitle = H1_RE.test(firstMeaningful);
    const missingMarkers = METADATA_MARKERS.filter(
      (marker) => !head.some((line) => line.includes(marker)),
    );

    if (!hasTitle || missingMarkers.length > 0) {
      // A WARNING, not an error, and that is the ruling rather than timidity.
      // Exactly one Design predates the convention. Failing it would either
      // rewrite a shipped historical document to satisfy a rule written after
      // it, or force a permanent exemption that hides the outlier. A warning
      // keeps it visible on every run, which is what "recorded rather than
      // failed" means.
      const detail = !hasTitle
        ? "it opens with something other than an H1 title"
        : `its metadata block omits ${missingMarkers.join(", ")}`;
      violations.push(
        violation(
          doc.path,
          1,
          `this Design carries no H1 title and metadata block in the shipped convention: ${detail}. ` +
            `Eight of the nine Designs in the tree open with an H1 followed by ` +
            `${METADATA_MARKERS.join(" ")}. Recorded as a warning, not an error: the convention was ` +
            `ruled from the corpus at the S2.2 gate and predates this document`,
          "warning",
        ),
      );
    }

    // --- the story number agrees with the filename ----------------------
    const declared = STORY_MARKER_RE.exec(doc.source.split("\n").slice(0, METADATA_WINDOW).join("\n"));
    const fromPath = pathMatch[1] ?? "";
    if (declared !== null && declared[1] !== fromPath) {
      violations.push(
        violation(
          doc.path,
          1,
          `this Design declares "**Story:** #${declared[1]}" but does not match its filename, ` +
            `which names Story ${fromPath}. One of the two is wrong, and every downstream ` +
            `citation resolves through the filename`,
        ),
      );
    }
  }

  return { designs, sections, violations };
}
