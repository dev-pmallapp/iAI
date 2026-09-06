---
name: goal-create
description: turn a goal into a milestone, create the milestone for goal G3, set up a milestone from my goals, start a new goal, what milestone should this goal become, re-run goal-create after editing the goals file
---

# goal-create

Takes a goal identifier. Creates the one GitHub milestone that goal becomes, its
description carrying the feature table the rest of the pipeline reads.

**One argument: the goal identifier.** Everything else is read from disk and
from the forge, never assumed.

## Phase 0: Context Discovery

Nothing in this phase writes.

Read, in this order:

1. **The goals source**, located as `references/context-discovery.md` describes.
   It is the only input that carries what the goal means. **It is routinely
   absent** — it is a private, gitignored path on every public checkout — and
   that absence is the hard failure below, not a prompt to invent one.
2. **The goal identifier's entry** in that source. An identifier that resolves
   to nothing is the same hard failure: this skill never guesses which goal was
   meant, and never creates a milestone named after an identifier it could not
   resolve.
3. **The existing milestones**, by title. This is what makes the skill
   re-entrant, and it is read *before* anything is created — see Re-entry.

### Hard failure — the goal cannot be resolved

A milestone created from a goal nobody could read is a guess wearing a title.
**Absence is a hard failure, not a default.** Emit exactly this and stop:

```
HARD FAILURE in Phase 0 (goal-create):
- Goal: <id>
- Expected: a readable goals source containing that identifier
- Found: none
- Action: Pipeline cannot continue. Supply the goals source and re-run.
```

Do not create an empty milestone to be filled in later. Do not infer the goal
from the identifier's spelling. Do not fall back to the most recent goal. A
skill that invented a milestone here would produce something the whole pipeline
downstream treats as authoritative.

> **This skill reads no `domain:` label and resolves no binding.** It runs
> before any Story exists, and a milestone carries no labels. The domain enters
> at `story-create`, which is the first verb with a Story to label. Recorded
> because the surrounding claim describes a binding read that has no referent
> here — see the issue linked from the Story's Design.

## What it writes

**Exactly one GitHub milestone**, whose description carries a
`| Feature | Description |` table. That table is not decoration: it is the
authoritative input `story-create` reads, so a milestone written without it
stalls the next verb rather than failing loudly here.

Keep the description within the forge's description budget. It is a **truncated
copy** of the milestone document on disk, and the document — not this
description — is what later verbs parse. Do not let the copy become the only
place a fact lives.

**The back-link on the goal's line is out of scope.** It was severed
deliberately: it needs a file in another repository, a line grammar that is
nowhere specified, a forge primitive that does not exist, and a tenth name in a
closed set of sentinel names. The severed half is recorded as its own issue, not
silently dropped. **Do not implement a partial version of it here.**

## Re-entry

**This skill is re-run.** Re-running detects existing state and addresses only
the gaps.

The re-entry condition is: **the milestone for this goal identifier is either
absent, or present and current.** Identity is the milestone **title**; it is
what a second run matches on, and it is why a second run against the same goal
creates nothing.

Every mutating step is preceded by the read that decides it:

| Read first | Then, and only then |
|---|---|
| Does a milestone with this title exist? | create it, or leave it and update only what changed |
| Does its description already carry the feature table? | write the table, or amend the rows that differ |
| Did the goal resolve at all? | proceed, or emit the hard-failure block and stop |

**A second run against the same goal issues no mutating command at all** when
nothing has changed — not a create that fails, not an update that rewrites the
same bytes. Read first, then decide, then act.

## Error Handling

Consult `references/gh-error-handling.md` for backoff and exit-code taxonomy.

- **The resource does not exist.** The goals source is absent, or the identifier
  resolves to nothing. This is the hard failure above. Report the identifier
  that failed and stop.
- **The resource already exists.** A milestone with this title is already
  present. This is the ordinary re-run case, not an error: leave it, and amend
  only the description rows that differ. **Creating a second milestone for one
  goal is the failure this skill exists to prevent** — it is what makes every
  downstream count wrong.
- **Rate limiting.** Back off and retry the read. A rate-limited *read* of the
  milestone list must never be treated as "no such milestone" — that is exactly
  how a re-run creates the duplicate above, because absence is what the create
  step keys on.
- **A partial write.** The milestone was created but its description was not
  written, or was written without the feature table. Re-running detects it: the
  title read finds the milestone, the description read finds the missing table,
  and only the gap is filled. Report which half completed rather than reporting
  success.

Labels are a state machine, described in `references/workflow-states.md`. Never
record a goal as ingested when only the milestone shell exists — the next verb
reads the record, not the milestone.
