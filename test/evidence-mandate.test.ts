import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  HARD_FAILURE_ACTION_PREFIX,
  HARD_FAILURE_HEADLINE_PREFIX,
  checkEvidenceMandate,
} from "../packages/core/src/index";

const repoRoot = join(import.meta.dir, "..");
const EVIDENCE_DIR = join(repoRoot, "docs", "evidence");

function evidenceFiles(): readonly string[] {
  return readdirSync(EVIDENCE_DIR).filter((f) => f.endsWith(".md"));
}

// ===========================================================================
// CASE 8 of docs/test-plans/47-plan.md — CLAIM-47.6, P0, tool-checked.
//
//   "The artifact count is read at run time and asserted non-zero FIRST; then
//    a task anchored to a claim with no artifact emits the hard-failure
//    block. Evidence precedes the label, so a status:resolved with nothing
//    behind it is a claim, not a result."
//
// ---------------------------------------------------------------------------
// PARTIALLY DISCHARGED, BY GATE RULING G-b ON #47. READ THIS BEFORE EXTENDING.
// ---------------------------------------------------------------------------
//
// This file discharges the REFUSAL direction. It does not discharge, and must
// not be read as discharging, the positive direction — "this claim IS covered,
// because here is its artifact". That belongs to build target 4 and is blocked
// on a corpus problem recorded in #341:
//
//   Of the artifacts on disk, a large minority carry no `| Claims |` row at
//   all, and the remainder use at least five mutually incompatible range
//   notations plus a retired `ISC-*` namespace. docs/evidence/ is IMMUTABLE
//   (NEVER-194.6), so the gaps can never be backfilled and the notations can
//   never be normalised.
//
// Which leaves exactly one sound direction:
//
//   SOUND   — a claim id appearing in ZERO artifacts is certainly uncovered.
//   UNSOUND — a claim id appearing somewhere is therefore covered.
//
// A refusal needs only the sound one. The CARRY is: build target 4 owns the
// positive direction, and #341 owns the ruling on whether it is reconstructed
// from the Design/plan side instead of from the artifacts.
// ===========================================================================
describe("case 8 (CLAIM-47.6): a task anchored to a claim with no artifact is refused", () => {
  // THE DENOMINATOR, FIRST AND ALONE, because the plan's own wording demands
  // that ordering. Every assertion below reasons about "appears in zero
  // artifacts"; over an empty directory that is vacuously true of EVERY claim
  // id, and the refusal test would pass while proving nothing at all.
  test("the docs/evidence/ corpus is non-zero, so the absence reasoning below is not vacuous", () => {
    expect(evidenceFiles().length).toBeGreaterThan(0);
  });

  // The synthetic task's anchor. Story 999 does not exist and never will, so
  // no artifact can ever legitimately mention it -- which is what makes this
  // fixture stable rather than a hostage to whatever ships next.
  const UNCOVERED_CLAIM = "CLAIM-999.1";

  test("the synthetic claim appears in ZERO artifacts on disk -- the sound direction, measured", () => {
    const files = evidenceFiles();
    expect(files.length).toBeGreaterThan(0); // denominator again, this test standing alone

    const hits = files.filter((f) =>
      readFileSync(join(EVIDENCE_DIR, f), "utf8").includes(UNCOVERED_CLAIM),
    );

    // Asserted as the LIST, not as a count. A count says "1"; the list says
    // which file, which is the difference between a failure you can act on
    // and one you have to go looking for. #321's M5/M6 pair is the recorded
    // instance of a length check hiding what a value check would have named.
    expect(hits, `${UNCOVERED_CLAIM} must be uncovered for this fixture to mean anything`).toEqual([]);
  });

  test("a task anchored to that claim is REFUSED, and the refusal is the house hard-failure block", () => {
    const decision = checkEvidenceMandate({
      task: 9991,
      story: 999,
      claim: UNCOVERED_CLAIM,
      resolution: { kind: "absent" },
    });

    expect(decision.action).toBe("block");

    // The block, asserted through the exported constants rather than restated
    // literals -- a test that restated them could drift into agreeing with
    // itself while the renderer changed underneath.
    expect(decision.message.startsWith(HARD_FAILURE_HEADLINE_PREFIX)).toBe(true);
    const lines = decision.message.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[4].startsWith(HARD_FAILURE_ACTION_PREFIX)).toBe(true);

    // It must name the claim it refused on. A refusal that does not say what
    // was missing sends the reader back to the code to find out.
    expect(decision.message).toContain(UNCOVERED_CLAIM);
    // And record the absence, not merely fail -- the same "tied to ABSENCE"
    // posture case 12 asserts of the prose bodies.
    expect(lines[3]).toBe("- Found: none");
  });

  // EVIDENCE PRECEDES THE LABEL. The doctrine at
  // references/evidence-artifacts.md:140-144 is the reason the refusal exists,
  // so the refusal says it.
  test("the refusal states the doctrine: a status:resolved with no artifact is a claim, not a result", () => {
    const decision = checkEvidenceMandate({
      task: 9991,
      story: 999,
      claim: UNCOVERED_CLAIM,
      resolution: { kind: "absent" },
    });
    expect(decision.message).toContain("is a claim, not a result");
  });

  // THE OTHER HALF OF THE PARTITION. Without this the guard could be a
  // constant function returning `block`, and every assertion above would
  // still pass. Mutation M9/M9b of #320 is the recorded instance of exactly
  // that shape going unnoticed.
  test("a task whose claim HAS an artifact is allowed, so the guard is not a constant refusal", () => {
    const decision = checkEvidenceMandate({
      task: 9991,
      story: 999,
      claim: UNCOVERED_CLAIM,
      resolution: { kind: "present", artifact: "docs/evidence/999-20260101T000000Z.md" },
    });

    expect(decision.action).toBe("allow");
    expect(decision.message).not.toContain(HARD_FAILURE_HEADLINE_PREFIX);
  });

  // THE SEAM, ASSERTED STATICALLY. #316's whole shippability rests on this
  // module resolving nothing -- see packages/core/src/guards/evidence-mandate.ts's
  // header and #341. A future edit that makes it read the corpus itself would
  // silently adopt the UNSOUND direction and pre-empt a ruling nobody has made.
  //
  // Behaviourally that change is invisible: the guard would return the same
  // verdicts for every input this file supplies. #322's M11 is the precedent
  // for the kill -- a behaviourally equivalent mutation can only be killed
  // statically.
  test("the guard's own source reads no corpus: no fs, no path, no directory listing", async () => {
    const source = await Bun.file(
      join(repoRoot, "packages", "core", "src", "guards", "evidence-mandate.ts"),
    ).text();

    // Guard the extraction first, so a failed read cannot pass vacuously.
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("checkEvidenceMandate");

    const imports = source
      .split("\n")
      .filter((l) => l.startsWith("import "))
      .join("\n");
    expect(imports.length).toBeGreaterThan(0);

    for (const forbidden of ["node:fs", "node:path", "readdirSync", "readFileSync", "Bun.file"]) {
      expect(imports, `evidence-mandate.ts must not import ${forbidden}`).not.toContain(forbidden);
    }
  });
});
