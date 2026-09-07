---
name: story-create
description: create the stories for a milestone, turn the feature table into issues, cut stories for M2, which features have no story yet, re-run story-create after adding a feature row, why is there a story with no feature row
---

# story-create

Takes a milestone. Creates one Story issue per feature row that does not already
have one, labelled and assigned, and reports anything it will not reconcile.

**Arguments: the milestone, and optionally a single feature row.** Everything
else is read.

## Phase 0: Context Discovery

Nothing in this phase writes.

Read, in this order:

1. **The milestone document on disk**, located as
   `references/context-discovery.md` describes. **The document is
   authoritative, not the forge's milestone description** — that description is
   a truncated copy written by an earlier verb, and a file in the working tree
   is re-readable, diffable and testable while a description is not.
2. **The feature table** in that document. **The identity key is the feature
   row's description text**, not any section number. That is what makes "one
   Story per row" mean anything, and it is what a re-run matches on.
3. **The `domain:` label** declared for each Story in the milestone document's
   own metadata line. **Read it here, before any step that needs a binding.**
   It is *not* in the feature table — no milestone document has a domain column
   — so a skill that looked only at the table would find nothing and be tempted
   to invent one.
4. **The binding that label resolves to**, through the registry described in
   `references/domain-binding.md`. A label that resolves to no binding is the
   hard failure below. Validate it *before* creating anything: a Story labelled
   with a domain no later verb can resolve is a Story that stalls the pipeline
   after it has already been created.
5. **The existing Stories on the milestone**, so the run knows which rows are
   already satisfied. This is read before any create — see Re-entry.

### Hard failure — no resolvable domain

**Absence is a hard failure, not a default.** Emit exactly this and stop:

```
HARD FAILURE in Phase 0 (story-create):
- Milestone: <milestone>
- Expected: exactly one resolvable `domain:` label declared for the Story
- Found: none
- Action: Pipeline cannot continue. Declare the domain and re-run.
```

Do not pick the domain of the previous Story. Do not read it off the milestone's
number. Do not label the Story with the most common domain and let a human fix
it later. Every downstream verb routes on this label; a guess here is a wrong
answer that looks like a right one for the rest of the Story's life.

Apply the same refusal to a label that resolves to **more than one** binding, or
to a Story block declaring two `domain:` labels. Exactly one, or stop.

## What it writes

**One Story issue per feature row that has none.** Each carries the Story type
label, exactly one domain label, the project label, and an assignment to the
milestone. The label vocabulary and the at-most-one-status invariant live in
`references/workflow-states.md` — cite it; do not restate the namespaces here.

**A run against a fully populated milestone creates nothing.** That is the
ordinary outcome, not a failure, and it must be reported as such.

### The orphan report

A milestone may hold **a Story with no feature row**. Run against M1 today this
finds five rows and six Stories, because one Story was cut before the table
existed.

**Report the orphan and create nothing for it.** Do not delete it, do not invent
a feature row to match it, and do not quietly renumber. A skill that papers over
a real inconsistency between the milestone document and the issue tracker is
worse than one that stops, because the inconsistency is the finding — it means
the two sources disagree about what the milestone contains, and only a human
knows which is right.

Report it in both directions: rows with no Story (which this skill creates), and
Stories with no row (which it never touches).

## Re-entry

**This skill is re-run** — after a crash, after a row is added to the table,
after a human cuts a Story by hand.

The re-entry condition is: **every feature row either has exactly one Story, or
has none and is about to get one.** Identity is the row's description text.

Every mutating step is preceded by the read that decides it:

| Read first | Then, and only then |
|---|---|
| Does a Story already exist for this row? | create one, or leave it untouched |
| Does the declared domain resolve to a binding? | proceed, or emit the hard-failure block |
| Is the existing Story assigned to this milestone? | assign it, or leave it |
| Are there Stories with no row? | report them; **never** create, edit or close |

Never create a Story whose title duplicates one already on the milestone. A
duplicate is not corrected by a later run — both persist, both look
authoritative, and every count downstream is wrong from then on.

## Error Handling

Consult `references/gh-error-handling.md` for backoff and exit-code taxonomy.

- **The resource does not exist.** The milestone document is absent, or the
  named milestone has no matching document. Report which and stop. Do not
  create the milestone — that is the previous verb's job, and doing it here
  would create one with no feature table.
- **The resource already exists.** A Story is already present for this row. The
  ordinary re-run case: leave it. Only assign the milestone if that is the one
  gap.
- **Rate limiting.** Back off and retry the read. A rate-limited *read* of the
  existing Stories must never be treated as "no Stories exist" — that is how a
  re-run creates a duplicate of every row at once, because absence is what the
  create step keys on. **This is the single most damaging failure mode of this
  skill**, because it is silent, plausible and multiplied by the row count.
- **A partial write.** Some rows got Stories and the run stopped. Re-running
  detects it: the existing-Story read finds what landed, and only the remaining
  rows are created. Report how many rows were satisfied and how many remain,
  rather than reporting success.

Never record the milestone as populated when only part of the table has Stories.
The next verb reads the record, not the table.
