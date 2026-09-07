---
issue: 47
repo: dev-pmallapp/iAI
story: "S2.3 — Execution skills"
milestone: "M2 — Universal lifecycle"
---

# Test Plan: #47 — S2.3 Execution skills

## Source

`docs/design/stories/47.md` at `8039d53` — 9 claims (`CLAIM-47.1`–`.7`, `.11`,
`.12`) and 3 anti-claims (`NEVER-47.8`, `.9`, `.10`), 11 Problems, 6 Decisions,
11 Build Targets.

**The design gate was ruled APPROVED before this plan was written**, 2026-09-07,
carrying four rulings: G1 restate `CLAIM-47.1` to the Design's `## Build
Targets` table, G2 drop the plural `Blocked by:` lines and move cycle refusal
out of scope with an owner, G3 close the task issue at verify time, G4 share the
git/argv layer with #293's adapter port. This plan is written against the ruled
Design, not against `docs/milestones/M2.md:119-137`. **Four of the six seeded
criteria are restated**, and every one is marked `derived:` with its Decision.

## Feature Summary

These are the three highest-traffic verbs in the system and the ones most likely
to corrupt state. The plan's difficulty is that **two of the six seeded claims
were unimplementable and one was already named defective inside shipped code**,
so most cases verify a restatement rather than the milestone's sentence.

Five things carry the weight.

**The first is that `CLAIM-47.1` was a type error, not a phrasing problem.**
`binding.unitOfWork` is `UnitSpec` — five `readonly string` fields, declared
singular, validated with `isPlainObject`. Case 1 therefore parses the Design's
`## Build Targets` table over **every Design on disk**, which is the source four
independent documents name and the one the spine guard already guarantees
exists.

**The second is a live defect this Story fixes.** Case 2 asserts the Story's
existing body **survives** the checklist merge. At HEAD it does not:
`packages/core/src/gh/sub-issues.ts:296-304` passes the checklist as the whole
`--body`. Case 12 is its mutation — and **it kills nothing until Build Target 1
lands**, because there is no body-preservation logic to delete. That is recorded
as a forward-dated kill, the taxonomy S2.1 established, not hidden as a pass.

**The third is that a shipped module already refuses `CLAIM-47.5`'s path.**
`packages/core/src/evidence/template.ts:108-116` rejects `{n}` at construction
and its message names `docs/milestones/M2.md:132` — this claim's own first line
— as defective. Case 5 asserts the refusal *and* that the message still names
the placeholder, so the warning S1.4 aimed two milestones forward cannot decay
into a generic error.

**The fourth is that the `--remove-label` pairing is unsatisfiable for a task's
first status.** Case 10 asserts the transition emits **exactly one command in
all three cases**, including zero on a no-op. This is the second occurrence of a
defect `packages/core/src/gh/labels.ts:16-26` already restated for `CLAIM-21.3`,
in that file's own comment.

**The fifth is that three new verbs enter a partition that is now asserted.**
The #307 ruling replaced the domain exemption with two named populations whose
sizes must sum to the `SKILL.md` count read from disk. Case 14 is that equality
at **seven**. `task-create`, `task-do` and `task-verify` must each be classified
deliberately, or the total stops matching — by design.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-47.1 | 1 | P0 |
| CLAIM-47.2 | 9 | P0 |
| CLAIM-47.3 | 3, 11 | P0 |
| CLAIM-47.4 | 17 | P0 |
| CLAIM-47.5 | 4, 5, 10, 20 | P0 |
| CLAIM-47.6 | 8 | P0 |
| CLAIM-47.7 | 2, 12 | P0 |
| NEVER-47.8 | 6, 7 | P0 |
| NEVER-47.9 | 15, 18 | P0 |
| NEVER-47.10 | 13 | P0 |
| CLAIM-47.11 | 14 | P0 |
| CLAIM-47.12 | 16 | P1 |
| cross-cutting | 19 (P1) | P1 |

20 cases — 18 P0 / 2 P1 / 0 P2.

**Corpus distribution: 11 `real` / 8 `synthetic` / 1 `none`.** The real majority
is possible because this Story's subject already exists on disk: eleven Designs
to parse, twelve reference documents, seven skill bodies, and an argv layer whose
refusals shipped two milestones early.

## Standing checks

Not anchored to a claim, and not optional. Run at story-verify.

| Check | Command | Passes when |
|-------|---------|-------------|
| Evidence immutability | `git log --diff-filter=MD --name-only -- docs/evidence/` | no artifact modified or deleted |
| Required contexts | `bash scripts/verify-required-checks.sh` | PASS, six contexts |
| Workflow hygiene | `bash scripts/verify-workflow-hygiene.sh` | PASS, six jobs |
| Allow-list retirement | `bun run claim-lint` | `allowlist-stale` 0 before and after the three verb directories land |
| Full chain | `bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint && bun run claim-lint` | all 0 |
| CI on the integration PR | `gh pr checks 313` | 7/7 |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 1 | `task-create` enumerates tasks from the Design's `## Build Targets` table | CLAIM-47.1 | iai-core | P0 | tool-checked | real — every `docs/design/stories/*.md` on disk | `bun test` | Every Design parses and yields a row count, with **the Design count read at run time and asserted non-zero first**. A Design with the section removed fails. `derived:` Decision 1, ruled G1 — `binding.unitOfWork` is a `UnitSpec`, not a list, and supplies the noun and sizing bound only |
| 2 | A `## Tasks` checklist merges into the Story body without discarding it | CLAIM-47.7 | iai-core | P0 | tool-checked | synthetic — a Story body carrying prose that must survive; no live Story may be mutated by a test | `bun test` | The pre-existing body is present **after** the merge, and the checklist is added. Re-running is idempotent, modelled on `withParentLine`. **At HEAD this fails** — see case 12 |
| 3 | `task-do` names the branch and validates the commit subject | CLAIM-47.3 | iai-core | P0 | tool-checked | real — the four-step slug rule at `packages/core/src/gh/pr.ts:52` | `bun test` | `task/{n}-{slug}` matches the shipped four-step slug, and `checkCommitPrefix` accepts the subject it produces. The prefix has eight homes; this case cites the owning module and never restates the regex |
| 4 | `task-verify` renders the evidence path from `{issue}` and `{ts}` | CLAIM-47.5 | iai-core | P0 | tool-checked | real — the 53 filenames in `docs/evidence/` | `bun test` | Every real filename is reproducible by the renderer from its own parts, **with the artifact count read at run time and asserted non-zero**. `derived:` Decision 5 — the seeded `{n}` is refused, see case 5 |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 5 | `{n}` is refused at construction, and the message still names it | CLAIM-47.5 | iai-core | P0 | tool-checked | synthetic — a template carrying `{n}`, which must never reach the shipped constant | `bun test` | Construction fails, and the message **names `{n}` specifically** rather than failing generically. `packages/core/src/evidence/template.ts:16-26` aimed this warning two milestones forward at whoever implemented `CLAIM-47.5`; a generic error would decay it to nothing |
| 6 | A task PR targeting the default branch is refused **before creation** | NEVER-47.8 | iai-core | P0 | tool-checked | synthetic — a `task/` head against the default branch, which must never be created for real | `bun test` | Refused at construction with a message naming the head and the default branch. Already shipped at `packages/core/src/gh/pr.ts:152-157`, whose comment cites this claim by line two milestones early |
| 7 | A `Closes` directive on a task PR is refused | NEVER-47.8 | iai-core | P0 | tool-checked | synthetic — a task PR body carrying `Closes`, invalid by construction | `bun test` | Refused, with a message distinct from case 6's. A task PR targets the story branch, so a `Closes` there would never fire — an inert directive that reads as if it will |
| 8 | A task anchored to a claim with no artifact on disk is refused | CLAIM-47.6 | iai-skills | P0 | tool-checked | real — the 53 artifacts in `docs/evidence/`, with a synthetic task anchored to an uncovered claim | `bun test` | The artifact count is read at run time and asserted non-zero **first**; then a task anchored to a claim with no artifact emits the hard-failure block. Evidence precedes the label, so a `status:resolved` with nothing behind it is a claim, not a result |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 9 | The dependency declaration is one comma-joined line, in checklist order | CLAIM-47.2 | iai-core | P0 | tool-checked | real — the shipped renderer and checklist builder | `bun test` | Exactly **one** `Blocked by:` line, comma-separated, and the order matches the parent checklist exactly with a deliberately unsorted input. **A per-line emission fails**, pinning `NEVER-21.7`. `derived:` Decision 2, ruled G2 — the seeded plural would break a shipped anti-claim |
| 10 | The label transition emits exactly one command, and zero on a no-op | CLAIM-47.5 | iai-core | P0 | tool-checked | synthetic — three label states, one per branch of the transition | `bun test` | All three cases: incumbent present → one command with `--remove-label`; **no incumbent → one command without it**; already applied → **zero commands, reported as success**. `derived:` Decision 5 — the seeded unconditional pairing is unsatisfiable for a task's first status |
| 11 | A task branch cut from the previous task branch is accepted | CLAIM-47.3 | iai-core | P0 | tool-checked | real — the stacking rule at `references/branch-and-pr-model.md:15` | `bun test` | A head cut from a sibling task branch is accepted, not refused. `derived:` Decision 3 — the seeded *"cut from the story branch"* forbids the stacking shape the reference mandates and merge order depends on |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 12 | Deleting the body-preservation logic turns case 2 red | CLAIM-47.7 | iai-core | P0 | tool-checked | synthetic — the mutation is an edit to source, reverted after | mutation test | Case 2 fails when the merge is replaced by an overwrite. **This mutation kills nothing before Build Target 1 lands** — there is no logic to delete — and that is recorded as a forward-dated kill with the pre-landing run stated as a measured gap, never as a pass |
| 13 | No new body restates an exported constant or carries a domain routing form | NEVER-47.10 | iai-skills | P0 | tool-checked | real — 7 skill bodies and 12 reference documents | `bun run skill-lint` | 0 violations across the real corpus with **both population counts printed and asserted non-zero**. A fixture body containing the literal sentinel prefix fails, and one containing a routing form fails. **`## iai-evidence` written literally is an instant `duplicate-contract` error** — `task-verify` names the sentinel by reference, as all four shipped bodies do |
| 14 | The scanned skill count equals the verb directories on disk, at seven | CLAIM-47.11 | iai-skills | P0 | tool-checked | real — the directories under `skills/` | `bun run skill-lint` | **Exactly 7, asserted both ways** with both sides read at run time, plus a pinned literal citing this plan. And the two populations of the #307 partition must still **sum to the disk count** — the three new verbs must each be classified deliberately or this fails |
| 15 | The artifact is committed before the label transitions | NEVER-47.9 | iai-skills | P0 | tool-checked | real — the commit order in this Story's own task branches | `bun test` | For every task branch, the artifact's commit precedes the transition. Evidence precedes the label; the reverse ordering is a label that outruns its artifact, which the next skill reads instead of the disk |
| 16 | Every `expect()` figure this Story records names the commit it was measured at | CLAIM-47.12 | iai-core | P1 | tool-checked | real — this Story's artifacts under `docs/evidence/` | `bun test` | Each artifact quoting an `expect()` total also names a commit. #299 makes an unqualified figure wrong **on arrival**: committing an artifact changes the total by +2. P1 because a missing commit degrades a record rather than admitting a defect |

### Model-judged

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 17 | Each of the three bodies states a re-entry condition preceding every mutating step | CLAIM-47.4 | iai-skills | P0 | model-judged | real — the `## Re-entry` tables in the three new bodies | review | 3 of 3, one artifact row per skill. **The denominator is tool-checked** — the row count is asserted equal to the table row count read from each body at run time — **only the verdict is not.** `derived:` Decision 4, inheriting `CLAIM-41.8` until #293 lands. **This may not be upgraded to `tool-checked`** on the strength of #293's seam rung |
| 18 | The bodies order the artifact write before the label transition in prose | NEVER-47.9 | iai-skills | P0 | model-judged | real — the three new `SKILL.md` bodies | review | 3 of 3, recorded with reasoning. The *count* is tool-checked; whether the prose actually orders the steps is meaning, and no regex closes it |

### Distinctness

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 19 | The refusal messages are pairwise distinct | cross-cutting | iai-core | P1 | tool-checked | synthetic — one fixture per refusal, each crafted to trip exactly one | `bun test` | Each message asserts the **absence** of the others' phrases, not merely the presence of its own. Cases 5, 6, 7 and 8 all refuse; a test proving "it was rejected" proves nothing about which rule rejected it. P1 because a collapsed message degrades diagnosis rather than admitting a defect |

### Reconciliation

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 20 | The two references agree with the ruled closure timing | CLAIM-47.5 | iai-references | P0 | tool-checked | real — `references/gh-operations.md` and `references/branch-and-pr-model.md` | `bun test` | Neither reference still instructs closing *after merge, citing the merge commit*. **Gate ruling G3 generated this work**: it contradicted both, so both are restated. Build Target 11, which neither the milestone nor the Design's first draft had a row for |

## Not applicable

- **Cycle detection over the dependency graph.** There is no graph code anywhere
  in the tree, and `Blocked by:` is **emit-only with no parser** — though the
  sibling `Parent:` line has both a regex and a reader. You cannot detect a
  cycle in edges nobody reads. Moved out of scope with a named owner at gate
  ruling G2; case 9 keeps the ordering half, which is real and already enforced.
- **Transactional rollback across N issue creations.** *"Rather than partially
  created"* needs an undo mechanism this repository has never had. Resuming a
  partial batch exists; undoing one does not.
- **Executing any of the three skills.** No harness exists. `CLAIM-47.4` is
  `model-judged` by review over three documents and case 17 says so. The harness
  is **#293**, and its own gate ruling forbids a later Story upgrading this
  claim on the strength of a green seam rung.
- **Story roll-up on last-task-resolved.** `docs/milestones/M2.md:145` lists it
  as an indicative task; `references/workflow-states.md:76-79` records that
  nothing in M1 or M2 implements it and it is done by hand. Named here so the
  row is not silently dropped a sixth time.
- **Retiring the duplicate `gh` argv in `scripts/bootstrap-github.sh`.** It
  hand-writes what `packages/core/src/gh/milestones.ts` already builds. Visible
  the moment the port exists; retiring it needs the bootstrap scripts
  reconciled, which is not this unit of work.

## Deviations from the milestone

Four of the six seeded criteria are asserted differently here. All four were
ruled at the gate on 2026-09-07.

| Claim | Milestone wording | What this plan asserts | Cases | Ruling |
|---|---|---|---|---|
| `CLAIM-47.1` | one sub-issue per `binding.unitOfWork` **item** | one per row of the Design's `## Build Targets` table; the binding supplies the noun and sizing bound | 1 | G1 |
| `CLAIM-47.2` | `Blocked by: #N` **lines**, plus cyclic refusal | one comma-joined line in checklist order; cycles out of scope with an owner | 9 | G2 |
| `CLAIM-47.3` | branch **cut from the story branch** | cut from the story branch **or the previous task branch** | 3, 11 | Decision 3 |
| `CLAIM-47.5` | `docs/evidence/{n}-{ts}.md`, `--remove-label` unconditional | `{issue}` not `{n}`; `--remove-label` only with an incumbent; closure **at verify time** | 4, 5, 10, 20 | G3 |

`CLAIM-47.5` is the sharpest of the four: **a shipped module in `packages/core`
already names `docs/milestones/M2.md:132` as defective, by file and line, in a
runtime error string.** The milestone was not restated to match the code; the
code was written knowing the milestone was wrong and left the warning where the
implementer could not miss it.

## Amendments after implementation

Recorded rather than silently applied.

| # | Amendment | Why |
|---|---|---|
| 1 | **Recorded, not yet applied:** case 12 cannot kill until Build Target 1 lands | There is no body-preservation logic to delete at HEAD, so the mutation survives for a reason unrelated to test quality. Recording it as a plain survivor would imply the fix was wrong; recording it as killed would be false. The resolution is S2.1's: **simulate the future state and record a forward-dated kill** |
| 2 | **Recorded:** case 14's count of 7 assumes all three verbs ship in this Story | If a task is deferred, the literal and the disk read still agree at the lower number, but the pinned literal must move deliberately. It is hardcoded **on purpose** — it is a claim about what S2.3 committed to build, not a fact about the filesystem |
