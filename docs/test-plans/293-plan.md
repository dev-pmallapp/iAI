---
issue: 293
repo: dev-pmallapp/iAI
story: "S2.6 — Skill execution harness"
milestone: "M2 — Universal lifecycle"
---

# Test Plan: #293 — S2.6 Skill execution harness

## Source

`docs/design/stories/293.md` at `bc25b77` — 7 claims (`CLAIM-293.1`–`.3`, `.6`,
`.8`, `.9`, `.11`) and 4 anti-claims (`NEVER-293.4`, `.5`, `.7`, `.10`),
11 Problems, 6 Decisions, 10 Build Targets.

**The design gate was ruled APPROVED before this plan was written**, 2026-09-07,
carrying seven rulings: G1a two rungs, G1b token replay excluded by name, G2 the
seam rung's green may never upgrade an inherited claim, G3 the adapter port
first, G4 the fixture forge must be able to lie, G5 a new build target plus an
`ARCHITECTURE.md` row, G6 one fixture repository consumed by M4. This plan is
written against the ruled Design, not against `docs/milestones/M2.md:107-109`.

## Feature Summary

This Story builds the first thing in the repository that executes anything. The
plan therefore has an unusual shape: **most of its corpus does not exist yet**,
and saying so per case is the point rather than an apology.

Five things carry the weight.

**The first is that every `== 0` assertion is paired with a `> 0` on the same
counter, measured one run earlier.** "Run 2 made zero mutations" is meaningless
alone; "run 1 made more than zero **and** run 2 made zero" is the property.
Cases 3 and 7 are the same claim from both directions, and case 7 is the one
that stops a harness reporting success over zero *work* rather than zero
*skills*.

**The second is that the denominator is asserted three ways, not one.** Case 6
proves a deleted verb directory turns the run red — the J2 mutation made
executable. A disk-read count on both sides of an equality passes a corpus of
three verbs and a deleted one, which is why case 3 also pins a literal.

**The third is that a check which cannot fail is not a check.** Case 9 is the
case that proves the harness can go red: an injected truncated-list lie must
make a real second run mutate, and the harness must report it. Without case 9
the seam rung is `smoke-install` with a bigger budget —
`.github/workflows/ci.yml:137-146` names that disqualifier itself.

**The fourth is that the harness must not be shadowed by its own test double.**
Case 8 drives the fake forge *directly* with a duplicate-creating argv and
asserts it **accepts**. A fake that refuses duplicates makes run 2 clean for the
fake's reason rather than the skill's — the S1.5 shadowing trap one layer out.

**The fifth is that this plan publishes what the harness does NOT verify.**
Cases 16 and 17 pass when the harness **fails to notice** a mutated `SKILL.md`.
That is not a defect; it is gate ruling G2 made mechanical. The transcription
gap becomes a number in an evidence artifact instead of a footnote nobody reads.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-293.1 | 1, 12 | P0 |
| CLAIM-293.2 | 2 | P0 |
| CLAIM-293.3 | 3, 11 | P0 |
| NEVER-293.4 | 5, 6, 7, 21, 22 | P0 |
| NEVER-293.5 | 16, 17 | P0 |
| CLAIM-293.6 | 9 | P0 |
| NEVER-293.7 | 8 | P0 |
| CLAIM-293.8 | 4, 10 | P0 |
| CLAIM-293.9 | 19 | P0 |
| NEVER-293.10 | 13, 14, 15 | P0 |
| CLAIM-293.11 | 18 | P0 |
| cross-cutting | 20 (P1) | P1 |

22 cases — 21 P0 / 1 P1 / 0 P2.

**Corpus distribution: 8 `real` / 13 `synthetic` / 1 `none`.** Stated because it
inverts S2.2's ratio and the reason is structural, not sloppy: **the harness's
own fixtures are synthetic by construction** — a disposable git tree and a fake
forge are invented on purpose. The `real` cases are the ones that read the
repository as it is: the `gh` barrel, the skill roster, the CI job list, the
required-context list.

## Standing checks

Not anchored to a claim, and not optional. Run at story-verify.

| Check | Command | Passes when |
|-------|---------|-------------|
| Evidence immutability | `git log --diff-filter=MD --name-only -- docs/evidence/` | no artifact modified or deleted |
| Required contexts | `bash scripts/verify-required-checks.sh` | PASS, and the count is unchanged unless case 13 changed it deliberately |
| Workflow hygiene | `bash scripts/verify-workflow-hygiene.sh` | PASS, and no required job carries an `if:` |
| Full chain | `bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint && bun run claim-lint` | all 0 |
| Harness self-report | `bun run skill-harness` | exits 0 **and** prints non-zero scenario, skill and run-1-mutation denominators |
| CI on the integration PR | `gh pr checks 312` | 7/7 |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 1 | Every `gh` operation family reaches a process through exactly one port function | CLAIM-293.1 | iai-core | P0 | tool-checked | real — the families exported by `packages/core/src/gh/index.ts` | `bun test` | The family count is **read from the barrel at run time**, asserted non-zero **first**, and asserted equal to the port's dispatch table on both sides. A family added to the barrel and not to the port fails here |
| 2 | Each scenario begins from a real, distinct, committed git seed | CLAIM-293.2 | iai-harness | P0 | tool-checked | synthetic — a disposable git tree per scenario; the real Goals source is a gitignored private symlink, so it cannot be checked out | `bun run skill-harness` | Every scenario produces a real `.git`; `scenarios_executed == SCENARIO_ROSTER.length` and `> 0`; and the set of pre-run tree hashes has **cardinality equal to the scenario count**, so two scenarios cannot silently share a seed |
| 3 | Run 1 mutates, and only then is run 2 asserted to make no mutation | CLAIM-293.3 | iai-harness | P0 | tool-checked | synthetic — fixture repository plus stateful fake forge, invented because no public fixture can supply a forge | `bun run skill-harness` | Per scenario, **`run1.mutations > 0` is evaluated before `run2.mutations == 0` is considered**, never summed across scenarios. Skill denominator asserted **three ways**: `> 0`, `== \|skills/*/SKILL.md\|` with both sides read at run time, and `== PINNED_SKILL_COUNT` with a plan citation |
| 4 | Both mutation surfaces are recorded, and reported separately | CLAIM-293.8 | iai-harness | P0 | tool-checked | synthetic — one comment-only scenario and one file-only scenario, built to trip exactly one surface each | `bun test` | Argv mutations and worktree tree-hash changes are reported as **two counts**, and each surface has at least one scenario that trips **only** it — so neither can be silently unwired, which is mutation N2's shape |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 5 | The runner exits non-zero on an empty scenario roster | NEVER-293.4 | iai-harness | P0 | tool-checked | synthetic — an empty roster, which cannot occur in the real corpus by construction | `bun run skill-harness` | The **runner** exits non-zero, not a test file. `skill-lint` exits 0 over zero files today and its non-vacuity lives only in a test; that is the mistake this case exists to not repeat |
| 6 | Deleting a verb directory turns the harness run red | NEVER-293.4 | iai-harness | P0 | tool-checked | synthetic — a verb directory removed from a copy of the real skill roster | mutation test | The equality between the scanned skill count and the directories on disk fails, **naming the missing verb**. This is mutation J2 made executable: a loop over a corpus stays green when the corpus shrinks |
| 7 | A scenario whose run 1 mutates nothing is a failure, not a pass | NEVER-293.4 | iai-harness | P0 | tool-checked | synthetic — a scenario wired to a no-op skill invocation | mutation test | The run fails **naming that scenario**. Without this case the identity function scores a perfect idempotency result — handoff finding 10's shape at higher stakes |
| 8 | The fake forge accepts a duplicate-creating argv rather than refusing it | NEVER-293.7 | iai-harness | P0 | tool-checked | synthetic — the fake driven directly, bypassing every skill | `bun test` | For each of the 4 identity keys the skills rely on — milestone title, feature-row description, sentinel identity, Design path — the fake **accepts** the duplicate. The key list is enumerated from the four bodies and its count asserted. A fake that refuses makes run 2 clean for the fake's reason |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 9 | An injected lie makes a second run mutate, and the harness reports it | CLAIM-293.6 | iai-harness | P0 | tool-checked | synthetic — five injected failure modes; a real forge cannot be made to rate-limit on demand | `bun run skill-harness --inject` | All 5 modes injectable — rate limit with a zeroed budget, the header-absent third state, a truncated unpaginated list, a silent no-op mutation, a transient connection error. The **truncated-list** mode makes at least one skill's run 2 issue a duplicate create, and the harness reports it. **This is the case that proves the harness can fail** |
| 10 | A rewrite with identical bytes is reported as a mutation | CLAIM-293.8 | iai-harness | P0 | tool-checked | synthetic — a Design rewritten to byte-identical content | `bun test` | The tree hash is unchanged, so the hash comparison alone would score zero. The write itself is recorded, because an identical-bytes rewrite is an action that can race |
| 11 | Run 2 reads at least as many times as the skill's own re-entry table has rows | CLAIM-293.3 | iai-harness | P0 | tool-checked | real — the `## Re-entry` tables in `skills/*/SKILL.md` | `bun run skill-harness` | The row count is **read from each `SKILL.md` at run time**, never hardcoded. This distinguishes *"decided to do nothing"* from *"did nothing"*: a run 2 with zero mutations **and zero reads** did not run at all |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 12 | No file outside the port spawns `gh` | CLAIM-293.1 | iai-core | P0 | tool-checked | real — every `.ts` in `packages/` and `scripts/` | `bun run lint` | 0 files outside the port reference `gh` in a spawn position, **with the scanned file count asserted non-zero first**. `packages/core/src/gh/` stays pure; the port is the only executor |
| 13 | The live rung's job is absent from the required contexts | NEVER-293.10 | iai-core | P0 | tool-checked | real — `.github/workflows/ci.yml` and the two verifier scripts | `bash scripts/verify-required-checks.sh` | The required-context count is asserted **both before and after**, and each verifier hardcodes the list twice, so all four sites must agree. A live job silently promoted to required fails here |
| 14 | No required job carries an `if:` | NEVER-293.10 | iai-core | P0 | tool-checked | real — the job list in `.github/workflows/ci.yml` | `bash scripts/verify-workflow-hygiene.sh` | 0 `if:` keys on required jobs, job count asserted non-zero. NEVER-9.8: **a job skipped by an `if:` reports success**, so this is the difference between a gate and a rubber stamp |
| 15 | The live runner refuses a `PRIVATE`-class payload | NEVER-293.10 | iai-core | P0 | tool-checked | synthetic — a `USER/`-derived payload, which cannot be committed to a public tree | `bun test` | The egress guard **blocks** it, over the 4 classes with the class count read from the classifier. `USER/`-derived content is `PRIVATE` by fail-safe default and reaches no cloud model under any consent |
| 16 | Mutating a `SKILL.md` without touching the harness leaves the seam rung green | NEVER-293.5 | iai-harness | P0 | tool-checked | real — the four shipped bodies, mutated one at a time | mutation test | **This case PASSES when the harness does not notice.** Reorder a read after its write in a `## Re-entry` table; the seam rung stays green. 4 of 4 bodies, count asserted non-zero first. Do not "fix" this — see case 17 |
| 17 | The transcription gap is published, not merely stated | NEVER-293.5 | iai-core | P0 | tool-checked | real — `docs/test-plans/41-plan.md`'s verifier column | `bun test` | `CLAIM-41.8`'s class is still `model-judged` after this Story ships. `derived:` gate ruling G2 — the seam rung's green may never upgrade an inherited claim, and this is the assertion that makes the prohibition mechanical rather than cultural |

### Model-judged

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 18 | The harness's transcription of each skill is faithful to its `SKILL.md` | CLAIM-293.11 | iai-harness | P0 | model-judged | real — the four shipped `SKILL.md` bodies and their `## Re-entry` tables | review | One artifact row per re-entry row, naming the harness step implementing it, with the reviewer's reasoning recorded. **The denominator is tool-checked** — the row count is asserted equal to the table row count read from each body at run time — **only the verdict is not.** `derived:` Decision 2 |
| 19 | A live conformance run is performed, attested, and its token cost recorded | CLAIM-293.9 | iai-harness | P0 | human-attested | none — an attestation is a statement by a named person, not a fixture | review | A named person states the run was performed at a resolved commit, on a named host, at routing category `plan`, with the artifact at a path. The artifact carries mutation counts **and measured token cost**, closing `docs/milestones/M2.md:240-241`. `derived:` Decision 1 — n=1 over a non-deterministic function is an existence proof, not a property |

### Distinctness

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 20 | The harness's failure messages are pairwise distinct | cross-cutting | iai-harness | P1 | tool-checked | synthetic — one fixture per failure mode, each crafted to trip exactly one | `bun test` | Each message asserts the **absence** of the other phrases, not merely the presence of its own. **Two messages that differ only in the value they quote are one message.** P1 because a collapsed message degrades diagnosis rather than admitting a defect |

### Verdict mechanics

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 21 | The verdict is the exit code plus a JSON artifact, never a grep of stdout | NEVER-293.4 | iai-harness | P0 | tool-checked | real — the runner's own exit code and artifact path | `bun run skill-harness` | Nothing greps the runner's stdout and the runner greps nothing of its own. Finding 37: a mutation harness decided on `"0 fail" not in stdout` and read a fixture's prose as the verdict. Its recorded owner is *any future harness* — which is this one |
| 22 | A fixture repository seeded with the harness's own success phrases still yields the correct verdict | NEVER-293.4 | iai-harness | P0 | tool-checked | synthetic — a tracked file containing the runner's success strings verbatim | `bun test` | The verdict is unchanged, which makes case 21 **provable rather than stated**. `docs/evidence/` is full of the exact phrases this harness will print, so this is not a hypothetical corpus |

## Not applicable

- **Executing a skill on a live model in CI.** Structurally illegal, not merely
  expensive: `.github/workflows/ci.yml:8-25` forbids the `if:` a live job would
  need, there is no `paths:` escape, and fork PRs receive no secrets. The live
  rung is `workflow_dispatch` or local, never required, and `NEVER-293.10` pins
  it. Cases 13 and 14 assert the pin.
- **Token replay in any form.** Excluded by name at gate ruling G1b. A fixed
  token stream re-emits decisions rather than re-deriving them, so no case can
  distinguish a stable recording from an idempotent skill. The tool-call
  cassette is the near-miss and dies on tape invalidation — every `SKILL.md`
  edit, which is every Story in M2.
- **Proving the model reading the markdown is idempotent.** The seam rung's
  population is the harness's transcription, not the model. Cases 16, 17 and 18
  measure and publish that gap rather than closing it. **Gate ruling G2 forbids
  a later Story treating a green seam rung as having closed it.**
- **Running the real `goal-create` against the real goals source.** Its input is
  a gitignored symlink into a private repository and is `PRIVATE` by fail-safe
  default. Blocked on **#292** for a public fixture, and an egress violation on
  a cloud model regardless. Case 15 asserts the refusal.
- **M4/S4.5's end-to-end conformance suite.** `docs/milestones/M4.md:195` and
  `docs/milestones/M4.md:215` own the milestone-to-merged-PR run. Gate ruling G6
  makes this Story's fixture repository the one M4 consumes, so the boundary is
  a restatement in M4, not a second corpus.

## Deviations from the milestone

`docs/milestones/M2.md:107-109` seeds the verification as *"Each skill runs twice
against the same fixture repository and the second run makes zero mutations."*
Three deviations, all ruled at the gate on 2026-09-07.

| Claim | Milestone wording | What this plan asserts | Cases | Ruling |
|---|---|---|---|---|
| `CLAIM-293.3` | "the second run makes zero mutations" | run 1 mutates **and then** run 2 does not, asserted in that order, per scenario, never summed | 3, 7, 11 | G1a |
| `CLAIM-293.9` | (the milestone has no live-run row) | a live rung exists, is never required, and carries the measured token cost `docs/milestones/M2.md:240-241` demands | 19 | G1a |
| `NEVER-293.5` | (the milestone assumes the skill is what is tested) | the seam rung's population is the transcription, and the gap is published as a passing case | 16, 17 | G2 |

The milestone's sentence is not wrong; it is **incomplete in the one direction
that matters**. "Zero mutations" with no `> 0` beside it is satisfied perfectly
by a harness that never ran anything.
