---
issue: 194
repo: dev-pmallapp/iAI
story: "S1.6 — Retire the ISC/ISA acronym family"
milestone: "M1 — Kernel and foundation"
---

# Test Plan: #194 — S1.6 Retire the ISC/ISA acronym family

## Source

`docs/design/stories/194.md` — 5 claims (`CLAIM-194.1`–`CLAIM-194.5`) and
2 anti-claims (`NEVER-194.6`, `NEVER-194.7`).

This plan is written in the vocabulary the Story proposes: verifiers are
`tool-checked`, `model-judged` and `human-attested`, not `deterministic`,
`judged` and `attested`. The plan is therefore its own first test of the
renamed verifier classes.

## Feature Summary

A vocabulary migration, not a behaviour change. Nothing about what a claim
*means* or how it is verified changes. Three properties must survive it:

1. **Totality** — no `ISC-` token survives outside four allow-listed paths.
2. **Uniqueness** — every identifier is Story-qualified and globally unique.
3. **Immutability** — the evidence record and posted gate comments are untouched.

The third is the one that cannot be undone if it is got wrong, which is why it
carries two anti-claim cases and the highest severity.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-194.1 | 1, 2, 12, 16 | P0, P1 |
| CLAIM-194.2 | 3, 4, 13, 17, 21 | P0, P1 |
| CLAIM-194.3 | 5, 14, 20 | P0, P1 |
| CLAIM-194.4 | 6, 7, 15 | P0, P1 |
| CLAIM-194.5 | 8, 18 | P1 |
| NEVER-194.6 | 9, 10 | P0 |
| NEVER-194.7 | 11, 19 | P0, P1 |
| CLAIM-194.8 | 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 | P0, P1 |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | No `ISC-` token survives outside the four allow-listed paths | CLAIM-194.1 | iai-references | P0 | tool-checked | `git grep -n 'ISC-' -- docs scripts .github '*.md'` | Every hit is under `docs/evidence/`, or is `docs/design/stories/194.md`, `docs/test-plans/194-plan.md` or `docs/design/verification-pass.md` |
| 2 | The thematic design series is migrated | CLAIM-194.1 | iai-references | P1 | tool-checked | `git grep -c 'ISC-' -- docs/design` | 0 hits outside `stories/194.md` and `verification-pass.md` |
| 3 | Every claim identifier is Story-qualified | CLAIM-194.2 | iai-core | P0 | tool-checked | `bun run claim-lint` | Exit 0; every identifier matches `^(CLAIM\|NEVER)-\d+\.\d+$` |
| 4 | Story 9's nine identifiers map one-to-one with `n` preserved | CLAIM-194.2 | iai-references | P0 | tool-checked | `bun run claim-lint --map 9` | `ISC-1..6`→`CLAIM-9.1..6`, `ISC-7..9`→`NEVER-9.7..9` |
| 5 | Every anti-claim in a Story design document carries the `NEVER-` prefix | CLAIM-194.3 | iai-core | P0 | tool-checked | `bun run claim-lint` | 0 anti-claim rows carrying `CLAIM-` |
| 6 | Every `anchors_to` resolves to an existing identifier | CLAIM-194.4 | iai-core | P0 | tool-checked | `bun run claim-lint` | 0 dangling references across `docs/test-plans/` |
| 7 | Coverage tables resolve to identifiers in the matching design | CLAIM-194.4 | iai-core | P1 | tool-checked | `bun run claim-lint` | Every Coverage row resolves |
| 8 | Every task issue's `\| Claims \|` row names identifiers that exist | CLAIM-194.5 | iai-references | P1 | human-attested | `gh issue list --label type:task` review | 43/43 bodies migrated, 0 unresolvable |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 9 | No file under `docs/evidence/` is modified | NEVER-194.6 | iai-references | P0 | tool-checked | `git diff --name-only main...HEAD -- docs/evidence` | Empty output |
| 10 | No posted `## iai-evidence` or `## iai-gate` comment is edited | NEVER-194.6 | iai-references | P0 | human-attested | comment `updated_at` audit on #9–#14, #187 | No gate or evidence comment shows an edit after its Story closed |
| 11 | The `## iai-isa` sentinel is never left dangling | NEVER-194.7 | iai-references | P0 | tool-checked | `git grep -c 'iai-isa'` and `git grep -c 'iai-design'` | Writers and readers agree; no mixed state in any single commit |
| 12 | A reintroduced `ISC-` token fails the check | CLAIM-194.1 | iai-core | P1 | tool-checked | plant `ISC-1` in a design file, run `claim-lint` | Non-zero exit naming the file and line |
| 13 | A duplicate identifier across two Stories fails | CLAIM-194.2 | iai-core | P0 | tool-checked | plant `CLAIM-9.1` in another Story's design | Non-zero exit naming both files |
| 14 | An anti-claim written as `CLAIM-` in a Story design fails | CLAIM-194.3 | iai-core | P1 | tool-checked | plant an anti-claim row with `CLAIM-` | Non-zero exit naming the row |
| 15 | A dangling `anchors_to` fails | CLAIM-194.4 | iai-core | P0 | tool-checked | plant `anchors_to: CLAIM-9.99` | Non-zero exit naming the dangling reference |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 20 | A milestone seed carrying `CLAIM-` for a prohibition does **not** fail | CLAIM-194.3 | iai-core | P1 | tool-checked | `bun run claim-lint docs/milestones` | Exit 0. `M1.md`'s `CLAIM-15.6` (*"No file … performs I/O"*) is a seed, not a design claim |
| 21 | The same identifier in a seed and a design is not a duplicate | CLAIM-194.2 | iai-core | P0 | tool-checked | `bun run claim-lint` | `CLAIM-9.1`–`9.6` appear in both `M1.md` and `stories/9.md`; uniqueness is per-identifier-meaning, not per-occurrence |


| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 16 | The allow-list is closed at exactly four paths | CLAIM-194.1 | iai-core | P1 | tool-checked | add a second file containing `ISC-` | Non-zero exit; the allow-list is closed, not a prefix match |
| 17 | Two-digit Story and claim numbers parse | CLAIM-194.2 | iai-core | P1 | tool-checked | `CLAIM-194.10` | Parsed as Story 194, claim 10 — not 194.1 followed by 0 |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 18 | Evidence documents remain resolvable via the mapping note | CLAIM-194.5 | iai-references | P1 | model-judged | read `docs/evidence/187-*.md` `Claims: ISC-4, ISC-9` | Both resolve through `stories/194.md` to `CLAIM-9.4` and `NEVER-9.9` |
| 19 | A newly posted sentinel uses the renamed form | NEVER-194.7 | iai-references | P1 | human-attested | next Story's sentinel | Posted as `## iai-design`; nothing still greps `iai-isa` |

### Path Guard (#210)

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 22 | A citation of an existing repo-relative path passes | CLAIM-194.8 | iai-core | P0 | tool-checked | `bun run claim-lint` | Exit 0; no `path-dangling` violation |
| 23 | A citation of a non-existent repo-relative path fails | CLAIM-194.8 | iai-core | P0 | tool-checked | plant `` `docs/design/stories/888.md` `` in a design doc, run `claim-lint` | Non-zero exit; `path-dangling` names the file and line of the citation |
| 24 | The planted `docs/design/stories/999.md` fires | CLAIM-194.8 | iai-core | P0 | tool-checked | plant `` `docs/design/stories/999.md` `` in a design doc, run `claim-lint` | Non-zero exit; `path-dangling` names `docs/design/stories/999.md` |
| 25 | Exclusion 1 — a citing file under `docs/evidence/` is skipped entirely | CLAIM-194.8 | iai-core | P1 | tool-checked | plant a dangling citation inside `docs/evidence/1-x.md`, run `claim-lint` | Exit 0; the evidence file is never scanned |
| 26 | Exclusion 2 — a cited target under `docs/evidence/` is excluded | CLAIM-194.8 | iai-core | P1 | tool-checked | cite a nonexistent `docs/evidence/999-x.md` from a design doc, run `claim-lint` | Exit 0; no violation for the evidence-prefixed target |
| 27 | Exclusion 3 — a `{}` or `<>` template placeholder is excluded | CLAIM-194.8 | iai-core | P1 | tool-checked | cite `docs/design/stories/{issue}.md` and `docs/design/NN-domain-<id>.md`, run `claim-lint` | Exit 0; neither placeholder is reported |
| 28 | Exclusion 4 — a glob is excluded | CLAIM-194.8 | iai-core | P1 | tool-checked | cite `docs/milestones/M*.md`, run `claim-lint` | Exit 0; no violation |
| 29 | Exclusion 5 — range notation is excluded | CLAIM-194.8 | iai-core | P1 | tool-checked | cite `docs/milestones/M1..M8.md`, run `claim-lint` | Exit 0; no violation |
| 30 | Exclusion 6 — a SHA-pinned permalink target must NOT be reported | CLAIM-194.8 | iai-core | P0 | tool-checked | cite a nonexistent path trailing `/blob/<sha>/`, both a 40-hex and a 7-8-hex short SHA, run `claim-lint` | Exit 0 for both; the `{7,40}` contract (`docs/milestones/M1.md:170`) covers short SHAs too |
| 31 | Exclusion 7 — citing file is `docs/design/verification-pass.md` | CLAIM-194.8 | iai-core | P1 | tool-checked | cite an ancestor-repo path from `verification-pass.md`, run `claim-lint` | Exit 0; that document's citations are never checked against this tree |
| 32 | Exclusion 8 — a path under an `ignoredPrefixes` entry is excluded | CLAIM-194.8 | iai-core | P1 | tool-checked | cite `USER/GOALS/GOALS.md`, run `claim-lint` | Exit 0; no violation |

## Not applicable

- **Runtime behaviour.** No package under `packages/` changes behaviour; the
  only new code is the `claim-lint` guard, covered by cases 3–7 and 12–17.
- **Rung promotion.** This Story never leaves `rung:compile`.
- **Rewriting evidence.** Explicitly forbidden by `NEVER-194.6`; there is no
  passing variant of that action to test.

## Notes

Case 4 is the one that makes the migration auditable. Because `n` is preserved,
correctness is a **diff of identifiers**, not a re-reading of every claim. If a
task renumbers anything, that property is lost and case 4 fails.

Cases 9 and 10 are the irreversible ones. Run them **before** any push, not as
part of final verification — a rewritten evidence file that reaches `main` is
not recoverable by revert, because the value was the SHA-pin.

<sub>Written by iAI, hand-executed. `/iai:story-test-plan` lands in M2.</sub>
