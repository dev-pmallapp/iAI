# Context Discovery

**Contract.** How a skill establishes project state without a config file.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster — it is read by explicit path. See
`docs/design/01-skill-hierarchy.md:53` for the ownership row.

---

## The rule that produces everything else

**Never trust conversation memory. Re-read disk and GitHub before acting.**

A skill that assumes it knows the current state is a skill that corrupts it. The
same rule appears as a checklist item at `CONTRIBUTING.md:266-269` ("Phase 0 must
run context discovery") and as the verification doctrine in
`references/verification.md`.

Context discovery is therefore **Phase 0 of every skill**, and it reads three
files plus GitHub. It writes nothing.

---

## The three parse targets

iAI has no `iai.config.json` and will not grow one. Project context is derived
from documents that already have to be correct for humans, on the reasoning that
a config file is a fourth place for the truth to drift.

| Source | Section | Yields |
|--------|---------|--------|
| `ARCHITECTURE.md` | `## Build Targets` | the build-target table: package name, type, path |
| `CONTRIBUTING.md` | `## Commands` | the verification commands and what each proves |
| `docs/milestones/M*.md` | the `\| Feature \| Description \|` table | the feature rows a Story is cut from |

### Resolution order

1. `ARCHITECTURE.md` first. It names the packages, and a target that is not in
   that table does not exist for planning purposes.
2. `CONTRIBUTING.md` second, for the commands that verify those targets.
3. The milestone file last, because it is scoped by the first two — a feature
   row naming a build target absent from `ARCHITECTURE.md` is a defect in the
   milestone, not a new target.

The order matters when they disagree. **They do disagree**, and the resolution is
not "prefer the newest".

### Failure modes

| Failure | Correct response |
|---------|------------------|
| The section heading is missing | **Fail loudly.** Do not fall back to scanning the whole file — a heuristic that "finds" a table elsewhere will find the wrong one |
| The table is present but empty | Fail. An empty table is a defect, not an empty project |
| A row references a path that does not exist | Report it and continue. `packages/core/src/guards/path-allowlist.ts` exists precisely because some cited paths are legitimately not yet created |
| Two sources disagree | Follow the resolution order above, **and record the disagreement**. Do not silently pick one |
| The file is absent entirely | Fail. This is not a project iAI can plan against |

**Never infer a build target from the filesystem.** `packages/` may contain a
directory that is deliberately not a target. The table is the authority.

---

## Known drift, recorded rather than resolved

Two of the three parse targets are specified in more than one place, and this is
documented in the conflict register at `docs/design/verification-pass.md`.

- **The `## Commands` shape.** A block form and a table form are both specified.
  Where the table form is used, its header column is `Kind`, while the upstream
  tool this pattern was adopted from parses `Action`. Register rows 36 and 473.
- **`{target_dir}`.** Defined twice, at `CONTRIBUTING.md:64` and
  `docs/design/04-domain-dev.md:334`. The `CONTRIBUTING.md` form was adopted;
  register rows 35 and 475 record that the other form is the one actually used
  upstream.

  > **The register's own citation is off by one.** Row 35 gives
  > `CONTRIBUTING.md:63`, which is `{target}` — a different placeholder in the
  > same table. `{target_dir}` is at `:64`. The row is **not corrected here**:
  > `docs/design/verification-pass.md`'s verdict rows are immutable by Decision 9
  > of `docs/design/stories/35.md`. It is recorded instead, and it is the second
  > stale line-number citation found while writing S2.1 — see the reconciliation
  > table below.

A parser must tolerate both shapes or fail with the shape it found named in the
error. It must not guess.

---

## What this document does not own

- **The verification doctrine itself** — `references/verification.md`.
- **Any `gh` invocation.** Discovery reads GitHub through the argv builders
  described in `references/gh-operations.md`; it does not construct its own.
- **What to do when a read fails transiently** — `references/gh-error-handling.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Three parse targets, and their sections | `docs/design/01-skill-hierarchy.md:53` | confirmed |
| Phase 0 must run context discovery | `CONTRIBUTING.md:266-269` | confirmed |
| No config file, by design | `docs/design/01-skill-hierarchy.md:53` | confirmed |
| `## Commands` specified twice | `docs/design/verification-pass.md` rows 36, 473 | **carried** — owner: `CLAIM-9.6` / #14 |
| `{target_dir}` specified twice | `docs/design/verification-pass.md` rows 35, 475 | **carried** — owner: `CLAIM-9.6` / #14 |
| Register row 35 cites `CONTRIBUTING.md:63` for `{target_dir}` | `CONTRIBUTING.md:63` is `{target}`; `{target_dir}` is at `:64` | **carried, not corrected** — the row is immutable by Decision 9. Second instance of the stale-`:NN` class (finding 26); the first was `docs/design/stories/35.md`'s Problem 5 citing `01-skill-hierarchy.md:471` for a rule at `:472` |
