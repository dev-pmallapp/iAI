---
issue: 243
repo: dev-pmallapp/iAI
story: "S1.8 — Adopt the strict PRIVATE egress posture"
milestone: "M1 — Kernel and foundation"
---

# Test Plan: #243 — S1.8 Adopt the strict PRIVATE egress posture

## Source

`docs/design/stories/243.md` — 5 claims (`CLAIM-243.1`–`CLAIM-243.5`) and
2 anti-claims (`NEVER-243.6`, `NEVER-243.7`), approved at the design-approval
gate on 2026-08-31 as written.

## Feature Summary

This Story removes a capability. Its verification surface is therefore shaped
differently from S1.2's: the interesting cases are the ones proving a path is
*gone*, and proving it cannot come back.

Two things carry most of the weight. The twelve-cell matrix is re-driven with the
changed cell asserted as a block, and the consent corpus is driven against the
`PRIVATE` cloud path to show that no consent value — including a granted one —
produces an allow. The second is the whole of `NEVER-243.6`, and it exists
because the consent parameter is retained rather than deleted.

The rest is documentation reconciliation, verified by search rather than by
execution, plus a retention check that the projection survives with no egress
caller.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-243.1 | 1, 2 | P0, P1 |
| CLAIM-243.2 | 3, 4, 5 | P0 |
| CLAIM-243.3 | 6, 7 | P1 |
| CLAIM-243.4 | 8, 9 | P0, P1 |
| CLAIM-243.5 | 10 | P1 |
| NEVER-243.6 | 11, 12, 13, 14 | P0 |
| NEVER-243.7 | 15 | P0 |

15 cases — 10 P0 / 5 P1 / 0 P2.

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | No document states that `PRIVATE` data may reach a cloud vendor under any condition | CLAIM-243.1 | iai-references | P0 | tool-checked | `git grep -n` for the per-session opt-in and de-identified-egress phrasings across `docs/` and the root markdown set | 0 hits outside `docs/evidence/**` and the superseded-annotation lines |
| 2 | The strict posture is stated positively, not merely by absence of the permissive one | CLAIM-243.1 | iai-references | P1 | human-attested | read `docs/design/09-security.md` class table and absolutes | The `PRIVATE` row and the second absolute both say no cloud egress, so a reader reaches the rule without inferring it |
| 8 | `deidentifyPrivatePayload` remains exported and under test | CLAIM-243.4 | iai-core | P0 | tool-checked | `bun test packages/core` | The projection's own tests still pass unchanged; the export resolves from the guards barrel |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 3 | `PRIVATE` to a `cloud` destination blocks with consent **granted** | CLAIM-243.2 | iai-core | P0 | tool-checked | `bun test packages/core` | `action: "block"`; this is the cell S1.2 shipped as allow, and it is the single behavioural change in the Story |
| 4 | `PRIVATE` to a `cloud` destination blocks with consent withheld and omitted | CLAIM-243.2 | iai-core | P0 | tool-checked | `bun test packages/core` | both block, unchanged from S1.2 |
| 5 | The full twelve-cell matrix returns the documented action under the strict posture | CLAIM-243.2 | iai-core | P0 | tool-checked | `bun test packages/core` | 12/12 cells; only the `PRIVATE`/cloud/granted cell differs from the S1.2 table |
| 9 | The projection has no caller on any egress path | CLAIM-243.4 | iai-core | P1 | tool-checked | grep `deidentifyPrivatePayload` across `packages/**/src`, excluding its own module | 0 references from `egress.ts` or any other guard reached by `checkEgress` |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 11 | A granted consent cannot produce an allow for `PRIVATE` to cloud | NEVER-243.6 | iai-core | P0 | tool-checked | `bun test packages/core` | `{granted: true}` blocks; the test name states why re-enabling is forbidden |
| 12 | No consent value in the corpus produces an allow for `PRIVATE` to cloud | NEVER-243.6 | iai-core | P0 | tool-checked | `bun test packages/core` | granted, withheld, omitted, `{}`, `null`, `undefined`, `{granted: "yes"}`, a throwing getter — 0 allows across all of them |
| 13 | Consent does not alter the decision for any class or destination | NEVER-243.6 | iai-core | P0 | tool-checked | `bun test packages/core` | For all four classes and both localities, the decision with consent granted is deep-equal to the decision with consent withheld |
| 14 | Consent remains inert for `SECRET`, unchanged from S1.2 | NEVER-243.6 | iai-core | P0 | tool-checked | `bun test packages/core` | `SECRET` blocks under every consent value and both localities |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 6 | `CLAIM-15.4` is annotated as superseded and names #243 | CLAIM-243.3 | iai-references | P1 | human-attested | read `docs/design/stories/15.md` | The annotation names #243; the original claim text is intact, so the sealed Design still matches the evidence taken against it |
| 7 | `CLAIM-126.3` and `CLAIM-126.4` are corrected at source and each names #243 | CLAIM-243.3 | iai-references | P1 | human-attested | read `docs/milestones/M5.md` | Both corrected; neither still asserts that a de-identified payload egresses |
| 10 | The local-model prerequisite is recorded as a blocking dependency on M5 | CLAIM-243.5 | iai-references | P1 | human-attested | read `docs/milestones/M5.md` | The entry names the capability M5 cannot deliver without a named local model, not merely that one is missing |

### Immutability

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 15 | `docs/evidence/` is untouched and no posted sentinel is edited | NEVER-243.7 | iai-references | P0 | tool-checked | `git diff --name-only main...HEAD -- docs/evidence` | 0 files changed; #15's `## iai-verdict` remains as posted |

## Not applicable

- **Latency.** This Story removes a branch rather than adding one, so
  `checkEgress` cannot get slower. `CLAIM-15.5`'s benchmark continues to run and
  would catch a regression; no case here re-measures it.
- **Purity.** No new I/O surface is introduced. `CLAIM-15.6`'s harness and the
  `no-io-in-pure-modules` lint rule both continue to run unchanged.
- **Adapter mappings.** The changed cell moves between two arms of
  `EgressDecision` that both already exist, so neither adapter changes shape and
  cases 22 to 24 of `docs/test-plans/15-plan.md` remain valid as written.
- **Concurrency and persistence.** Unchanged from S1.2: the predicates are pure
  synchronous functions over caller-supplied values.

## Notes

1. **Case 13 is the strongest form of the inertness claim, and is the reason
   `NEVER-243.6` carries four cases rather than one.** Asserting that a granted
   consent blocks (case 11) only proves the one cell. Asserting that the decision
   is *deep-equal* with and without consent, across every class and locality,
   proves the parameter cannot influence anything — which is the property that
   makes retaining it safe. If consent is ever legitimately wired to something
   else, case 13 is the test that must be consciously narrowed, and that is the
   intended friction.

2. **Case 1 must exclude the annotation lines it would otherwise flag.** Decision
   4 requires `CLAIM-15.4` to keep its original text with a superseded note
   beside it, so the permissive phrasing survives on purpose in exactly one
   place. The search excludes `docs/evidence/**` and the annotation, and any
   further exclusion is a finding rather than a search adjustment.

   **One further exclusion was found, and is recorded rather than waved
   through.** `docs/test-plans/15-plan.md` case 6 asserts the removed behaviour,
   because it is the case that verified `CLAIM-15.4`. It receives the same
   treatment as the claim — text intact, superseded annotation beside it, number
   not freed — and is documented in that plan's `## Superseded cases` section.
   Case 1's search therefore excludes exactly three things, all named.

3. **No P2 tier, for the same reason as S1.2.** Every case either proves a leak
   path is closed or proves the record stayed honest. Nothing here is cosmetic.

4. **Cases 6, 7 and 10 are `human-attested` reads.** They check that a correction
   says the right thing, which no grep can judge — a document can name #243 and
   still describe the posture wrongly. The tool-checked half of `CLAIM-243.1` is
   case 1; these three are the half that needs a reader.

<sub>Written by iAI, hand-executed. `/iai:story-test-plan` lands in M2.</sub>
