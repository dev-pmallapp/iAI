# Design Format

**Contract.** The structure of a Story's Design document.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row:
`docs/design/01-skill-hierarchy.md:63`.

> **This file was seeded as `isa-format` and renamed to `design-format`** at the
> S2.1 design gate on a human decision, 2026-09-05 (Decision 5 of
> `docs/design/stories/35.md`). `docs/design/stories/194.md:63` retired the `ISA`
> acronym and maps it to **Design**, and `docs/milestones/M1.md:269-272`
> sequenced that retirement before M2 precisely so this document would not be
> written in the retired vocabulary and need migrating twice.
>
> `docs/design/9-isa.md` keeps its name: it is a historical artifact, migrated
> separately at `docs/design/stories/194.md:225`.

---

## Where a Design lives

`docs/design/stories/{issue}.md`, one per Story. It is written by
`/iai:story-design`, approved at a gate, and is **authoritative over the
milestone's indicative task table** (`PLAN.md:200-203`).

---

## Frontmatter — the convention, not the keys

**No YAML frontmatter.** An H1 title over a bolded metadata block, ruled G1b.

The format is **v2.21.0**, inherited from LifeOS, where the same structure is
called an ISA. iAI keeps the structure and drops the acronym.

---

## Body sections — ordered, not fixed

The body carries a **ten-section ordered spine**, measured 9 of 9.

> **Ruled at the gate (G1a).** The seventeen-section reading is retired. The
> ten names live in `packages/core/src/guards/design-spine.ts`, enforced by
> `claim-lint`'s `design-spine` rule — cited here, not copied, because a
> second list is one that drifts from the rule that checks it.
>
> `docs/design/verification-pass.md:515` (row 461) had already verdicted the
> "seventeen, fixed" reading `corrected`: *"Empty sections are excluded
> entirely"*. `docs/milestones/M2.md:85`'s "all seventeen" is **annotated,
> not falsified** — `CLAIM-41.3` is where the disagreement was discharged.

A conforming Design therefore preserves **relative order**; it does not pad.

---

## Claims

Claims are checkbox lines, one per acceptance criterion:

```
- [ ] CLAIM-{story}.{n}: <a statement that can be shown true or false>
```

Two properties make them useful rather than decorative:

**They are addressable.** `CLAIM-35.3` names one assertion in one Story, so a
test plan case, a task, and an evidence row can all point at the same thing.

**They carry dependencies.** `(after: ID)` orders one claim behind another, which
is what lets tasks be cut without re-deriving the order by hand.

### Anti-claims

A claim of the form "X never happens" is written as `NEVER-{story}.{n}`, not as a
`CLAIM-` with a negation. The distinction is enforced —
`claim-lint`'s `anticlaim-not-never` rule fails a negative claim wearing the
positive prefix.

### Claims may be restated, and the restatement is recorded

A milestone seeds claims before the Design exists, so some arrive unverifiable —
false at HEAD, or governing a population the Story does not create.

**Restate to what is true and enforceable, and record the deviation.** That
posture is set by Decision 3 of `docs/design/stories/26.md` and Decision 1 of
`docs/design/stories/31.md`, and S2.1 restated four of its six seeded criteria
under it.

A restated claim is marked in the Test Strategy's `anchors_to` column as
`derived:` plus the Decision that restates it, so the deviation is visible rather
than silent.

---

## The Test Strategy table

| Column | Carries |
|---|---|
| `claim` | the claim id |
| `type` | one of the three verifier classes |
| `check` | what is actually run or read |
| `threshold` | the number that must hold, **including the denominator** |
| `tool` | the command |
| `anchors_to` | `literal`, or `derived:` and the Decision |
| `severity` | how bad a failure is |

The three verifier classes are declared at
`packages/core/src/binding/domain.ts:125`; see `references/verification.md` for
what each means and when each is the honest choice.

> **State the denominator in `threshold`.** "0 violations" over an unstated corpus
> is the vacuous pass `skill-lint` demonstrates daily. Write "0 across N files",
> and assert N.

---

## `## Build Targets` — iAI's addition

iAI adds a `## Build Targets` section that the upstream format does not have.
It names every target the Story touches, and it is **authoritative over the
milestone's indicative task table**.

This is not cosmetic. Four consecutive Stories have found the milestone's task
table under-counts enforcement work — S1.3 needed a net-new task, then S1.4, then
S1.5, then S2.1. The Build Targets table is where that work is declared so
`/iai:task-create` cannot silently drop it.

---

## What this document does not own

- **When a Story is too big to design** — `references/sizing-criteria.md`.
- **What makes a claim verified** — `references/verification.md`.
- **The evidence a claim produces** — `references/evidence-artifacts.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Stored at `docs/design/stories/{issue}.md` | `docs/design/01-skill-hierarchy.md:63` | confirmed |
| Frontmatter keys, v2.21.0 | `docs/design/01-skill-hierarchy.md:63` | **corrected** — gate ruling **G1b**. 8 of 9 shipped Designs carry no frontmatter at all; the one that does has *seven* keys with stale values. The convention, not the keys, is the rule |
| Seventeen body sections | `docs/design/01-skill-hierarchy.md:63` | **corrected** — gate ruling **G1a**. The measured spine is **ten**, 9 of 9. The list is held by `packages/core/src/guards/design-spine.ts`, not restated here |
| Sections are **ordered, not fixed** | `docs/design/verification-pass.md:515` (row 461) | **discharged** — was `carried` against `docs/milestones/M2.md:85`'s "all seventeen"; resolved by Decision 3 of `docs/design/stories/41.md`, ruled G1a. `CLAIM-41.3` |
| Claim grammar and `(after: ID)` dependencies | `docs/design/01-skill-hierarchy.md:63` | confirmed |
| Anti-claims use the `NEVER-` prefix | `claim-lint`'s `anticlaim-not-never` rule | confirmed — enforced, not conventional |
| Restatement posture | Decision 3 of `docs/design/stories/26.md`, Decision 1 of `docs/design/stories/31.md` | confirmed |
| `## Build Targets` is iAI's addition and is authoritative | `PLAN.md:200-203` | confirmed |
| This file was renamed from `isa-format` | Decision 5 of `docs/design/stories/35.md`, human decision 2026-09-05 | confirmed |
