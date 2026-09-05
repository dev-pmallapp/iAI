---
issue: 31
repo: dev-pmallapp/iAI
story: "S1.5 — Domain binding interface and registry"
milestone: "M1 — Kernel and foundation"
---

# Test Plan: #31 — S1.5 Domain binding interface and registry

## Source

`docs/design/stories/31.md` at `05f8deb` — 6 claims (`CLAIM-31.1`–`CLAIM-31.6`)
and 4 anti-claims (`NEVER-31.7`–`NEVER-31.10`), 12 Decisions.

**The design-approval gate was decided APPROVED before this plan was written**,
2026-09-04, carrying all four rulings. That is a departure from S1.4, whose plan
was pre-registered against an open gate. It matters here because three of the
four rulings change what a case must assert: Decision 1 opens the `id` union,
Decision 3 adds two types, and Decision 5 makes `CLAIM-31.5` stricter than its
seeded wording. This plan is written against the approved Design, not against
`docs/milestones/M1.md:203-219`, and every place the two differ is called out in
the case's *Passes when* column.

## Feature Summary

The surface is pure functions over plain data, like S1.3 and S1.4, so the corpus
needs no issue, no token and no network — with one deliberate exception: the
conformance suite must resolve a real workspace package, because
`CLAIM-31.3` is a claim about package boundaries and cannot be tested inside
core.

Five things carry the weight.

**The first is that the types must match a document, and the document is read at
run time.** `CLAIM-31.1` says "every field name and type from
`docs/design/01-skill-hierarchy.md`". Case 1 parses the interface block out of
that file and asserts each field name is declared — rather than restating the
list, which is how a plan drifts from its own source of truth. S1.4's case 15
established the pattern by reading the real artifact filenames off disk.

**The second is that two rejection rules can never fire against well-typed
input.** `evidenceRequired: true` and `rungs[0].reversible` are literal types;
`false` is a compile error. Decision 4 keeps the runtime check for the three
unsound paths that reach it. Cases 8 and 9 must therefore build their fixtures
**through an explicit cast**, and case 9 additionally asserts the cast is present
— a case that cannot construct its input is a case that silently passes.

**The third is that the registry must reject before it registers.** Decision 11
makes validation happen at registration so resolution is total. Cases 19 and 20
are the pair that stops a registry that validates and then registers anyway, or
that returns a failure with a payload attached.

**The fourth is that the purity rule must actually fire, for the third Story
running.** Cases 15–17 repeat the three-case pattern deliberately. It is not
redundant: #261's verification found an obfuscated `globalThis["pro" + "cess"]`
lookup that leaves `bun run lint` at exit 0 with zero violations while the
trapped-runtime harness fails
(`docs/evidence/261-20260904T040110Z.md`). Cases 21 and 22 apply the same
three-part shape to `NEVER-31.10`'s brand-new rule.

**The fifth is that a hang is not a throw.** Case 18 carries a per-call time cap
that no earlier hostile corpus in this repository has had. #261's mutation 7
removed one guard and produced a run that never terminated;
`expect(fn).not.toThrow()` cannot catch that.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-31.1 | 1, 2 | P0 |
| CLAIM-31.2 | 3, 4, 5 | P0, P0, P1 |
| CLAIM-31.3 | 6, 7 | P0 |
| CLAIM-31.4 | 8, 9 | P0 |
| CLAIM-31.5 | 10, 11, 12, 13 | P0 |
| CLAIM-31.6 | 14 | P0 |
| NEVER-31.7 | 15, 16, 17 | P0 |
| NEVER-31.8 | 18 | P0 |
| NEVER-31.9 | 19, 20 | P0 |
| NEVER-31.10 | 21, 22 | P0 |

22 cases — 21 P0 / 1 P1 / 0 P2.

## Standing checks

Not anchored to a claim, and not optional. Run at story-verify.

| Check | Command | Passes when |
|-------|---------|-------------|
| Evidence immutability | `git diff --name-only --diff-filter=MD main...HEAD -- docs/evidence` | 0 files. **`--diff-filter=MD` is mandatory** — Decision 12 of `docs/design/stories/26.md`. The unfiltered form returns this Story's own added artifacts and reads as a false failure |
| Required contexts | `bash scripts/verify-required-checks.sh` | PASS, six contexts |
| Workflow hygiene | `bash scripts/verify-workflow-hygiene.sh` | PASS, six jobs |
| Workspace invariants | `bun test test/workspace.test.ts` | PASS. `test/workspace.test.ts:40-56` requires every `packages/*/package.json` name to appear in `ARCHITECTURE.md`'s Build Targets table, so `iai-domain-null` needs a row or the suite goes red |
| Full chain | `bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint && bun run claim-lint` | all 0 |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 1 | Every field name declared in the Design's interface block exists in the shipped types | CLAIM-31.1 | iai-core | P0 | tool-checked | `bun test packages/core` | The seven interface blocks are **parsed from `docs/design/01-skill-hierarchy.md:185-233` at run time**; every field name found is declared in `packages/core/src/binding`. Requires the parse to yield `>= 25` field names before asserting, so a failed parse cannot pass vacuously |
| 3 | A registered `domain:*` label resolves to that binding | CLAIM-31.2 | iai-core | P0 | tool-checked | `bun test packages/core` | `domain:null` returns the registered binding, identical by deep equality to the value supplied to `createRegistry`; `matchCount` semantics do not apply — exactly one binding per id |
| 6 | The conformance suite registers a binding imported from a package outside core | CLAIM-31.3 | iai-core | P0 | tool-checked | `bun test packages/core` | The suite imports `nullBinding` **by package name** from `iai-domain-null`, not by relative path; `createRegistry` accepts it and `resolveBinding` returns it. A relative import fails the case even if resolution succeeds, because it would prove nothing about package boundaries |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 4 | Four resolution failures each return a hard-failure `Decision` and no binding | CLAIM-31.2 | iai-core | P0 | tool-checked | `bun test packages/core` | Unregistered `domain:trade`, an absent label, a malformed `domain:`, and a prefix-less `trade` all yield `action: "block"` with no binding attached. The unregistered case **names the missing pack**. 0 defaults, 0 `undefined` returns |
| 5 | The four resolution failure messages are pairwise distinct | CLAIM-31.2 | iai-core | P1 | tool-checked | `bun test packages/core` | 4 unique message strings; each names the rule it violated. A single generic "cannot resolve domain" for all four fails. Same defect class as case 3 of `docs/test-plans/26-plan.md` |
| 8 | A binding whose `verify.rungs[0].reversible` is `false` is rejected | CLAIM-31.4 | iai-core | P0 | tool-checked | `bun test packages/core` | Rejected, with `rungs[0].reversible` named in the reason. The fixture is constructed through an explicit unsound cast, because the declared type makes `false` a compile error (Decision 4) |
| 9 | A binding whose `verify.evidenceRequired` is not `true` is rejected | CLAIM-31.4 | iai-core | P0 | tool-checked | `bun test packages/core` | Rejected, naming `evidenceRequired`, for `false`, `undefined`, `"true"` and `1`. **The test source must contain the cast** — asserted by reading the test file — because a fixture that cannot be constructed is a case that passes while testing nothing |
| 10 | A sentinel outside the `## iai-` namespace is rejected | CLAIM-31.5 | iai-core | P0 | tool-checked | `bun test packages/core` | `"## evidence"`, `"iai-evidence"`, `"## iai-"` and `""` all rejected, naming `evidence.sentinel`. Uses the imported `SENTINEL_NAMESPACE_PREFIX`, never a restated literal |
| 11 | A sentinel inside the namespace but outside the nine known names is rejected | CLAIM-31.5 | iai-core | P0 | tool-checked | `bun test packages/core` | `"## iai-audit"` is rejected. **This is Decision 5's strengthening and is stricter than `CLAIM-31.5`'s seeded wording**, which says only "falls outside the `## iai-` namespace". `packages/core/src/evidence/sentinel.ts:88-98` deferred the choice here explicitly |
| 12 | A `pathTemplate` declared for a non-artifact-bearing sentinel is rejected | CLAIM-31.5 | iai-core | P0 | tool-checked | `bun test packages/core` | A binding with `sentinel: "## iai-risk"` and any `pathTemplate` is rejected. Inherited from Decision 10 of `docs/design/stories/26.md:388-396`; uses the imported `ARTIFACT_BEARING_SENTINELS` |
| 18 | Hostile and malformed input returns a typed failure, never a throw and never a hang | NEVER-31.8 | iai-core | P0 | tool-checked | `bun test packages/core` | 0 throws and 0 timeouts across the corpus applied **reflectively to every exported function, in first and second argument position**, each call under an explicit per-call time cap. Corpus: `null`, `undefined`, `{}`, a throwing getter, a throwing `toString`, a `Symbol`, a cyclic object, `[]`, an array of non-objects, a 200,000-character string, `NaN`, a negative number, and a binding with every field of the wrong type. Requires `>= 6` exported functions before asserting |
| 19 | A rejected binding is never resolvable | NEVER-31.9 | iai-core | P0 | tool-checked | `bun test packages/core` | For every rejection fixture in cases 8–13, `createRegistry` fails and produces no registry; there is no code path that registers an invalid binding and rejects it afterwards |
| 20 | No failure result carries a binding, and no success carries a reason | NEVER-31.9 | iai-core | P0 | tool-checked | `bun test packages/core` | Across the full corpus, every `ok: false` has no `value` key and every `ok: true` has no `reason` key; every blocking `Decision` from `resolveBinding` has no binding attached |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 2 | The two `CLAIM-31.1` amendments compile, and only they | CLAIM-31.1 | iai-core | P0 | tool-checked | `bun run typecheck`, `bun test packages/core` | `nullBinding`'s id and a hypothetical sixth id both compile against `DomainId`; `KnownDomainId` still has exactly the five members of `docs/design/01-skill-hierarchy.md:187`, in that order; `LabelDef` is declared with `name` and `color` required. Type-level fixtures under `packages/core/type-tests/`, matching the existing convention |
| 13 | The `budgetChars` bound is the imported constant, and 60,000 is legal | CLAIM-31.5 | iai-core | P0 | tool-checked | `bun test packages/core` | `60000` accepted, `60001` rejected, and `0`, `-1`, `1.5` and `"60000"` all rejected. **No file under `packages/core/src/binding` contains the literal `60000` or the literal `## iai-`** — Decision 11 of `docs/design/stories/26.md` exists to prevent a second copy, and a restated constant is how the two drift |

### Integration

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 7 | Registering a domain requires no reference to it from core | CLAIM-31.3 | iai-core | P0 | tool-checked | `bun test packages/core` | A search of every `.ts` file under `packages/core/src` for `domain-null`, `nullBinding` and `iai-domain-` returns 0 matches, over a denominator of `> 30` files scanned. Case 6 proves the fixture resolves; this proves core does not know it exists |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Command | Passes when |
|---|------|------------|--------|----------|----------|---------|-------------|
| 14 | The domain literals appear in core only in the id union and test fixtures | CLAIM-31.6 | iai-core | P0 | tool-checked | `bun test packages/core` | A search of `packages/core/src` for `dev`, `trade`, `health`, `wealth` and `know` as whole words matches only the `KnownDomainId` declaration. `>= 30` files scanned. **The search must be word-anchored**: an unanchored `dev` matches `device`, `developer` and `dev/null` in prose, which is the substring trap `docs/evidence/21-20260902T100227Z.md` recorded as live in this repository |
| 15 | The `no-io-in-pure-modules` rule covers `packages/core/src/binding` | NEVER-31.7 | iai-core | P0 | tool-checked | `bun run lint`, plus a test on the scope predicate | The predicate returns true for a path under the directory, the printed scope string names it, `bindings/` and `binding-store/` are **not** pulled into scope, the violation message names `NEVER-31.7` rather than `CLAIM-15.6`, and the run reports `files.length >= 4` so the scan is not vacuous |
| 16 | The stubbed-runtime purity harness exercises the binding barrel | NEVER-31.7 | iai-core | P0 | tool-checked | `IAI_PURITY_CHILD=1 bun test packages/core/test/purity.test.ts` | The harness imports the `binding` barrel alongside `classify`, `guards`, `gh` and `evidence`, and every exported entry point executes with `fs`, `net` and `process` stubbed to throw |
| 17 | An I/O call introduced under `packages/core/src/binding` is actually caught | NEVER-31.7 | iai-core | P0 | tool-checked | mutation test | An `fs` import, a bare `fs` import, a `fetch` call, a `Bun.$` call, a `child_process` import and a `process.cwd` read are each reported and each name `NEVER-31.7`; reverting restores 0. **A rule in scope that does not fire is the failure this case exists to exclude** |
| 21 | A file under `packages/core/src` importing a domain pack is a violation | NEVER-31.10 | iai-core | P0 | tool-checked | `bun run lint` | `import ... from "iai-domain-dev"`, a dynamic `import()`, a `require`, and a relative `../../domain-dev/src/index` are each reported by the new `no-domain-pack-import` rule naming `NEVER-31.10`. A non-core package importing a pack is **not** flagged — the rule is core-only, matching every other scoped rule in `scripts/lint.ts` |
| 22 | The new rule fires against the real tree, and reports 0 there | NEVER-31.10 | iai-core | P0 | tool-checked | mutation test, `bun run lint` | The mutation is reported and reverting restores 0 across all 75+ files. The rule appears in `RULE_SCOPES` with its scope printed, so it cannot be a rule that runs and reports nothing |

## Not applicable

- **Latency as a separate `CLAIM-15.5` case.** Nothing here sits on a guard hot
  path — `resolveBinding` is called by a Tier-1 skill, not by a
  `PreToolUse` hook — so the 50 ms budget does not bind. **Non-termination is
  covered instead, by case 18's per-call cap**, which is the failure mode that
  actually materialised in this repository (`docs/evidence/261-20260904T040110Z.md`).
- **Network, GitHub and the filesystem.** This layer performs no request and
  reads no file. The bindings arrive as values. Cases 1, 7, 13 and 14 read files
  — they are *tests* reading the tree, not the layer doing I/O, which is the
  same posture `packages/core/test/evidence-purity.test.ts:194-217` already
  takes.
- **Evaluating anything a binding declares.** Sizing against `minSize` is M2's,
  entry-criteria predicates M5's, `autoDeny` evaluation M6's, the gate lifecycle
  M3's. Decision 6 records the five specific claims that need a type this Story
  deliberately does not invent.
- **Any real domain pack.** `devBinding` is `CLAIM-83.1` (M4), which re-runs
  this Story's conformance suite. The five existing `packages/domain-*` stubs
  are not touched.
- **Whether the binding is markdown or TypeScript.** Nine citations say
  `skills/<id>/domain.md`, four say `packages/domain-<id>/src/binding.ts`, and
  `docs/milestones/M4.md:56` says both in one row. The Design declares a
  TypeScript interface and records the conflict; a markdown parser would sit in
  front of the same types.
- **The `repo` field, `vetoAgent`'s roster conflict, and the rung colour ramp.**
  All three are recorded in the Design's *Not resolved here* and belong to M3,
  M5 and each pack's own Story.

## Notes

1. **Case 1 reads its expectations from the Design tree, not from this plan.**
   `CLAIM-31.1` is a claim *about a document*, so restating the field list here
   would create a third copy to drift. The case parses
   `docs/design/01-skill-hierarchy.md:185-233` and asserts a denominator before
   asserting anything else. This is S1.4's case 15 pattern — which pinned the
   `{ts}` format against 22 real filenames rather than against prose that
   disagreed with itself in four places.

2. **Case 9 asserts that its own fixture is unsound, and that is the point.**
   Decision 4 keeps a runtime check for a condition the type system forbids.
   The only way to test it is a cast, and the only way to know the cast was not
   quietly deleted — turning the case green while testing nothing — is to assert
   the test source contains it. This is the same class of defect as the dead
   assertion #30's verification found (`list === mixed.slice(0, 0)`, a condition
   that can never hold).

3. **Cases 15–17 are the third instance of the same three-case pattern, and it
   is still not redundant.** Case 15 proves the directory is *in scope*, case 16
   proves the code *runs trapped*, case 17 proves the rule *fires*. #261's story
   verification demonstrated a mutation that only case 16's analogue caught: an
   obfuscated `globalThis["pro" + "cess"]` lookup leaves the lint rule at exit 0
   with zero violations. A static rule certifies the source it can read.

4. **Cases 21 and 22 give a brand-new rule the same treatment.**
   `no-domain-pack-import` has never existed, so there is no prior evidence it
   works. `skill-lint` is required in CI, reports success on every run, and
   scans zero files — a new rule that matched nothing would look identical.

5. **Case 14's search must be word-anchored.**
   `docs/evidence/21-20260902T100227Z.md` recorded that `grep -rn "merge"` over
   `packages/core/src/gh` returns 10+ legitimate hits while the anchored form
   returns 0. `dev` is the worst offender of the five: it is a substring of
   `device`, `developer` and `/dev/null`. An unanchored search here would fail
   for reasons that have nothing to do with the claim.

6. **Case 13 greps for a restated constant.** Decision 11 of
   `docs/design/stories/26.md` had S1.4 export `BUDGET_CHARS` and
   `SENTINEL_NAMESPACE_PREFIX` specifically so S1.5 would not restate them, and
   the exports carry `EXPORTED FOR S1.5` comments saying so. The only way that
   decision can be silently undone is a literal typed into the new directory, so
   the case looks for one.

7. **Case 5 is the one that stops a degenerate registry.** Case 4 is satisfied
   by an implementation returning `"cannot resolve domain"` four times.
   `CLAIM-31.2` requires the failure to name the missing pack, and distinctness
   is what makes the message useful to whoever tripped it.

8. **The evidence-immutability standing check uses `--diff-filter=MD`.**
   Copied from `docs/test-plans/26-plan.md:76` by precedent, not from
   `docs/test-plans/243-plan.md:86`, which has the defective form. Three Stories
   have now read a false failure from the unfiltered command.

9. **No P2 tier.** Every case proves a type matches its specification, a
   rejection rule fires, a boundary is where the Design says, or an enforcement
   mechanism actually works.

<sub>Written by iAI, hand-executed. `/iai:story-test-plan` lands in M2.</sub>
