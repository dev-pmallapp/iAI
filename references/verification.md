# Verification

**Contract.** What counts as proof, and what does not.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:56`.

---

## The doctrine

> **Never trust conversation memory. Re-read disk and GitHub before acting.**

A skill that believes what it said three turns ago is a skill that acts on a
state that no longer exists. Every verb re-establishes state in Phase 0 — see
`references/context-discovery.md`.

Two corollaries, both non-negotiable:

1. **Evidence must exist on disk before any issue is closed.** Not "the work was
   done" — an artifact, committed, at a path.
2. **Evidence precedes the label.** Write and commit the artifact, *then*
   transition. A `status:resolved` with no artifact behind it is a claim.

---

## The three verifier classes

Declared as a type at `packages/core/src/binding/domain.ts:125`, and validated
against a closed list at `packages/core/src/binding/validate.ts:68`. A domain
binding chooses one per rung.

| Class | Means | Fails when |
|---|---|---|
| `tool-checked` | a command exits 0, or a test asserts it | there is no command; "I ran it" is not a tool |
| `model-judged` | a model reads the artifact and reaches a verdict | the judgement is not recorded with its reasoning |
| `human-attested` | a person states it is so | nobody is named, or the attestation is inferred from silence |

**The classes are not a quality ranking.** `model-judged` is the correct class
for a reconciliation, because meaning is not mechanically checkable, and calling
it `tool-checked` would be a vacuous pass dressed as rigour. Likewise
`human-attested` is correct where no automated check exists — protocol adherence,
for instance — and inventing a tool for it would be worse, not better.

**Choosing a stronger-sounding class than the check supports is the failure this
taxonomy exists to prevent.**

---

## A check that passes while checking nothing

The standing example lives in this repository. `skill-lint` is required in CI and
has reported success on every run since S1.3 — over **zero files**, because
`skills/` is empty.

It is not broken. It is green, and it is meaningless, and nothing distinguishes
the two from the outside.

> **Assert the denominator.** A check that reports "0 violations" must also
> report how many things it looked at, and something must assert that the number
> is non-zero.

This applies to every enumerating check in the repository, and it is why cases
throughout `docs/test-plans/` assert a count before asserting a result.

### The related trap: a guard shadowed by another guard

When several rules can reject the same fixture, a test proving "it was rejected"
proves nothing about the rule under test. Assert **the reason**, not the verdict.

And when distinguishing two rules by their messages: **two messages that differ
only in the value they quote are one message.** Name a phrase belonging to
exactly one rule and assert the **absence** of the other's.

---

## Format is not existence

A validator that checks a permalink's *shape* has not checked that the target
exists. A well-formed but fabricated 40-hex SHA passes every format check in this
repository and still 404s — this was hit live, with a wrong SHA that shared the
real one's short prefix.

**Resolve a SHA against the remote before citing it.** Format validation cannot
do it, and no amount of stricter regex will change that.

---

## Mutation testing

A test suite that has never been shown to fail is a suite of unknown value.
Every task in this repository so far has had at least one surviving mutation, and
each one taught something the suite did not know.

Two rules that keep earning:

- **A condition that cannot hold is an assertion that does not exist.**
- **A hang is not a throw.** `expect(fn).not.toThrow()` cannot catch a function
  that never returns. Hostile-input corpora need a per-call time cap.

Run mutations against the **committed** tree. A run on a dirty working copy is a
recollection, not evidence.

### A mutation may survive because the defect is not yet reachable

A pre-emptive fix — one guarding a state the tree has not reached — will show a
surviving mutation, because the thing it prevents cannot happen yet. That is not
a pass and not a failure.

**Simulate the future state and kill it there**, then record it as a survivor
with a forward-dated kill. Recording it as "killed" would be false; recording it
as a bare survivor would imply the fix was wrong.

---

## What this document does not own

- **How to establish state** — `references/context-discovery.md`.
- **What an artifact looks like** — `references/evidence-artifacts.md`.
- **When a label may move** — `references/workflow-states.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Never trust conversation memory | `docs/design/01-skill-hierarchy.md:56`, `CONTRIBUTING.md:266-269` | confirmed |
| Evidence on disk before closure; evidence precedes the label | `docs/design/01-skill-hierarchy.md:56` | confirmed |
| Three verifier classes | `packages/core/src/binding/domain.ts:125`, validated at `validate.ts:68` | confirmed — **owning module named**. The three names are used here because defining them is this document's assigned job (`01-skill-hierarchy.md:56`); the closed list itself is not copied |
| `skill-lint` is green over zero files | observed every run since S1.3 | confirmed — **an open weakness, not a defect in this document** |
| Format validation is not existence validation | hit live; no guard can close it | **carried** — owner: S1.4's sentinel engine, if a future Story widens it |
