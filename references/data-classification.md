# Data Classification

**Contract.** The four levels, what falls in each, and what may leave the machine.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:57`.

---

## The four levels

Declared as a type at `packages/core/src/classify/levels.ts:5`, with the rank
order and the comparison helpers in the same module (`rankOf` at `:14`,
`maxClass` at `:18`). The rank map itself is not reproduced here; read it.

| Class | Contains | May reach a cloud model? |
|---|---|---|
| `PUBLIC` | ticker symbols, market prices, published papers, open-source code, public issues | yes |
| `INTERNAL` | project code, design documents, test plans, evidence artifacts, work state | yes |
| `PRIVATE` | health and lab results, biomarker values, wearable streams, open positions and quantities, balances, transaction history, clinician notes | **never** |
| `SECRET` | API keys, broker credentials, OAuth tokens, session cookies, `.env` contents, private keys | **never** |

The full inventory with examples is at `docs/design/09-security.md:47-52`.

### The two absolutes

> **`SECRET` never enters a prompt. Ever.** No opt-in, no override, no
> "just this once".

> **`PRIVATE` never reaches a cloud model.** No per-session opt-in admits it,
> and de-identification does not either — a de-identified projection is retained
> for **local** rendering only, never as a cloud-egress path.

These are stated as absolutes because they are enforced as absolutes. A skill
that offers the user a way around either is a defect.

---

## Classification takes the maximum, never a partial

`classify` resolves a whole structure to **the highest level any part of it
reaches**. It never returns a per-field or partial result.

A summary containing one biomarker value is `PRIVATE` **in its entirety** — not
"mostly `INTERNAL`". This is `CLAIM-15.1`, and the reasoning is at
`docs/design/09-security.md:44-45`.

**The practical consequence:** you cannot redact your way to a lower class by
mixing. Sensitivity is a property of the payload, not of its majority.

Entry points, all in `packages/core/src/classify/`:

| Function | Answers |
|---|---|
| `classify` | what class is this whole structure |
| `classifyPath` | what class does this path imply |
| `classifyKeyName` | does this field name imply a class |
| `classifySecretShape` | does this *value* look like a credential |

The last two return a class **or null**, so "not recognised" is distinguishable
from "recognised as `PUBLIC`". Conflating them is how a `SECRET` becomes a
default.

---

## `USER/` is a symlink, and everything under it is at least `PRIVATE`

`USER/` in the public tree is a **symlink into a separate private repository**,
and the symlink itself is gitignored (`docs/design/09-security.md:303-319`).

> **An unclassified file under `USER/` is treated as `PRIVATE`, never as
> `INTERNAL`.** `docs/design/09-security.md:72`. It is a fail-safe: the default
> must be the stricter class, because the failure of guessing low is
> unrecoverable and the failure of guessing high is an inconvenience.

`PRIVATE` content lives under `USER/` only. Never in the public repo, never in a
commit.

---

## The `last_4` rule

Account numbers are recorded as **the last four digits only** — never the full
number, in any file, any issue, or any model context.

This is a `PRIVATE`-class rule enforced by `guards/`, **not a convention**
(`docs/design/00-synthesis.md:39`). A full account number in a file that expects
`last_4` is a `SECRET`-class leak, not a formatting error
(`docs/design/05-domain-trading.md:418`).

The related affordance: monetary fields are typed as **strings**, so a partially
redacted budget with `$X,XXX` placeholders still validates. That looks like
sloppiness until you see it is what lets a user commit a redacted file at all.

---

## The egress gate

`checkEgress` at `packages/core/src/guards/egress.ts:186` decides whether a
payload may reach a destination. Three properties matter:

**Consent is withheld by default.** The parameter defaults to the frozen
`CONSENT_WITHHELD` value at `:106`. A caller that forgets to pass consent gets
the safe answer, not the permissive one.

**It cannot throw.** The whole body is wrapped, and an internal error returns a
**block**, not an exception. A gate that throws is a gate that a `catch` upstream
can turn into an allow.

**It is a decision, not an action.** The gate answers; it does not send. Nothing
in this layer performs I/O.

---

## What this document does not own

- **Model IDs and routing** — `references/model-routing.md`.
- **Which `gh` call carries a payload** — `references/gh-operations.md`.
- **Whether a claim about a payload was verified** — `references/verification.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Four levels, ranked | `packages/core/src/classify/levels.ts:5`, `:14`, `:18` | confirmed — **module named; the rank map is not copied**. The four names are used because defining them is this document's assigned job (`01-skill-hierarchy.md:57`) |
| Classification takes the maximum | `docs/design/09-security.md:44-45`, `CLAIM-15.1` | confirmed |
| `SECRET` never in a prompt; `PRIVATE` never to a cloud model | `docs/design/09-security.md:47-52` | confirmed |
| `USER/` is a symlink; unclassified under it is `PRIVATE` | `docs/design/09-security.md:72`, `:303-319` | confirmed |
| `last_4` only, enforced by `guards/` not convention | `docs/design/00-synthesis.md:39`, `docs/design/05-domain-trading.md:418` | confirmed |
| Egress consent withheld by default; the gate cannot throw | `packages/core/src/guards/egress.ts:106`, `:186` | confirmed |
| `GateSpec.killSwitch` disagrees with the security inventory in four domains of five | `docs/design/stories/31.md` Problem 7 | **carried** — owner: each pack's Story. Not a `data-classification` defect, but it is the inventory this document cites |
