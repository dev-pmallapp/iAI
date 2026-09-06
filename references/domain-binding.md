# Domain Binding

**Contract.** The interface a domain pack implements, and what makes it loadable.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:59`.

---

## The point of the abstraction

iAI's lifecycle is domain-agnostic. **A domain pack supplies values; it never
supplies control flow.** The kernel does not know what `trade` or `health` means
— it knows how to read a binding.

The test of that claim is mechanical: a domain must be registerable **without
editing any file under `packages/core/src`** (`CLAIM-31.3`), and a lint rule
forbids `packages/core` from importing a domain pack at all.

---

## The interface

Declared in `packages/core/src/binding/domain.ts`. Read the module; the shapes
are not reproduced here.

| Type | Line | Carries |
|---|---|---|
| `DomainBinding` | `:223` | the whole binding |
| `LabelDef` | `:95` | a label's name and colour |
| `UnitSpec` | `:111` | what one unit of work is, and sizing thresholds |
| `Rung` | `:142` | one step of the domain's verification ladder |
| `RungVerifier` | `:125` | `tool-checked` / `model-judged` / `human-attested` |
| `VerifySpec` | `:164` | the rung ladder and whether evidence is required |
| `GateSpec` | `:192` | which actions need a human, and the kill switch |
| `EvidenceSpec` | `:209` | the sentinel and artifact path template |

Domain ids: the known five at `:62`, the open type at `:66`, the array at `:73`.

### The id union is open, deliberately

`DomainId` is the known set **plus any string**. This resolves a conflict that was
otherwise unsatisfiable: `CLAIM-31.1` requires the closed five-member union while
`CLAIM-31.3` requires a sixth domain to register without editing core — and the
fixture binding used to prove it has no legal id under a closed union at all.

Decision 1 of `docs/design/stories/31.md` records the reasoning and the three
rejected alternatives. Autocomplete still offers the five.

---

## The registry is constructed, not mutated

`createRegistry` at `packages/core/src/binding/registry.ts:58` takes a list of
bindings and returns a registry. There is **no `register()` and no module-level
map to append to.**

| Function | Line |
|---|---|
| `createRegistry` | `:58` |
| `registeredDomainIds` | `:82` |
| `resolveBinding` | `:104` |

Three properties follow, and each was chosen against an alternative:

**Registration is a pure construction.** Every module in the kernel is a pure
function; a mutable singleton would break that and make the registry
order-dependent.

**Validation happens at registration, so resolution is total.** A binding that
fails validation produces no registry — there is no path that registers an
invalid binding and rejects it afterwards (`NEVER-31.9`).

**The registry is enumerable**, because a later milestone needs to render one
surface per domain.

> **This was a live contradiction and has been fixed.** `CONTRIBUTING.md:303`
> once instructed a pack to register itself by editing
> `packages/core/src/binding/registry.ts`, while `CLAIM-111.1`
> (`docs/milestones/M5.md:82-85`) fails the build if a story branch touches that
> directory. Decision 2 of `docs/design/stories/31.md` resolved it in M5's favour
> **and corrected the checklist**: `CONTRIBUTING.md:303-312` now says to add the
> pack to the composition root's binding list and explicitly not to edit
> `registry.ts`.
>
> Cited here because the *reasoning* still matters — a pack author reaching for a
> `register()` will not find one, and should know that is deliberate.

---

## What makes a binding loadable

Validation is `validateBinding` at `packages/core/src/binding/validate.ts:251`.
The rules that most often bite:

- **The id and the label namespace must agree.** `domainLabelFor` at `:246`
  derives the label; a binding whose declared namespace disagrees is rejected.
- **Ids must be unique** across the supplied list.
- **The sentinel must be one of the nine known names**, not merely inside the
  namespace — see `references/evidence-artifacts.md`.
- **A path template is only legal for an artifact-bearing sentinel.**
- **`evidenceRequired` must be true**, and the first rung must be reversible.
  Both are literal types, so a well-typed pack cannot violate them; the runtime
  checks exist for JavaScript packs, `JSON.parse` and casts, and are unreachable
  from TypeScript. That is deliberate, not dead code.

Failures return a reason, never a partial binding. Every rejection names **which**
rule it violated — a single generic "invalid binding" would make the failures
indistinguishable, which is the defect `docs/evidence/33-...md` records three
mutations surviving behind.

---

## Known divergences, carried with owners

This document describes a shipped interface that **disagrees with the design
documents in six recorded places.** None is a defect in the code; each is a
conflict with a named owner, per Decision 6 of `docs/design/stories/35.md`.

| # | Divergence | Owner |
|---|---|---|
| 1 | **`Rung` is declared twice.** `packages/core/src/guards/risk-mandate.ts:13` is a three-member union where `docs/design/03-workflow.md:125-126` requires four rungs per domain, so `checkRiskMandate` cannot express one of them | M6 |
| 2 | **`GateSpec.killSwitch` and `docs/design/09-security.md:355-362` disagree in four domains of five.** One declares a switch where the inventory says the control is capability absence; another omits one the inventory supplies | each pack's Story |
| 3 | **`vetoAgent` names agents that `docs/design/02-roles.md` grants no veto** in three of five packs — one of them a Ring 1 advisor that cannot be assigned work | M3, and each pack |
| 4 | **The binding has no `repo` field**, though `docs/design/09-security.md:323-327` says the domain binding carries the repo | M5, at the first private domain |
| 5 | **Sizing thresholds are prose, not values.** `UnitSpec`'s min/max are described by four documents as thresholds the binding supplies; the declared type is a sentence, so sizing is model-judged rather than tool-checked | M2 |
| 6 | **Where the binding physically lives is unresolved.** Nine citations say `skills/<id>/domain.md`; four say `packages/domain-<id>/src/binding.ts`; `docs/milestones/M4.md:56` says both in one row | M4 |

**Do not "tidy" any of these.** Each is recorded with its reasoning in
`docs/design/stories/31.md`; changing the code to match one document would break
its agreement with another.

---

## What this document does not own

- **What a rung *means* in a domain** — the pack's own Design.
- **The sentinel namespace** — `references/evidence-artifacts.md`.
- **The label state machine** — `references/workflow-states.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Eight interface types and their fields | `packages/core/src/binding/domain.ts` | confirmed — **module and lines named; no shape copied** |
| The id union is open | Decision 1 of `docs/design/stories/31.md` | confirmed — records the conflict it resolves |
| Registry is constructed, not mutated; validation precedes registration | `packages/core/src/binding/registry.ts:58`, `NEVER-31.9` | confirmed |
| `CONTRIBUTING.md:303` once instructed editing `registry.ts`, contradicting `CLAIM-111.1` | `CONTRIBUTING.md:303-312` | **resolved and already fixed.** Decision 2 of `docs/design/stories/31.md` corrected the checklist in that Story; the current text names the composition root and forbids editing `registry.ts`. **This document's first draft described the pre-fix state as current — caught by resolving the citation rather than trusting the finding list** |
| A domain registers without editing `packages/core/src` | `CLAIM-31.3`, enforced by `no-domain-pack-import` | confirmed |
| Six divergences between the shipped interface and the design documents | table above; `docs/design/stories/31.md` | **all carried with named owners** — zero *unowned*, per Decision 6 of `docs/design/stories/35.md` |
