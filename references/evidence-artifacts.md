# Evidence Artifacts

**Contract.** The artifact envelope, the sentinel namespace, permalinks, budgets
and paths.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:60`.

> **This document describes constants it deliberately does not contain.**
> `NEVER-35.7` forbids a reference from restating a value `packages/core`
> exports, and this document's subject *is* a set of such values. Every one is
> named by its owning module and line instead. Read the constant; do not copy it
> from here, because a copy is how two definitions drift.

---

## The sentinel namespace

Sentinel comments are how iAI finds its own prior output on an issue. Each is a
markdown comment whose **first line** is the namespace prefix followed by a
sentinel name.

| Thing | Where |
|---|---|
| The namespace prefix | `packages/core/src/evidence/sentinel.ts:53` |
| The nine legal names | `packages/core/src/evidence/sentinel.ts:23-32`, with the array at `:34` |
| The lint rules over a sentinel body | `packages/core/src/evidence/lint.ts:35`, ids at `:45` |

**The name set is closed.** A sentinel outside the nine is rejected, and that is
stricter than the seeded claim it implements — see Decision 5 of
`docs/design/stories/31.md`. Adding a tenth is a Design change, not a code change.

### One sentinel, one comment

A sentinel is **updated in place**, never stacked. Two comments carrying the same
sentinel is an ambiguity nothing downstream can resolve: "the latest" is not a
property of a comment list a reader can rely on.

Update with a PATCH against the existing comment id, and **verify the comment
count did not change** afterwards.

> **"One gate, one comment" means UPDATE an existing sentinel — it does not mean
> skip posting a new one** when none exists. Enumerate first, then decide.

### Discovery and upsert are owned here

`docs/design/01-skill-hierarchy.md:54` assigns "comment upsert by sentinel" to
`references/gh-operations.md`, and `:60` assigns the namespace to this document.
Both cannot own it.

**Resolved by Decision 7 of `docs/design/stories/35.md`**, following the boundary
`docs/design/stories/21.md:88-92` already drew when S1.3 excluded upsert and
assigned it to S1.4:

- `references/gh-operations.md` owns **argv construction** — the create, edit and
  list calls.
- **This document owns the upsert decision** — which comment is *the* sentinel,
  and therefore which one to edit.

The consumer side is `packages/core/src/evidence/consumer.ts`; the upsert types
are at `packages/core/src/evidence/upsert.ts`.

---

## Permalinks must be SHA-pinned, and pinning is not existence

A permalink in a sentinel points at a blob at a **commit SHA**, never a branch
name. A branch-relative link silently changes meaning when the branch moves.

The shape is validated against the pattern exported at
`packages/core/src/evidence/permalink.ts:27`.

> **Format validation is not existence validation.** A well-formed but fabricated
> 40-hex SHA passes every check in this repository and still 404s. This was hit
> live: a wrong SHA that shared the real one's short prefix linted clean.
>
> **Resolve the SHA against the remote before posting.** No regex can do it.

The SHA to pin is the commit that **contains the artifact** — usually the
*evidence* commit, not the implementation one.

---

## Budgets

Three related limits, all exported from
`packages/core/src/evidence/render.ts`:

| Constant | Line | Role |
|---|---|---|
| the working budget | `:40` | what an artifact body may occupy |
| the hard limit | `:56` | the ceiling the host imposes |
| the envelope allowance | `:59` | derived — the difference, reserved for the wrapper |

The third is **computed from the other two**, not declared independently. That is
deliberate: two independently-declared numbers plus a subtraction is three places
to be wrong.

When a body exceeds the budget, the render strategy switches from inline to a
summary (`RenderStrategy`, `:61`). **The artifact is never silently truncated** —
a truncated artifact that still looks well-formed is worse than a summary that
announces itself.

> **The hard limit has no source in this repository.** It is marked at
> `packages/core/src/evidence/render.ts:42-56` as an explicitly unverified
> inherited constant. It is treated as authoritative because something must be,
> not because it was confirmed.

---

## The artifact on disk

Artifacts live under `docs/evidence/`, one file per verification run, named for
the issue and the run timestamp. The timestamp format is produced by
`formatCompactUtcTimestamp` — **that function is the definition**; four documents
in this repository describe the format differently and the shipped form is the
one that counts.

Each artifact carries frontmatter identifying the issue, the story, the commit,
the branch, the run time and the verdict.

**Artifacts are immutable.** A verification that was wrong is superseded by a new
artifact, never edited. The story-verify check for this is
`git diff --name-only --diff-filter=MD main...HEAD -- docs/evidence`, and
**`--diff-filter=MD` is mandatory** — the unfiltered form returns the Story's own
added artifacts and reads as a false failure (Decision 12 of
`docs/design/stories/26.md`).

### An artifact changes the tree it describes

A case in `packages/core/test/` reads `docs/evidence/` at run time and counts what
it finds. **Committing an artifact therefore changes the `expect()` total the
artifact reports.**

State which commit each number was measured at. It is the only way the arithmetic
reconciles, and it is why every artifact's frontmatter carries a `commit:` field.

---

## Evidence precedes the label

Write and commit the artifact, **then** transition the issue. A `status:resolved`
with no artifact behind it is a claim, not a result. See
`references/workflow-states.md` and `references/verification.md`.

---

## What this document does not own

- **The `gh` argv** — `references/gh-operations.md`.
- **What makes a verdict true** — `references/verification.md`.
- **When the label may move** — `references/workflow-states.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Sentinel namespace prefix and the nine closed names | `packages/core/src/evidence/sentinel.ts:53`, `:23-32`, `:34` | confirmed — **named, never written out**. This is the `NEVER-35.7` bind recorded as Decision 7's neighbour; resolved by citing rather than restating |
| A sentinel outside the nine is rejected | Decision 5 of `docs/design/stories/31.md` | confirmed — stricter than the seeded claim |
| Upsert-by-sentinel ownership | `01-skill-hierarchy.md:54` vs `:60` | **resolved** by Decision 7 of `docs/design/stories/35.md` — argv there, upsert decision here |
| Permalinks SHA-pinned; pattern exported | `packages/core/src/evidence/permalink.ts:27` | confirmed — **pattern named, not copied** |
| Format validation is not existence validation | hit live; no guard closes it | **carried** — owner: S1.4's sentinel engine if a future Story widens it |
| Working budget, hard limit, derived envelope | `packages/core/src/evidence/render.ts:40`, `:56`, `:59` | confirmed — **all three named, none written out** |
| The hard limit has no source in this repository | `packages/core/src/evidence/render.ts:42-56` | **carried** — an explicitly unverified inherited constant |
| The `{ts}` timestamp format differs across four documents | `formatCompactUtcTimestamp` is the shipped form | **carried** — owner: the four documents, per Decision 8 of `docs/design/stories/35.md` |
| Artifacts are immutable; `--diff-filter=MD` mandatory | Decision 12 of `docs/design/stories/26.md` | confirmed |
