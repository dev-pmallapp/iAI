---
issue: 35
repo: dev-pmallapp/iAI
story: "S2.1 — Kernel reference documents"
milestone: "M2 — Universal lifecycle"
---

# Test Plan: #35 — S2.1 Kernel reference documents

## Source

`docs/design/stories/35.md` at `3471342` — 6 claims (`CLAIM-35.1`–`CLAIM-35.6`)
and 2 anti-claims (`NEVER-35.7`, `NEVER-35.8`), 11 Problems, 10 Decisions.

**The design-approval gate was decided APPROVED before this plan was written**,
2026-09-05, carrying two rulings: the four restated claims stand as restated, and
`isa-format` is renamed `design-format`. This plan is written against the
approved and amended Design, not against `docs/milestones/M2.md:36-53`. Three of
the eight rows in the Design's Test Strategy are marked `derived:` rather than
`literal`, and every one of them is a place where this plan asserts something
different from the milestone's words. Each is called out in the case's *Passes
when* column.

## Feature Summary

Twelve markdown files and three lint rules. The documents themselves are prose
and cannot be unit-tested; **everything testable here is a property of the
population, the tooling, or the boundary between them.** That makes this plan
unusually enforcement-heavy: 9 of 21 cases are mutations or denominator
assertions, because almost every claim in this Story can pass vacuously.

Six things carry the weight.

**The first is that the tool named in the Test Strategy cannot currently see the
files it is asked to scan.** This is the headline finding of this plan and it is
not in the Design. `scripts/skill-lint.ts:386-397`'s `discoverSkillFiles` matches
**`SKILL.md` by exact basename only**; `main()` defaults its target to `skills/`;
and `.github/workflows/ci.yml:107` pins the invocation to `bun run skill-lint
skills/`. Running `bun scripts/skill-lint.ts references` today reports
*"0 SKILL.md files scanned"*. `CLAIM-35.3` and `NEVER-35.7` both name
`bun run skill-lint` as their tool and both require scanning `references/`.
**Neither can pass honestly without a second discovery path and a changed CI
invocation, and the Design's Build Targets list neither.** Case 21 exists to
fail until that is fixed, and cases 8 and 15 assert non-zero denominators so the
rules cannot report success over an empty file set — the exact shape `skill-lint`
itself has demonstrated daily since S1.3.

**The second is that this scope was already adjudicated the other way.**
`docs/design/verification-pass.md:142` (conflict row 19) records skill-lint as
shipping **`skills/`-only**, with the reasoning *"`references/` is 'contracts,
not skills'; `agents/` must omit `name` on opencode. One schema cannot span all
three."* `docs/milestones/M1.md:62` says the linter *"does not sweep the docs
targets"*, and `references/` is a docs target. That adjudication is about the
**frontmatter schema**, and the three new rules are **body** rules, so they are
not strictly in conflict — but the distinction has never been written down, and
the mechanism, the CI line and the CONTRIBUTING line all still say `skills/`.
Case 21 pins the reconciliation.

**The third is that a body rule merged against an empty `skills/` is vacuous.**
`skills/` stays empty through this entire Story; S2.2 is the first to put a
`SKILL.md` on disk. All three new rules would therefore report success over zero
files on the day they merge. Decision 2 requires negative fixtures and a mutation
proving each fires, which is the #253 / #261 / #272 posture. Cases 5, 13, 16 and
19 are those mutations, and they are not optional.

**The fourth is that two rules must be proved to reject for their own reason.**
`docs/evidence/33-...md` recorded three surviving mutations in one task caused by
**a guard shadowed by another guard**, and the fix for one of them failed on its
first attempt because two messages that differed only in the value they quoted
were treated as distinct. `duplicate-contract` polices three contracts at once,
so its three negative fixtures are exactly that hazard. Case 3 therefore asserts
the **reason**, and case 5 asserts that deleting one check lets **only** its own
fixture through.

**The fifth is that retiring the allow-list family breaks two tests that
`claim-lint` cannot see.** This was exercised end-to-end on `0c37649` and
reverted. Writing the twelve files, deleting the `references/*.md` family and
correcting the header leaves `claim-lint`, `lint`, `typecheck` and `skill-lint`
**all green** while `bun test` fails twice — and neither failure is one of the
three header-count assertions the Design warns about. Case 18 pins both.

**The sixth is that `NEVER-35.7` and Decision 7 pull in opposite directions.**
`NEVER-35.7` forbids a reference from restating a constant `packages/core`
exports. `docs/design/01-skill-hierarchy.md:60` and Decision 7 make
`references/evidence-artifacts.md` the owner of **the sentinel namespace** —
whose value, `"## iai-"`, is exported as `SENTINEL_NAMESPACE_PREFIX` from
`packages/core/src/evidence/sentinel.ts:53`. A document whose subject is a
constant may not contain that constant. The same bind applies to the
commit-prefix regex in `branch-and-pr-model.md`. Case 16 fixes the resolution:
the reference must **name the owning module and line**, and the rule must permit
that while banning the literal.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-35.1 | 1, 2 | P0 |
| CLAIM-35.2 | 3, 4, 5 | P0 |
| CLAIM-35.3 | 6, 7, 8 | P0 |
| CLAIM-35.4 | 9, 10, 11 | P0 |
| CLAIM-35.5 | 12, 13 | P0 |
| CLAIM-35.6 | 14 | P0 |
| NEVER-35.7 | 15, 16 | P0 |
| NEVER-35.8 | 17, 18, 19 | P0 |
| cross-cutting | 20 (P1), 21 | P1, P0 |

21 cases — 20 P0 / 1 P1 / 0 P2.

## Standing checks

Not anchored to a claim, and not optional. Run at story-verify.

| Check | Command | Passes when |
|-------|---------|-------------|
| Evidence immutability | `git diff --name-only --diff-filter=MD main...HEAD -- docs/evidence` | 0 files. **`--diff-filter=MD` is mandatory** — Decision 12 of `docs/design/stories/26.md`. The unfiltered form returns this Story's own added artifacts and reads as a false failure |
| Required contexts | `bash scripts/verify-required-checks.sh` | PASS, six contexts |
| Workflow hygiene | `bash scripts/verify-workflow-hygiene.sh` | PASS, six jobs |
| Workspace invariants | `bun test test/workspace.test.ts` | PASS |
| Full chain | `bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint && bun run claim-lint` | all 0 |
| CI on the integration PR | `gh pr checks 279` | 7/7. **`story/35` gets zero check runs without PR #279** — `ci.yml:30-35` triggers only on `pull_request`, `push` to `main` and `merge_group`. A locally green story branch is not a verified one |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | All twelve reference documents exist, under names read from the milestone at run time | CLAIM-35.1 | iai-references | P0 | tool-checked | `bun test` | The twelve names are **parsed out of `docs/milestones/M2.md` at run time**, not restated in the test, following case 1 of `docs/test-plans/31-plan.md`. Each parsed name resolves to a non-empty `references/<name>.md`. The parse must yield exactly **12** names before any existence assertion runs, so a failed parse cannot pass vacuously. `design-format` is among them and `isa-format` is not — the gate rename (Decision 5) is thereby asserted, not assumed |
| 4 | A skill body citing the owning reference by path passes all three contract rules | CLAIM-35.2 | iai-core | P0 | tool-checked | `bun run skill-lint` | Three positive fixtures — one citing `references/evidence-artifacts.md`, one `references/workflow-states.md`, one `references/branch-and-pr-model.md` — each produce **0** `duplicate-contract` violations. Fixtures are passed to `lintSkillSource` directly, not written to `skills/`, per Decision 2 |
| 9 | The roster-discovery predicate returns zero for `references/`, over a denominator of twelve | CLAIM-35.4 | iai-core | P0 | tool-checked | `bun test` | `discoverSkillFiles("references")` returns **0** entries **and** the directory is independently asserted to hold **12** `.md` files. **The denominator is the case.** An empty directory also returns zero, so without it this claim is the vacuous pass Decision 3 restated it to avoid. `derived:` — the milestone says "installed skill roster", which M8 builds and which does not exist |
| 10 | No reference document carries skill frontmatter | CLAIM-35.4 | iai-references | P0 | tool-checked | `bun test` | None of the twelve begins with a `---` line. Asserted over all 12, with the count checked first. A reference that grew frontmatter would still not be discovered by name, so this and case 9 are independent halves of the claim |
| 17 | The `references/` allow-list family is fully retired and no stale entry remains | NEVER-35.8 | iai-core | P0 | tool-checked | `bun run claim-lint` | `allowlist-stale` reports **0**; `PATH_ALLOW_LIST` contains **no** entry whose path starts `references/`; the family header count and the total both match the real entries, asserted three ways by `packages/core/test/path-refs.test.ts`. Header moves "Seven families, 37 entries" → "Six families, 25 entries" |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 3 | Each of the three restated contracts is rejected **by its own rule**, with a distinct reason | CLAIM-35.2 | iai-core | P0 | tool-checked | `bun run skill-lint` | Three negative fixtures — one restating the sentinel namespace prefix, one the at-most-one-`status:` invariant, one the commit-prefix regex — each produce a `duplicate-contract` violation naming **which** contract was restated. The three messages are pairwise distinct **by phrase, not merely by quoted value**: `docs/evidence/33-...md` records a distinctness assertion that passed while the mutation survived, because both messages quoted different offending values through the same template. Each message must contain a phrase belonging to exactly one rule, and the **absence** of the other two phrases is asserted |
| 6 | A literal model ID in an authored file other than `model-routing.md` is reported | CLAIM-35.3 | iai-core | P0 | tool-checked | `bun run skill-lint` | A fixture containing a literal model ID under each of `skills/`, `agents/` and `references/` is reported, naming `CLAIM-35.3` and the offending file. **`derived:` — Decision 1.** The milestone's wording ("no file outside `packages/core/src/routing`") is **false at HEAD**: 7 files carry one across 28 lines, including `docs/design/02-roles.md:547-553`, `ARCHITECTURE.md:149` and two guard files where a model ID is the canonical false-positive fixture. The rule is scoped to the authored surface instead |
| 16 | A reference restating an exported constant is reported; naming the owning module is not | NEVER-35.7 | iai-core | P0 | tool-checked | `bun run skill-lint` | A fixture reference containing the literal `## iai-` is reported. A fixture that instead writes *"the prefix exported as `SENTINEL_NAMESPACE_PREFIX` by `packages/core/src/evidence/sentinel.ts:53`"* produces **0** violations. **This resolves the bind in Feature Summary point six**: `references/evidence-artifacts.md` owns the sentinel namespace as its subject (`01-skill-hierarchy.md:60`, Decision 7) while `NEVER-35.7` forbids it from containing the value. Same shape for the commit-prefix regex in `branch-and-pr-model.md`, whose regex has eight homes already (Problem 3) |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 2 | `references/` holds exactly the twelve, and nothing else | CLAIM-35.1 | iai-references | P0 | tool-checked | `bun test` | The set of `.md` files under `references/` equals the twelve parsed names **by set equality in both directions**. A thirteenth file, a misspelling, or a leftover `isa-format.md` each fail. "Each of the twelve exists" alone would pass with a stray file present, which is how a rename leaves a corpse behind |
| 7 | `model-routing.md` is exempt, and the exemption is shape-based, not positional | CLAIM-35.3 | iai-core | P0 | tool-checked | `bun run skill-lint` | `references/model-routing.md` may contain model IDs with 0 violations, and the exemption is expressed as **an exact path match**, not a line range and not a prefix. `docs/evidence/34-...md` recorded a surviving mutation where a **range-based** exemption admitted an inserted declaration that fit inside the range: *an exemption expressed as a line range admits anything that fits inside it.* A prefix match would additionally exempt a hypothetical `model-routing-notes.md` |
| 12 | The citation cap rejects four references and accepts three, using the imported constant | CLAIM-35.5 | iai-core | P0 | tool-checked | `bun run skill-lint` | A fixture citing **4** references fails; one citing **3** passes; one citing **0** passes. The cap is read from the exported constant, and **no file implementing the rule contains a bare `3`** as the threshold — Decision 11 of `docs/design/stories/26.md` exists to stop a second copy of a constant. `derived:` — the live count over real skills is `CLAIM-41.x`'s, in S2.2, because S2.1 authors zero skills |
| 18 | Retiring the family does not break the two fixtures `claim-lint` cannot see | NEVER-35.8 | iai-core | P0 | tool-checked | `bun test packages/core/test/path-refs.test.ts` | 63 pass, 0 fail. **This was exercised on `0c37649` and reverted.** Two fixtures break on retirement and `claim-lint` stays green through both: `path-refs.test.ts:201` uses `references/gh-operations.md` as its canonical `planned` fixture, which the retirement deletes — re-point it at a surviving `planned` entry such as `skills/dev/domain.md`; and `path-refs.test.ts:300` asserts `PATH_ALLOW_LIST.length > 30`, which **25** fails. **The floor must not simply be lowered.** It is an anti-vacuity guard in direct conflict with the shrink mandate in `path-allowlist.ts`'s own header, and a literal floor cannot express "non-empty" over a list designed to drain. Express it relative to the surviving family count, or record why the new number is right. Expect `expect()` to move 2598 → 2562 |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 5 | Deleting each `duplicate-contract` check lets **only** its own fixture through | CLAIM-35.2 | iai-core | P0 | tool-checked | mutation test | Three mutations. Each removes one of the three contract checks; the corresponding fixture from case 3 stops being reported and **the other two are still reported**. Reverting restores all three. This is the `docs/evidence/33-...md` shape: a fixture rejected by a *later* rule proves nothing about the rule under test. Run against the **committed** tree, and print `git status --porcelain` at the end |
| 8 | The model-ID rule scans a non-zero file set across all three directories | CLAIM-35.3 | iai-core | P0 | tool-checked | `bun run skill-lint` | The run reports the number of files scanned, and it is **≥ 12** with `references/` contributing ≥ 12. A rule that reports 0 violations over 0 files fails this case. `skill-lint` reporting *"0 SKILL.md files scanned, 0 errors"* while required in CI is the standing example this case exists to exclude |
| 11 | The discovery predicate is not simply returning empty | CLAIM-35.4 | iai-core | P0 | tool-checked | mutation test | A `SKILL.md` placed under `references/` **is** discovered — 1 entry — and removing it returns to 0. Without this, case 9's "returns zero" is satisfied by a predicate that returns zero for everything, which is the same defect class as a lint that scans no files |
| 13 | The citation-count rule actually fires | CLAIM-35.5 | iai-core | P0 | tool-checked | mutation test | Deleting the count comparison makes the 4-reference fixture pass; reverting restores the failure. Additionally, changing the cap constant from 3 to 4 must make the 4-fixture pass — proving the rule reads the constant rather than a hard-coded literal |
| 15 | No reference restates any constant `packages/core` exports, over a non-zero constant set | NEVER-35.7 | iai-core | P0 | tool-checked | `bun run skill-lint` | 0 restatements across the twelve, and the set of constants checked is asserted **non-empty and ≥ 4** — at minimum `SENTINEL_NAMESPACE_PREFIX`, the commit-prefix regex, the 65536 hard limit and the 60000 working budget. A no-restatement rule with an empty constant list is a rule that cannot fail |
| 19 | Reintroducing a retired allow-list entry is caught | NEVER-35.8 | iai-core | P0 | tool-checked | mutation test | Re-adding one retired `references/` entry is reported by `allowlist-stale` **and** by the three count assertions in `path-refs.test.ts`. `docs/evidence/277-...md` records this guard as **over-determined** — no mutation survived — so this case confirms the property holds after the family is removed, not that it exists |
| 21 | The three new rules reach `references/` and `agents/`, in the CLI and in CI | cross-cutting | iai-core | P0 | tool-checked | `bun run skill-lint`, `bash scripts/verify-workflow-hygiene.sh` | **This case fails today and is expected to, until the scope is widened.** `scripts/skill-lint.ts:386-397` matches `SKILL.md` by exact basename; `main()` defaults to `skills/`; `.github/workflows/ci.yml:107` pins `bun run skill-lint skills/`; `CONTRIBUTING.md:113` states the same. Passes when the CI invocation, the CONTRIBUTING command and the default target all cover the three authored directories, **and** `docs/design/verification-pass.md:142` (row 19, "shipped `skills/`-only") plus `docs/milestones/M1.md:62` ("does not sweep the docs targets") are reconciled in writing — the distinction being that row 19 adjudicated the **frontmatter schema**, not body rules. **This reconciliation is a Build Target the Design does not list** |

### Model-judged

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 14 | Every normative statement is reconciled, and every disagreement has a named owner | CLAIM-35.6 | iai-references | P0 | model-judged | review | The evidence artifact carries a reconciliation table with **one row per normative statement**, each verdicted against `docs/design/` and the shipped M1 code. Row count is asserted non-zero and stated explicitly. Every unresolved row names **an owner and an issue** — `derived:` is not permitted as an owner. **Restated** per Decision 6: "zero unresolved conflicts" became "zero *unowned* conflicts", because `docs/design/verification-pass.md` exists precisely to hold ~40 deferred divergences and a 24-row register, and a claim of zero would be false the day it is written |

### Distinctness

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 20 | The three new rules' messages are pairwise distinct and each names its own rule id | cross-cutting | iai-core | P1 | tool-checked | `bun run skill-lint` | `duplicate-contract`, `reference-citation-count` and `model-id-literal` produce three distinct message shapes, each naming its own rule id and the claim it enforces. Same defect class as case 3 of `docs/test-plans/26-plan.md`, and case 5 of `docs/test-plans/31-plan.md`. P1 because a collapsed message degrades diagnosis rather than admitting a defect — but `docs/evidence/27-...md` recorded all five linter messages collapsing to one and only the third case catching it |

## Not applicable

- **A live corpus for any of the three new rules.** `skills/` is empty through
  this Story and `S2.2` is the first to add a `SKILL.md`. Decision 2 makes
  fixtures the deliverable and cases 5, 13 and 16 the proof. **This is a known
  weakness shipped on purpose**, and it is why every rule case above asserts a
  denominator.
- **The live three-reference count over real skills.** `CLAIM-35.5` ships the
  counting rule; `CLAIM-41.x` in S2.2 counts. Recorded rather than deferred
  silently, because **the budget is already over-subscribed**:
  `docs/design/01-skill-hierarchy.md:472` caps a skill at 3 while
  `CONTRIBUTING.md:266-276` makes `context-discovery`, `gh-operations` and
  `gh-error-handling` mandatory for **every** skill — the entire budget, before
  a skill cites anything specific to its own job. S2.2 is the first Story that
  can violate it.
- **The forge namespace collision.** Creating `references/workflow-states.md` and
  `references/branch-and-pr-model.md` makes 39 bare citations in
  `docs/design/verification-pass.md` resolve against iAI files carrying **another
  repository's line numbers** — 21 and 18 respectively. `path-dangling` cannot
  see it, because it only asks whether a path exists. Decision 9 records it
  rather than editing a document whose verdict rows are immutable. **No case
  here**, and the blast radius has never been measured: 39 citations were
  counted, none was opened. It needs its own issue.
- **`packages/core/src/routing`.** `CLAIM-35.3`'s exemption directory is an
  M3/S3.1 build target and does not exist. The allow-list records it as `M2`,
  which is wrong (Problem 2). No case can exercise an exemption for a directory
  that cannot contain a file.
- **The installed skill roster.** M8 builds it. Case 9 proves the property
  against the discovery predicate instead, per Decision 3.
- **Line-number citation drift.** `docs/milestones/M2.md` is addressed
  positionally by ~30 citations including two immutable `docs/evidence/`
  artifacts, and nothing in the repository detects a `:NN` suffix that still
  resolves but now names the wrong line. Milestone edits in this Story must be
  line-neutral. Recorded in Decision 5; **no case, because no guard can express
  it** — this is a standing gap, not a testable property.

## Deviations from the milestone

Four of the six seeded criteria are asserted differently here, all approved at
the gate on 2026-09-05.

| Claim | Milestone wording | What this plan asserts | Case |
|---|---|---|---|
| `CLAIM-35.3` | no literal model ID outside `packages/core/src/routing` | scoped to `skills/`, `agents/`, `references/` | 6, 7, 8 |
| `CLAIM-35.4` | the installed skill roster contains zero `references/` entries | the discovery **predicate** returns zero over 12 files | 9, 10, 11 |
| `CLAIM-35.5` | no skill cites more than three references | the counting **rule** ships and is fixture-proved | 12, 13 |
| `CLAIM-35.6` | zero unresolved conflicts | zero **unowned** conflicts | 14 |
