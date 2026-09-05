# GitHub Operations

**Contract.** The exact `gh` invocations for every operation iAI performs.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:54`.

---

## This layer builds argv. It does not execute.

Every operation below is produced by a **pure function returning an argument
vector**. Nothing in `packages/core/src/gh/` spawns a process, opens a socket or
reads a file — that is the adapter's job, and the separation is enforced by the
`no-io-in-pure-modules` lint rule.

The practical consequence for a skill author: you do not hand-write `gh` command
strings. You call the builder, and you get an argv that has already refused the
malformed cases.

Barrel: `packages/core/src/gh/index.ts`.

| Operation | Module |
|---|---|
| Issues — create, view, list, edit body, close | `packages/core/src/gh/issues.ts` |
| Labels — create, list, transition | `packages/core/src/gh/labels.ts` |
| Milestones — create, list, update | `packages/core/src/gh/milestones.ts` |
| Comments — create, edit, list | `packages/core/src/gh/comments.ts` |
| Pull requests — create, list, body construction | `packages/core/src/gh/pr.ts` |
| Sub-issues — the GraphQL tree | `packages/core/src/gh/sub-issues.ts` |
| Repo identity and flags | `packages/core/src/gh/repo.ts` |
| Response parsing | `packages/core/src/gh/parse.ts` |

---

## THE HAZARD: `Closes #N` does not fire on a task PR

This is the single most expensive thing in this document.

**GitHub's closing keywords fire only when a pull request merges into the
repository's default branch.** iAI's branch model has task PRs target the *story*
branch, not the default branch. Therefore:

> **A `Closes #N` in a task PR body is silently inert. The task issue stays open,
> and nothing reports an error.**

`packages/core/src/gh/pr.ts` refuses to emit it rather than letting it look like
it worked — see the guard and its reasoning at `packages/core/src/gh/pr.ts:261-263`
and `:309-311`. A task PR that asks for `Closes` is rejected at body-construction
time.

### What to do instead

| PR kind | Target | Closing |
|---|---|---|
| Task PR | the story branch | **Close the issue explicitly** after merge, citing the merge commit — then **re-read the issue state to confirm** |
| Integration (Story) PR | the default branch | `Closes #N` fires normally |

### One directive per line

`Closes` and `Refs` are emitted **one per line**. A comma-separated list is
silently ignored by GitHub — it does not error, it simply closes nothing.

`Blocked by:` is the exception: it *is* comma-separated, and correct that way.
The two forms are adjacent in the same body and are easy to conflate. See
`packages/core/src/gh/pr.ts:250`.

---

## Label transitions

Label state is a state machine, and three namespaces are **mutually exclusive** —
an issue may carry at most one label from each. The authoritative list is the
exported constant at `packages/core/src/gh/labels.ts:54`; do not restate it here
or in a skill body.

`planLabelTransition` (`packages/core/src/gh/labels.ts:71`) takes the labels
currently on the issue **as a value** and returns the transition to perform. Two
properties matter:

- **A no-op transition is skipped**, not re-issued. The current labels must be
  read first; this layer will not guess them.
- The transition is a **single command** adding and removing together. Two
  commands leave a window in which the issue carries two exclusive labels or
  none.

The state machine itself is owned by `references/workflow-states.md`, not here.

---

## Sub-issues need a feature header

Sub-issue queries and mutations are GraphQL-only and require an opt-in header.
Without it the query does not error — **it returns a shape that looks like an
empty tree**, which reads as "this Story has no tasks".

The header is exported as a named constant at
`packages/core/src/gh/sub-issues.ts:41`. Use it; do not retype the string.

Attaching an existing issue to a parent uses the `addSubIssue` mutation, which
needs both node ids, not issue numbers.

---

## Comment upsert is NOT owned here

`docs/design/01-skill-hierarchy.md:54` assigns "comment upsert by sentinel" to
this document, and `:60` assigns the sentinel namespace to
`references/evidence-artifacts.md`. **Both cannot own it.**

Resolved by Decision 7 of `docs/design/stories/35.md`, following the boundary
`docs/design/stories/21.md:88-92` already drew when S1.3 explicitly excluded
upsert and assigned it to S1.4:

- **This document owns argv construction** — `commentCreate`, `commentEdit`,
  `commentList` in `packages/core/src/gh/comments.ts`.
- **`references/evidence-artifacts.md` owns sentinel discovery and the upsert
  decision** — which comment to edit, and what makes two comments the same one.

If you need to update a sentinel comment in place, read that document. The rule
"one sentinel, one comment — update in place, never stack a second" lives there.

---

## Verifying a mutation actually happened

`gh` mutations have been observed to **fail silently or no-op**:

- Three calls in one session failed with a connection error and succeeded on
  immediate retry.
- `gh pr ready` printed nothing and left the PR a draft.

Therefore: **never redirect stderr on a mutating command, and always re-read the
resulting state.** Confirm a close with the issue's `state`, a ready with
`--json isDraft`, a comment edit with the comment count.

`gh pr view --json merged` is **not a field**. Use `state`, `mergedAt`,
`mergeCommit`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| This layer is pure and returns argv | `packages/core/src/gh/`, `no-io-in-pure-modules` | confirmed |
| `Closes` fires only on the default branch | `packages/core/src/gh/pr.ts:261-263`, `:309-311` | confirmed |
| One directive per line; `Blocked by:` is comma-separated | `packages/core/src/gh/pr.ts:250` | confirmed |
| Three mutually exclusive label prefixes | `packages/core/src/gh/labels.ts:54` | confirmed — constant named, not restated |
| Sub-issues need the feature header | `packages/core/src/gh/sub-issues.ts:41` | confirmed — constant named, not restated |
| This document owns comment upsert | `docs/design/01-skill-hierarchy.md:54` vs `:60` | **resolved** by Decision 7 of `docs/design/stories/35.md` — argv here, upsert in `references/evidence-artifacts.md` |
