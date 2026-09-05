# GitHub Error Handling

**Contract.** Exit codes, rate limits, retry-vs-fail, and resuming a partial
batch.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:55`.

---

## The one question this layer answers

> Given this response, is a retry warranted at all?

`shouldRetryResponse` (`packages/core/src/gh/errors.ts:262`) answers it, and
**answering is all it does.** It does not sleep, does not count attempts across
calls, and does not re-invoke anything. All three are effects and belong to the
adapter.

---

## Exit-code taxonomy

The taxonomy is a table of **observed** codes, exported at
`packages/core/src/gh/errors.ts:78`. Each row carries a `provenance` field of
`observed` or `assumed`, so a reader can tell a reproduced behaviour from an
inferred one. Do not restate the codes in a skill body; read the constant.

Two properties are easy to get wrong:

**Success is classified `fatal`, deliberately.** There is nothing to retry on
success. It is marked fatal so a caller who consults the classifier *without*
first checking for success fails safe — refusing to retry — rather than re-running
a side-effecting command because "retryable" looked true.

**The general-error code is `fatal`, not retryable.** It is `gh`'s catch-all and
covers permanent usage errors (unknown subcommand, missing argument, rejected
credential) and remote failures alike. Treating it as retryable would retry a
permanently broken invocation forever.

**Unmapped codes fall through to a default** rather than being guessed at. Most
integers are not in the table, and that is intentional.

---

## Rate limits: three states, not two

`classifyRateLimit` (`packages/core/src/gh/errors.ts:217`) returns one of three
values, and the third is the important one.

| Classification | Meaning |
|---|---|
| not rate limited | the budget header was present and non-zero, or nothing suggests a limit |
| rate limited | the budget header was present and zero, **or** the secondary-limit phrase was matched |
| **possibly** rate limited | a 403 with **no** budget header captured |

**Why the third state exists.** `gh api --include` appears nowhere in this
repository, so the common case is that no headers were captured at all. Treating
"no header" as "definitely fine" would abandon a batch that would have succeeded
on retry. The absent header is therefore read conservatively.

**Possibly-rate-limited still yields a resume plan.** It is not fatal.

### The secondary limit is a separate mechanism

GitHub's secondary (abuse-detection) limit is distinct from the primary budget
and carries **no header this layer can rely on** — it is reported only in the
response body's message. It is therefore matched as text, against both stdout and
stderr, because `gh` was observed writing an error to stderr while a JSON body
landed on stdout.

This is the one place text is matched rather than parsed, and it is deliberately
narrow: a whole documented phrase, not a heuristic on the word "rate". The regex
lives at `packages/core/src/gh/errors.ts:197`. Do not loosen it.

---

## Resuming a partial batch

When a batch fails part-way, the property that matters is **exactly-once across
the union of all attempts** — not "name the remaining items".

A plan that names the right remainder still corrupts the run if re-invoking
re-emits the already-processed items: that duplicates issues. `planResume`
(`packages/core/src/gh/resume.ts`) is therefore built around a **stable item
identity**, not a count, so the remainder is a provable slice of the original
array rather than a number two invocations could compute differently.

### Backoff

The constants are exported and named:

| Constant | Location |
|---|---|
| base delay | `packages/core/src/gh/resume.ts:54` |
| multiplier | `packages/core/src/gh/resume.ts:59` |
| cap | `packages/core/src/gh/resume.ts:69` |
| max attempts | `packages/core/src/gh/resume.ts:78` |

**They are invented, and the module says so.** No upstream source specified
them. Read them from the module; a skill body that restates the numbers creates
a second copy that will drift.

The planner returns delays. **It does not sleep** — the adapter does.

---

## Racing label edits

A label transition read-then-write can race another writer. The transition is
issued as a **single command** adding and removing together, which closes the
window in which an issue carries two mutually exclusive labels or none.

If a transition appears to have had no effect, **re-read the labels** before
re-issuing. A no-op transition is skipped by design, and cannot be distinguished
from a lost write without a read. See `references/gh-operations.md`.

---

## Transient failures are common, and quiet

Observed in a single session:

- three `gh` calls failing with a connection error, each succeeding on immediate
  retry — an `issue comment`, a `pr ready`, and a script that shells out to `gh`;
- `gh pr ready` printing **nothing** and leaving the PR a draft;
- a script reporting `gh` was not authenticated while `gh auth status` returned
  success in the same shell.

**Retry once before believing a failure, and re-read state before believing a
success.** Never redirect stderr on a mutating command — it is where `gh` puts
the reason.

---

## What this document does not own

- **Which argv to build** — `references/gh-operations.md`.
- **What the labels mean** — `references/workflow-states.md`.
- **Whether the work was correct** — `references/verification.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| This layer decides; it does not sleep or re-invoke | `packages/core/src/gh/resume.ts:5-10` | confirmed |
| Exit taxonomy carries `observed` / `assumed` provenance | `packages/core/src/gh/errors.ts:78` | confirmed — constant named, not restated |
| Success classified `fatal` so a careless caller fails safe | `packages/core/src/gh/errors.ts:78` | confirmed |
| Three rate-limit states, absent header read conservatively | `packages/core/src/gh/errors.ts:217` | confirmed |
| Secondary limit matched as a documented phrase, not a heuristic | `packages/core/src/gh/errors.ts:197` | confirmed |
| Backoff constants are invented, not sourced | `packages/core/src/gh/resume.ts:26` | **carried** — no upstream authority exists; owner: this repository |
| Exactly-once across the union is the property | `packages/core/src/gh/resume.ts:12-22` | confirmed |
