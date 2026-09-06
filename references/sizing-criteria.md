# Sizing Criteria

**Contract.** When a Story is too big to design, when a Task is too big to do in
one pass, and what happens when either is true.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row:
`docs/design/01-skill-hierarchy.md:64`.

---

## The split of responsibility

> **The binding supplies the thresholds. This document supplies the method.**
> `docs/milestones/M2.md:220`.

A unit of work means something different in every domain — a module in `dev`, a
marker's measurement chain in `health`, a position in `trade`. The kernel cannot
hold that knowledge, so it does not try.

`UnitSpec` at `packages/core/src/binding/domain.ts:111` is where a pack declares
it: the noun, the description, the minimum, the maximum, and the leaf skill that
executes one.

---

## The thresholds are prose, and that is a known consequence

**`minSize` and `maxSize` are declared as strings.** They are written bounds, not
numbers and not predicates.

Four documents describe them as "thresholds the binding supplies", which reads as
though a comparison were possible. It is not. Decision 6 of
`docs/design/stories/31.md` refused to invent a numeric or predicate form against
zero real callers, and recorded the consequence rather than hiding it:

> **`size` is model-judged against a written bound, not tool-checked against a
> number.**

That is an honest classification, not a shortfall — see the three verifier
classes in `references/verification.md`. Calling it `tool-checked` because the
field exists would be exactly the vacuity this repository keeps finding.

Adding a structured field beside the prose one later is a **widening** that keeps
every existing binding compiling, so the door is open without being propped.

---

## When a Story is too big to design

A Story is too big when its Design cannot state its claims without inventing
sub-Stories inside itself. Symptoms, in order of reliability:

- **Its claims are not independently verifiable.** If proving one requires having
  already built another Story's surface, the boundary is wrong.
- **Its Build Targets span unrelated packages.** One Story, one coherent surface.
- **Two of its claims are jointly unsatisfiable.** This has happened — S1.5's
  `CLAIM-31.1` and `CLAIM-31.3` could not both hold as seeded. That is not
  always a sizing problem, but it is always a signal to stop and re-cut.

The remedy is `replan`, not heroism.

---

## When a Task is too big for one pass

A Task is too big when it cannot be finished, verified and evidenced in one
sitting without leaving the tree red in between.

The sharpest test is **the build must be green at every commit boundary**. If a
Task's change set necessarily leaves the repository failing partway, it is at
least two Tasks — or its parts must land together in one commit, which is itself
a sizing statement.

A worked example from this Story: writing a reference document and retiring its
allow-list entry **cannot** be split, because the guard fails the build the moment
the file exists. That coupling makes them one Task, not two.

---

## What `replan` does

`replan` detects that a requirement changed or a unit was mis-sized, and updates
the plan incrementally rather than re-cutting from scratch.

It applies `status:blocked` when a unit exceeds `maxSize`
(`docs/milestones/M2.md:206-207`), and the blocker is named in a comment — a
blocked issue with no named blocker is not a state, per
`references/workflow-states.md`.

**`replan` is S2.5 and does not exist yet.** Until it ships, mis-sizing is
detected by a human reading the Design and is corrected by hand.

---

## The rejection must state the reason

A unit refused for size names **which** bound it violated and by what measure.
`CLAIM-111.5` (`docs/milestones/M5.md:95-97`) requires exactly this: accept one
marker's chain, reject both a bare measurement (below the minimum) and a
four-marker task (above the maximum), **with the reason stated**.

A refusal that says only "too big" is unactionable, and — because several rules
can refuse the same unit — it is also unfalsifiable. See
`references/verification.md` on asserting the reason rather than the verdict.

---

## What this document does not own

- **The per-domain thresholds themselves** — each pack's binding.
- **The Design a Story is sized against** — `references/design-format.md`.
- **The label applied when a unit is refused** — `references/workflow-states.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| The binding supplies thresholds; the reference supplies the method | `docs/milestones/M2.md:220` | confirmed |
| `UnitSpec` declares noun, description, min, max, leaf skill | `packages/core/src/binding/domain.ts:111` | confirmed — **module and line named; no shape copied** |
| `minSize` / `maxSize` are strings, so `size` is model-judged | Decision 6 of `docs/design/stories/31.md` | **carried** — four documents imply a comparison is possible; it is not. Owner: M2, and a later widening if real callers need one |
| `replan` applies `status:blocked` above `maxSize` | `docs/milestones/M2.md:206-207` | confirmed |
| `replan` does not exist yet | S2.5 | **carried** — mis-sizing is human-detected until it ships |
| A refusal states which bound and by what measure | `CLAIM-111.5`, `docs/milestones/M5.md:95-97` | confirmed |
