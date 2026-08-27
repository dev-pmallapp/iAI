# iAI — Master plan

**8 milestones · 36 stories · ~142 tasks.**

This file is the roadmap. It is written in forge's own format so forge can execute
it: each milestone below carries a `| Feature | Description |` table, and
`/iai:story-create <milestone>` turns each row into exactly one Story issue.

Read [`README.md`](README.md) for the thesis and
[`docs/design/`](docs/design/) for the design that these milestones implement.

---

## Milestone overview

| # | Milestone | Theme | Stories | Est. | Depends on |
|---|-----------|-------|---------|------|------------|
| 1 | Kernel and foundation | The pure core everything sits on | 5 | L | — |
| 2 | Universal lifecycle | Tier-1 skills, domain-agnostic | 5 | XL | M1 |
| 3 | Roles and routing | Agents, categories, gates | 5 | L | M1, M2 |
| 4 | Development pack | forge, ported and generalised | 5 | L | M2, M3 |
| 5 | Health pack | Ingestion, trends, clinician briefs | 5 | L | M2, M3 |
| 6 | Trading pack | The greenfield. Safety-first | 6 | XL | M2, M3, M5 |
| 7 | Wealth and Knowledge | Supporting domains | 2 | M | M2, M3 |
| 8 | Runtime and release | Installer, dashboard, v1.0 | 3 | L | all |

**Critical path:** M1 → M2 → M3 → M4. M5, M6 and M7 fan out from M3 and can run
in parallel by different engineers. M6 depends on M5 only for the shared
`class:private` egress machinery — not for domain logic.

```
M1 Kernel ──▶ M2 Lifecycle ──▶ M3 Roles ──┬──▶ M4 Dev ─────┐
                                          ├──▶ M5 Health ──┤
                                          ├──▶ M6 Trade ◀──┘ (egress only)
                                          └──▶ M7 Wealth/Know
                                                            │
                                          M8 Release ◀──────┘
```

**Ordering rationale.** M4 (Dev) ships before the life domains deliberately: it is
the domain where the loop is already proven by forge, so it validates the
`DomainBinding` abstraction against a known-good baseline before that abstraction
is trusted with money or health data. If Dev cannot be expressed as a binding
without special-casing, the abstraction is wrong and M5–M7 must not start.

---

## Milestone 1 — Kernel and foundation

> The pure TypeScript core. No host imports, no I/O, no `process.cwd()`.
> Everything is a function from input to a `Decision`.

| Feature | Description |
|---------|-------------|
| Monorepo scaffold and build targets | Bun workspace with the 13 build targets from ARCHITECTURE.md, CI running build/test/lint/typecheck/skill-lint on every PR, and the commit-message hook enforcing the `#{issue}:` prefix. |
| Data classification and the guard kernel | The four-level classification engine (PUBLIC/INTERNAL/PRIVATE/SECRET), the pure `Decision { action, message }` type, and the guard predicates checkEgress, checkSpend, checkCommitPrefix, checkRiskMandate. All guards pure and under 50ms. |
| GitHub operations layer | Command construction and response parsing for every `gh` call iAI makes: issues, milestones, sub-issues via GraphQL with the `Parent: #N` body-link fallback, labels, comments, PRs, and rate-limit backoff. The core builds commands; only adapters execute them. |
| Evidence and sentinel engine | The two-surface artifact model: an issue comment carrying a `## iai-*` sentinel as the discovery surface, and a committed file as the durable store, linked by a SHA-pinned permalink. Enforces the 60,000-char budget against GitHub's 65,536 limit. |
| Domain binding interface and registry | The `DomainBinding` type with UnitSpec, VerifySpec, GateSpec and EvidenceSpec, plus the registry that resolves a `domain:*` label to a binding. Ships with a `null` binding used by the conformance tests. |

**Exit criteria.** `bun test` green across all core packages. A binding registry
test proves a domain can be added without editing core. No package in
`packages/core` imports from any adapter.

---

## Milestone 2 — Universal lifecycle

> The fourteen Tier-1 verbs. None of them may name a domain.

| Feature | Description |
|---------|-------------|
| Kernel reference documents | The twelve `references/*.md` contract documents that skills cite rather than restate: context-discovery, gh-operations, gh-error-handling, verification, data-classification, model-routing, domain-binding, evidence-artifacts, branch-and-pr-model, workflow-states, isa-format and sizing-criteria. |
| Planning skills | goal-create (TELOS goal to GitHub milestone), story-create (milestone feature table to Story issues), story-design (writes the ISA design document with pre-registered claims) and story-test-plan (ISA claims to a categorised verification plan). |
| Execution skills | task-create (one task sub-issue per unit of work, with Blocked-by dependency links and the parent checklist), task-do (branch, execute, draft PR, commit traceability) and task-verify (run the verification, mark the PR ready, resolve the task, roll up to the Story). |
| Closure skills | story-verify (re-ground the plan on what was actually done, run it, open the integration PR, close the Story) and learn (extract learnings from a completed milestone, raise knowledge-base PRs, close the milestone). |
| Continuity skills | checkpoint and resume for cross-session and cross-engineer handoff, plus status (six view modes with a local-only fallback), size (S/M/L/XL estimation) and replan (requirement-change detection and incremental update). |

**Exit criteria.** Every Tier-1 skill passes the domain-agnosticism lint: no skill
body contains the literal strings `dev`, `trade`, `health`, `wealth` or `know`
outside of a reference citation. Each skill is idempotent under a re-run test.

---

## Milestone 3 — Roles and routing

| Feature | Description |
|---------|-------------|
| Ring 0 orchestrator agents | iai-conductor, iai-planner, iai-executor and iai-validator, each with a machine-parsed first-line output contract, a mandatory GitHub verification after every phase, and the standard hard-failure block. Generated in both Claude Code and opencode dialects. |
| Ring 1 advisor agents | iai-critic, iai-oracle, iai-librarian and iai-researcher. All read-only: write and edit denied at the permission layer, not merely discouraged. The researcher fences all external content as data, never instructions. |
| Model routing by category | The category-to-model resolver: plan, deep, quick, critic, quant, write and search, each mapping to a model chain with fallbacks, rendered per host as an alias or a `provider/model-id`. Includes the cross-vendor rule that a critic should not share a vendor with the proposer. |
| Gate engine | The gate lifecycle: a `gate:pending` label plus an `## iai-gate` sentinel comment, cleared only by a human decision recorded as `gate:approved`. On opencode it additionally drives the `permission.ask` hook. Gates block; they never warn-and-continue. |
| Delegation graph enforcement | Who may spawn whom, enforced by `permission.task` on opencode and by the conductor on Claude Code. Includes the loop guard preventing specialists from re-delegating, and the rule that risk-officer is spawned only by the conductor. |

**Exit criteria.** An advisor agent attempting a write is blocked by the
permission layer in both hosts. A specialist attempting to spawn a subagent is
blocked. Gate approval cannot be granted by any agent.

---

## Milestone 4 — Development pack

> forge, ported onto the binding abstraction. The baseline that validates M1.

| Feature | Description |
|---------|-------------|
| Dev binding and build-target detection | The `dev` DomainBinding with the build target as its unit of work, plus detection of build definition files across C/C++, Go, Python, Rust, JavaScript and Bazel, and the granularity rules that keep one build target to exactly one task. |
| Config-free project context discovery | The seven-step Phase 0 that derives all project context from git and root documents with no config file: owner/repo and default branch from the remote, the Build Targets table from ARCHITECTURE.md, the Commands table from CONTRIBUTING.md, and multi-repo handling where issues live in the primary repo. |
| Branch, PR and integration model | Story and task branch creation, the draft task PR against the story branch, the integration PR against the default branch with one Closes per line, and explicit task-issue closure to work around GitHub firing closing keywords only on default-branch merges. |
| Dev leaf skills | code-review, debug, refactor, test-gen, arch-audit, dep-audit and release, each dispatched from a Tier-1 verb through the dev binding rather than invoked directly by the lifecycle. |
| forge parity validation | A conformance suite proving iAI reproduces forge's end-to-end pipeline on a fixture repository, including sub-issue fallback on instances without the GraphQL sub-issue API, and a documented diff of every intentional behavioural change. |

**Exit criteria.** The fixture repo runs milestone to merged integration PR
without manual intervention other than the three gates. No dev-specific branch
exists anywhere in `packages/core` or the Tier-1 skills.

---

## Milestone 5 — Health pack

> Advisory only. No diagnosis, no prescription, no medical authority.

| Feature | Description |
|---------|-------------|
| Biometric ingestion adapters | The healthsync layer ported from LifeOS: Oura, Eight Sleep, Apple Health, Function Health labs and Health Auto Export, writing timezone-resolved day files with per-source status so a stale source can never silently report healthy. |
| Health binding and rungs | The `health` DomainBinding with a protocol or tracked marker as its unit of work, and the observe, trend, flag and clinician-review rungs, where nothing promotes past clinician-review automatically. |
| Trend and anomaly engine | Trend computation over pre-declared windows with per-result reference ranges stored alongside each value, so an assay change mid-series cannot corrupt the trend, plus anomaly flagging against those ranges rather than against a global constant. |
| Clinician brief and emergency short-circuit | Generation of a locally-rendered clinician brief containing observations, trends and questions but never conclusions, and the emergency classifier that short-circuits the entire pipeline and instructs the user to seek immediate care. |
| Health privacy enforcement | All health data classified `class:private`, trend and flag computation performed locally on structured data, and only derived de-identified summaries permitted to reach a cloud model, and then only on an explicit per-session opt-in. |

**Exit criteria.** A test proves raw biomarker values cannot reach a cloud model
without the opt-in. The emergency classifier halts the pipeline on every fixture
in the emergency column of the anomaly table.

---

## Milestone 6 — Trading pack

> The largest greenfield area. LifeOS has no trading code at all.
> Every story here is written safety-first.

| Feature | Description |
|---------|-------------|
| Trade binding and the risk mandate | The `trade` DomainBinding with a strategy or position change as its unit of work, plus the committed risk mandate defining position limits, sector caps, portfolio heat, drawdown halt and permitted instruments, amendable only by a human-reviewed pull request. |
| Market data and broker adapter interfaces | Vendor-neutral provider interfaces for market data and brokerage, with PaperBroker as the default and only adapter enabled out of the box, and loud degradation to the research rung whenever a provider is absent rather than silent failure. |
| Backtest engine and pre-registration | Backtesting with metrics for CAGR, maximum drawdown, Sharpe, hit rate, exposure and turnover, gated by the pre-registration rule that thresholds, sizing and exits are written into the ISA before the first run, with a logged backtest counter to expose overfitting by iteration. |
| Risk officer, veto and kill switch | The risk-officer specialist spawned independently of the proposer, evaluating every order against the mandate, holding a veto that only the human principal may override with a logged reason, plus the armed kill switch that halts orders and demotes open trade Stories. |
| Trade journal and audit trail | The append-only orders log pinning each order to the SHA of the mandate that authorised it, the daily journal, and the post-mortem skill that closes the loop from thesis through outcome. |
| Live rung gating | The four-rung ladder enforced end to end, with the live rung requiring a written mandate, a per-order human authorisation, an armed kill switch, and a hard prohibition on any auto mode proceeding past the paper rung. |

**Exit criteria.** No code path can reach a live order without a recorded
per-order human authorisation and a passing risk-officer verdict. `/iai:auto`
refuses to advance a `rung:paper` Story. The kill switch halts within one tick.

---

## Milestone 7 — Wealth and Knowledge

| Feature | Description |
|---------|-------------|
| Wealth pack | The `wealth` DomainBinding over the balance sheet and cash flow, reusing LifeOS's nine-type FINANCES schema and its validation rules, with statement reconciliation, obligation auditing and net-worth tracking, and an absolute prohibition on moving money. |
| Knowledge pack | The `know` DomainBinding as the citation backbone for the other four domains: capture with source snapshotting, distillation, wikilink cross-linking, BM25 retrieval without a vector database, and the contradiction check that blocks silent promotion of a claim conflicting with canon. |

**Exit criteria.** A trade thesis and a health protocol both resolve their
citations through the knowledge pack. A contradicting claim opens a resolution
Story rather than overwriting canon.

---

## Milestone 8 — Runtime and release

| Feature | Description |
|---------|-------------|
| Dual-host installer | The installer that generates host-native agents and commands in each dialect, merges hook registrations without clobbering existing configuration, links the shared skill tree, and refuses to write anything without an explicit apply flag. |
| Pulse read-only dashboard | The optional sidecar rendering GitHub state, the ISA tree and per-domain surfaces, which never writes and whose absence degrades cleanly to the text-mode status skill. |
| Release engineering and security audit | The leak scanner protecting the public/private repo split, the full irreversible-action audit, host compatibility testing on both Claude Code and opencode, documentation, and the v1.0 cut. |

**Exit criteria.** A clean machine installs iAI on both hosts and completes one
full dev-domain milestone. The leak scanner passes. Zero telemetry ships.

---

## Task decomposition

Tasks are created by `/iai:task-create <story>` from the Build Targets table in
each Story's ISA. Indicative distribution:

| Milestone | Stories | Est. tasks | Dominant build targets |
|-----------|---------|-----------|------------------------|
| M1 | 5 | 21 | iai-core, iai-references |
| M2 | 5 | 22 | iai-skills, iai-references |
| M3 | 5 | 16 | iai-agents, iai-core, both adapters |
| M4 | 5 | 17 | iai-domain-dev, iai-skills |
| M5 | 5 | 21 | iai-domain-health |
| M6 | 6 | 25 | iai-domain-trade |
| M7 | 2 | 8 | iai-domain-wealth, iai-domain-know |
| M8 | 3 | 12 | iai-installer, iai-pulse |
| | **36** | **142** | |

Per-story task tables live in `docs/milestones/M*.md`. Those tables are
*indicative*: the authoritative task list for a Story is produced by
`/iai:task-create <story>` from the Build Targets table in that Story's ISA, and
may differ once the design is written.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The binding abstraction leaks and domains need core edits | High — the whole design collapses to five forks | M4 validates the abstraction against forge parity before M5–M7 start. If Dev needs a special case, stop and redesign. |
| opencode's v2 plugin API changes under us | Medium — agent registration breaks | Use the documented v1 Hooks API as load-bearing; treat v2 as an optimisation and pin the dependency exactly. |
| Trading domain scope creep toward live execution | Severe — real money | The four rungs are enforced in code, not convention. Live is the last story of M6, not the first. |
| Health data reaching a cloud model | Severe — irreversible privacy loss | Egress gate lands in M1, before any health code exists in M5. Tests assert the block. |
| Context budget exhaustion from 60+ skills | Medium — degraded routing | Three-tier progressive disclosure; only Tier 0 is always resident. Measure actual token cost in M2 and revise. |
| Two hosts drift apart | Medium — one host silently rots | CI installs and smoke-tests both hosts on every PR from M1. |
| Plan authored by an agent contains invented detail | Medium | M1 story 1 includes a verification pass reconciling every claim in `docs/design/` against the three source repositories. |

---

## Getting started

```bash
cd ~/tmp/iAI
git init && git add -A && git commit -m "Initial plan"
gh repo create iAI --private --source=. --remote=origin --push

./scripts/bootstrap-github.sh          # labels + 8 milestones + 8 epics
./scripts/bootstrap-stories.py --apply # 36 Stories + 142 Tasks
```

Then begin M1 story 1 (#9).

Until M2 ships the Tier-1 skills there is no `/iai:` command to run, and forge is
**not** used to stand in for one — it is a design input, already incorporated in
`docs/design/00-synthesis.md`, never an installed plugin. For that window the
loop in `docs/design/03-workflow.md` is executed **by hand**: the ISA lands at
`docs/design/stories/{issue}.md`, evidence is posted behind `## iai-*` sentinels,
Stories carry a rung, and the three gates are honoured. From M3 onward `/iai:`
drives its own construction. iAI is built by the system it generalises.
