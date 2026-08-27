# S1.3 — Retire the ISC/ISA acronym family

**Story:** #194 · **Milestone:** M1 — Kernel and foundation
**Unit of work:** one vocabulary term, migrated everywhere it appears
**Supersedes vocabulary in:** `docs/design/9-isa.md`, `docs/milestones/M1.md`–`M8.md`

This document is written in the vocabulary it proposes. That is deliberate: a
Story that retires a format should demonstrate the replacement rather than
describe it. If the gate rejects the proposal, this file is the only artifact
that has to change back.

---

## Problem

Three defects, one root cause: identifiers inherited from a project of a
different shape.

**1. The acronyms are never expanded.** `ISC` appears **490** times across the
repository (**438** as `ISC-N`), in 41 tracked files and 43 issue bodies.
Nothing in this repository says what it stands for. The expansion survives only
in the ancestor: `LifeOS/install/settings.enhancements.json:576` — *"ISC = Ideal
State Criteria = Verification Criteria."* `ISA` = *Ideal State Artifact*. A
reader of iAI alone cannot recover either.

**2. `ISC` collides with an OSI licence.** In any TypeScript repository `ISC`
reads as the ISC Licence first. forge's own lockfile carries `"license": "ISC"`.

**3. The identifiers are not unique.** Every Story restarts at `ISC-1`:

| Where | Identifier | Subject |
|---|---|---|
| `docs/design/9-isa.md:96` | `ISC-1` | clean install and build |
| `docs/milestones/M8.md:35` | `ISC-1` | `iai install` writes zero bytes |
| `docs/milestones/M8.md:77` | `ISC-1` | Pulse serves on `:31337` |
| `docs/milestones/M6.md:39` | `ISC-1` | registry resolves `domain:trade` |

LifeOS could carry Story-local numbering because a LifeOS project has **one**
Ideal State Artifact. iAI has one per Story. `docs/evidence/187-*.md` records
`Claims: ISC-4, ISC-9` — unresolvable without also knowing the Story. This is
the defect that actually costs something: it makes evidence ambiguous.

## Vision

Claim identifiers are Story-qualified, self-describing and greppable:

```
CLAIM-9.4    tool-checked   lint fails a core file importing an adapter
NEVER-9.9    tool-checked   packages/core has zero host imports
```

`docs/design/03-workflow.md:7` already commits to this style — *"the binding
re-binds four **nouns** — unit of work, verification, gate, evidence"*. The
workflow layer honours it; the design layer underneath does not. This Story
extends a declared style rather than inventing one.

## Mapping

| Today | Becomes | Note |
|---|---|---|
| `ISC-{n}` in Story `{s}` | `CLAIM-{s}.{n}` | mechanical; `n` is preserved |
| `ISC-{n}` where the row is an anti-claim | `NEVER-{s}.{n}` | mechanical; `n` is preserved |
| `ISA` | **Design** | the path is already `docs/design/` |
| `TELOS` | **Goals** | `/iai:goal-create` already exists |
| Current State | **Existing** | |
| Ideal State | **Target** | a design commits, it does not forecast |
| `deterministic` | `tool-checked` | |
| `judged` | `model-judged` | |
| `attested` | `human-attested` | each now names who says no |

Applied to Story 9, the whole mapping is nine rows: `ISC-1`–`ISC-6` become
`CLAIM-9.1`–`CLAIM-9.6`; `ISC-7`, `ISC-8`, `ISC-9` are anti-claims and become
`NEVER-9.7`, `NEVER-9.8`, `NEVER-9.9`.

**Not renamed**, because none is an acronym and each earns its keep: `rung`
(372 uses), `binding` (178), `sentinel` (79), `Pulse`, `Cortex`. **`TELOS` is
not an acronym** — it is Greek τέλος — but it is opaque to an English reader,
which is why it is in the table.

## Out of Scope

- **`docs/evidence/*.md`.** Immutable. See Constraints.
- **Posted `## iai-evidence` and `## iai-gate` comments.** Immutable.
- Renaming `rung`, `binding`, `sentinel`, `Pulse`, `Cortex`.
- Any change to what a claim *means*, how it is verified, or the rung ladder.
- The four M2–M8 milestone documents' *content*; only their identifiers move.

## Constraints

**`docs/evidence/*.md` is immutable — six documents, SHA-pinned and linked from
issue comments.** They are the record of what was verified and when. Rewriting
them would falsify that record. Migration is **forward-only with a mapping
note**, the way a retired database column is handled. Never a global
find-and-replace.

The same holds for any posted comment carrying `**Decision:** APPROVED`.

**`## iai-isa` is a sentinel** — machine-findable by definition. Renaming it
breaks anything that greps for it. **Nothing does today**, which makes now the
cheapest possible moment, and is the strongest argument for not deferring.

**Nothing parses the `-isa.md` filename.** All eight references
(`ci.yml`, `install-git-hooks.ts`, `verify-required-checks.sh`,
`verify-workflow-hygiene.sh`) are prose comments. The rename is safe; the
comments must still be updated or they become dangling.

## Dependencies

Story #9 closed in `bbc834e`. That was the only blocker and it is discharged.

## Goal

Every claim in the repository is addressable by a globally unique identifier
that a new reader can decode without consulting the ancestor project, and every
anti-claim announces itself as one.

## Claims

- [ ] CLAIM-194.1: No file under `docs/`, `scripts/`, `.github/` or the root
      markdown set contains the token `ISC-`, except for exactly two
      allow-listed paths: `docs/evidence/**` (immutable) and
      `docs/design/194-design.md` (this file, which *is* the mapping note).
      The allow-list is closed — a third path is a violation.
- [ ] CLAIM-194.2: Every claim identifier is Story-qualified —
      `CLAIM-{story}.{n}` or `NEVER-{story}.{n}` — and no two Stories share an
      identifier. Asserted by a script over `docs/design/` and
      `docs/milestones/`.
- [ ] CLAIM-194.3: Every anti-claim carries the `NEVER-` prefix, and no
      `NEVER-` row appears in a `## Claims` list without matching anti-claim
      prose.
- [ ] CLAIM-194.4: `docs/test-plans/*.md` `anchors_to` and Coverage columns
      resolve to identifiers that exist in the corresponding design document; a
      dangling reference fails the check.
- [ ] CLAIM-194.5: The 43 issue bodies carrying `ISC-` are migrated, and the
      `| Claims |` row of every task issue names identifiers that exist.
- [ ] NEVER-194.6: No file under `docs/evidence/` is modified, and no posted
      `## iai-evidence` or `## iai-gate` comment is edited.
- [ ] NEVER-194.7: The `## iai-isa` sentinel is never left dangling — it is
      either renamed everywhere it is written *and* read, or left alone
      entirely.

## Build Targets

| Target | Type | Touched |
|---|---|---|
| `iai-references` | docs | `docs/design/`, `docs/milestones/`, `docs/test-plans/` |
| `iai-core` | library | new guard for CLAIM-194.2 / CLAIM-194.4 |

## Test Strategy

| claim | type | check | threshold | tool | anchors_to | severity |
|-------|------|-------|-----------|------|------------|----------|
| CLAIM-194.1 | tool-checked | no `ISC-` token outside the two allow-listed paths | 0 hits | `git grep -n 'ISC-' -- docs scripts .github '*.md'`, minus `docs/evidence/**` and this file | literal | critical |
| CLAIM-194.2 | tool-checked | every identifier Story-qualified and globally unique | 0 collisions | `bun run claim-lint` (new) | literal | critical |
| CLAIM-194.3 | tool-checked | every anti-claim row carries `NEVER-` | 0 violations | `bun run claim-lint` | derived: anti-claim prose | major |
| CLAIM-194.4 | tool-checked | no dangling `anchors_to` reference | 0 dangling | `bun run claim-lint` | literal | critical |
| CLAIM-194.5 | human-attested | issue bodies migrated, `\| Claims \|` rows resolve | 43/43 | `gh issue list` review | literal | major |
| NEVER-194.6 | tool-checked | `docs/evidence/` untouched across the Story | 0 files changed | `git diff --name-only main...HEAD -- docs/evidence` | literal | critical |
| NEVER-194.7 | tool-checked | `iai-isa` writers and readers agree | 0 asymmetry | `git grep -c 'iai-isa'` before/after | literal | critical |

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Identifier form is `CLAIM-{story}.{n}`, dot-separated | `CLAIM-9-4` is ambiguous with a Story named `9-4`; the dot reads as a version |
| 2 | `n` is **preserved** across the migration | A one-to-one mapping stays auditable; renumbering would break the evidence mapping note |
| 3 | Anti-claims keep their `n` from the `ISC` sequence | `ISC-9` → `NEVER-9.9`, not `NEVER-9.1`. Preserves the audit trail |
| 4 | Migration is forward-only; evidence gets a mapping note | Constraint, not preference |
| 5 | `docs/design/9-isa.md` → `docs/design/9-design.md` | **See open question 1** |

### Open questions for the gate

**1. Story design files collide with the thematic series.** `docs/design/`
currently mixes two kinds of document: ten thematic designs
(`00-synthesis.md` … `09-security.md`) and per-Story designs (`9-isa.md`).
Renaming `9-isa.md` → `9-design.md` puts it one character from `09-security.md`
and makes the collision worse. Three options:

- `docs/design/9-design.md` — minimal change, keeps the ambiguity
- `docs/design/stories/9.md` — separates the two kinds cleanly. **Recommended.**
- leave the filename alone, migrate only the identifiers inside it

**2. Does `## iai-isa` get renamed?** NEVER-194.7 permits either, but the Story
must choose. Nothing reads it today, so renaming to `## iai-design` costs one
commit now and grows more expensive with every Story. **Recommend renaming.**

**3. Is CLAIM-194.5 in scope?** Migrating 43 issue bodies is the largest and
least reversible part, and GitHub issue bodies are not version-controlled.
**Recommend deferring it to its own task** so the document migration can land
and be verified independently.

<sub>Written by iAI, hand-executed. `/iai:story-design` does not exist until M2.</sub>
