import { decide, type Decision } from "../decision";

// The auto-past-paper-rung refusal ONLY, per Decision 9 of
// docs/design/stories/15.md and docs/milestones/M1.md:107. Mandate
// evaluation, expiry and signature checks, the four risk axes and the
// `VETO` verdict are all M6's (docs/milestones/M6.md:42-44, :63). Everyone
// including this comment expects that surface to grow: M6 extends this
// function rather than replacing it. Note forward: docs/milestones/M6.md:42
// says the mandate evaluation "returns `VETO`", which is not a member of
// `Action` (packages/core/src/decision.ts:14). Whether M6 maps `VETO` onto
// `block` or widens the union is M6's decision; this module does not
// pre-empt it.
export type Rung = "research" | "paper" | "live";

// Recognised strictly; anything else — including a value that merely looks
// like a rung — is unrecognised and blocks. See checkRiskMandate's fail-
// closed default below.
const AUTO_ALLOWED_RUNGS: ReadonlySet<Rung> = new Set(["research", "paper"]);

function isRung(value: string): value is Rung {
  return value === "research" || value === "paper" || value === "live";
}

// Labels are the source of truth for a Story's rung
// (docs/design/03-workflow.md:96-98 and the ladder at :135), and they carry
// the `rung:` prefix literally. A caller reading a label off an issue
// therefore holds "rung:research", not "research". Accepting only the bare
// form made a legitimate auto run at rung:research block — fail-closed, so
// not dangerous, but wrong, and it announced itself only as a doubled prefix
// in the failure message.
//
// At most ONE prefix is stripped, so "rung:rung:live" remains unrecognised
// and still blocks.
const RUNG_LABEL_PREFIX = "rung:";

function normaliseRung(rung: unknown): string {
  if (typeof rung !== "string") {
    return "";
  }
  return rung.startsWith(RUNG_LABEL_PREFIX) ? rung.slice(RUNG_LABEL_PREFIX.length) : rung;
}

// Reproduces the hard-failure block at docs/design/03-workflow.md:498-504
// verbatim. `story` is the caller-supplied Story identifier (e.g. the number
// after "#" in "Story: #902"); `rung` is the Story's current rung, which may
// be any string the caller passed in, including one this module does not
// recognise.
function hardFailure(story: string | number, rung: string): string {
  return (
    "HARD FAILURE in Phase 6 (task-do):\n" +
    `- Story: #${story}\n` +
    "- Expected: rung:research or rung:paper for an /iai:auto run\n" +
    `- Found: rung:${rung}\n` +
    "- Action: Pipeline cannot continue. Fix and re-run."
  );
}

// Evaluates whether an `/iai:auto` run is permitted to proceed against a
// Story at the given rung. `story` identifies the Story for the block
// message only; this function reads nothing about it.
//
// An unrecognised rung fails closed to `block`, per NEVER-15.8's governing
// principle applied here: a rung this module has never heard of is never
// treated as though it were research or paper.
export function checkRiskMandate(story: string | number, rung: string): Decision {
  const normalised = normaliseRung(rung);

  if (isRung(normalised) && AUTO_ALLOWED_RUNGS.has(normalised)) {
    return decide(
      "allow",
      `Story #${story} is at rung:${normalised}; an /iai:auto run is permitted up to rung:paper`,
    );
  }

  return decide("block", hardFailure(story, normalised));
}
