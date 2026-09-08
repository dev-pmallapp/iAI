// A synthetic goals source, declared as such.
//
// WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT A SHORTCUT.
//
// `goal-create` is one of the four skills the harness must run, and its Phase 0
// input is a goals document under `USER/`. references/data-classification.md
// :66-76 establishes two things about that path: `USER/` in the public tree is
// a SYMLINK INTO A SEPARATE PRIVATE REPOSITORY and the symlink itself is
// gitignored, and "an unclassified file under `USER/` is treated as `PRIVATE`,
// never as `INTERNAL`".
//
// So there are two independent reasons a real goals corpus cannot be used:
//
//   1. NO PUBLIC CHECKOUT CAN SUPPLY IT. CI has no access to the private
//      repository, so a harness keyed to the real path would be skipped in CI
//      -- and a skipped required check reports SUCCESS (NEVER-9.8).
//
//   2. IT MAY NEVER REACH A CLOUD MODEL. `PRIVATE` content has no consent
//      path, no de-identification path and no override. The live rung (#324)
//      sends its input to a model, so a live run against the real source would
//      be a designed egress violation, not an accident.
//
// references/verification.md:102-106 is explicit that a synthetic corpus is
// legal and a lesser one only when UNDECLARED: "What is forbidden is an
// undeclared or unreasoned synthetic corpus, not a synthetic one." The reason
// is stated here, in the module, so a test citing it does not have to restate
// it and cannot drift from it.
//
// #292 owns whether a public `templates/GOALS.template.md` ships. If it does,
// this fixture should be reconciled against it rather than kept in parallel.

/** The declaration a case's `Corpus` column must carry when it uses this. */
export const GOALS_FIXTURE_CORPUS_DECLARATION =
  "synthetic — the real goals source is a gitignored symlink into a private " +
  "repository and is PRIVATE by fail-safe default, so no public checkout can " +
  "supply it and no cloud model may receive it";

export interface GoalsFixtureOptions {
  /** Goal identifiers, in order. Distinct per scenario so two scenarios cannot
   *  accidentally share an identity key -- which is what `goal-create`'s
   *  idempotency is keyed on. */
  readonly goals: readonly string[];
}

/** Render a goals document in the shape `goal-create` parses.
 *
 *  DELIBERATELY MINIMAL. #292 records that the `G0` grammar is unspecified;
 *  inventing a rich format here would be inventing the specification that
 *  issue exists to settle, and a later ruling would silently invalidate every
 *  scenario built on it. */
export function renderGoalsFixture(options: GoalsFixtureOptions): string {
  const lines = ["# Goals", "", "<!-- SYNTHETIC FIXTURE. Not a real goals document. -->", ""];
  for (const [index, goal] of options.goals.entries()) {
    lines.push(`## G${index}: ${goal}`, "");
  }
  return lines.join("\n");
}
