---
issue: 9
repo: dev-pmallapp/iAI
story_title: >-
  S1.1 — Monorepo scaffold and build targets
milestone: M1 — Kernel and foundation
domain: dev
isa: https://github.com/dev-pmallapp/iAI/blob/ce02b291a9216d297a17d22fb8bb2fe398d14f7c/docs/design/9-isa.md
claims: ISC-1..ISC-9
created: 2026-08-25
---

# Test Plan: #9 — S1.1 Monorepo scaffold and build targets

## Source

| Field | Value |
|-------|-------|
| Story | S1.1 — Monorepo scaffold and build targets |
| Milestone | M1 — Kernel and foundation |
| Domain | dev |
| ISA | https://github.com/dev-pmallapp/iAI/blob/ce02b291a9216d297a17d22fb8bb2fe398d14f7c/docs/design/9-isa.md |
| Rung ladder | compile -> unit -> integration -> review |
| Date | 2026-08-25 |

## Feature Summary

A clean checkout of iAI must install and build all ten `library` and `binary`
targets named in the Build Targets table, and a pull request must report
build, test, lint, typecheck and skill-lint as five separately named required
checks, with any one of them failing leaving the PR unmergeable. A malformed
commit subject and a malformed skill frontmatter must each be rejected at the
point of authorship, not later in CI. `docs/design/verification-pass.md` must
carry a verdict — `confirmed`, `corrected` or `invented` — for every assertion
in `docs/design/` against LifeOS, forge and oh-my-opencode, with every
`invented` row closed by a corrective commit before this story is done.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| ISC-1 | 1, 2, 18, 20, 21, 23 | P0, P1 |
| ISC-2 | 3, 14, 20 | P0 |
| ISC-3 | 7, 9, 24 | P0, P1 |
| ISC-4 | 4, 12, 13 | P0, P1 |
| ISC-5 | 5, 10, 11, 22 | P0, P1 |
| ISC-6 | 8, 19, 22 | P1, P2 |
| ISC-7 | 16, 17 | P1, P2 |
| ISC-8 | 15 | P1 |
| ISC-9 | 6, 13 | P0, P1 |

24 cases — 9 P0 / 13 P1 / 2 P2

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | Clean install and workspace build produces an artifact for every library and binary target | ISC-1 | iai-core | P0 | deterministic | `bun install && bun run build` | Exit code 0, no `error TS` line on stderr, and an artifact exists for each of the ten library/binary targets in the ISA's Build Targets table |
| 2 | A filtered build of `iai-core` alone succeeds, confirming the filter mechanism every other target's build depends on | ISC-1 | iai-core | P1 | deterministic | `bun run build --filter iai-core` | Exit code 0, no `error TS` line on stderr, artifact produced for `packages/core` |
| 3 | A pull request reports exactly five separately named required check contexts | ISC-2 | iai-core | P0 | deterministic | `bash scripts/verify-required-checks.sh` | Exit code 0 and the script reports exactly 5 contexts named build, test, lint, typecheck, skill-lint |
| 4 | Lint exits clean on an unmodified `packages/core` tree | ISC-4 | iai-core | P1 | deterministic | `bun run lint` | Exit code 0 with no errors reported against `packages/core` |
| 5 | Skill-lint passes a docs-target `SKILL.md` whose frontmatter carries a valid `name` and `description` matching its directory | ISC-5 | iai-references | P1 | deterministic | `bun run skill-lint skills/` | Exit code 0 |
| 6 | Lint reports zero host-import and zero `process.cwd()` violations against an unmodified `packages/core` | ISC-9 | iai-core | P1 | deterministic | `bun run lint` | Exit code 0 and 0 violations reported for the host-import and `process.cwd()` rules |
| 7 | A well-formed commit subject (`#9: add workspace scaffold`) is accepted by `checkCommitPrefix` | ISC-3 | iai-core | P1 | deterministic | `bun test packages/core -t "checkCommitPrefix"` | Exit code 0, summary reports `0 fail`, the well-formed fixture is accepted |
| 8 | `docs/design/verification-pass.md` carries a verdict row for every assertion in `docs/design/` | ISC-6 | iai-references | P1 | judged | `review of docs/design/verification-pass.md against the three source repos` | 100% of assertion rows carry one of `confirmed`, `corrected` or `invented`; no row is blank |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 9 | A commit subject failing the ISC-3 subject regex is rejected by the commit-msg hook | ISC-3 | iai-core | P0 | deterministic | `bun test packages/core -t "checkCommitPrefix"` | Non-zero exit for the malformed fixture, and the hook's output echoes the offending subject text |
| 10 | Skill-lint rejects a docs-target `SKILL.md` whose frontmatter omits `name` or `description` | ISC-5 | iai-references | P0 | deterministic | `bun run skill-lint skills/` | Non-zero exit, error output names the specific `SKILL.md` file and the missing field |
| 11 | Skill-lint rejects a docs-target `SKILL.md` whose `name` differs from its containing directory name | ISC-5 | iai-references | P1 | deterministic | `bun run skill-lint skills/` | Non-zero exit, error output identifies the `name`/directory mismatch |
| 12 | Lint fails a `packages/core` file that imports from `packages/adapter-opencode` or `packages/adapter-claude` | ISC-4 | iai-core | P0 | deterministic | `bun run lint` | Non-zero exit, error output names the offending file and the forbidden adapter import |
| 13 | Lint fails a `packages/core` file that calls `process.cwd()` | ISC-4, ISC-9 | iai-core | P0 | deterministic | `bun run lint` | Non-zero exit, error output names the offending file and cites the `process.cwd()` rule |
| 14 | A pull request with one failing required check (e.g. lint) is reported unmergeable | ISC-2 | iai-core | P0 | deterministic | `bash scripts/verify-required-checks.sh` | The script reports the failing context as blocking; the PR's mergeable state is not "clean" |
| 15 | A skipped or absent required check never causes the PR to report as passing | ISC-8 | iai-core | P1 | attested | `GitHub required-checks config review (recognize-on-encounter)` | 0 skip-as-pass incidents across the required-checks configuration audit; a skipped or absent context never appears among the checks marked passing |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 16 | The `iai-skills` docs target has no build file and its build is a no-op | ISC-7 | iai-skills | P1 | deterministic | `bun run build --filter iai-skills` | Exit code 0, no build file is invoked, no artifact is produced |
| 17 | `iai-agents` and `iai-references` are docs targets with no build file and an empty source directory at scaffold time; their build is also a no-op | ISC-7 | iai-agents, iai-references | P2 | deterministic | `bun run build --filter iai-agents` | Exit code 0, no build file is invoked, no artifact is produced; the same holds for `iai-references` under the equivalent filtered run |
| 18 | A library target with only a package skeleton and an empty `src/` directory still builds to a trivial artifact | ISC-1 | iai-domain-dev | P1 | deterministic | `bun run build --filter iai-domain-dev` | Exit code 0, no `error TS` line on stderr, a (possibly empty) artifact is produced |
| 19 | An assertion in `docs/design/` with no corresponding statement in LifeOS, forge or oh-my-opencode is marked `invented` and names the commit that removed or corrected it | ISC-6 | iai-references | P2 | judged | `review of docs/design/verification-pass.md against the three source repos` | The row's verdict reads `invented` and cites a specific commit hash |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 20 | The full local pipeline — install, build, test, lint, typecheck, skill-lint — runs to completion on a clean checkout | ISC-1, ISC-2 | iai-core | P0 | deterministic | `bun install && bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint` | Exit code 0 for the whole chain, matching the five checks reported on a PR |
| 21 | `bun run typecheck` resolves all thirteen package entries in one pass via TypeScript project references | ISC-1 | iai-core | P1 | deterministic | `bun run typecheck` | Exit code 0, `tsc` reports no diagnostics across the workspace |
| 22 | A skill-lint rejection on a docs target correlates to a `corrected` verdict row in the reconciliation table citing the same fixing commit | ISC-5, ISC-6 | iai-references | P1 | judged | `bun run skill-lint skills/` | The linter's exit code transitions from non-zero to 0 after the fix, and the corresponding `docs/design/verification-pass.md` row reads `corrected` and cites the fixing commit |

### Error Recovery

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 23 | A build failure in one target leaves the other nine targets buildable, and the tree is retryable after the break is fixed | ISC-1 | iai-installer | P1 | deterministic | `bun run build --filter iai-installer` | After the introduced break is reverted, the command exits 0 with no `error TS` line and no artifact left in a partial state |
| 24 | A commit rejected by the commit-msg hook leaves the working tree and staged changes untouched, and a corrected subject is accepted on immediate retry | ISC-3 | iai-core | P0 | deterministic | `bun test packages/core -t "checkCommitPrefix"` | After rejection, the staged diff is unchanged; re-invoking with a corrected subject exits 0 |

## Not applicable

- **Concurrency** — no claim in ISC-1..ISC-9 describes concurrent access or
  shared mutable state; the scaffold has no runtime concurrency surface to
  exercise.
- **Upgrade/Downgrade** — S1.1 is the first story of the first milestone;
  there is no prior version of the workspace to upgrade from or downgrade to.
- **Scale** — no claim specifies a load or volume threshold (contrast S1.2's
  10,000-iteration benchmark); build, lint and typecheck run once per
  invocation regardless of workspace size.
- **Performance** — no claim in this ISA carries a latency or throughput
  threshold; ISC-1..ISC-9 are exit-code and structural checks only.
- **Loop/Stability** — no claim describes a long-running or repeatedly
  invoked process; the commit-msg hook and CI checks each run once per commit
  or PR, not in a loop.

## Notes

1. **The `anchors_to` collision.** The token is used with three different
   meanings across the repo: claim provenance in the ISA's Test Strategy
   table (`literal`, `derived:`), a build-target reference in
   `docs/design/04-domain-dev.md:427-433`, and "the ISC-N a case covers" in
   `docs/milestones/M2.md:88-90`. This plan uses the third meaning
   throughout. Flag for the ISC-6 reconciliation pass.
2. **Priority is not carried on the ISA.** `docs/design/01-skill-hierarchy.md:63`
   says the Test Strategy table has a `tier` column, but the actual ISA at
   `docs/design/stories/9.md` has no such column. Priorities in this plan are
   assigned by this plan, using the ISA's `severity` column as the signal:
   `critical` (ISC-1..ISC-5) forms the P0 spine, the blank-severity anti-claims
   and the manual reconciliation/recognize-on-encounter checks (ISC-6..ISC-9)
   are distributed across P1/P2 by judgement. Flag for reconciliation.
3. **iAI's verdict semantics diverge from forge's.** In forge, any failing
   test is `FAIL`; in iAI (`docs/design/02-roles.md:265-268`), the verdict
   keys off P0 specifically — all P0 passing is `PASS`, any P0 failing is
   `FAIL`, and P0 passing with P1/P2 incomplete is `PARTIAL`. A failing P2
   case in this plan is therefore `PARTIAL`, not `FAIL`. Priority is
   load-bearing here.
