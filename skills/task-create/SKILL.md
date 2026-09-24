---
name: task-create
description: cut the tasks for a Story, create task issues from the design, open sub-issues for story 47, break this story into tasks, turn build targets into issues, re-run task creation after the design changed
---

# task-create

Takes a Story issue number. Opens one task sub-issue per row of that Story's
Design `## Build Targets` table, and merges a checklist of them into the Story
body.

**One argument: the Story number.** Everything else is read, never assumed.

## Phase 0: Context Discovery

Nothing in this phase writes. Establish every fact from disk and from the forge
before deciding anything — never from conversation memory, and never from what a
previous turn said it had done. `references/context-discovery.md` is the
contract for this phase.

Read, in this order:

1. **The Story issue** — body, labels, milestone, and which sub-issues it
   already has. The existing sub-issues are what make this skill re-entrant.
2. **The Story's `domain:` label.** Read it here, in Phase 0, *before* any step
   that needs a binding. If it is absent, stop and emit the hard-failure block
   below. Every task opened inherits this label; do not infer one from the
   title, the milestone, or whichever was in play last time.
3. **The binding for that label**, resolved through the registry described in
   `references/domain-binding.md`. This skill never names a domain itself — it
   reads a label and loads what that label resolves to. Adding a sixth domain
   must be one binding file and no edit here.
4. **The Design on disk** — `docs/design/stories/{n}.md` — and specifically its
   `## Build Targets` table. **This table is the unit of work, and the only
   one.** Parse it with `parseBuildTargets`
   (`packages/core/src/guards/build-targets.ts`), which finds the `Target`
   column *by name* and refuses a table it cannot read rather than guessing.
   The section spine that guarantees the table exists is
   `references/design-format.md`'s.
5. **The binding's unit-of-work noun and its sizing bound**, which supply the
   vocabulary and the size each row is judged against —
   `references/sizing-criteria.md`. The binding contributes the *noun* and the
   *bound*; it does not contribute the list. It is a single specification
   object, not a sequence, and iterating it is an error.

### Hard failure — no Design table to cut tasks from

A Story whose Design has no readable `## Build Targets` table has no units of
work, and tasks invented without one are a guess. **Absence is a hard failure,
not a default.** Emit exactly this and stop:

```
HARD FAILURE in Phase 0 (task-create):
- Story: #<n>
- Expected: a Design on disk whose `## Build Targets` table parses
- Found: none
- Action: Pipeline cannot continue. Write the Design and re-run.
```

The same block, with its own `Expected` line, covers an absent `domain:` label.
Do not open a single task before both reads succeed. Do not open the tasks you
*can* read and leave the rest — a partial cut is indistinguishable, on re-run,
from a complete one.

## What it writes

**One task sub-issue per table row**, in table order, each one:

- anchored to at least one claim that already exists in that Story's Design.
  A task anchored to no claim is work nobody can verify; a task anchored to an
  invented identifier fails `claim-lint`.
- labelled `type:task` and **the parent's own `domain:` label**, read in
  Phase 0 and copied, never chosen here.
- carrying its dependencies as **exactly one** `Blocked by:` line, comma-joined,
  in checklist order. The form is owned by
  `packages/core/src/gh/blocked-by.ts` — do not restate it. One line, never one
  per blocker: that directive is comma-separated where `Closes` is per-line, and
  the two rules are deliberately opposite.
- parented to the Story. Where the sub-issue API is unavailable the fallback is
  a `Parent: #N` line in the body; `packages/core/src/gh/sub-issues.ts` owns
  both paths and the choice between them.

**A `## Tasks` checklist merged into the Story body.** *Merged* — the checklist
is folded into the existing body and the rest of it is preserved exactly. The
Story body carries load-bearing prose inside that section, including dependency
orderings and rulings, and a whole-section rewrite deletes it. Use the merger in
`packages/core/src/gh/sub-issues.ts`; it rewrites only the leading run of entry
lines and refuses a body with two `## Tasks` sections. **Never assemble the
checklist and send it as the whole body.**

Checklist order is table order. Nothing here sorts, because the `Blocked by:`
lines are required to match the checklist and a sort would break that from
underneath.

## Re-entry

**This skill is re-run.** After a crash, after a context compaction, after a
human opens a task by hand, after a gate ruling adds a row to the Design's
table. Re-running detects existing state and addresses only the gaps.

The re-entry condition is: **every table row either has its task issue, or does
not.** Every mutating step below is preceded by the read that decides which:

| Read first | Then, and only then |
|---|---|
| Does `docs/design/stories/{n}.md` exist, and does its `## Build Targets` table parse? | enumerate the rows, or stop and emit the hard-failure block |
| Does the Story already carry a `domain:` label? | copy it onto each task, or stop and emit the hard-failure block |
| Which sub-issues does the Story already have, and which row does each cover? | open only the rows with no issue, or leave the existing ones alone |
| Does the Story body already carry a `## Tasks` section? | merge into it, or add one — never replace the body |
| Does each opened task already carry its `Blocked by:` line? | write it once, or leave the existing line alone |

Never close and reopen a task to "start clean". Its number is already cited by
the checklist, by other tasks' dependency lines, and possibly by an evidence
artifact, and those citations do not follow a renumbering.

Match an existing task to its row by the row's target text, not by position. A
row inserted into the middle of the table shifts every position after it, and a
position-matched re-run would then open duplicates for work that already exists.

## Error Handling

Consult `references/gh-error-handling.md` for backoff and exit-code taxonomy.
The four conditions this skill must survive:

- **The resource does not exist.** The Story number names no issue, or names a
  pull request, or the Design file is absent. Report the number or path that
  failed and stop. Do not create the Story, and do not write a Design.
- **The resource already exists.** A task issue for a row is already open. This
  is the ordinary re-run case, not an error: leave it, record its number, and
  move on. Opening a second issue for one row is the failure mode to avoid, and
  it is silent — both issues look correct in isolation.
- **Rate limiting.** Back off and retry the read. A rate-limited *read* must
  never be treated as "absent" — that is how a re-run turns into a duplicate,
  because absence is exactly what the create step keys on.
- **A partial write.** Some tasks were opened and the checklist was never
  merged, or the checklist was merged naming issues that were never created.
  Both are recoverable by re-running: the sub-issue read and the body read above
  detect each case. Report which half completed rather than reporting success.

Never leave the Story labelled as though its tasks were cut when only some of
them are. The labels are a state machine, described in
`references/workflow-states.md`; a label that outruns the artifact is worse than
no label, because the next skill in the chain reads the label and not the disk.
