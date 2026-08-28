# iAI

**One plugin. Two harnesses. Every domain of your life on the same rails.**

iAI is a dual-target plugin for **Claude Code** and **opencode** that fuses three
existing systems into a single operating model:

| Source | Layer it contributes | Question it answers |
|--------|----------------------|---------------------|
| **LifeOS** (`~/tmp/LifeOS`) | **Intent** — TELOS, Current→Ideal State, Design, Cortex memory | *Why am I doing this, and what does "done" look like?* |
| **forge / gh-workflow** (`~/tmp/gh-workflow`) | **Execution** — Milestone→Story→Task on GitHub, gates, traceability | *How is work tracked, and how do I prove it happened?* |
| **oh-my-opencode** (`oh-my-openagent`) | **Runtime** — category-based model routing, agent roster, hook composer | *Who runs it, on which model, with what guardrails?* |

---

## The thesis

> forge's `Milestone → Story → Task` decomposition is **not specific to software**.
> It is a generic method for turning intent into verifiable units of work.

LifeOS already half-proved this. Its Work System *"turns every meaningful unit of
work into a labeled GitHub issue in one configured private repo. The repo is the
system of record."* But LifeOS stops there — it files issues and never runs the
loop. forge runs a rigorous loop — but only for code.

iAI is the join: **forge's loop, driven by LifeOS's intent, across every domain.**

```
LifeOS TELOS Goal  (G0: "ApoB under 60 by Q4")
      │
      ▼
GitHub Milestone   ── Epic. Description carries the feature table.
      │
      ▼
Story issue        ── One end-to-end deliverable outcome.
      │              Design doc — the artifact LifeOS calls the ISA.
      ▼
Test plan          ── Design verifiable claims (CLAIM-{story}.{n}) become test cases.
      │
      ▼
Task sub-issues    ── One per "unit of work" (domain-defined).
      │
      ▼
Evidence artifact  ── Committed to the repo, linked from the issue.
```

One state machine. Five domains. The domains differ in only five bindings:

| Binding | dev | trade | health | wealth | know |
|---------|-----|-------|--------|--------|------|
| **Unit of work** | build target | strategy / position | protocol / biomarker | account / obligation | source / claim |
| **Verification** | unit + integration tests | backtest → paper → live | lab trend + wearable delta | reconciliation | citation + contradiction check |
| **Safety gate** | code review | risk mandate + kill switch | clinician boundary | spend limit | provenance |
| **Evidence** | test results | trade log + equity curve | lab PDF + daily metrics | statement diff | source snapshot |
| **Never does** | merge PRs | place live orders unattended | diagnose or prescribe | move money | assert without a source |

---

## The three "never" rules

The spine of the design is inherited from forge's *"Forge never merges PRs"* — a
system that stops one step short of the irreversible action, every time.

1. **iAI never merges.** It opens PRs and marks them ready. A human merges.
2. **iAI never trades live unattended.** Execution has three rungs —
   `research` → `paper` → `live`. `live` requires a written risk mandate, a
   per-order human gate, and an armed kill switch. Default is `research`.
3. **iAI never diagnoses or prescribes.** It observes, trends, flags anomalies,
   and drafts questions for your clinician. It has no medical authority.

A fourth, cross-cutting: **iAI never leaks.** Health and finance data are
classified `PRIVATE` and are hard-gated from egress to any cloud model, inheriting
LifeOS's `EgressClassGuard` / `data-classification` model.

---

## Hierarchical skills — three tiers

Not a flat pile of sixty skills. A kernel, a universal lifecycle, and domain packs
that *re-bind* the lifecycle verbs.

```
Tier 0  KERNEL          iai (router) + references (contracts, not skills)
   │                    context-discovery · gh-operations · verification
   │                    data-classification · model-routing · domain-binding
   ▼
Tier 1  LIFECYCLE       Domain-agnostic verbs. The universal loop.
   │                    goal-create · story-create · story-design · story-test-plan
   │                    task-create · task-do · task-verify · story-verify
   │                    status · size · replan · checkpoint · resume · learn
   ▼
Tier 2  DOMAIN PACKS    Each pack supplies a domain.md binding + leaf skills.
                        dev/* · trade/* · health/* · wealth/* · know/*
```

A Tier-1 verb never hardcodes a domain. It reads the Story's `domain:` label,
loads that pack's `domain.md` binding, and executes. Adding a sixth domain means
writing one binding file — not forking fourteen skills.

See [`docs/design/01-skill-hierarchy.md`](docs/design/01-skill-hierarchy.md).

---

## Roles — three rings

```
Ring 0  ORCHESTRATORS   iai-conductor (primary) · iai-planner
                        iai-executor · iai-validator

Ring 1  ADVISORS        iai-critic · iai-oracle · iai-librarian · iai-researcher
        (read-only)     No write. No edit. Cannot be assigned work.

Ring 2  SPECIALISTS     dev-coder · quant-analyst · risk-officer (VETO)
                        health-analyst · wealth-steward · scribe
```

**Separation of duties.** Borrowed from LifeOS's *"Forge never audits work Forge
built"*: the agent that proposes is never the agent that approves. `risk-officer`
holds an absolute veto over `quant-analyst`. `iai-validator` cannot close what
`iai-executor` wrote without independent evidence from disk.

See [`docs/design/02-roles.md`](docs/design/02-roles.md).

---

## Repository map

| Path | Contents |
|------|----------|
| [`PLAN.md`](PLAN.md) | **Master roadmap** — 8 milestones, 36 stories, ~142 tasks |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Build targets, package layout, data flow |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Commands, branching, conventions |
| `docs/design/00-synthesis.md` | How the three sources merge; what is kept/dropped |
| `docs/design/01-skill-hierarchy.md` | Full skill tree with frontmatter contracts |
| `docs/design/02-roles.md` | Agent roster, delegation graph, separation of duties |
| `docs/design/03-workflow.md` | The universal loop, state machine, labels, gates |
| `docs/design/04-domain-dev.md` | Development pack |
| `docs/design/05-domain-trading.md` | Stock trading pack |
| `docs/design/06-domain-health.md` | Health monitoring pack |
| `docs/design/07-domain-wealth-know.md` | Wealth + Knowledge packs |
| `docs/design/08-dual-target.md` | Claude Code ↔ opencode adapter strategy |
| `docs/design/09-security.md` | Data classification, egress gates, secrets |
| `docs/milestones/M1..M8.md` | Per-milestone feature tables → Story bodies |
| `scripts/bootstrap-github.sh` | Creates labels, milestones and Stories via `gh` |

---

## How this plan is tracked

This plan is **self-hosting**: iAI is built by running iAI's own process, and
the plan is written in a machine-parseable format so that process can read it.

- `ARCHITECTURE.md` carries a `## Build Targets` table — one task per target.
- `CONTRIBUTING.md` carries a `## Commands` table — how to build, test and lint.
- Each `docs/milestones/M*.md` carries a `| Feature | Description |` table —
  one Story per row.

The format is inherited from forge, but forge is **not** a runtime dependency.
It is never installed and never invoked: it was consumed at design time in
`docs/design/00-synthesis.md`, and `~/tmp/gh-workflow` is kept read-only as the
reconciliation source for S1.1 and the parity target for S4.5.

Until the Tier-1 verbs land at the end of M2, the loop in
`docs/design/03-workflow.md` is executed **by hand** — the Design, the `## iai-*`
sentinels, the rungs and the three gates are all followed as written, just not
yet automated. From M3 onward `/iai:` drives its own construction.

Bootstrap:

```bash
gh repo create iAI --private --source=. --remote=origin
./scripts/bootstrap-github.sh          # labels + 8 milestones + 8 epics
./scripts/bootstrap-stories.py --apply # 36 Stories + 142 Tasks
```

---

## Status

**Planning.** No code written yet. `PLAN.md` M1 is the entry point.
