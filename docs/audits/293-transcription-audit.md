# Transcription audit — the four skills of S2.6

Case 18 of `docs/test-plans/293-plan.md`, anchoring `CLAIM-293.11`. Task #323.

`CLAIM-293.11` is **`model-judged` deliberately**: the harness holds a
procedure, the `SKILL.md` holds prose, and whether the two agree is meaning. No
regex closes it. **The denominator is tool-checked** — the row count below is
asserted at run time against `countReEntryRows()`
(`packages/harness/src/re-entry.ts:98`) by
`test/transcription-gap.test.ts` — **only the verdict is not.**

## Why this document is not an evidence artifact

Every model-judged verdict in this repository so far has been recorded in
`docs/evidence/`. This one is not, for two mechanical reasons:

1. `packages/core/test/evidence-upsert.test.ts:33-50` asserts that **every**
   `.md` under `docs/evidence/` matches `^(\d+)-(\d{8}T\d{6}Z)\.md$`. A durable,
   re-checkable audit has no timestamp to carry.
2. An evidence artifact is **immutable once pushed**, and is measured on the
   tree that contains it. This audit is a standing record that must be re-read
   and amended whenever a `## Re-entry` table or a transcription changes — the
   opposite lifetime.

The #323 evidence artifact records the verdict of the audit; this file is the
audit itself.

## Method, and what would have made a row fail

Each row below was resolved by hand, in both directions:

- the `## Re-entry` cell was read from `skills/<name>/SKILL.md` and quoted
  verbatim, not paraphrased;
- the harness step was located by its `ctx.read(<row>, …)` call and its line
  number read off the file, not carried from a prior document;
- the mutation that the row's *"Then, and only then"* half authorises was
  located separately, and checked to be **after** its own read.

A row fails this audit if any of: the transcription implements a different
read than the cell names; a mutation the cell authorises runs **before** the
read that decides it; the cell's *"never"* half is violated; or the row has no
step at all.

**The ordering constraint is per-row, not table-wide.** Each skill body states
it in terms — `skills/story-create/SKILL.md:95` says *"Every mutating step is
preceded by the read that decides it"*, and `skills/story-design/SKILL.md:90-91`
says the same. It does **not** say the rows execute top to bottom. Three of the
four transcriptions therefore execute their rows out of table order, each for a
recorded reason, and all three are faithful. **This is the same fact that makes
case 16 pass when the harness fails to notice a reordered table** — see the
closing section.

## The audit

`Executes` is this step's position in the transcription's own execution order.
`Mutation` is the write the row's *"Then, and only then"* half authorises.

| Skill | Row | "Read first" cell, verbatim | Harness step | Executes | Mutation it gates | Verdict | Reviewer's reasoning |
|---|---|---|---|---|---|---|---|
| goal-create | 1 | Does a milestone with this title exist? | `packages/harness/src/transcription-goal-create.ts:68` | 2nd of 3 | `POST …/milestones` at `:72` | faithful | Identity is matched on the milestone **title**, which is what `skills/goal-create/SKILL.md:79-81` names as the identity a second run matches on. The read is a `--paginate` list, so a truncated page cannot be read as absence; the create at `:72` is inside the `if not found` branch the read decides. |
| goal-create | 2 | Does its description already carry the feature table? | `packages/harness/src/transcription-goal-create.ts:90` | 3rd of 3 | `PATCH …/milestones/{number}` at `:111` | faithful | The list is **re-read** rather than reusing row 1's read. That is not redundancy: `skills/goal-create/SKILL.md:107-110` names a rate-limited read of this same list as the failure that must never be read as *"no such milestone"*, and trusting the create above to have landed would be exactly that mistake. The amend branch is dead in the roster — see *Dead branches* below — for a reason that is about the fake, not about this step. |
| goal-create | 3 | Did the goal resolve at all? | `packages/harness/src/transcription-goal-create.ts:53` | **1st of 3** | none — the hard-failure `throw` at `:55` | faithful | Executed first although it is the table's third row. The cell's second half is *"proceed, or emit the hard-failure block and stop"*, and a goal that does not resolve must mutate **nothing** — so every create-or-leave row above it is only meaningful once this read has passed. Running it third would make the hard-failure block unreachable after a milestone had already been created. The out-of-order execution is what makes the row faithful, not a departure from it. |
| story-create | 1 | Does a Story already exist for this row? | `packages/harness/src/transcription-story-create.ts:74` | 2nd of 4 | `gh issue create` at `:92` | faithful | Identity is the row's description text, per `skills/story-create/SKILL.md:93`. The read is fetched ahead of row 4's orphan comparison and ahead of every create; row 4's own constraint is only that it precede row 1's **creates**, never row 1's **read**. |
| story-create | 2 | Does the declared domain resolve to a binding? | `packages/harness/src/transcription-story-create.ts:58` | **1st of 4** | none — the hard-failure `throw` at `:60` | faithful | Executed first although it is the table's second row, for the same reason as `goal-create`'s row 3: `skills/story-create/SKILL.md:34-37` says a Story labelled with a domain no later verb can resolve is a Story that stalls the pipeline **after it has already been created**. Validating after the creates would be a different skill. |
| story-create | 3 | Is the existing Story assigned to this milestone? | `packages/harness/src/transcription-story-create.ts:117` | 4th of 4 | `gh issue edit --milestone` at `:121` | faithful | The issue list is read **again** at `:117` rather than reusing `:74`'s result — the creates just issued changed which issues exist, and `skills/story-create/SKILL.md:119-123` names a rate-limited read here as one that must never be mistaken for *"no Stories exist"*. Dead in the roster; see below. |
| story-create | 4 | Are there Stories with no row? | `packages/harness/src/transcription-story-create.ts:83` | 3rd of 4 | **none, and that is the point** | faithful | The cell says *"report them; **never** create, edit or close"*, and `skills/story-create/SKILL.md:102` carries the same `never`. The step reads the milestone document, computes the orphan set and reports it. There is no mutation to audit, and a transcription that quietly fixed an orphan would be a transcription of a different skill. Placed before row 1's creates, per `skills/story-create/SKILL.md:73-85`. |
| story-design | 1 | Does `docs/design/stories/{n}.md` exist? | `packages/harness/src/transcription-story-design.ts:44` | 1st of 4 | `writeFile` + `git add` + `git commit` at `:46-48` | faithful | `git cat-file -e` is an existence probe that does not read the blob, which is the correct read for a create-or-leave decision. When the file exists the transcription writes **nothing at all** — not even identical bytes. That matters: case 10 of `docs/test-plans/293-plan.md` makes an identical-bytes rewrite a recorded mutation, so a "harmless" rewrite here would score as a run-2 mutation and be a real defect. |
| story-design | 2 | Does the Story already carry a design sentinel? | `packages/harness/src/transcription-story-design.ts:77` | **4th of 4** | `gh issue comment` at `:88`, or `PATCH …/issues/comments/{id}` at `:99` | faithful | Executed last although it is the table's second row, because the sentinel body pins the permalink that row 3's read resolves — the sentinel cannot be posted before the sha it quotes exists. Both halves of the cell are implemented: post when absent, **edit that comment in place** when present, never append a second. |
| story-design | 3 | Does the pinned commit resolve on the remote? | `packages/harness/src/transcription-story-design.ts:63` | 2nd of 4 | none — its output is consumed by row 2's sentinel body | faithful | Read **after** row 1's write, never before: the sha that resolves is the one the write, if any, just produced. Reading it first would pin a permalink to the parent commit — the precise error the handoff records as *"an evidence artifact cannot carry the hash of the commit that contains it"*. The fixture has no remote, so this is `rev-parse HEAD`; the audit records that as the honest limit of the transcription, not as a divergence. |
| story-design | 4 | Do the registered claims already exist? | `packages/harness/src/transcription-story-design.ts:74` | 3rd of 4 | **none — observational by construction** | faithful | Claims live as checklist text **inside** the Design file, not as a separate forge object, so there is no second mutation that could "register" one beyond row 1's write. The cell's second half, *"register them, or leave the existing identifiers alone"*, is satisfied by construction: this transcription never rewrites a Design that already exists. A step that invented a registration call would be transcribing a skill that does not exist. |
| story-test-plan | 1 | Does the plan file exist? | `packages/harness/src/transcription-story-test-plan.ts:61` | 1st of 5 | `writeFile` + `git add` + `git commit` at `:95-97` | faithful | Same existence-probe shape as `story-design`'s row 1, and the same no-rewrite-when-present rule. Note the write at `:95` executes **after** rows 2, 3 and 4's reads, all of which need the pre-write state. |
| story-test-plan | 2 | Which claims have no case? | `packages/harness/src/transcription-story-test-plan.ts:67` | 2nd of 5 | none — feeds the body written by row 1 | faithful | The Design is read as the **only** source of claims, per `skills/story-test-plan/SKILL.md:29-31`. The transcription never invents a claim to plan against, which is the failure this row exists to prevent. |
| story-test-plan | 3 | Which cases anchor to a claim that is gone? | `packages/harness/src/transcription-story-test-plan.ts:78` | 3rd of 5 | **none — reports only** | faithful | Read **before** the write at `:95`, deliberately. On a first run the plan file does not exist and `git show HEAD:<plan>` exits non-zero — that is expected, and it is still a **recorded read**, never a reason to skip the call. Skipping it would be the *"decided to do nothing"* versus *"did nothing"* collapse that `CLAIM-293.3` exists to separate. The cell says *"do not silently delete a case"*; the step reports into `danglingCases` and deletes nothing. |
| story-test-plan | 4 | Does every case already declare a `Corpus`? | `packages/harness/src/transcription-story-test-plan.ts:90` | 4th of 5 | **none — observational** | faithful | Reads the same pre-write state as row 3 and does so **under its own row number**, rather than reusing row 3's result. That is what makes the read count honest: the runner's threshold is `countReads(report.calls)` (`packages/harness/src/argv-kind.ts`), computed from calls actually issued, never from a declared row. The cell's *"add the column"* half has no separate mutation because the plan's shape is always written whole, once, by row 1. |
| story-test-plan | 5 | Is a test-plan sentinel already posted? | `packages/harness/src/transcription-story-test-plan.ts:109` | 5th of 5 | `gh issue comment` at `:114`, or `PATCH …/issues/comments/{id}` at `:126` | faithful | The cell asks for both halves in its own text — *"edit that comment, never append a second"* — and both are implemented. Contrast `story-design`'s row 2, whose cell asks the same and is implemented the same way; the two are consistent with each other and each with its own body. |

## Denominator

**16 rows audited; 16 `## Re-entry` rows on disk; 0 divergent.**

| Skill | `## Re-entry` rows | Rows audited |
|---|---|---|
| goal-create | 3 | 3 |
| story-create | 4 | 4 |
| story-design | 4 | 4 |
| story-test-plan | 5 | 5 |
| **Total** | **16** | **16** |

Neither direction has an orphan: no `## Re-entry` row lacks a step, and no
transcription step is attributable to no row.

> **THIS TABLE IS DELIBERATELY NOT UNDER `## The audit`, AND MUST NOT BE MOVED
> BACK.** `test/transcription-gap.test.ts` parses the audit table by section,
> and every row of this summary also begins with a skill name followed by an
> integer. While the two tables shared a section the parser counted 23 pairs
> instead of 16, silently double-counting four skills — an error in the
> direction that *inflates* a denominator, which is the direction that hides a
> missing row. `## The audit` holds exactly one table; keep it that way.

## Dead branches — two, and both are the fake's limit, not the transcription's

Two authorised mutations exist in the transcriptions and are never reached by
any scenario in `packages/harness/src/scenario-roster.ts`:

| Branch | Why it never fires | Why no scenario forces it |
|---|---|---|
| `goal-create` row 2's `PATCH …/milestones/{number}` | Scenario 1 creates the milestone with the feature table already correct, so run 2 finds no *"description differs"* state | `packages/harness/src/fake-forge.ts` models **no** `PATCH` on a milestone at all. A scenario reaching it lands on `unmodelled`, never a real update |
| `story-create` row 3's `gh issue edit --milestone` | Every create in scenario 2 carries `--milestone` from the start, so `milestone === null` is never true | The fake's `create` never fails to honour `--milestone`, so the null-assignment state is unreachable without making the fake lie in a way it does not model |

**Both are correct re-entrant behaviour**, and neither is a transcription
defect: the code implements what its cell authorises, and the state that would
trigger it cannot honestly be produced by this fake. A scenario built to force
either would be asserting something about the fake rather than about the skill.

**This is an unmodelled-shape gap in the fake forge, and it is now recorded
rather than built around.** It is the item the #322 handoff listed as *needing
an issue if #323's audit or #324's live rung does not absorb it*. This audit
absorbs the **record**; it does not close the coverage. The live rung (#324) is
the first thing that can, because a real forge honours both shapes.

## What this audit does NOT establish

- **It does not test the model reading a `SKILL.md`.** The population audited
  here is the transcription. Gate ruling G2 (`docs/design/stories/293.md`)
  forbids any later Story treating this audit, or a green harness run, as
  licence to upgrade `CLAIM-41.8` or `CLAIM-47.4` from `model-judged`.
- **It does not make the transcriptions correct by construction.** It records
  that a reviewer checked sixteen correspondences on a named tree. A change to
  either side invalidates the row that covers it, and the denominator assertion
  will catch a row **added or removed** — it cannot catch a cell **edited**.
- **It is not the roster's coverage report.** Two authorised mutations above
  are audited as faithful and are never executed.

## Why case 16 passes, and why it must not be "repaired"

The transcriptions attribute each read to a row number **written by hand**.
Nothing parses the `## Re-entry` table at run time except the row **count**.
Reorder two rows of a shipped table and the count does not change, so
`bun run skill-harness` stays green and not one assertion moves.

That is `NEVER-293.5` working, and this audit is why it is the right behaviour
rather than a hole: the table is a set of read-before-write obligations, not a
sequence, and three of the four transcriptions already execute their rows out
of table order **for reasons recorded row by row above**. A harness that went
red on a reordered table would be asserting an ordering the skill bodies never
claimed — and would go red on three of the four skills as they are shipped
today.

The gap that remains real is the one this document exists to bound: the harness
would not notice if a cell's **text** changed to mean something else. That is
measured, published, and owned by `CLAIM-293.11` — which is why it is
`model-judged`.
