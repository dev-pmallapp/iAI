---
name: story-design
description: write the Design for a Story, design story 41, draft the design doc, add claims to a story, what should this story build, turn a story into a design, design-doc this issue, re-run the design after the gate ruled
---

# story-design

Takes a Story issue number. Writes that Story's Design document, registers its
claims, and posts the design sentinel pointing at the committed text.

**One argument: the Story number.** Everything else is read, never assumed.

## Phase 0: Context Discovery

Nothing in this phase writes. Establish every fact from disk and from the forge
before deciding anything — never from conversation memory, and never from what a
previous turn said it had done.

Read, in this order:

1. **The Story issue** — body, labels, milestone, and whether it already has a
   design sentinel on it.
2. **The Story's `domain:` label.** Read it here, in Phase 0, *before* any step
   that needs a binding. If it is absent, stop and emit the hard-failure block
   below. Do not infer a domain from the title, the milestone, the file paths in
   the body, or from whichever domain was in play last time.
3. **The binding for that label**, resolved through the registry described in
   `references/domain-binding.md`. The binding supplies the pack's `domain.md`
   and the pack's own vocabulary. This skill never names a domain itself — it
   reads a label and loads what that label resolves to. Adding a sixth domain
   must be one binding file and no edit here.
4. **The Goals ancestry** the Story hangs from, so the Design's Goal section
   inherits rather than invents.
5. **The Design on disk, if one exists** — `docs/design/stories/{n}.md`. Its
   presence is what makes this skill re-entrant; see Re-entry below.

### Hard failure — no `domain:` label

A Story with no `domain:` label has no binding, and a Design written without a
binding is a guess. **Absence is a hard failure, not a default.** Emit exactly
this and stop:

```
HARD FAILURE in Phase 0 (story-design):
- Story: #<n>
- Expected: exactly one `domain:` label, to resolve the pack binding
- Found: none
- Action: Pipeline cannot continue. Label the Story and re-run.
```

Do not pick a domain. Do not fall back to the most common one. Do not proceed
with a partial Design and fix it later. A skill that silently picked a domain
would pass every test that only checked it did not crash.

## What it writes

**`docs/design/stories/{n}.md`** — the Story's Design.

The section spine, its order, and the metadata convention are specified in
`references/design-format.md` and enforced by the `design-spine` rule in
`packages/core/src/guards/design-spine.ts`, which holds the authoritative list.
**Read the spine from there; this skill does not carry a copy of it.** A second
copy is a copy that drifts.

The Design must carry at least one registered claim, written as a checklist
item so the Story's progress is readable from the document itself. Claims are
Story-qualified and unique; anti-claims carry the negative prefix. The
identifier grammar is `references/verification.md`'s, and `claim-lint` enforces
it — including over this file's own output.

Then **post the design sentinel** on the Story issue, carrying a permalink
pinned to the commit that contains the Design, not to a branch name. The
sentinel namespace, the closed set of legal sentinel names, and the permalink
shape are all specified in `references/evidence-artifacts.md`, which cites the
owning modules. Resolve the commit against the remote and fetch the file at that
ref **before** posting — a permalink to a SHA that was never pushed is a link to
nothing.

**One sentinel, one comment.** If a design sentinel is already present, edit
that comment in place. Never append a second; the comment count must not grow on
re-run.

## Re-entry

**This skill is re-run.** After a crash, after a context compaction, after a
human edits the Design by hand, after a gate ruling changes the text it already
wrote. Re-running detects existing state and addresses only the gaps.

The re-entry condition is: **the Design file on disk and the design sentinel on
the issue are each either absent, or present and current.** Every mutating step
below is preceded by the read that decides which:

| Read first | Then, and only then |
|---|---|
| Does `docs/design/stories/{n}.md` exist? | create it, or amend the sections that changed |
| Does the Story already carry a design sentinel? | post one, or edit that comment in place |
| Does the pinned commit resolve on the remote? | pin the permalink, or push first and re-resolve |
| Do the registered claims already exist? | register them, or leave the existing identifiers alone |

Never delete and recreate the Design to "start clean" — the identifiers in it
are referenced by the test plan, by task issues and by evidence artifacts that
have already been written against them.

## Error Handling

Consult `references/gh-error-handling.md` for backoff and exit-code taxonomy.
The four conditions this skill must survive:

- **The resource does not exist.** The Story number names no issue, or names a
  pull request. Report the number that failed and stop. Do not create the Story.
- **The resource already exists.** A Design file is on disk, or a design
  sentinel is already on the issue. This is the ordinary re-run case, not an
  error: amend the file and edit the sentinel comment in place. Growing the
  comment count is the failure mode to avoid.
- **Rate limiting.** Back off and retry the read. A rate-limited *read* must
  never be treated as "absent" — that is how a re-run turns into a duplicate,
  because absence is what every create step keys on.
- **A partial write.** The Design was committed but the sentinel was not posted,
  or the sentinel was posted pointing at a commit that was never pushed. Both
  are recoverable by re-running: the file read and the remote-resolve above
  detect each case. Report which half completed rather than reporting success.

Never leave the Story labelled as though the Design were complete when only part
of it is. The labels are a state machine, described in
`references/workflow-states.md`; a label that outruns the artifact is worse than
no label, because the next skill in the chain reads the label and not the disk.
