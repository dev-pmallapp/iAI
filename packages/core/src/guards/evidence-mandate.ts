import { decide, type Decision } from "../decision";
import { renderHardFailure } from "./hard-failure";

// CLAIM-47.6's refusal: task-verify does not resolve a task whose anchored
// CLAIM-{story}.{n} has no artifact on disk.
//
// The doctrine is references/evidence-artifacts.md:140-144 — "A
// `status:resolved` with no artifact behind it is a claim, not a result." It
// had no reader (Problem 6 of docs/design/stories/47.md); this is the reader.
//
// ============================================================================
// THIS MODULE RESOLVES NOTHING, AND THAT IS THE DESIGN, NOT AN OMISSION
// ============================================================================
//
// It takes an ALREADY-DETERMINED resolution and decides what to do about it.
// It does not enumerate docs/evidence/, does not parse a Claims row, and does
// not decide whether a claim is covered. The seam is the one
// risk-mandate.ts:58-60 already documents for the same reason: "`story`
// identifies the Story for the block message only; this function reads nothing
// about it."
//
// The reason is specific and is recorded in #341. Build target 4's
// claim-to-artifact resolver CANNOT be built as the Design specifies, because
// the corpus will not support it: of the 54 artifacts in docs/evidence/, 21
// carry no `| Claims |` row at all and the other 33 use at least five mutually
// incompatible notations, plus a retired `ISC-*` namespace. docs/evidence/ is
// immutable (NEVER-194.6), so neither the gaps nor the notations can ever be
// normalised.
//
// Only ONE DIRECTION is sound over such a corpus:
//
//   SOUND   — a claim id appearing in ZERO artifacts is certainly uncovered.
//   UNSOUND — a claim id appearing somewhere is therefore covered. This needs
//             range expansion across five notations and cannot be had.
//
// A refusal needs only the sound direction, which is why CLAIM-47.6 can ship
// while build target 4 is blocked. Gate ruling G-b on #47 records case 8 as
// PARTIALLY discharged on exactly this basis, carrying the positive direction
// to build target 4.
//
// So: if a future change makes this module read the corpus itself, it has
// silently adopted the unsound direction and pre-empted a ruling that has not
// been made. Supply the resolution; do not compute it here.

// What the caller determined about the anchored claim's artifact.
//
// `absent` is deliberately NOT "not found" — the distinction matters. A caller
// that could not look (a read failed, a directory was unreadable) has NOT
// established absence, and must not report `absent`, because the refusal below
// is indistinguishable from the one earned by a genuinely missing artifact.
// Fail the read loudly instead; do not launder it into a verdict.
export type EvidenceResolution =
  | { readonly kind: "present"; readonly artifact: string }
  | { readonly kind: "absent" };

export interface EvidenceMandateInput {
  // The task issue being verified, for the block's subject line.
  readonly task: string | number;
  // The Story the task belongs to, named in the refusal's prose.
  readonly story: string | number;
  // The claim the task is anchored to, e.g. "CLAIM-47.6".
  readonly claim: string;
  readonly resolution: EvidenceResolution;
}

// Phase 7 is task-verify (docs/design/03-workflow.md:21).
const TASK_VERIFY_PHASE = 7;
const TASK_VERIFY_SKILL = "task-verify";

export function checkEvidenceMandate(input: EvidenceMandateInput): Decision {
  if (input.resolution.kind === "present") {
    return decide(
      "allow",
      `Task #${String(input.task)} is anchored to ${input.claim}, and ` +
        `${input.resolution.artifact} is on disk behind it`,
    );
  }

  return decide(
    "block",
    renderHardFailure({
      phase: TASK_VERIFY_PHASE,
      skill: TASK_VERIFY_SKILL,
      subject: { kind: "Story", value: input.story },
      expected: `an evidence artifact on disk for ${input.claim}, anchored by task #${String(input.task)}`,
      found: "none",
      // The doctrine, said in the block rather than only in the reference, so
      // the person who reads the refusal reads the reason with it.
      remedy:
        "A status:resolved with no artifact behind it is a claim, not a result. " +
        "Run the verification, write the artifact, and re-run.",
    }),
  );
}
