---
issue: 15
repo: dev-pmallapp/iAI
story: "S1.2 — Data classification and the guard kernel"
milestone: "M1 — Kernel and foundation"
---

# Test Plan: #15 — S1.2 Data classification and the guard kernel

## Source

`docs/design/stories/15.md` — 6 claims (`CLAIM-15.1`–`CLAIM-15.6`, the
milestone-seeded acceptance criteria) and 3 anti-claims (`NEVER-15.7`–
`NEVER-15.9`), approved at the design-approval gate on 2026-08-30 with Decision 3
amended by the Q2 ruling.

## Feature Summary

Four pure predicates and one classifier, all under `packages/core/src`, with the
two adapter mappings. The verification surface is dominated by one artifact: the
twelve-cell class-by-destination matrix authored in the Design, which the
milestone requires a hostile-input fixture set to drive exhaustively. Every cell
gets a case.

Two of the nine claims are now enforced by the type system rather than by
assertion, following the Q2 ruling. Those are verified by `tsc` rejecting a
program, not by a runtime expectation, which is why this plan carries a
type-level category that earlier plans did not.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-15.1 | 1, 2, 17, 19 | P0, P1 |
| CLAIM-15.2 | 13, 14, 18, 20 | P0, P1 |
| CLAIM-15.3 | 10, 11, 12, 22, 31 | P0, P1 |
| CLAIM-15.4 | 6, 9, 23 | P0 |
| CLAIM-15.5 | 7, 8, 15, 16, 21 | P0, P1 |
| CLAIM-15.6 | 25, 32 | P0 |
| NEVER-15.7 | 3, 4, 5, 24, 30, 31 | P0, P1 |
| NEVER-15.8 | 26, 27, 28 | P0 |
| NEVER-15.9 | 29 | P0 |

32 cases — 20 P0 / 12 P1 / 0 P2. The matrix accounts for 12 of them: cases 3, 4,
5, 6, 9, 10, 11 cover all twelve cells, with 12 and 23 covering the two
continuation rules that hang off them.

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | A payload of four hundred public fields and one biomarker value classifies `PRIVATE` in its entirety | CLAIM-15.1 | iai-core | P0 | tool-checked | `bun test packages/core` | `classify()` returns `PRIVATE`; no partial or per-field result is returned |
| 2 | A single-class payload classifies at its own level, for each of the four levels | CLAIM-15.1 | iai-core | P0 | tool-checked | `bun test packages/core` | 4/4 fixtures return their declared level exactly |
| 3 | `PUBLIC` allows against all three destination conditions | NEVER-15.7 | iai-core | P1 | tool-checked | `bun test packages/core` | 3/3 return `action: "allow"`; none carries `redacted`; none returns `warn` |
| 4 | `INTERNAL` allows against all three destination conditions | NEVER-15.7 | iai-core | P1 | tool-checked | `bun test packages/core` | 3/3 return `action: "allow"`; none returns `warn` |
| 5 | `PRIVATE` on-device allows the raw record | NEVER-15.7 | iai-core | P1 | tool-checked | `bun test packages/core` | `action: "allow"` and the payload is passed through unredacted |
| 6 | `PRIVATE` to a `cloud` destination with the per-session opt-in present returns `allow` carrying a de-identified `redacted` payload | CLAIM-15.4 | iai-core | P0 | tool-checked | `bun test packages/core` | `action: "allow"`, `redacted` present, and the raw record is absent from it per the projection at `docs/design/09-security.md:137-153` |
| 7 | `checkSpend` below the supplied threshold allows | CLAIM-15.5 | iai-core | P1 | tool-checked | `bun test packages/core` | `action: "allow"` for every below-threshold fixture |
| 8 | `checkRiskMandate` permits an auto run at `rung:research` and at `rung:paper` | CLAIM-15.5 | iai-core | P1 | tool-checked | `bun test packages/core` | `action: "allow"` for both rungs |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 9 | `PRIVATE` to a `cloud` destination with no per-session opt-in blocks | CLAIM-15.4 | iai-core | P0 | tool-checked | `bun test packages/core` | `action: "block"`; the message names the required reroute and performs no routing |
| 10 | `SECRET` blocks against `locality: "on-device"` | CLAIM-15.3 | iai-core | P0 | tool-checked | `bun test packages/core` | `action: "block"`; `locality` is shown inert by the on-device and cloud results being identical |
| 11 | `SECRET` blocks to `cloud` with the opt-in both withheld and granted | CLAIM-15.3 | iai-core | P0 | tool-checked | `bun test packages/core` | 2/2 block; the opt-in changes nothing, per `docs/design/09-security.md:56-58` |
| 12 | A `SECRET` block carries no `redacted` continuation | CLAIM-15.3 | iai-core | P0 | tool-checked | `bun test packages/core` | `redacted` absent at runtime on every block fixture, complementing the structural guarantee in case 31 |
| 13 | An unrecognised value classifies `PRIVATE` | CLAIM-15.2 | iai-core | P0 | tool-checked | `bun test packages/core` | `PRIVATE`, not `PUBLIC` and not `INTERNAL`, for every unrecognised-shape fixture |
| 14 | A path under `USER/` classifies at least `PRIVATE`, never `INTERNAL` | CLAIM-15.2 | iai-core | P0 | tool-checked | `bun test packages/core` | 0 results at `PUBLIC` or `INTERNAL` across the `USER/` path corpus |
| 15 | `checkSpend` above the supplied threshold blocks | CLAIM-15.5 | iai-core | P1 | tool-checked | `bun test packages/core` | `action: "block"` for every above-threshold fixture, including the exact-equality boundary |
| 16 | `checkRiskMandate` refuses an auto run at `rung:live` | CLAIM-15.5 | iai-core | P0 | tool-checked | `bun test packages/core` | `action: "block"`, and the message reproduces the hard-failure block at `docs/design/03-workflow.md:498-504` |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 17 | A mixed payload whose single non-public field sits at `INTERNAL`, then `PRIVATE`, then `SECRET` returns that level each time | CLAIM-15.1 | iai-core | P1 | tool-checked | `bun test packages/core` | 3/3 return the elevated level, proving the maximum is taken rather than the mode or the first hit |
| 18 | An empty object, an empty array, `null` and `undefined` each classify `PRIVATE` | CLAIM-15.2 | iai-core | P0 | tool-checked | `bun test packages/core` | 4/4 return `PRIVATE`; none throws and none returns `PUBLIC` |
| 19 | A biomarker value nested ten levels deep still lifts the whole payload to `PRIVATE` | CLAIM-15.1 | iai-core | P1 | tool-checked | `bun test packages/core` | `PRIVATE`; depth does not truncate the walk |
| 20 | Path prefixes that resemble `USER/` without being it are classified on their merits | CLAIM-15.2 | iai-core | P1 | tool-checked | `bun test packages/core` | `USERS/x` and `user/x` do not match the rule; `USER/x` and `./USER/x` do; no fixture both misses and leaks |
| 21 | Latency at the full corpus size, per predicate | CLAIM-15.5 | iai-core | P1 | tool-checked | benchmark harness, 10,000 iterations | p99 under 50ms for each of the four predicates; observed maximum reported alongside the p99 in the evidence artifact |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 22 | Both adapters express the same block | CLAIM-15.3 | iai-adapter-claude, iai-adapter-opencode | P0 | tool-checked | `bun test packages/adapter-claude packages/adapter-opencode` | `toExitCode` returns 2 and `applyDecision` throws, from one `EgressDecision` |
| 23 | The opencode adapter mutates `output.args` to the redacted payload on the allow-with-continuation path | CLAIM-15.4 | iai-adapter-opencode | P0 | tool-checked | `bun test packages/adapter-opencode` | `output.args` equals `decision.redacted` after the call, per `docs/design/09-security.md:132`; the raw value is never assigned |
| 24 | `EgressDecision` is assignable to `Decision`, so neither adapter changes shape | NEVER-15.7 | iai-core, iai-adapter-claude, iai-adapter-opencode | P0 | tool-checked | `bun run typecheck` | Both union arms pass to `toExitCode` and `applyDecision` without a cast and without widening their parameter types |
| 25 | The whole suite passes with the runtime stubbed | CLAIM-15.6 | iai-core | P0 | tool-checked | stubbed-runtime harness with `fs`, `net` and `process` throwing | 0 failures and 0 skips; a stub that is never reached is asserted to have been installed |

### Error Recovery

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 26 | An omitted consent argument behaves exactly as consent withheld | NEVER-15.8 | iai-core | P0 | tool-checked | `bun test packages/core` | The two-argument and explicitly-withheld three-argument calls return deep-equal decisions across the whole matrix |
| 27 | An unrecognised `locality` blocks rather than falling through to the cloud branch | NEVER-15.8 | iai-core | P0 | tool-checked | `bun test packages/core` | `action: "block"` for every out-of-vocabulary `locality`, including the empty string |
| 28 | A hostile `Destination` blocks rather than throwing or allowing | NEVER-15.8 | iai-core | P0 | tool-checked | `bun test packages/core` | A null vendor, a prototype-polluted object and a getter that throws each yield `action: "block"`; no fixture escapes as `allow` |
| 29 | No raw `PRIVATE` field and no `SECRET` value appears in any returned `message` or `redacted` | NEVER-15.9 | iai-core | P0 | tool-checked | `bun test packages/core` | 0 occurrences of any fixture's sentinel secret across every returned string and every serialised continuation, block paths included |

### Type-level and lint

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 30 | A `warn` egress decision does not compile | NEVER-15.7 | iai-core | P1 | tool-checked | `bun run typecheck` over an `@ts-expect-error` fixture | The fixture compiles only because the error is expected; removing the directive fails the build |
| 31 | A block carrying a `redacted` continuation does not compile | NEVER-15.7, CLAIM-15.3 | iai-core | P1 | tool-checked | `bun run typecheck` over an `@ts-expect-error` fixture | As case 30; this is the structural half of CLAIM-15.3, of which case 12 is the runtime half |
| 32 | No file under the classifier or the guards imports a runtime module | CLAIM-15.6 | iai-core | P0 | tool-checked | `bun run lint` | 0 violations for `fs`, `net`, `process` and `Bun` specifiers under `packages/core/src/classify` and `packages/core/src/guards` |

## Not applicable

- **Concurrency.** Every predicate in this Story is a pure synchronous function
  over caller-supplied values with no shared mutable state, so there is no
  interleaving to exercise. The consent snapshot is a value, not a handle.
- **Rung promotion.** This Story never leaves `rung:compile`. Case 16 exercises
  `checkRiskMandate`'s reading of a rung, not a promotion through one.
- **Persistence and idempotence.** Nothing here writes. Re-running a predicate
  with the same inputs is trivially identical because the functions are pure,
  which case 25 establishes structurally rather than by repetition.
- **Rate limiting and network failure.** No case in this Story touches a network;
  CLAIM-15.6 makes that structural.

## Superseded cases

**Case 6** — *"`PRIVATE` to a `cloud` destination with the per-session opt-in
present returns `allow` carrying a de-identified `redacted` payload"* — superseded
by #243, 2026-08-31.

@dev-pmallapp ruled that no `PRIVATE` data reaches a cloud vendor under any
condition. `checkEgress` now blocks that cell for every consent value, so the
behaviour this case asserts no longer exists.

**The case text above is left exactly as written, and the row is left in its
table.** `docs/evidence/15-*.md` records a PASS taken against this case, and
rewriting it would leave that evidence asserting something the plan no longer
says. This is the same treatment `CLAIM-15.4` receives in
`docs/design/stories/15.md`, and for the same reason: the record of what was
verified is not edited to match a later decision.

The case is not retired and its number is not freed. Retirement means a case was
never executable; this one executed and passed against the code as it then stood.
It is superseded, which is a different thing and is recorded differently.

`CLAIM-15.4`'s remaining coverage — cases 9 and 23, the block path and the
adapter mapping — is unaffected and still passes, because blocking `PRIVATE` to
cloud without consent was always the behaviour.

## Notes

1. **Two claims moved from assertion to type.** The Q2 ruling at the
   design-approval gate narrowed `checkEgress`'s return type so that `warn` and a
   redacted block are both unrepresentable. Cases 30 and 31 verify that by
   compiling a program that must fail, which is a weaker signal than it looks:
   an `@ts-expect-error` directive passes when *any* error occurs on that line,
   not only the intended one. Both cases therefore assert the specific diagnostic
   text as well as the presence of an error. Cases 12 and 24 keep the runtime and
   assignability halves under test so that a future widening of the type is
   caught by more than one thing.

2. **`checkSpend` and `checkRiskMandate` have no functional claim, and that is a
   gap in the milestone's criteria, not in this plan.** S1.2's six seeded
   criteria cover these two predicates only through CLAIM-15.5's latency and
   CLAIM-15.6's purity. A benchmark over a predicate whose behaviour nobody
   asserted measures the speed of an unverified function, so cases 7, 8, 15 and
   16 test behaviour and anchor to CLAIM-15.5 as the nearest owning claim. Case
   16 in particular carries the trading hard rule at
   `docs/design/03-workflow.md:490-495`, which is the most consequential single
   behaviour in this Story. Flag for reconciliation: the milestone should seed a
   functional claim for both predicates.

3. **Priority is assigned by this plan, not by the design's severity column.**
   Case 16 is P0 despite anchoring to a `major` claim, for the reason in note 2 —
   its severity is inherited from a latency claim that does not describe what it
   actually tests. Cases 7, 8 and 15 stay P1 because a spend comparison failing
   is recoverable in a way that an auto run reaching `rung:live` is not.

4. **There are no P2 cases.** Every case in this Story either guards an
   irreversible disclosure or establishes the structural property that makes the
   guarding cheap. Nothing here is cosmetic, and inventing a P2 tier to look
   balanced would misreport the risk.

5. **The matrix is the plan's centre of gravity.** Cases 3, 4, 5, 6, 9, 10 and 11
   between them drive all twelve cells of the table in Decision 3 of the Design.
   If that table changes, this block changes with it, and any cell without a case
   is a hole in `docs/milestones/M1.md:111-113`'s requirement that the fixture
   set drive every branch.

6. **Case 20 exists because the path rule is a string test.** CLAIM-15.6 forbids
   the I/O that would let the classifier resolve a path, so `USER/` matching is
   pure prefix logic on a caller-supplied string. That makes both a false
   negative and a false positive cheap to introduce, and the case covers both
   directions rather than only the leak direction.

4. **Case 6 is superseded, not retired.** See `## Superseded cases`. It is the
   second of the two places in this repository where the retired permissive
   phrasing survives on purpose, the first being `CLAIM-15.4`'s annotation in
   `docs/design/stories/15.md`.

<sub>Written by iAI, hand-executed. `/iai:story-test-plan` lands in M2.</sub>
