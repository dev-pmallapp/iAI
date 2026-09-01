---
issue: 21
repo: dev-pmallapp/iAI
story: "S1.3 — GitHub operations layer"
milestone: "M1 — Kernel and foundation"
---

# Test Plan: #21 — S1.3 GitHub operations layer

## Source

`docs/design/stories/21.md` — 6 claims (`CLAIM-21.1`–`CLAIM-21.6`) and 4
anti-claims (`NEVER-21.7`–`NEVER-21.10`), approved at the design-approval gate
on 2026-09-01 with Decisions 3 and 9 confirmed explicitly.

## Feature Summary

Everything in this Story is a pure function from plain data to plain data, so
the verification surface is unusually mechanical: a golden-argv corpus and a
response-fixture corpus, neither needing a token, a network or a repository.

Three things carry most of the weight, and none of them is the constructors.

**The first is that this layer cannot execute anything.** That is asserted three
ways deliberately — by grep for the banned tokens, by the lint rule once its
scope is widened, and by the stubbed-runtime harness. Decision 9 exists because
today the rule covers `classify` and `guards` only, so a claim of purity here
would currently be enforced by nothing at all. Case 20 is the mutation test that
proves the widened rule actually fires rather than merely being in scope.

**The second is the exit-code taxonomy**, which Decision 3 authors from zero.
The risk is not that a code is classified wrongly; it is that a guess is
recorded as a fact. Case 13 therefore checks provenance markers, not just
coverage, and case 14 checks that the unmapped default is fatal — the property
that makes an incomplete taxonomy safe.

**The third is resume identity.** Case 11 is the one that matters: across two
invocations, each item is emitted exactly once. A plan that re-emits a processed
item is worse than no plan, because it duplicates issues.

The rest is contradiction-resolution verified by construction: the single-command
transition in both its forms, and the two body directives with opposite list
rules.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-21.1 | 1, 2 | P0, P0 |
| CLAIM-21.2 | 3, 4, 5 | P0 |
| CLAIM-21.3 | 6, 7, 8 | P0 |
| CLAIM-21.4 | 9 | P1 |
| CLAIM-21.5 | 10, 11, 12 | P0, P0, P1 |
| CLAIM-21.6 | 13, 14 | P0 |
| NEVER-21.7 | 15, 16 | P0, P1 |
| NEVER-21.8 | 17 | P0 |
| NEVER-21.9 | 18, 19, 20 | P0 |
| NEVER-21.10 | 21 | P0 |

21 cases — 17 P0 / 4 P1 / 0 P2.

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | Each of the six operation families has a constructor returning an argv array | CLAIM-21.1 | iai-core | P0 | tool-checked | `bun test packages/core` | 6/6 families — issues, milestones, sub-issues, labels, comments, PRs — return a `string[]` matching its golden argv exactly |
| 3 | Sub-issue creation emits the GraphQL mutation when the capability input reports the API present | CLAIM-21.2 | iai-core | P0 | tool-checked | `bun test packages/core` | The emitted argv carries `api graphql`, the `addSubIssue` mutation and both node-id variables; no body-link form is emitted |
| 6 | A transition from a predecessor status emits one command carrying both flags | CLAIM-21.3 | iai-core | P0 | tool-checked | `bun test packages/core` | Exactly one argv, containing both `--add-label` and `--remove-label` |
| 13 | Every exit code in the taxonomy has a fixture, a classification and a provenance marker | CLAIM-21.6 | iai-core | P0 | tool-checked | `bun test packages/core` | 100% of taxonomy entries carry `retryable`\|`fatal` **and** `observed`\|`assumed`; the `gh` version is recorded in the evidence artifact |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 2 | No file under `packages/core/src/gh` references `child_process`, `Bun.$` or `fetch` | CLAIM-21.1 | iai-core | P0 | tool-checked | `grep` over the directory, plus `bun run lint` | 0 occurrences of all three tokens; lint reports 0 violations with the directory in scope |
| 4 | On a reported absence the task body carries the `Parent: #N` line | CLAIM-21.2 | iai-core | P0 | tool-checked | `bun test packages/core` | The body contains `Parent: #901` at column zero, exactly once; no GraphQL argv is emitted |
| 8 | A label transition never emits two commands, in either form | CLAIM-21.3 | iai-core | P0 | tool-checked | `bun test packages/core` | Across the full transition corpus, every result has length 1 or 0; length 2 never occurs |
| 14 | An unmapped exit code is fatal and is not retried | CLAIM-21.6 | iai-core | P0 | tool-checked | `bun test packages/core` | A code absent from the taxonomy classifies `fatal`; no retry or resume plan is produced for it |
| 15 | A multi-issue integration PR body never carries a comma-separated `Closes` list | NEVER-21.7 | iai-core | P0 | tool-checked | `bun test packages/core` | Four issues produce four `Closes #N` lines; no line contains two issue references |
| 21 | `gh pr merge` cannot be constructed by any function in the layer | NEVER-21.10 | iai-core | P0 | tool-checked | `bun test packages/core`, plus a grep over the directory | No exported function emits the token `merge` in a PR argv; 0 occurrences of the literal `pr merge` in the directory |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 7 | A first-status transition emits one command carrying `--add-label` alone | CLAIM-21.3 | iai-core | P0 | tool-checked | `bun test packages/core` | Exactly one argv, containing `--add-label` and **no** `--remove-label`; this is Decision 2's carve-out and must not be a fabricated removal |
| 9 | A transition whose target label is already present emits zero commands | CLAIM-21.4 | iai-core | P1 | tool-checked | `bun test packages/core` | 0 argvs returned and the result reports success, not a no-op error |
| 12 | A rate-limit response with the header absent classifies conservatively | CLAIM-21.5 | iai-core | P1 | tool-checked | `bun test packages/core` | A `403` with no `x-ratelimit-remaining` still yields a resume plan rather than a fatal classification, per Decision 1 |
| 16 | A comma-separated `Blocked by:` list is constructed, not rejected | NEVER-21.7 | iai-core | P1 | tool-checked | `bun test packages/core` | `Blocked by: #931, #932` is emitted intact; the comma rejection is proven directive-specific rather than generic |
| 17 | Hostile and malformed input returns a typed failure and never throws | NEVER-21.8 | iai-core | P0 | tool-checked | `bun test packages/core` | 0 throws across the corpus — `null`, `undefined`, `{}`, a throwing getter, a negative issue number, an empty label set, a title containing a newline and a shell metacharacter |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 5 | The fallback also emits a `## Tasks` checklist edit on the parent issue | CLAIM-21.2 | iai-core | P0 | tool-checked | `bun test packages/core` | A second argv edits the parent; the checklist sits under an H2 that is exactly `## Tasks` and preserves the supplied item order |
| 10 | A response classified rate-limited yields a resume plan naming the unprocessed items | CLAIM-21.5 | iai-core | P0 | tool-checked | `bun test packages/core` | Given 10 items failing at item 4, the plan names items 4–10 and omits 1–3 |
| 11 | Re-invoking with a resume plan emits commands for exactly those items and no others | CLAIM-21.5 | iai-core | P0 | tool-checked | `bun test packages/core` | Across both invocations the union is all 10 items and each appears **exactly once**; no item is emitted twice |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 18 | The `no-io-in-pure-modules` rule covers `packages/core/src/gh` | NEVER-21.9 | iai-core | P0 | tool-checked | `bun run lint`, plus a test on the scope predicate | The rule's scope predicate returns true for a path under the directory, and the printed scope string at `scripts/lint.ts` names it |
| 19 | The stubbed-runtime purity harness exercises the new barrel | NEVER-21.9 | iai-core | P0 | tool-checked | `bun test packages/core` | The harness imports the `gh` surface alongside `classify` and `guards`, and the suite passes with `fs`, `net` and `process` stubbed to throw |
| 20 | An I/O call introduced under `packages/core/src/gh` is actually caught | NEVER-21.9 | iai-core | P0 | tool-checked | mutation test — add an `fs` import and a `fetch` call, run `bun run lint` | Both mutations are reported as violations; reverting restores 0. **A rule in scope that does not fire is the failure this case exists to exclude** |

## Not applicable

- **Latency.** No predicate here is on a guard hot path, so `CLAIM-15.5`'s 50 ms
  budget does not bind. The benchmark harness continues to run unchanged and
  would catch a regression in the four predicates it does cover.
- **Network, rate limits and retries as *behaviour*.** This layer never performs
  a request. Rate limiting appears only as a *classification* over a response
  value supplied by the caller (cases 10–12); the sleeping and re-invoking are
  the adapter's, per Out of Scope.
- **Adapter conformance.** Neither adapter is touched. Wiring an adapter to
  execute what this layer builds is M3.
- **Sentinel discovery and comment upsert.** S1.4 owns both, per Decision 10.
  Case 1 covers only that a comment argv is constructible.
- **Issue-graph equivalence.** `docs/milestones/M1.md:147` requires the fallback
  to produce an equivalent graph and no document defines equivalence. Cases 4
  and 5 pin the shapes emitted; whether a reader reconstructs the same tree is
  `status`'s claim in M2 and cannot be observed from here.

## Notes

1. **Case 20 is the reason `NEVER-21.9` carries three cases rather than one.**
   Cases 18 and 19 prove the directory is *in scope*. Neither proves the rule
   *fires*. That distinction is not hypothetical here: `skill-lint` is in CI,
   reports success on every run, and scans zero files, because `skills/` is
   empty. A purity rule that silently matches nothing would be the same failure
   with worse consequences, and case 20 is the only case that excludes it.

2. **Case 13 checks provenance, not just coverage.** Decision 3 permits this
   Story to author the taxonomy, which is a licence to invent. The mitigation is
   that every entry says whether it was `observed` against a real `gh` binary or
   `assumed` from documented HTTP semantics. A case that only counted entries
   would let a fully-invented table pass. The `gh` version goes in the evidence
   artifact for the same reason #198 confirmed a row against the shipped binary
   rather than the build an issue named.

3. **Case 11, not case 10, is the real resume test.** A plan that names the
   right items still corrupts the run if re-invoking re-emits the processed
   ones — that duplicates issues, which is the failure
   `docs/design/04-domain-dev.md:505` describes as "a re-run duplicates". Exactly-once
   across the union is the property; naming the remainder is only half of it.

4. **Case 16 exists because the obvious implementation of `NEVER-21.7` is
   wrong.** `docs/milestones/M1.md:148` says "comma-separated lists are rejected
   at construction". Implemented generically, that rejects
   `Blocked by: #931, #932`, which is correct and required. The rejection is
   per-directive, and this case is what holds that line.

5. **No P2 tier.** Every case either proves the layer cannot execute something,
   proves a contradiction was resolved the way the Design said, or proves an
   enforcement mechanism actually fires. Nothing here is cosmetic.

<sub>Written by iAI, hand-executed. `/iai:story-test-plan` lands in M2.</sub>
