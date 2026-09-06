---
name: story-test-plan
description: write the test plan for a story, turn the design claims into cases, how do we verify story 41, build the verification plan, which claims have no case, re-run the test plan after the design changed, add the corpus column
---

# story-test-plan

Takes a Story number. Turns that Story's Design claims into a categorised
verification plan, and posts the test-plan sentinel pointing at the committed
text.

**One argument: the Story number.** The Design is the input; nothing here
invents a claim.

## Phase 0: Context Discovery

Nothing in this phase writes.

Read, in this order:

1. **The Story issue** — body, labels, and whether it already carries a
   test-plan sentinel.
2. **The Story's `domain:` label.** Read it here, before any step that needs a
   binding. Absent, it is the hard failure below.
3. **The binding that label resolves to**, through the registry described in
   `references/domain-binding.md`. The binding supplies the verifier classes and
   the rungs this domain recognises — the plan's tiers are the domain's, not
   this skill's.
4. **The Design on disk.** It is the **only** source of claims. Every
   `CLAIM-{story}.{n}` and every anti-claim in it, and its Test Strategy
   section. A Design that does not exist is a hard failure too: this skill does
   not write one, and it does not invent claims to plan against.
5. **The test plan on disk, if one exists.** Its presence is what makes this
   skill re-entrant.

### Hard failure — the inputs are not there

**Absence is a hard failure, not a default.** Emit exactly this and stop:

```
HARD FAILURE in Phase 0 (story-test-plan):
- Story: #<n>
- Expected: a resolvable `domain:` label and a Design carrying at least one claim
- Found: none
- Action: Pipeline cannot continue. Supply the missing input and re-run.
```

Do not plan against a Design you could not read. Do not synthesise a claim so
the plan has something to anchor to. Do not assume the previous Story's domain.
A plan whose cases anchor to claims nobody registered verifies nothing while
looking complete, which is worse than having no plan.

## What it writes

**`docs/test-plans/{n}-plan.md`** — the Story's verification plan.

Three obligations, all of them checked by `claim-lint` after the fact, and all
of them the skill's job to get right before that:

1. **Every claim in the Design appears in the `anchors_to` column of at least
   one case.** A registered claim with no case is a claim nobody will verify.
   Report the uncovered claims rather than quietly planning around them.
2. **No case anchors to a claim that does not exist.** A typo'd identifier is a
   case that verifies nothing and reports success.
3. **Every case declares a `Corpus`.** The column, its position, and its
   vocabulary are specified in `references/verification.md` — read it there.
   **This skill refuses to emit a case table without the column.** Not a
   warning, not a column added later: a table without it is not a table this
   skill writes.

On the third: a `synthetic` corpus is **legal and not lesser**. Some fixtures
must be invented, and a plan that banned them would delete the cases that prove
an exemption is exact rather than a prefix. What is forbidden is an
**undeclared** or **unreasoned** one. Record the reason in the cell, because the
check can verify that a declaration exists and is well formed — it cannot verify
that it is true, and pretending otherwise is how a `real` label ends up on
invented fixtures.

Cases carry a priority tier so a partial run has a defensible stopping point.

Then **post the test-plan sentinel** on the Story issue with a permalink pinned
to the commit containing the plan. The sentinel namespace, the closed set of
legal names and the permalink shape are specified in
`references/evidence-artifacts.md`, which cites the owning modules. Resolve the
commit against the remote and fetch the file at that ref **before** posting.

**One sentinel, one comment.** If one is already present, edit it in place; the
comment count must not grow on re-run.

## Re-entry

**This skill is re-run** — most often because the Design changed after a gate
ruling, which is exactly when a stale plan is most dangerous.

The re-entry condition is: **every claim in the Design is covered by a case, and
every case anchors to a claim that still exists.** Both halves are read before
anything is written, because a Design amendment can invalidate a plan in either
direction — a new claim leaves a hole, a withdrawn claim leaves a dangling
anchor.

| Read first | Then, and only then |
|---|---|
| Does the plan file exist? | create it, or amend only the rows affected |
| Which claims have no case? | add cases for those, leave the rest alone |
| Which cases anchor to a claim that is gone? | report them; do not silently delete a case |
| Does every case already declare a `Corpus`? | add the column, or leave it |
| Is a test-plan sentinel already posted? | edit that comment, never append a second |

**Never renumber existing cases on a re-run.** Case numbers are cited by
evidence artifacts, by task issues and by the Design's own coverage table.
Renumbering silently reassigns every one of those references.

## Error Handling

Consult `references/gh-error-handling.md` for backoff and exit-code taxonomy.

- **The resource does not exist.** The Story, the Design, or a claim a case
  anchors to. Report which, and stop. Never create the Design here.
- **The resource already exists.** The plan file, or the sentinel. The ordinary
  re-run case: amend the file and edit the comment in place. Growing the comment
  count, or appending a second plan file under a different name, are the failure
  modes to avoid.
- **Rate limiting.** Back off and retry the read. A rate-limited read of the
  Story's comments must never be treated as "no sentinel is present" — that is
  how a re-run posts the duplicate the previous paragraph forbids.
- **A partial write.** The plan was committed but the sentinel was not posted,
  or was posted against a commit that was never pushed. Both are recoverable by
  re-running: the file read and the remote-resolve detect each. Report which
  half completed rather than reporting success.

Never label the Story as planned when the plan covers only some of the claims.
Labels are a state machine, described in `references/workflow-states.md`, and
the next verb reads the label rather than counting the cases.
