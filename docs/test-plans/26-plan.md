---
issue: 26
repo: dev-pmallapp/iAI
story: "S1.4 — Evidence and sentinel engine"
milestone: "M1 — Kernel and foundation"
---

# Test Plan: #26 — S1.4 Evidence and sentinel engine

## Source

`docs/design/stories/26.md` at `30db7bf` — 6 claims (`CLAIM-26.1`–`CLAIM-26.6`)
and 4 anti-claims (`NEVER-26.7`–`NEVER-26.10`), 12 Decisions.

**The design-approval gate was open and `PENDING` when this plan was written.**
The plan is pre-registered against the Design as committed. If the gate amends
any claim, the cases anchored to that claim are void and must be rewritten
before execution rather than reinterpreted afterwards.

## Feature Summary

Like S1.3, everything here is a pure function over plain data, so the surface is
a fixture corpus needing no issue, no token and no network. Unlike S1.3, the
behaviour was already specified — the risk is not invention but **drift between
two documents that both claim to specify it**.

Four things carry the weight.

**The first is that the linter must enforce five rules, not four.**
`CLAIM-26.1` as seeded named four; `docs/design/03-workflow.md:388-392` defines
five, and Decision 3 restates the claim. Case 2 proves each of the five is
rejected. Case 3 proves the five messages are *distinct*, which is the case that
excludes a linter returning one generic "malformed sentinel" for everything and
passing case 2 while telling an author nothing.

**The second is the budget boundary, and what it is measured on.** Decision 5
splits it: the inline/summary choice reads artifact size, the 65,536 cap binds
the rendered body, and the gap between them is the envelope's own budget. Cases
8–12 test all three quantities separately. Case 9 is the 60,000 case
`CLAIM-26.4` never defined and `docs/milestones/M1.md:189` demands a fixture for.

**The third is upsert identity.** Case 17 proves a second run edits rather than
creates. Cases 23 and 24 prove it cannot edit the wrong comment or emit both
operations at once. Decision 2 makes the producer's upsert a guarantee about
iAI's own writes only, so case 6 — the tie-break — is what stops `CLAIM-26.2`
from being satisfiable by a function that returns either of two comments.

**The fourth is that the purity claim must actually fire.** Cases 19–21 repeat
S1.3's three-case pattern deliberately, and case 21 is the mutation test. #253
exists because S1.3 shipped `CLAIM-21.1` with the lint scope unwidened; this
Story carries the widening as a Build Target from the start.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-26.1 | 1, 2, 3 | P0 |
| CLAIM-26.2 | 4, 5, 6 | P0 |
| CLAIM-26.3 | 7 | P0 |
| CLAIM-26.4 | 8, 9, 10, 11, 12 | P0, P0, P0, P0, P1 |
| CLAIM-26.5 | 13, 14 | P0 |
| CLAIM-26.6 | 15, 16, 17, 18 | P0, P0, P0, P1 |
| NEVER-26.7 | 19, 20, 21 | P0 |
| NEVER-26.8 | 22 | P0 |
| NEVER-26.9 | 23, 24 | P0 |
| NEVER-26.10 | 25, 26 | P0 |

26 cases — 24 P0 / 2 P1 / 0 P2.

## Standing checks

Not anchored to a claim, and not optional. Run at story-verify.

| Check | Command | Passes when |
|-------|---------|-------------|
| Evidence immutability | `git diff --name-only --diff-filter=MD main...HEAD -- docs/evidence` | 0 files. **`--diff-filter=MD` is mandatory** — Decision 12. The unfiltered form returns this Story's own added artifacts and reads as a false failure, which is what #243 and #21 both hit |
| Required contexts | `bash scripts/verify-required-checks.sh` | PASS, six contexts |
| Workflow hygiene | `bash scripts/verify-workflow-hygiene.sh` | PASS, six jobs |
| Full chain | `bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint && bun run claim-lint` | all 0 |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | A well-formed sentinel comment is accepted by the linter | CLAIM-26.1 | iai-core | P0 | tool-checked | `bun test packages/core` | All nine names of `docs/design/03-workflow.md:372-382` are accepted at column zero as the first line; 0 violations reported |
| 4 | Given three `## iai-verdict` comments the consumer returns the newest by `createdAt` | CLAIM-26.2 | iai-core | P0 | tool-checked | `bun test packages/core` | Exactly one comment returned, and it is the one with the greatest `createdAt` |
| 15 | `{issue}` and `{ts}` interpolate to the shape used by every artifact on disk | CLAIM-26.6 | iai-core | P0 | tool-checked | `bun test packages/core` | `docs/evidence/{issue}-{ts}.md` renders to `docs/evidence/26-20260903T101500Z.md`, and the emitted pattern matches all **22** filenames currently in `docs/evidence/` |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 2 | Each of the five producer-rule violations is rejected | CLAIM-26.1 | iai-core | P0 | tool-checked | `bun test packages/core` | 5/5 rejected — a preamble line, a leading space, a fenced sentinel, `### iai-design`, and two sentinels in one body |
| 3 | The five rejection messages are pairwise distinct | CLAIM-26.1 | iai-core | P0 | tool-checked | `bun test packages/core` | 5 unique message strings; a single generic message for all five fails. Each names the rule it violated |
| 5 | Older matching comments are neither merged nor averaged | CLAIM-26.2 | iai-core | P0 | tool-checked | `bun test packages/core` | The returned value is byte-identical to the newest comment; no field is drawn from the two older ones |
| 7 | Absence of a required sentinel returns a hard-failure `Decision` | CLAIM-26.3 | iai-core | P0 | tool-checked | `bun test packages/core` | An empty comment list and a list with only non-matching sentinels both yield a blocking `Decision`; no default, no `undefined`, no empty-string body |
| 14 | A branch-named permalink is rejected | CLAIM-26.5 | iai-core | P0 | tool-checked | `bun test packages/core` | `blob/main/`, `blob/HEAD/` and `blob/story-26/` are all rejected; the failure names the branch form |
| 16 | An unknown path placeholder is a construction failure | CLAIM-26.6 | iai-core | P0 | tool-checked | `bun test packages/core` | `docs/evidence/{n}-{ts}.md` returns a typed failure naming `{n}`; it never renders with the placeholder left uninterpolated |
| 22 | Hostile and malformed input returns a typed failure and never throws | NEVER-26.8 | iai-core | P0 | tool-checked | `bun test packages/core` | 0 throws across the corpus — `null`, `undefined`, `{}`, a throwing getter, a comment list containing a non-object, a body of `""`, a body of 2^17 characters, a `createdAt` that is not a date, and a negative issue number |
| 23 | An upsert instruction never targets a comment that lacks the sentinel | NEVER-26.9 | iai-core | P0 | tool-checked | `bun test packages/core` | Over a mixed list, every emitted edit target is a comment whose first line matches the requested sentinel; 0 mismatches |
| 24 | No single run emits both a create and an edit for one sentinel | NEVER-26.9 | iai-core | P0 | tool-checked | `bun test packages/core` | Across the full corpus every result is exactly one instruction; a create-and-edit pair never occurs |
| 25 | No rendered summary omits the permalink | NEVER-26.10 | iai-core | P0 | tool-checked | `bun test packages/core` | Every over-budget rendering contains a `/blob/[0-9a-f]{7,40}/` URL; a summary without one is a construction failure, not a warning |
| 26 | Nothing is rendered above the sentinel line | NEVER-26.10 | iai-core | P0 | tool-checked | `bun test packages/core` | Across every rendering — inline and summary, with and without counts — line 1 is the sentinel at column zero; 0 preambles |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 6 | Equal `createdAt` resolves deterministically by highest comment id | CLAIM-26.2 | iai-core | P0 | tool-checked | `bun test packages/core` | Two comments sharing a timestamp always return the higher id, over both input orderings. Decision 2 — without this the claim is satisfiable by a coin flip |
| 8 | A 59,999-character artifact is inlined | CLAIM-26.4 | iai-core | P0 | tool-checked | `bun test packages/core` | Strategy is inline; the full content appears below the sentinel; no permalink is emitted |
| 9 | A 60,000-character artifact is inlined | CLAIM-26.4 | iai-core | P0 | tool-checked | `bun test packages/core` | Strategy is inline. `docs/design/03-workflow.md:415` says `≤ 60000`; `CLAIM-26.4` names only 59,999 and 60,001, and Decision 5 settles the boundary as inclusive |
| 10 | A 60,001-character artifact yields a summary plus an SHA-pinned permalink | CLAIM-26.4 | iai-core | P0 | tool-checked | `bun test packages/core` | Strategy is summary; the body carries the size statement and one permalink; the full artifact text does not appear |
| 11 | No emitted comment body exceeds 65,536 characters in any of the three cases | CLAIM-26.4 | iai-core | P0 | tool-checked | `bun test packages/core` | Rendered body length ≤ 65,536 for the 59,999, 60,000 and 60,001 fixtures. Measured on the **rendered body**, not the artifact — the two are different quantities per Decision 5 |
| 12 | The rendered envelope stays within its 5,536-character budget | CLAIM-26.4 | iai-core | P1 | tool-checked | `bun test packages/core` | Rendered length minus inlined artifact length ≤ 5,536 across the corpus. This is Decision 5's new bound and the only thing that makes case 11 true by construction rather than by luck |
| 13 | Permalinks with 7-hex and 40-hex SHAs are both accepted | CLAIM-26.5 | iai-core | P0 | tool-checked | `bun test packages/core` | A 7-char, an 8-char and a 40-char lowercase hex SHA all pass; a 6-char and a 41-char both fail; uppercase hex fails |
| 18 | The `{ts}` format rejects the three non-conforming documentation forms | CLAIM-26.6 | iai-core | P1 | tool-checked | `bun test packages/core` | `20260825T1412Z` (no seconds) and `20260114T092211` (no `Z`) are rejected; `20260825T141207Z` is accepted. Decision 8 pins the format against the 22 artifacts on disk, not the prose examples |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 17 | A second producer run against a list already carrying the sentinel yields an edit | CLAIM-26.6 | iai-core | P0 | tool-checked | `bun test packages/core` | Run 1 against an empty list emits create; run 2 against the list containing run 1's comment emits edit naming that comment's id. The pair leaves exactly one comment per sentinel |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 19 | The `no-io-in-pure-modules` rule covers `packages/core/src/evidence` | NEVER-26.7 | iai-core | P0 | tool-checked | `bun run lint`, plus a test on the scope predicate | The predicate returns true for a path under the directory, the printed scope string names it, and the run reports `files.length >= 6` so the scan is not vacuous |
| 20 | The stubbed-runtime purity harness exercises the new barrel | NEVER-26.7 | iai-core | P0 | tool-checked | `IAI_PURITY_CHILD=1 bun test packages/core/test/purity.test.ts` | The harness imports the `evidence` barrel alongside `classify`, `guards` and `gh`, and passes with `fs`, `net` and `process` stubbed to throw |
| 21 | An I/O call introduced under `packages/core/src/evidence` is actually caught | NEVER-26.7 | iai-core | P0 | tool-checked | mutation test — add an `fs` import and a `fetch` call, run `bun run lint` | Both mutations are reported; reverting restores 0. **A rule in scope that does not fire is the failure this case exists to exclude** |

## Not applicable

- **Latency.** Nothing here sits on a guard hot path, so `CLAIM-15.5`'s 50 ms
  budget does not bind.
- **Network and the GitHub API.** This layer never performs a request. The
  comment list is an input value per Decision 1, so `createdAt`, comment ids and
  bodies are all fixture data.
- **`gh` argv construction.** S1.3 owns it. This layer returns an upsert
  *instruction*; the caller selects `commentCreate` or `commentEdit`. Case 17
  asserts the instruction, not the argv.
- **Writing the artifact to disk, and computing the SHA.** Both are effects. The
  permalink's SHA is an input; cases 13 and 14 validate the assembled URL, not
  its resolution.
- **`DomainBinding` registry validation.** S1.5 (#31). This Story exports the
  constants; `CLAIM-31.5` is where they are enforced against a binding.
- **Adapter conformance.** Neither adapter is touched.
- **The gate-collision case.** Two gate kinds on one issue collide under an
  `(issue, sentinel)` key. Decision 10 records it as M3's, and it cannot be
  observed from here.
- **Retrofitting the 22 existing artifacts.** They are immutable. Case 15 reads
  their filenames as a fixture and changes nothing.

## Notes

1. **Case 3 is the one that stops a degenerate linter.** Case 2 is satisfied by
   an implementation that returns the string `"malformed sentinel"` five times.
   `CLAIM-26.1` says *distinct*, and distinctness is what makes the linter
   useful to the author who tripped it. This is the same class of defect as the
   vacuous pass: a check that reports failure correctly while carrying no
   information.

2. **Case 21 is why `NEVER-26.7` carries three cases.** Cases 19 and 20 prove
   the directory is *in scope*; neither proves the rule *fires*. `skill-lint`
   is required in CI, passes every run and scans zero files. Case 19
   additionally asserts a non-zero denominator for exactly that reason — #253's
   first attempt passed while linting nothing, because `lintTree` was handed a
   directory with no package subdirectories.

3. **Case 9 tests a boundary the claim never defined.**
   `docs/milestones/M1.md:189` demands a 60,000-character fixture;
   `CLAIM-26.4` names only 59,999 and 60,001. The answer is in
   `docs/design/03-workflow.md:415` — `≤ 60000` inlines — and Decision 5 adopts
   it. Without this case the required fixture has no expected value.

4. **Case 16 is where the `{n}` defect surfaces.**
   `docs/design/03-workflow.md:376` and `docs/milestones/M2.md:132` both write
   `docs/evidence/{n}-{ts}.md`, and `{n}` is defined nowhere as an issue number.
   Decision 7 makes an unknown placeholder a construction failure precisely so
   that M2 hits a loud error rather than a path containing a literal `{n}`.

5. **Case 15 pins the template against disk, not against prose.** Four of the
   eight `{ts}` examples in the design documents disagree with each other; all
   22 artifacts in `docs/evidence/` agree. Decision 8 follows the artifacts. The
   case reads the real filenames so the plan cannot drift from them.

6. **Case 12 is the only P1 that would be a P0 in a stricter reading.** It is
   the bound that makes case 11 hold by construction. It is P1 only because
   case 11 asserts the outcome directly, so a regression here fails there too —
   just less legibly.

7. **The evidence-immutability standing check uses `--diff-filter=MD`.** This is
   Decision 12, and this plan is the first written that way. `NEVER-243.7`
   prohibits *modification*; the unfiltered form also reports *additions*, which
   every Story makes. #243 and #21 both read a false failure from it. There is
   no plan template to fix, so the correction propagates by precedent — copy
   this row, not `docs/test-plans/243-plan.md:86`.

8. **No P2 tier.** Every case proves a producer rule fires, a boundary is where
   the Design says, a contradiction was resolved as recorded, or an enforcement
   mechanism actually works.

<sub>Written by iAI, hand-executed. `/iai:story-test-plan` lands in M2.</sub>
