// The `Blocked by:` directive's FORM, owned in one place.
//
// Decision 8 of docs/design/stories/21.md:213 — *"Comma rejection is
// per-directive, not generic: `Closes` is per-line; `Blocked by:` is
// comma-separated and correct."* `docs/design/04-domain-dev.md:449` and
// `docs/design/05-domain-trading.md:525` both show `Blocked by: #931, #932`.
//
// WHY THIS IS A MODULE AND NOT A LINE INSIDE ITS ONE CALLER. Until #48 the
// form existed once, inline in `renderPrBody` (pr.ts), because only PR bodies
// carried it. CLAIM-47.2 puts the same directive on TASK ISSUE bodies, and
// the second copy is where a contract starts to drift: two emitters, one of
// them one day sorting or splitting, and no test comparing them.
//
// Same argument as #316's hard-failure spec, one Story later. The repository
// has now paid for this lesson twice (a second argv classifier in #320, a
// second git layer forbidden by G4/G3), so the form is extracted on first
// reuse rather than on the third.
//
// ORDER IS NEVER CHANGED HERE. `sub-issues.ts:200-203` already refuses to
// sort a checklist because `docs/milestones/M2.md:123-125` requires
// `Blocked by:` to match the parent checklist order; a sort in this function
// would break that claim from underneath a module that was careful not to.

export const BLOCKED_BY_PREFIX = "Blocked by: ";

export const BLOCKED_BY_SEPARATOR = ", ";

/**
 * Render the single `Blocked by:` line for the given issue numbers.
 *
 * EXACTLY ONE LINE, comma-joined, in the order supplied. Callers validate
 * their own input and decide their own failure mode; this function owns the
 * form and nothing else, so there is no way for one caller to emit a shape
 * the other would not.
 */
export function renderBlockedByLine(issues: readonly number[]): string {
  return `${BLOCKED_BY_PREFIX}${issues.map((n) => `#${n}`).join(BLOCKED_BY_SEPARATOR)}`;
}
