# Workflow States

**Contract.** The label state machine, and how a transition is performed.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:62`.

---

## Labels are the state. There is no other store.

iAI keeps no database and no state file. **GitHub labels are the state**, which
is why they are read before every action rather than remembered.

Four namespaces are in use: `type:`, `status:`, `domain:` and `rung:`, plus
`gate:` for the design-approval gate.

---

## Mutual exclusivity

**Three namespaces are mutually exclusive: an issue carries at most one label
from each.** The authoritative list is the exported constant at
`packages/core/src/gh/labels.ts:54`. Read it; do not restate it in a skill body,
because a second copy is how the two drift.

`type:` is also effectively single-valued in practice, but it is not enforced by
that constant — it is set once at creation and not transitioned.

### The `status:` states

| State | Meaning |
|---|---|
| in progress | actively being worked |
| resolved | work complete, awaiting closure |
| reopened | was resolved, then regressed or was rejected |
| blocked | cannot proceed; **the blocker is named in a comment** |

Defined with their colours at `docs/design/03-workflow.md:107-110`, and the
open/closed lifecycle at `:191-193`.

**`blocked` without a named blocker is not a state, it is a shrug.** The comment
is part of the transition, not an optional courtesy.

---

## A transition is ONE command

```bash
gh issue edit <N> --add-label <new> --remove-label <old>
```

**Both flags in the same invocation.** Never two commands.
`docs/design/03-workflow.md:168` states this directly, and the reason is a
window: between two commands the issue carries either two mutually exclusive
labels or none, and anything reading state in that window reads a lie.

`planLabelTransition` at `packages/core/src/gh/labels.ts:71` builds the argv. It
takes the **current labels as a value**, because this layer will not guess them —
see `references/gh-operations.md`.

### A no-op transition is skipped, not re-issued

If the label is already correct the transition is skipped by design. The
consequence: **a skipped transition and a lost write look identical from the
outside.** If a transition appears to have had no effect, re-read the labels
before re-issuing. Retrying blind is how a race becomes a corruption.

---

## The Story flip is automatic, and it is the one state nobody sets

When the last task resolves, the Story gains `status:resolved` — step 8 of
`docs/design/03-workflow.md:22`, marked *(automatic)*.

**Nothing in M1 or M2 implements that automation.** It is performed by hand
during the bootstrap window, like the rest of the loop. A skill must therefore
**verify the Story's state rather than assume the flip happened**, and this stays
true until the closure verbs land.

---

## Gates are a separate namespace, and they block

`gate:pending` plus the `gate` sentinel comment; cleared only by a human decision
recorded as `gate:approved`.

The sentinel's name is `gate`; its heading prefix is the namespace constant
exported at `packages/core/src/evidence/sentinel.ts:53`, and the nine legal
names are the union at `:23-32`. **This document deliberately does not write the
prefix out.** `NEVER-35.7` forbids a reference from restating a constant
`packages/core` exports, and the namespace belongs to
`references/evidence-artifacts.md` in any case.

**Gates block; they never warn-and-continue.** Two properties that are easy to
erode:

- **One gate, one comment.** Update the existing sentinel in place; do not stack
  a second. Verify the comment count is unchanged afterwards.
- **An agent may never author a decision** (`docs/design/03-workflow.md:271`).
  Relay it, attribute it to the human decider, and state that iAI did not
  originate it.

The enforcement mechanism — the `permission.ask` hook — is **M3**, not M2. Until
then a gate blocks because the operator honours it, not because anything stops
them. That is a real gap, not a formality.

---

## What this document does not own

- **The argv** — `references/gh-operations.md`.
- **A racing or failed edit** — `references/gh-error-handling.md`.
- **What justifies a transition** — `references/verification.md`. Evidence
  precedes the label.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Labels are the state; no other store | `docs/design/03-workflow.md:53-76` | confirmed |
| Three mutually exclusive namespaces | `packages/core/src/gh/labels.ts:54` | confirmed — **constant named, not restated** |
| Four `status:` states and their meanings | `docs/design/03-workflow.md:107-110`, `:191-193` | confirmed |
| A transition is one command with both flags | `docs/design/03-workflow.md:168` | confirmed |
| A no-op transition is skipped | `packages/core/src/gh/labels.ts:71` | confirmed |
| The Story flip at step 8 is automatic | `docs/design/03-workflow.md:22` | **carried** — nothing implements it; performed by hand through the bootstrap window. Owner: M2 closure verbs (S2.4) |
| Gates block via `permission.ask` | `docs/design/03-workflow.md:271`; mechanism is M3 | **carried** — honoured by discipline until M3. Owner: M3 gate engine |
