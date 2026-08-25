# Synthesis — what we take, what we drop

Three sources, one system. The README layer table assigns each source exactly one
layer, and this document is the line-by-line accounting behind that table:

| Source | Layer it contributes | Question it answers |
|--------|----------------------|---------------------|
| **LifeOS** | **Intent** — TELOS, Current→Ideal State, ISA, Cortex memory | *Why am I doing this, and what does "done" look like?* |
| **forge / gh-workflow** | **Execution** — Milestone→Story→Task on GitHub, gates, traceability | *How is work tracked, and how do I prove it happened?* |
| **oh-my-opencode** | **Runtime** — category-based model routing, agent roster, hook composer | *Who runs it, on which model, with what guardrails?* |

Read this document as a merge conflict resolution log. Where two sources overlap,
one wins and the other is explicitly dropped; nothing is silently merged. Every
KEEP below implies a build target in `ARCHITECTURE.md`; every DROP is a
non-goal you may cite when someone asks why iAI does not do a thing.

Verdicts use three values only:

| Verdict | Meaning |
|---------|---------|
| **KEEP** | Taken substantially as-is; behaviour is preserved, names may change |
| **ADAPT** | Concept survives, implementation is rewritten or scoped down |
| **DROP** | Not built. `DEFER` is a DROP with a milestone attached |

---

## From LifeOS

| Component | Verdict | Rationale |
|-----------|---------|-----------|
| **TELOS** — mission, problems, goals, strategies, beliefs, IDs `M0`/`P0`/`G0`/`S0` | **KEEP** | This is the intent root of the whole system. A Story with no path back to a `G0` is unjustified work. `iai-core/intent/` parses TELOS and `goal-create` maps a `G0` to a GitHub Milestone. The ID scheme is preserved verbatim so existing LifeOS TELOS files load unchanged |
| **Current State → Ideal State** — 7 UPPERCASE dimensions `HEALTH`, `MONEY`, `FREEDOM`, `CREATIVE`, `RELATIONSHIPS`, `RHYTHMS`, `INFRASTRUCTURE`; `IDEAL pct = 100 - (TBD count x 10)`; `CURRENT pct = (have + 0.5*partial) / (have + partial + missing) * 100` | **KEEP** | The only quantitative measure of intent completeness that either source project has. Both formulas are kept exactly — they are cheap, explainable, and stable across reruns. The 7 dimensions become the top-level grouping in `/iai:status`. Note `HEALTH` and `MONEY` map onto the `health` and `wealth` domain packs, which gives the packs a natural scoreboard |
| **The Algorithm v8.20.2** — 7-phase hill-climb loop | **ADAPT** | This becomes our universal loop, but re-expressed as forge phases so there is exactly one state machine, not two. The hill-climb shape (assess → propose → act → measure → keep-or-revert) is preserved; the phase names are replaced by `design → test-plan → task → do → verify → close`. The version number is dropped — our loop version is the plugin version |
| **ISA / Ideal State Artifact v2.21.0** — YAML frontmatter (`phase`, `progress`, `task`, `slug`), 17 fixed body sections, claims as `- [ ] ISC-N:` checkboxes with `(after: ID)` dependencies, Test Strategy table with `anchors_to` / `severity` / `tier`, three verifier classes `deterministic` / `judged` / `attested` | **KEEP** | This *is* our Story design doc. It is strictly better than forge's freeform `design-doc.md` because ISC claims are addressable, dependency-ordered and machine-checkable. The three verifier classes are the reason ISA generalises past code: `deterministic` covers dev and wealth reconciliation, `judged` covers `know` distillation, `attested` covers health protocol adherence where no automated check exists. Stored at `docs/design/{issue}-isa.md` per the ARCHITECTURE data model |
| **Cortex memory** — `MEMORY/`, `KNOWLEDGE/{People,Companies,Ideas,Research}`, BM25 with no vector DB, tiers A/B/C, typed items `memory` / `idea` / `knowledge` / `proposal` | **ADAPT** | Scoped down hard. The filesystem-as-index principle is load-bearing and kept (ARCHITECTURE: "Filesystem + GitHub. No database."). The A/B/C tiering and the four item types survive. The `KNOWLEDGE/{People,Companies}` CRM surface does not — it has no consumer in the five domains. What remains is "Cortex-lite": `MEMORY/**` as markdown plus append-only JSONL, read by `learn` and `resume`, optional at install time |
| **Pulse daemon `:31337` + Next.js Observability** | **ADAPT** | Becomes `iai-pulse`, a read-only optional sidecar on the same port. It renders GitHub state, the ISA tree and per-domain surfaces. It never writes. If it is absent, `/iai:status` is the text-mode equivalent and nothing degrades. The Next.js observability app is rebuilt rather than ported, because it is coupled to LifeOS paths |
| **Hook system** — 56 hooks including `EgressClassGuard`, `VerificationGate`, `ModelRungGuard`, `SpendAuditor`, `LoopDetector`, `FormatGate` | **ADAPT** | We take roughly ten of these as *concepts*, not code — LifeOS hooks are Claude Code external processes and cannot run in opencode. The survivors are `EgressClassGuard` (becomes `guards/checkEgress`), `VerificationGate` (becomes the disk re-read rule), `ModelRungGuard` (becomes `routing/` plus the trading rung check), `SpendAuditor` (becomes `guards/checkSpend`), `LoopDetector`, and `FormatGate` (becomes the commit-prefix and frontmatter linters). The other ~46 are LifeOS-specific and dropped |
| **healthsync** — `oura.ts`, `eightsleep.ts`, `apple.ts`, `function.ts` (labs), `hae.ts` | **KEEP** | This is the health pack's entire ingestion layer and it already works. Five connectors, no rewrite. They become the source side of `health/ingest`, writing into `USER/HEALTH/` under the declared schema. This is the single largest piece of working code we inherit |
| **FINANCES yaml schema** — 9 object types (`overview`, `income_source`, `expense`, `investment_account`, `account`, `goal`, `tax_profile`, `obligation`, `vendor`); monetary fields are **strings** so `$X,XXX` placeholders validate; `last_4` only, never full account numbers | **KEEP** | Adopted unchanged for the wealth pack. The string-money rule looks wrong until you realise it is what lets a user commit a partially redacted budget — it is a privacy affordance, not sloppiness. The `last_4`-only rule is a `PRIVATE` classification rule enforced by `guards/`, not a convention |
| **Fabric** — 315 prompt pattern files | **DROP** | Out of scope. It is a prompt library, not a workflow system, and it duplicates what Tier-2 leaf skills do with worse traceability. Users who want Fabric can keep running Fabric |
| **Voice / ElevenLabs** | **DROP** | No workflow surface. Adds a cloud egress path through which `PRIVATE` health data could leak, for zero loop value |
| **Hermes sidecar** | **DROP** | Superseded by `iai-pulse`. Two sidecars is one too many |
| **Custom Spinner Verbs, Custom Tooltips** | **DROP** | Claude-Code-only cosmetics. They cannot exist on the opencode target, so shipping them breaks the single-source-of-truth rule for zero function |
| **Helm terminal** | **DROP** | A terminal UI competing with two host TUIs we do not control |
| **Atlas asset graph** | **DEFER** | Interesting for `know` provenance graphs, but the `know` pack ships with citations and contradiction checks first. Revisit after the `know` pack is real |
| **Arbol** | **DEFER** | Tree-structured exploration overlaps with Team Mode worktrees; decide both together at M8, not separately |
| **Bunker** | **DEFER** | Its secrets-vault role is covered for now by the `.env`-only rule plus the `cat`/`grep`/`rg` deny-list in ARCHITECTURE. Reconsider only if the trading pack needs live broker credentials |
| **Daemon** | **DROP** | Background autonomy conflicts directly with the three "never" rules. Nothing irreversible may happen without a human in the loop, so a general-purpose daemon has no safe mandate |
| **Synapse** | **DROP** | Overlaps Cortex-lite. One memory system |
| **Constitutional rule: Output Format** | **DROP** | Host-specific formatting policy. Our equivalent is `FormatGate` on artifacts, not on chat output |
| **Constitutional rule: Verification** | **KEEP** | Promoted to a cross-cutting concern in ARCHITECTURE: never trust conversation memory, re-read disk and GitHub before acting. This is the same rule as forge's ephemerality doctrine arriving from the other direction |
| **Constitutional rule: `~/.claude` is PRIVATE** | **KEEP** | Generalised into the four-level classification `PUBLIC` / `INTERNAL` / `PRIVATE` / `SECRET` in `classify/`, and into the `USER/` symlink-into-a-private-store pattern. The public repo holds code, skills and templates only |
| **Constitutional rule: Security Protocol** | **DROP** | Absorbed. Its content is now split across `classify/`, `guards/checkEgress` and the secrets rule, where each part is testable |

### LifeOS has no trading

Grep of the LifeOS tree confirms **zero** broker integration, zero ticker
resolution, zero portfolio quote code, and no market data client of any kind.
`INVESTMENTS.md` is a static, hand-maintained markdown list of holdings — a
document, not a system. There is nothing to port.

Therefore the **entire trading domain is net-new** and must be built from
scratch: thesis capture, screening, backtesting, the risk mandate, paper
execution, live order gating, the kill switch, the trade journal and the
post-mortem. This is the largest greenfield area of the plan and should be
sequenced accordingly — it carries both the most new code and the only
irreversible money-moving action in the system.

---

## From forge (gh-workflow)

| Component | Verdict | Rationale |
|-----------|---------|-----------|
| **Milestone = Epic / Story / Task sub-issue hierarchy** | **KEEP, generalised** | The core thesis of iAI: this decomposition is not specific to software. Milestone carries the feature table, Story is one end-to-end deliverable outcome, Task is one unit of work. Only the *definition of a unit* varies by domain, and that is exactly what `DomainBinding.unitOfWork` supplies |
| **Label set** — `type:epic`, `type:story`, `type:task`, `type:bug`; `status:in-progress`, `status:resolved`, `status:reopened`, `status:blocked` | **KEEP and extend** | Kept verbatim, plus a `domain:` namespace (`domain:dev`, `domain:trade`, `domain:health`, `domain:wealth`, `domain:know`). The `domain:` label is the routing key the Tier-1 verbs read to pick a binding — it is the single most important addition we make to forge's schema |
| **State machine** — labels are the source of truth; at most one `status:` label at a time; transitions are a single `gh issue edit --add-label X --remove-label Y` | **KEEP** | Atomicity matters more than elegance. One command means no window in which an issue has two status labels or none. "Labels are the source of truth" is repeated in the ARCHITECTURE data model as the work-state row |
| **Branch and PR model** — `story/{n}-{slug}`, `task/{n}-{slug}`, task PRs target the story branch, one integration PR per story | **KEEP** | Gives every Task an independently reviewable diff while keeping one merge decision per Story. Preserved unchanged in `references/branch-and-pr-model.md` |
| **Gotcha: `Closes #N` only fires on merge to the DEFAULT branch** | **KEEP as a documented hazard** | Task PRs merge into the story branch, not `main`, so `Closes #N` in a task PR body **does not** auto-close the task. Tasks are closed explicitly by `task-verify` after evidence is on disk. This is written into `references/gh-operations.md` because it is the single most common way a naive implementation silently corrupts state |
| **Artifact / sentinel two-surface model** — `## forge-design-doc` style sentinel comments, 65536 char hard limit with a 60000 budget, SHA-pinned permalinks | **KEEP, renamed** | Big content lives on disk in git; the issue carries a short sentinel comment pointing at a SHA-pinned permalink. This is what makes evidence durable and reviewable. Sentinels are renamed to the `## iai-*` namespace (`## iai-isa`, `## iai-test-plan`, `## iai-evidence`). Budget stays 60000 against the 65536 limit |
| **References-hold-contracts principle** | **KEEP** | Recorded as a design decision in ARCHITECTURE: 20 self-contained skills carrying 20 copies of a contract drift within a month. Contracts live in `references/`, workflows live in skills. This also has a context-budget benefit — see `01-skill-hierarchy.md` |
| **The 3 agents** | **ADAPT** | forge's three-agent roster is too small for five domains and a veto role. It expands into the three-ring roster in `02-roles.md`; the *separation-of-duties* principle behind it ("forge never audits work forge built") is kept absolutely |
| **The 6 hooks** | **ADAPT** | Concepts kept, implementations rewritten twice — once per host — because forge hooks are Claude Code external processes. They merge with the ~10 surviving LifeOS hook concepts into one `guards/` module of pure predicates |
| **No config file — root docs carry the info** | **KEEP** | An explicit ARCHITECTURE design decision, with `iai-config.yaml` named as the rejected alternative. `ARCHITECTURE.md` carries `## Build Targets`, `CONTRIBUTING.md` carries `## Commands`, milestone docs carry `\| Feature \| Description \|` tables. Machine-readable and human-useful at once |
| **Idempotency doctrine** | **KEEP** | Every skill re-runs safely: detect current state, address only the gaps. Listed as a cross-cutting concern. This is what makes `resume` possible at all |
| **Ephemerality doctrine** — "never assume files exist based on conversation context" | **KEEP** | Identical in force to LifeOS's Verification rule. Stated once, in `references/verification.md`, and cited by every skill that reads or writes |
| **The 20 skills** | **ADAPT** | Recognisable but re-tiered. forge's flat 20 become Tier 1's 14 domain-agnostic verbs plus Tier 2 leaves. Direct correspondences: `task-implement` → `task-do`, `story-test` → `story-verify`, `enhance-debugger` → `learn` |

### Renames

| forge | iAI |
|-------|-----|
| `/forge:` command namespace | `/iai:` |
| `## forge-design-doc` sentinel | `## iai-isa` |
| `## forge-test-plan` sentinel | `## iai-test-plan` |
| `## forge-evidence` sentinel | `## iai-evidence` |
| `task-implement` | `task-do` |
| `story-test` | `story-verify` |
| `enhance-debugger` | `learn` |

forge is a design input, not a dependency. Everything above is the record of it
being **incorporated at design time** — it is never installed as a plugin and no
`/forge:` command is ever invoked. `~/tmp/gh-workflow` stays on disk read-only,
pinned, as the reconciliation source for S1.1 and the parity target for S4.5.

This plan is self-hosting, so the bootstrap window is executed by hand: the
Tier-1 verbs only exist once **M2** ships them, and until then the loop in
`03-workflow.md` is followed manually rather than delegated to another tool.

---

## From oh-my-opencode

| Component | Verdict | Rationale |
|-----------|---------|-----------|
| **The CATEGORY system** — `category`, not `subagent_type`; built-ins `visual-engineering`, `ultrabrain`, `deep`, `artistry`, `quick`, `writing`; the rule *"Category = what kind of work; Skill = what tools and knowledge"* | **KEEP** | This is the model-routing primitive and the cleanest idea in the source. It decouples *what kind of thinking a task needs* from *which model is currently best at it*, so model churn is a routing-table edit. `iai-core/routing/` resolves category → model chain → reasoning level → fallbacks. Domain packs never name models |
| **The 11 Greek-named agents** | **ADAPT — roles, not names** | The role decomposition (orchestrator, planner, executor, validator, critic, oracle, librarian, researcher, specialists) is sound and we take it. The Greek names are dropped for functional names: `iai-conductor`, `iai-planner`, `iai-executor`, `iai-validator`, and so on. A user reading a delegation trace should not have to memorise a pantheon |
| **5-tier hook composer, 58 slots** | **ADAPT, simplified** | 58 slots is more surface than five domains need, and it cannot be replicated on the Claude Code target where hooks are separate processes. We keep the layered-composition idea and collapse it onto the six event pairs in the ARCHITECTURE adapter table |
| **`ultrawork` keyword detector** | **ADAPT** | Same mechanism, renamed to `deepwork` to avoid colliding with the upstream keyword when both plugins are installed. It escalates the routing category and raises the reasoning level for the current turn |
| **IntentGate** | **KEEP** | Runs on `chat.message` (opencode) / `UserPromptSubmit` (Claude Code) and is the entry point for classification and the three "never" rules. It is the earliest place we can refuse a request, which makes it the cheapest place |
| **Hashline edit** | **DEFER** | The reported improvement — 6.7% to 68.3% edit success for Grok Code Fast — is large enough to be worth revisiting, but it is a tool-level optimisation orthogonal to the workflow, and it is only meaningful on models we do not route to by default. Not on the critical path |
| **Team Mode v4 (git worktrees)** | **DEFER to M8** | Parallel agents in worktrees is a real capability, but it multiplies every guard, gate and evidence path by N. Land the single-track loop across five domains first. Decide alongside Arbol |
| **Goal / `/goal`** — a persistent objective re-injected on `session.idle` | **KEEP, merged with TELOS** | The mechanism is right and the content source is wrong: instead of a free-text goal, we re-inject the active Story's TELOS ancestry and its ISA phase. Implemented via `experimental.chat.system.transform` on opencode, and via `SessionStart` context on Claude Code. Enhancement, never load-bearing |
| **Claude Code compatibility layer** | **KEEP** | This is the dual-target lever and it is why the whole plan is feasible. Combined with the fact that opencode natively reads `.claude/skills/<name>/SKILL.md`, it means every skill is written once and both hosts load the identical file. Only hooks, agents and commands need per-host generation |
| **PostHog telemetry, on by default** | **DROP — explicitly** | iAI ships **zero telemetry**. No opt-out flag, because there is nothing to opt out of. A system that reads lab results, account balances and trade positions has no business holding an analytics SDK, and the absence of the dependency is the only auditable guarantee |
| **`~/.omo/omo.jsonc` separate config** | **DROP** | Directly contradicts the no-config-file decision. Project context comes from root docs; work state comes from GitHub labels. A third location is a third thing to drift |

---

## What is net-new in iAI

- **The `DomainBinding` abstraction.** Neither source has it. forge hardcodes
  software; LifeOS hardcodes life-admin. `DomainBinding {unitOfWork, verify,
  gate, evidence, labels}` is the seam that lets one loop serve five domains,
  and it is data rather than code branches — a sixth domain is one file, not
  fourteen edits.
- **The generalisation of Story and Task beyond code.** LifeOS files issues but
  never runs the loop. forge runs the loop but only for code. Making
  `story-design` produce an ISA for a *health protocol* or a *trading strategy*
  with the same rigour it applies to a build target is the entire thesis, and
  nothing in either source does it.
- **The three "never" rules as an architectural spine.** forge has one
  ("forge never merges PRs"). We generalise the shape — stop one step short of
  the irreversible action, every time — into never-merge, never-trade-live-
  unattended, never-diagnose-or-prescribe, plus the cross-cutting never-leak.
- **The `risk-officer` veto role.** A Ring-2 specialist holding an *absolute*
  veto over `quant-analyst`, with no override path available to the
  orchestrator. Neither source has an agent that can refuse rather than advise.
- **The trading domain, entirely.** No broker code, no market data, no
  backtester, no order gate exists in any source. Built from zero.
- **The unified evidence model across domains.** One envelope, one sentinel
  namespace, one 60000-char budget, one SHA-pinned permalink convention —
  whether the payload is a test run, an equity curve, a lab PDF, a statement
  diff or a source snapshot. forge's evidence model is code-shaped; ours is
  payload-agnostic.
- **The dual-target installer.** `npx iai install [--host claude|opencode|both]`,
  dry-run by default, generating agent markdown in each dialect and merging hook
  registrations without clobbering. No source ships to two hosts from one tree.

---

## Conflicts resolved

| Tension | LifeOS says | forge says | iAI resolution |
|---------|-------------|------------|----------------|
| **Where work state lives** | Filesystem is the index; TELOS and `MEMORY/**` on disk carry state; issues are filed but not driven | GitHub labels are the source of truth; at most one `status:` label; disk holds artifacts only | **forge wins for work state, LifeOS wins for intent and evidence.** GitHub owns the state machine (one query language, free UI and history); disk owns TELOS, ISA, test plans, evidence and memory. Neither duplicates the other. If they disagree, GitHub is right about *status* and disk is right about *content* |
| **Configuration** | Rich configuration surface plus a hook registry spanning 56 entries | No config file at all — root docs carry project context | **forge wins.** `ARCHITECTURE.md` carries `## Build Targets`, `CONTRIBUTING.md` carries `## Commands`, `docs/milestones/M*.md` carry feature tables. Machine-parseable and human-useful, so it cannot rot unnoticed. `~/.omo/omo.jsonc` is dropped for the same reason |
| **Design doc format** | ISA v2.21.0: YAML frontmatter, 17 fixed sections, `ISC-N` claims with `(after: ID)` deps, verifier classes | Freeform `design-doc.md` posted behind a `## forge-design-doc` sentinel | **Merge, ISA-first.** iAI's Story design doc is the ISA — frontmatter, 17 sections, ISC claims, verifier classes — *plus* forge's `## Build Targets` table adopted as a section so the doc stays mechanically parseable. Published behind the renamed `## iai-isa` sentinel with a SHA-pinned permalink. Lives at `docs/design/{issue}-isa.md` |
| **Memory and continuity** | Cortex: `MEMORY/` + `KNOWLEDGE/{People,Companies,Ideas,Research}`, BM25, A/B/C tiers, four item types | Stateless by doctrine — never assume anything survives; re-read disk and GitHub every time | **forge's doctrine, LifeOS's store, in that order.** `checkpoint` and `resume` are the primary continuity primitives and they persist to GitHub and disk, so a cold start is always sufficient. Cortex-lite (`MEMORY/**` markdown + JSONL, A/B/C tiers, four item types, no CRM surface) is an *optional* accelerator that `learn` writes and `resume` may read. Nothing may become correct only because memory was warm |
| **Agent naming and roster** | Named systems (Hermes, Atlas, Arbol, Synapse) with overlapping mandates | 3 agents, tight mandates, strict separation of duties | **forge's discipline, oh-my-opencode's decomposition, functional names.** Three rings — orchestrators, read-only advisors, specialists. Greek names and LifeOS system names both dropped. Ring 1 cannot write, cannot edit, cannot be assigned work; `risk-officer` holds an absolute veto |
| **How much runs automatically** | Autonomic: 56 hooks acting continuously, daemons, background sync | Human gates at every consequential boundary; forge never merges | **Split by reversibility.** Reversible actions run automatically: ingestion, classification, checkpointing, status, screening, backtests, drafting. Irreversible actions are hard-gated behind a named authoriser: merging a PR, placing a live order, moving money, sending a clinician brief. The LifeOS `Daemon` is dropped precisely because it has no way to make that distinction |
| **Model selection** | Model rungs guarded per hook, tied to specific model names | Not addressed — forge does not route models | **oh-my-opencode wins.** Category, not model name, is what a skill or agent declares. `iai-core/routing/` resolves category → model chain → reasoning level → fallbacks, and it is the only module that knows a model ID exists. Model IDs differ per host (`"opus"` vs `"amd-anthropic/Claude-Opus-5"`) and the installer handles that translation |
| **Telemetry** | None | None | **oh-my-opencode's PostHog default is rejected outright.** Zero telemetry, no analytics dependency in the tree, no opt-out flag. With `PRIVATE` health and finance data in scope, the absent dependency is the guarantee |
