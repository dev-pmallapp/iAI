// The house hard-failure block, as ONE spec consumed in two directions.
//
// Build target 7 of docs/design/stories/47.md. The shape is specified at
// docs/design/02-roles.md:276-282: any Ring 0 agent that finds reality
// disagreeing with the pipeline's premise stops and emits it, and the
// conductor parses it to halt.
//
// TWO CONSUMERS, TWO DIRECTIONS, ONE SPEC. TypeScript call sites render
// through `renderHardFailure`. Prose bodies (skills/*/SKILL.md) are validated
// against the same constants by skill-lint's `hard-failure-block` rule. That
// is why the constants below are exported rather than inlined into the
// renderer: a renderer and a validator that agree only by coincidence are two
// contracts, which is the shape this module exists to remove.
//
// WHY THE PROSE BODIES ARE NOT REWIRED THROUGH THIS RENDERER. A SKILL.md body
// is read by a model, not executed, so no function can emit into it at run
// time. The block is the skill's OUTPUT contract — the model must emit those
// lines verbatim at refusal time — which is the opposite direction from the
// `duplicate-contract` rule's targets, where indirection is free. A body
// saying "emit the block from 02-roles.md" asks a model to have loaded a file
// it may not hold, and to interpolate the slots with no worked example.
// Recorded under gate ruling G-a on #47.

// The subject line's key, ruled by G-a on #47 to be an OPEN SLOT rather than
// the fixed `- Story:` that docs/design/02-roles.md:278 used to specify.
//
// ORDER IS LOAD-BEARING AND IS BROADEST TO NARROWEST: a Milestone contains
// Stories, a Story is decomposed toward Goals. It is declared here once so the
// renderer and the lint rule cannot disagree about the vocabulary.
//
// The fixed key was unsatisfiable: goal-create runs BEFORE ANY STORY EXISTS
// (skills/goal-create/SKILL.md:49-51), so `- Story: #` has nothing to name
// there, and it shipped `- Goal: <id>` instead. story-create shipped
// `- Milestone: <milestone>` for the same reason one rung up. Both passed
// review, because the rule that was supposed to police the subject line
// matched `(?:- .+\n?)+` and never looked at the key.
export const HARD_FAILURE_SUBJECT_KINDS = ["Milestone", "Story", "Goal"] as const;

export type HardFailureSubjectKind = (typeof HARD_FAILURE_SUBJECT_KINDS)[number];

// Only `Story` carries the `#` sigil, because only a Story is a forge issue
// number. `Goal` names an identifier from the goals source and `Milestone`
// names a milestone; neither is an issue. All four shipped bodies already
// agree with this, and it is asserted rather than assumed.
export const HARD_FAILURE_ISSUE_SIGIL = "#";

const SIGIL_KINDS: ReadonlySet<HardFailureSubjectKind> = new Set<HardFailureSubjectKind>(["Story"]);

// The invariant halves of the block. Everything a caller supplies is
// interpolated AFTER one of these; nothing a caller supplies can change one.
export const HARD_FAILURE_HEADLINE_PREFIX = "HARD FAILURE in Phase ";

// The action line is FAR more invariant than it looks. All five copies in the
// tree — the four prose bodies and risk-mandate.ts — preserve this prefix
// exactly and vary only the trailing imperative ("Supply the goals source and
// re-run.", "Declare the domain and re-run.", "Label the Story and re-run.",
// "Supply the missing input and re-run.", "Fix and re-run."). The variable
// part is ONE TRAILING SLOT, which is why `remedy` is a parameter and the rest
// of the line is not.
export const HARD_FAILURE_ACTION_PREFIX = "- Action: Pipeline cannot continue. ";

// Field order, after the headline. Declared as data so the lint rule can
// assert ORDER rather than mere presence — the old regex accepted any bullets
// in any order, which is how a transposed Expected/Found pair would have
// shipped unnoticed.
export const HARD_FAILURE_FIELD_ORDER = ["subject", "Expected", "Found", "Action"] as const;

export interface HardFailureSubject {
  readonly kind: HardFailureSubjectKind;
  // The identifier itself, WITHOUT the `#` sigil. A leading `#` is tolerated
  // and stripped exactly once, so a caller holding "#902" off a forge payload
  // and a caller holding 902 render identically. At most one is stripped, so
  // "##902" stays visibly wrong rather than being silently repaired — the same
  // posture as risk-mandate.ts's RUNG_LABEL_PREFIX.
  readonly value: string | number;
}

export interface HardFailureInput {
  // The pipeline phase, per docs/design/03-workflow.md's numbering.
  readonly phase: number;
  // The skill that stopped, e.g. "task-do". Named in the headline's parens.
  readonly skill: string;
  readonly subject: HardFailureSubject;
  // What should have existed.
  readonly expected: string;
  // What was actually found. The four prose bodies all use the literal "none";
  // that is a PROSE convention enforced by skill-lint, not a constraint here,
  // because a TypeScript caller usually knows more than "none" and should say so.
  readonly found: string;
  // The trailing imperative of the action line, e.g. "Fix and re-run.".
  readonly remedy: string;
}

export class HardFailureInputError extends Error {}

function renderSubjectValue(subject: HardFailureSubject): string {
  const raw = String(subject.value);
  const bare = raw.startsWith(HARD_FAILURE_ISSUE_SIGIL)
    ? raw.slice(HARD_FAILURE_ISSUE_SIGIL.length)
    : raw;

  return SIGIL_KINDS.has(subject.kind) ? `${HARD_FAILURE_ISSUE_SIGIL}${bare}` : bare;
}

// Renders the block. Pure: it reads no file, runs no process and consults no
// clock. Every fact in the output arrived as an argument.
//
// THIS FUNCTION DELIBERATELY DOES NOT RESOLVE ANYTHING. It does not decide
// whether an artifact exists, whether a claim is covered, or whether a rung is
// permitted — callers determine that and pass the result in. The seam is the
// one risk-mandate.ts:58-60 already documents: "`story` identifies the Story
// for the block message only; this function reads nothing about it." Keeping
// the emitter free of resolution is what lets CLAIM-47.6's refusal ship while
// build target 4's resolver is still blocked (#341).
export function renderHardFailure(input: HardFailureInput): string {
  if (!Number.isInteger(input.phase) || input.phase < 0) {
    throw new HardFailureInputError(
      `phase must be a non-negative integer, received ${String(input.phase)}`,
    );
  }

  // Each of these would otherwise render a structurally valid block with an
  // empty slot — the failure mode where the block says a refusal happened and
  // names nothing about it, which is precisely when it is most wanted.
  const blank = (["skill", "expected", "found", "remedy"] as const).find(
    (field) => input[field].trim() === "",
  );
  if (blank !== undefined) {
    throw new HardFailureInputError(`${blank} must not be blank`);
  }
  if (String(input.subject.value).trim() === "") {
    throw new HardFailureInputError("subject.value must not be blank");
  }

  // A newline in any slot would forge extra bullet lines, letting a caller
  // inject a field the spec does not have — or split the Action line so the
  // invariant prefix is still literally present but no longer governs.
  const multiline = (["skill", "expected", "found", "remedy"] as const).find((field) =>
    input[field].includes("\n"),
  );
  if (multiline !== undefined) {
    throw new HardFailureInputError(`${multiline} must not contain a newline`);
  }

  return (
    `${HARD_FAILURE_HEADLINE_PREFIX}${input.phase} (${input.skill}):\n` +
    `- ${input.subject.kind}: ${renderSubjectValue(input.subject)}\n` +
    `- Expected: ${input.expected}\n` +
    `- Found: ${input.found}\n` +
    `${HARD_FAILURE_ACTION_PREFIX}${input.remedy}`
  );
}
