# Model Routing

**Contract.** Category → model chain → reasoning level → fallbacks.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:58`.

> **This is the only document in `skills/`, `agents/` or `references/` permitted
> to contain a literal model ID.** `CLAIM-35.3`, as restated by Decision 1 of
> `docs/design/stories/35.md`. Everywhere else, name the category.

---

## Agents never name a model

They name a **category**. The category is resolved to a host-specific model ID
at install time and, on opencode, again at runtime via `chat.params`
(`docs/design/02-roles.md:541-543`).

**This is the whole point of the layer.** Model churn is then a routing-table
edit, not a sweep through every agent definition. A domain pack never names a
model at all.

---

## The categories

Transcribed from `docs/design/02-roles.md:547-553`, which is authoritative.

| Category | Used by | Reasoning | Claude Code | opencode |
|---|---|---|---|---|
| `plan` | `iai-conductor`, `iai-planner` | high — long horizon, decomposition, sizing | `opus` | `amd-anthropic/Claude-Opus-5` |
| `deep` | `iai-executor`, `iai-oracle`, `dev-coder` | high — implementation, root-cause work | `sonnet` | `amd-anthropic/Claude-Sonnet-5` |
| `quick` | `status`, `checkpoint`, label ops, sentinel parsing | low — mechanical, high volume | `haiku` | `amd-unified/gpt-5.4-mini` |
| `critic` | `iai-critic`, `iai-validator` | high — adversarial, must be cross-vendor | `opus` | `amd-unified/gpt-5.6-sol` |
| `quant` | `quant-analyst`, `risk-officer` | high — numerical rigour | `opus` | `amd-unified/gpt-5.6-terra` (analyst) / `amd-anthropic/Claude-Opus-5` (officer) |
| `write` | `scribe`, `health-analyst`, `wealth-steward` | medium — prose quality, careful hedging | `sonnet` | `amd-unified/gpt-5.6-luna` |
| `search` | `iai-librarian`, `iai-researcher` | low — retrieval, breadth over depth | `haiku` | `amd-unified/gemini-3.5-flash` |

**Category is what kind of work; skill is what tools and knowledge.** The two are
orthogonal, and collapsing them is how a routing table becomes a second agent
registry.

---

## The cross-vendor rule

> **The critic and the validator SHOULD run on a different vendor from the
> proposer wherever the roster allows it.**

`docs/design/02-roles.md:555-560`. A critic sharing a vendor with the proposer
inherits its blind spots, and an adversarial review that agrees for structural
reasons is not a review.

Note the `quant` row: the analyst and the officer are deliberately on **different
vendors**, because the officer's job is to refuse the analyst.

---

## `deepwork`

The escalation keyword. It raises the routing category and the reasoning level
for the current turn.

It is renamed from the upstream `ultrawork` specifically to avoid colliding when
both plugins are installed on the same host (`docs/design/00-synthesis.md`, the
oh-my-opencode table). **Do not restore the upstream name for familiarity** — the
collision is silent, and the symptom is another tool's handler firing.

---

## Where the resolver lives, and why it does not exist yet

`packages/core/src/routing/` is the resolver. **It is an M3/S3.1 build target and
does not exist in the tree today.**

Two consequences that a reader will otherwise trip over:

1. **`CLAIM-35.3`'s exemption clause is vacuous for all of M2.** The claim as
   seeded exempts files under `packages/core/src/routing`; there are none,
   because the directory is not yet created. Decision 1 restated the claim to
   scope the ban to the authored surface instead — `skills/`, `agents/`,
   `references/` — which is why this document is the named exception rather than
   one of several.
2. **`packages/core/src/guards/path-allowlist.ts` records that path as
   milestone `M2`, which is wrong.** It is M3's. Recorded as Problem 2 of
   `docs/design/stories/35.md`; owner is M3 and the allow-list note.

Until M3, nothing resolves a category at runtime. The table above is the
specification the resolver will implement, not a description of shipped code.

---

## Model IDs are permitted here and nowhere else — including in prose

The ban is on the **authored surface**, not on the whole tree. Seven design
documents and two guard files legitimately contain literal model IDs today: the
guards use one as the canonical false-positive fixture for path detection, and
the design documents are the source this table is transcribed from.

That is why the restated `CLAIM-35.3` names `skills/`, `agents/` and
`references/` rather than "no file outside the resolver". The original wording
was **false at HEAD** when the Story was written, and
`docs/design/verification-pass.md:192` had already verdicted the identical
assertion `corrected`.

---

## What this document does not own

- **What may be sent to a model at all** — `references/data-classification.md`.
  Routing decides *which* model; classification decides *whether any*.
- **Who may spawn whom** — the delegation graph, M3.
- **Agent definitions** — `agents/`, M3.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Agents name a category, never a model | `docs/design/02-roles.md:541-543` | confirmed |
| The seven categories and their model chains | `docs/design/02-roles.md:547-553` | confirmed — transcribed, this being the one document permitted to |
| Cross-vendor rule for critic and validator | `docs/design/02-roles.md:555-560` | confirmed |
| `deepwork` renamed from `ultrawork` to avoid collision | `docs/design/00-synthesis.md` | confirmed |
| `packages/core/src/routing` resolves category → model | `docs/design/02-roles.md:541-543` | **carried** — the directory does not exist; M3/S3.1 build target |
| The allow-list records `packages/core/src/routing` as `M2` | `packages/core/src/guards/path-allowlist.ts` | **carried, wrong milestone** — it is M3's. Problem 2 of `docs/design/stories/35.md`; owner M3 |
| `CLAIM-35.3` as seeded is false at HEAD | `docs/design/verification-pass.md:192` verdicts it `corrected` | **resolved** by Decision 1 — ban scoped to the authored surface |
