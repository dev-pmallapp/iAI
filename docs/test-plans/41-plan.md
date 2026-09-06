---
issue: 41
repo: dev-pmallapp/iAI
story: "S2.2 — Planning skills"
milestone: "M2 — Universal lifecycle"
---

# Test Plan: #41 — S2.2 Planning skills

## Source

`docs/design/stories/41.md` at `aadc6ab` — 8 claims (`CLAIM-41.1`–`.6`, `.8`,
`.10`) and 2 anti-claims (`NEVER-41.7`, `NEVER-41.9`), 9 Problems, 6 Decisions.

**The design gate was ruled APPROVED before this plan was written**, 2026-09-06,
carrying five rulings: G1a the ten-section spine, G1b the frontmatter
convention, G2 the routing-form domain rule with `know` dropped, G3 the severed
`G0` back-link (#292), G4 the execution harness as its own Story (#293, size L).
This plan is written against the ruled Design, not against
`docs/milestones/M2.md:78-96`. **Five of the six seeded criteria are restated**,
and every one is marked `derived:` with the Decision that restates it.

## Feature Summary

Four markdown files and three lint rules — but the testable content is almost
entirely a property of **populations that exist for the first time**.

**This is the first plan in the repository that can honestly write `real` in the
Corpus column, and it does so in 17 of 26 cases.** Every prior plan was written
against a corpus that was empty, synthetic, or not yet created. S2.2 has nine
shipped Designs, twelve shipped references, eight milestone documents, eight test
plans and four new skills to check against. That is the whole reason the claims
could be restated on measurement rather than on argument.

Five things carry the weight.

**The first is that three seeded rules would have rejected the real corpus.**
`CLAIM-41.3` as seeded rejects 9 of 9 Designs and cannot be implemented at all —
the seventeen section names do not exist in this repository. `CLAIM-41.6` as
seeded bans an ordinary English word appearing 16 times in `references/`, and its
carve-out exempts 0 of 28 occurrences. This is the third consecutive instance of
one defect, after #287 and #289: **a rule written before anyone looked at the
corpus it governs.** Cases 2, 13 and 14 are the corpus-facing proof that the
restated rules do not repeat it.

**The second is that two claims of this Story were jointly unsatisfiable as
seeded.** `references/domain-binding.md:13` — *"The kernel does not know what
`trade` or `health` means"* — contains four of the five banned tokens and is the
doctrine `CLAIM-41.5` requires the four skills to implement. Case 14 pins the
resolution: the documents that **define** domain-agnosticism must pass the rule
that enforces it.

**The third is that `skills/` is a near-zero-coverage zone.** `claim-lint`'s
scope is `docs/`, `scripts/`, `.github/` and root markdown
(`scripts/claim-lint.ts:36`), so a malformed claim identifier, a dangling
`anchors_to` or a dangling path citation inside a new `SKILL.md` is completely
unchecked. Case 24 forces a decision rather than letting the gap persist by
default — which is exactly how `CONTRIBUTING.md:128-129` came to be false.

**The fourth is that `skill-lint` stops being vacuous in this Story.** It has
reported success over zero files on every run since S1.3. `NEVER-41.9` and case
18 are what make that irreversible: the count is asserted non-zero **and** equal
to the number of verb directories, so neither a dropped file nor a changed
discovery path can put it back to zero silently.

**The fifth is that idempotency cannot be executed and the plan says so.**
Nothing in this repository can run a skill. `CLAIM-41.8` is `model-judged` by
Decision 6 and case 25 is a review, not a command. Calling it `tool-checked`
would be the vacuous pass dressed as rigour that
`references/verification.md:45-46` names.

## Coverage

| Claim | Cases | Priority |
|-------|-------|----------|
| CLAIM-41.1 | 7, 12 | P0 |
| CLAIM-41.2 | 3, 15 | P0 |
| CLAIM-41.3 | 2, 8, 9, 16, 17, 20 | P0 |
| CLAIM-41.4 | 4, 5, 11, 21 | P0 |
| CLAIM-41.5 | 6, 12 | P0 |
| CLAIM-41.6 | 10, 13, 14, 22 | P0 |
| NEVER-41.7 | 19 | P0 |
| CLAIM-41.8 | 25 | P0 |
| NEVER-41.9 | 1, 18 | P0 |
| CLAIM-41.10 | 23, 24 | P0 |
| cross-cutting | 26 (P1) | P1 |

26 cases — 25 P0 / 1 P1 / 0 P2.

**Corpus distribution: 17 `real` / 9 `synthetic` / 0 `none`.** Stated because
the repository-wide figure before this Story was 71 real against 122 synthetic —
63 per cent fixture-only. This plan inverts that ratio, and it is the first that
could.

## Standing checks

Not anchored to a claim, and not optional. Run at story-verify.

| Check | Command | Passes when |
|-------|---------|-------------|
| Evidence immutability | `git diff --name-only --diff-filter=MD main...HEAD -- docs/evidence` | 0 files. **`--diff-filter=MD` is mandatory** — Decision 12 of `docs/design/stories/26.md`. The unfiltered form returns this Story's own added artifacts and reads as a false failure |
| Required contexts | `bash scripts/verify-required-checks.sh` | PASS, six contexts |
| Workflow hygiene | `bash scripts/verify-workflow-hygiene.sh` | PASS, six jobs |
| Allow-list retirement | `bun run claim-lint` | `allowlist-stale` 0. **Four `planned`/`M2` entries are added for the verb directories and retired as each file lands**, with the family header and total updated. `git ls-files --cached --others --exclude-standard` means untracked-but-not-ignored is enough to fail the build |
| Full chain | `bun run build && bun test && bun run lint && bun run typecheck && bun run skill-lint && bun run claim-lint` | all 0 |
| CI on the integration PR | `gh pr checks 291` | 7/7. A pushed story branch with no PR gets **zero** check runs — `ci.yml` triggers only on `pull_request`, `push` to `main` and `merge_group` |

## Test Cases

### Positive

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 1 | The four verb directories exist and each carries a `SKILL.md` whose `name` equals its directory | NEVER-41.9 | iai-skills | P0 | tool-checked | real — the four directories under `skills/` | `bun run skill-lint` | Exactly **4** directories, each with one `SKILL.md`, each passing `name-format` and `name-directory-mismatch`. The set of directory names equals the four verb names **by set equality in both directions**, so a fifth directory or a misspelling fails |
| 2 | The ten-section ordered spine holds across every shipped Design | CLAIM-41.3 | iai-core | P0 | tool-checked | real — all 9 files in `docs/design/stories/` | `bun run claim-lint` | **every Design on disk** passes, with the count **read at run time** and asserted before the result — 10 at the time of writing and growing with each Story, so the case cannot go stale the way a literal denominator does (finding 3). The spine is `Problem · Vision · Out of Scope · Constraints · Dependencies · Goal · Claims · Build Targets · Test Strategy · Decisions`, checked for presence **and relative order**. `derived:` Decision 3 — the seeded "all seventeen" rejects 9 of 9 and its section names do not exist in this repository |
| 3 | The feature-table parser reads every milestone document on disk | CLAIM-41.2 | iai-core | P0 | tool-checked | real — all 8 `docs/milestones/M*.md` | `bun test` | **8 of 8** parse and the row count per file is asserted non-zero. `derived:` Decision 2 — the file on disk is authoritative over the GitHub milestone description, which is a copy truncated at 10,000 chars by `scripts/bootstrap-github.sh:44` |
| 4 | Every claim in every Design is anchored, and no case anchors to a claim that does not exist | CLAIM-41.4 | iai-core | P0 | tool-checked | real — 9 Designs against 9 plans | `bun run claim-lint` | Both directions, over a stated denominator. `anchor-dangling` already reports 0; this case adds the **forward** direction — a claim defined and never anchored — which nothing checks today |
| 5 | Every case in every test plan declares a `Corpus` | CLAIM-41.4 | iai-core | P0 | tool-checked | real — 194 cases across 8 plans, plus this plan's 26 | `bun run claim-lint` | `testplan-corpus` reports 0 violations over **9 plans and 220 cases** once this plan lands. The denominator is printed as three numbers and each is asserted non-zero |
| 6 | Each of the four skills reads the `domain:` label and carries the hard-failure block | CLAIM-41.5 | iai-skills | P0 | tool-checked | real — the four skill bodies | `bun test` | **4 of 4**, with the count asserted first. Each body names the label read **before** any step that would need the binding, so the ordering is checked and not just the presence |
| 7 | `goal-create` reads before it writes | CLAIM-41.1 | iai-skills | P0 | tool-checked | real — the `goal-create` body and `packages/core/src/gh/milestones.ts` | `bun test` | The body names the list operation **before** the create operation, and all three milestone argv builders resolve in the shipped module. `derived:` Decision 1 — the `G0` back-link half is severed to #292, so only the milestone half is asserted here |

### Negative

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 8 | A Design missing one spine section is rejected, naming which | CLAIM-41.3 | iai-core | P0 | tool-checked | synthetic — a real Design with one section deleted | `bun run claim-lint` | Built by taking a shipped Design off disk and removing exactly one `##` heading, per the #289 posture: the fixture is real content with one perturbation, not invented Design text. The message names the **missing section**, not merely that the document failed |
| 9 | A Design with two spine sections transposed is rejected | CLAIM-41.3 | iai-core | P0 | tool-checked | synthetic — a real Design with two sections swapped | `bun run claim-lint` | **Order is the rule, membership alone is not.** `references/design-format.md:52` defines conformance as preserving relative order; a check that only asserted presence would pass a Design whose Decisions preceded its Problem. The message distinguishes "out of order" from "missing" |
| 10 | A skill body containing a routing form is rejected | CLAIM-41.6 | iai-core | P0 | tool-checked | synthetic — a body carrying `domain:` plus a real id | `bun run skill-lint` | A fixture containing the label form is reported, and one containing a `skills/<id>/` path form is reported. The message names the offending form and the rule id. `derived:` Decision 4, ruled at the gate (G2) |
| 11 | `story-test-plan` refuses to emit a case table without the `Corpus` column | CLAIM-41.4 | iai-skills | P0 | tool-checked | synthetic — a case table with the column removed | `bun test` | This is #289's option 3, the preventive half. The lint is detective and reaches plans that already exist; the skill must refuse at authoring time. Both are required — a skill cannot annotate the plans written before it existed |
| 12 | A Story with no `domain:*` label produces the hard-failure block, not an assumed domain | CLAIM-41.5, CLAIM-41.1 | iai-skills | P0 | tool-checked | synthetic — an issue fixture with the label removed | `bun test` | Each of the four emits the hard-failure block. **Asserting the absence of a default is the case**: a skill that silently picked `dev` would pass any test that only checked it did not crash |

### Boundary

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 13 | `know`, `known`, `knowledge` and `unknown` produce zero violations across the real corpus | CLAIM-41.6 | iai-core | P0 | tool-checked | real — the 12 shipped `references/*.md` | `bun run skill-lint` | **0 violations across 16 occurrences of the `know` family**, 13 of which are ordinary English. This case is the gate ruling G2 made executable: the seeded bare-token ban produced 13 false positives here, and a whole-word rule still broke on 3 legitimate uses of the verb. Two of the seven `known` hits are section headings (`## Known divergences`, `## Known drift`), a house convention the seeded rule would have forced a repo-wide rename of |
| 14 | The **sentences** that define domain-agnosticism pass the rule that enforces it | CLAIM-41.6 | iai-core | P0 | tool-checked | real — the doctrine sentences read out of `docs/design/01-skill-hierarchy.md` and `CONTRIBUTING.md` | `bun test` | `01-skill-hierarchy.md:33` states the rule using the token `trade`; `CONTRIBUTING.md:304` uses `know` twice to say a Tier-1 verb may never know a domain. **Both must pass.** Under the seeded wording the two documents that define the rule violate it. Same shape as `NEVER-35.7`'s bind — *a document whose subject is a constant may not contain it* — and the same resolution: ban the form that does harm, not the word that describes it. **Amended after implementation (amendment 3):** the unit is the *sentence*, not the *file*. A design document is not a skill body and is out of this rule's population — `01-skill-hierarchy.md:436` legitimately spells out *"Read `domain:trade` → load `skills/trade/domain.md`"*, because **documenting** routing is its job. A separate assertion pins those out-of-population citations at **>= 4** so nobody "cleans up" a design document to satisfy a rule that was never meant to reach it |
| 15 | M1's five feature rows against six Story headings is **reported**, not reconciled | CLAIM-41.2 | iai-skills | P0 | tool-checked | real — `docs/milestones/M1.md` and the live issue list | `bun test` | `S1.6` has no feature row, so "exactly one Story per feature-table row" is already false on disk. `story-create` reports the orphan and creates nothing. **A skill that quietly papers over a real inconsistency between the milestone and the issue tracker is worse than one that stops.** `derived:` Decision 2 |
| 16 | A Design carrying an extra section beyond the spine passes | CLAIM-41.3 | iai-core | P0 | tool-checked | real — `docs/design/stories/194.md` and `docs/design/stories/15.md` | `bun run claim-lint` | `194.md` inserts `## Mapping` at position 3; `15.md` appends an `## Addendum`. Both are the only additions in the entire nine-file corpus and **both must pass**. Additional sections are permitted; the spine must be present and ordered. A membership-equality rule would reject both |
| 17 | Both frontmatter conventions in the corpus are accounted for | CLAIM-41.3 | iai-core | P0 | tool-checked | real — all 9 Designs | `bun test` | 8 of 9 carry an H1 title plus a bolded metadata block; `9.md` carries YAML with **seven** keys, not the four `references/design-format.md:31` specifies, and its values are stale. The rule describes the 8-of-9 convention and the 1 outlier is recorded rather than failed. `derived:` Decision 3, gate ruling G1b — put separately from G1a because the halves fail for different reasons: the section half is unimplementable, this half is contradicted by the corpus |

### Enforcement

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 18 | `skill-lint` reports a non-zero `SKILL.md` count equal to the directory count | NEVER-41.9 | iai-core | P0 | tool-checked | real — the `skills/` tree as shipped | `bun run skill-lint` | The scanned count is **4**, asserted **both** as non-zero and as equal to the number of verb directories on disk. Either assertion alone is insufficient: non-zero alone permits a silent drop from four to one, and equality alone is satisfied by zero equalling zero. `skill-lint: 0 SKILL.md files scanned` has been true on every run since S1.3; this case is what makes it irreversible |
| 19 | Deleting the routing-form check lets **only** the fixture through | NEVER-41.7 | iai-core | P0 | tool-checked | synthetic — the mutation, over the real four-skill corpus | mutation test | The mutation removes the check; the case-10 fixture stops being reported and **the four real bodies still pass**. Reverting restores the report. Run against the **committed** tree, printing `git status --porcelain` at the end. This is the `docs/evidence/33-*.md` shape: a fixture rejected by a later rule proves nothing about the rule under test |
| 20 | Deleting the spine-order check lets a transposed Design through | CLAIM-41.3 | iai-core | P0 | tool-checked | synthetic — the mutation, over all 9 real Designs | mutation test | Case 9's transposed fixture passes with the check deleted and fails with it restored, **and all 9 real Designs pass in both states** — proving the ordering check is doing work that the presence check is not |
| 21 | Deleting the Corpus refusal lets `story-test-plan` emit an undeclared case | CLAIM-41.4 | iai-skills | P0 | tool-checked | synthetic — the mutation | mutation test | With the refusal removed the skill emits a case table with no `Corpus` column, and `claim-lint` catches it downstream. **Both halves must be shown**: the skill's refusal firing, and the lint catching what a bypassed skill would produce |
| 22 | The domain rule reads `KNOWN_DOMAIN_IDS` and does not restate the five ids | CLAIM-41.6 | iai-core | P0 | tool-checked | real — the shipped rule source and `packages/core/src/binding/domain.ts` | `bun test` | No file implementing the rule contains the five literals as its own list. `packages/core/src/binding/domain.ts:68-72` declares itself the only place the domain literals may appear, and `DomainId` is **deliberately open** — a rule hardcoding five tokens would need editing to admit a sixth domain, which is the precise failure `ARCHITECTURE.md:209` names. Same posture as Decision 11 of `docs/design/stories/26.md` |
| 23 | `CONTRIBUTING.md` and the linter agree about what the linter checks | CLAIM-41.10 | iai-core | P0 | tool-checked | real — `CONTRIBUTING.md` and `scripts/skill-lint.ts` parsed together | `bun test` | Every capability the document claims for `skill-lint` resolves to a rule id that exists. **`CONTRIBUTING.md:128-129` is false at HEAD** — it names a Phase 0 section rule and an Error Handling section rule; neither exists. Decision 5 ships the rules rather than softening the sentence. The rule-id set is read from the linter, never restated in the test |
| 24 | `skills/` is either in `claim-lint`'s scope or its exclusion has a recorded reason | CLAIM-41.10 | iai-core | P0 | tool-checked | real — `scripts/claim-lint.ts` and the `skills/` tree | `bun run claim-lint` | Either `skills/` is in `SCOPE_DIRS` and the four new files are scanned for claim identifiers and dangling paths, or the exclusion carries a reason in the source. **The gap is why case 23's defect survived**: nothing cross-checked the document against the linter it describes, because the directory that would have caught it is out of scope. "Nobody thought about it" must not be the reason twice |

### Model-judged

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 25 | Each skill's re-entry condition is stated, and every mutating step is preceded by the read that makes it idempotent | CLAIM-41.8 | iai-skills | P0 | model-judged | real — the four skill bodies | review | The evidence artifact carries **one row per skill**, naming its re-entry condition and each mutating step with the read that precedes it. Row count asserted as 4. `derived:` Decision 6, gate ruling G4 — **nothing in this repository can execute a skill**, so the seeded re-run verification is impossible; the harness is #293, sized L. Calling this `tool-checked` would be the vacuous pass dressed as rigour that `references/verification.md:45-46` names |

### Distinctness

| # | Case | anchors_to | Target | Priority | Verifier | Corpus | Command | Passes when |
|---|------|------------|--------|----------|----------|--------|---------|-------------|
| 26 | The three new rules' messages are pairwise distinct and each names its own rule id | cross-cutting | iai-core | P1 | tool-checked | synthetic — one minimal failing fixture per rule | `bun run skill-lint` | The spine rule, the routing-form rule and the section rules produce distinct message shapes. Distinctness is asserted **by phrase and by the absence of the other phrases**, not by inequality of strings: `docs/evidence/33-*.md` records a distinctness assertion that passed while the mutation survived, because two messages quoted different values through one template. P1 because a collapsed message degrades diagnosis rather than admitting a defect |

## Not applicable

- **Executing any skill.** No host runner, no LLM call, no fixture repository,
  no recording proxy exists. `CLAIM-41.8` is restated to a structural property by
  Decision 6 and case 25 is a review. **The execution harness is #293, sized L at
  the gate**, and S2.3 through S2.5 inherit the same restatement until it lands.
- **The `G0` back-link.** Severed by Decision 1 and gate ruling G3. It needs a
  file that lives in a separate private repository, a line grammar that does not
  exist, a line-anchored comment primitive that does not exist, and a tenth
  sentinel in a closed nine-name set. **Raised as #292**, which must also answer
  whether a public `GOALS` template ships — without one, any Goals rule would
  ship green over a corpus of zero, which is the failure #289 was filed about.
- **The installer.** `CONTRIBUTING.md:147` names a file that does not exist and
  `:286-287` tells the author of a new skill to run it. S2.2 is the first Story
  that authors one, so its author is the first person who will hit this. Owner:
  M8/S8.1. Recorded rather than fixed.
- **Retiring `scripts/bootstrap-stories.py`.** It created 36 Stories and 142
  tasks keyed on `### S{m}.{n}` headings rather than feature rows, and spans two
  verbs' jobs. Coexistence is stated in Decision 2; retirement needs those issues
  reconciled and is not this Story's unit of work.
- **The `path-refs.test.ts:204` fixture landmine.** The canonical `planned`
  fixture now sits on `skills/dev/domain.md`, moved there by S2.1 *because*
  `references/` was being emptied. S2.2 does not create that path, so no case
  fires. **M4 will delete it out from under the test, exactly as S2.1 did to the
  previous one.** No case here; moving it again only relocates the trap.

## Deviations from the milestone

Five of the six seeded criteria are asserted differently here. All five were
ruled at the gate on 2026-09-06.

| Claim | Milestone wording | What this plan asserts | Cases | Ruling |
|---|---|---|---|---|
| `CLAIM-41.1` | milestone **and** a back-link comment on the `G0` line | the milestone half only; the back-link is #292 | 7, 12 | G3 |
| `CLAIM-41.2` | one Story per feature-table row | the file on disk is authoritative, the row text is the identity key, and M1's 5-against-6 mismatch is reported | 3, 15 | — |
| `CLAIM-41.3` | "all seventeen body sections" plus the Design frontmatter keys | the ten-section ordered spine, 9 of 9, plus the H1-and-bold-metadata convention 8 of 9 use | 2, 8, 9, 16, 17, 20 | G1a, G1b |
| `CLAIM-41.6` | no body contains `dev`, `trade`, `health`, `wealth` or `know` outside a `references/` citation path | no body contains a **routing form** — `domain:<id>` or `skills/<id>/` — with the id list imported, and `know` dropped entirely | 10, 13, 14, 22 | G2 |
| `CLAIM-41.8` | each skill runs twice and the second run makes zero mutations | each skill declares a re-entry condition and orders its reads before its writes | 25 | G4 |

`CLAIM-41.4` is **widened** rather than restated: the #289 ruling adds the
`Corpus` obligation to `story-test-plan`, which the milestone predates.

## Amendments after implementation

Recorded rather than silently applied, per the posture of Decision 3 of
`docs/design/stories/26.md`.

| # | Amendment | Why |
|---|---|---|
| 1 | Cases 2, 8, 9 and 16 move from `bun run skill-lint` to **`bun run claim-lint`** | The plan assigned a **Design-document** rule to the **skill** linter. `skill-lint` scans `skills/`, `references/` and `agents/`; `docs/design/stories/` is `claim-lint`'s scope. `testplan-corpus` — the sibling rule for test plans — lives in `claim-lint` for exactly this reason. **Test plans and Designs are siblings and their linters must be too.** Found by implementing #294, not by review |
| 2 | Case 2's denominator becomes a **run-time count** instead of the literal "9 of 9" | The literal was stale before it was committed: `docs/design/stories/41.md` is itself a Design, so the corpus was **10** the moment this plan landed. Same defect class as finding 3 — a counted denominator drifts, a read one cannot |
| 3 | Case 14's unit changes from the **file** to the **sentence**, and its tool from `skill-lint` to `bun test` | The case asked a **skill-body** rule to judge a **design document**. `01-skill-hierarchy.md` carries four `skills/<id>/` citations and spells out `domain:trade` at `:436` — because documenting routing is its job. **Second occurrence of the category error amendment 1 records**, in consecutive tasks: a rule pointed at a population it was never scoped to. The property case 14 exists to pin — that the seeded rule indicted its own source — survives intact and is asserted over the doctrine sentences, read out of the real files |
