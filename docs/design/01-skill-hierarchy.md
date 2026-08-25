# Skill hierarchy

iAI is not a flat pile of sixty skills. It is a kernel, a universal lifecycle,
and domain packs that *re-bind* the lifecycle verbs:

```
Tier 0  KERNEL          iai (router) + references (contracts, not skills)
   │
Tier 1  LIFECYCLE       14 domain-agnostic verbs. The universal loop.
   │
Tier 2  DOMAIN PACKS    dev/* · trade/* · health/* · wealth/* · know/*
```

**Why three tiers and not one.** Every skill a host can see costs context before
it is ever used: the name and description of each skill sit in the model's
working set for the whole session. A flat roster of sixty skills spends that
budget on sixty descriptions the model will not use, on every turn. Progressive
disclosure fixes this — load Tier 0 always, Tier 1 when a verb routes, Tier 2
only once the `domain:` label is known, and references only when a skill reads
them by explicit path. ARCHITECTURE lists this as a cross-cutting concern:
*"Progressive disclosure — Tier 0 always, Tier 1 on route, Tier 2 on demand."*

**Why the tiers are shaped this way and not by domain.** If you group by domain
you get five copies of `story-design`, and within a month they disagree about
what an ISA is. Grouping by *lifecycle stage* means there is exactly one
`story-design`, and the domain-specific part is data it reads.

The rule that makes the whole scheme hold:

> **A Tier-1 verb never hardcodes a domain.**

A Tier-1 verb reads the issue's `domain:` label, loads that pack's `domain.md`
binding, and executes against the binding. There is no `if (domain === "trade")`
anywhere in Tier 1. Adding a sixth domain means writing one binding file — not
forking fourteen skills.

---

## Tier 0 — Kernel

Tier 0 is almost entirely **references**, and references are deliberately *not
skills*. A reference is a markdown file under `references/` that a skill reads
by explicit path when it needs the contract. It therefore consumes **zero**
skill-tool budget: the host never enumerates it, never summarises it, and never
holds its description in context.

This is forge's lesson recorded as an ARCHITECTURE design decision — *"References
hold contracts, skills hold workflows"*, with *"20 copies of a contract drift
within a month"* as the rejected alternative.

| Reference | Owns |
|-----------|------|
| `references/context-discovery.md` | How to find project context without a config file: parse `## Build Targets` from `ARCHITECTURE.md`, `## Commands` from `CONTRIBUTING.md`, `\| Feature \| Description \|` from `docs/milestones/M*.md`. Resolution order and failure modes |
| `references/gh-operations.md` | Exact `gh` invocations for every operation: sub-issue creation, label transitions, milestone queries, comment upsert by sentinel. Documents the hazard that `Closes #N` fires only on merge to the **default** branch, so task PRs never auto-close |
| `references/gh-error-handling.md` | Rate-limit backoff, partial-batch resume, `gh` exit code taxonomy, retry-vs-fail decisions, what to do when a label edit races |
| `references/verification.md` | The verification doctrine: never trust conversation memory; re-read disk and GitHub before acting. Evidence must exist on disk before any issue is closed. Defines the three verifier classes `deterministic`, `judged`, `attested` |
| `references/data-classification.md` | The four levels `PUBLIC` / `INTERNAL` / `PRIVATE` / `SECRET`, what falls in each, the `USER/` symlink-into-a-private-store pattern, the `last_4`-only rule, and the egress gate contract |
| `references/model-routing.md` | Category → model chain → reasoning level → fallbacks. The built-in categories and the `deepwork` escalation keyword. The only document in the tree that names model IDs |
| `references/domain-binding.md` | The `DomainBinding` interface, its sub-types, the registry, and the rules a pack must satisfy to be loadable |
| `references/evidence-artifacts.md` | The artifact envelope, the `## iai-*` sentinel namespace, SHA-pinned permalinks, the 65536 hard limit and 60000 working budget, and the disk path templates |
| `references/branch-and-pr-model.md` | `story/{n}-{slug}` and `task/{n}-{slug}` naming, task PRs targeting the story branch, one integration PR per Story, commit prefix `#{issue}:` |
| `references/workflow-states.md` | The label state machine. `type:` and `status:` namespaces, the at-most-one-`status:` invariant, and the single-command transition `gh issue edit --add-label X --remove-label Y` |
| `references/isa-format.md` | ISA v2.21.0: YAML frontmatter keys `phase` / `progress` / `task` / `slug`, the 17 fixed body sections, `- [ ] ISC-N:` claims with `(after: ID)` dependencies, the Test Strategy table columns `anchors_to` / `severity` / `tier`, plus the `## Build Targets` section iAI adds |
| `references/sizing-criteria.md` | When a Story is too big to design, when a Task is too big to do in one pass, and what `replan` does about it. Per-domain thresholds are supplied by the binding, not here |

Tier 0 contains exactly **one skill**:

| Skill | Frontmatter | Purpose |
|-------|-------------|---------|
| `iai` | `disable-model-invocation: true`, `argument-hint: "[status\|goal\|story\|task\|verify\|learn]"` | The router. It is never invoked by the model on its own initiative — only by the user, explicitly. It resolves the requested verb plus the issue's `domain:` label into exactly one Tier-1 skill and, where needed, one Tier-2 leaf |

`disable-model-invocation: true` is load-bearing. Without it the model would
call the router speculatively, which is both a context tax and a way to start
work the user did not ask for.

---

## Tier 1 — Lifecycle

Fourteen domain-agnostic verbs. Together they are the universal loop:

```
goal-create → story-create → story-design → story-test-plan
    → task-create → task-do → task-verify → story-verify
```

with `status`, `size`, `replan`, `checkpoint`, `resume` and `learn` available at
any point.

| Skill | Argument hint | Reads | Writes | Gate? |
|-------|---------------|-------|--------|-------|
| `goal-create` | `[telos-id]` | `USER/TELOS/TELOS.md`, `references/context-discovery.md` | GitHub Milestone with feature table in description; back-link comment on the `G0` line | No |
| `story-create` | `[milestone] [feature-row?]` | Milestone description feature table, `references/workflow-states.md` | Story issue, labels `type:story` + `domain:*`, milestone assignment | No |
| `story-design` | `[story#]` | Story body, TELOS ancestry, `references/isa-format.md`, pack `domain.md` | `docs/design/{issue}-isa.md`; `## iai-isa` sentinel comment with SHA-pinned permalink | No |
| `story-test-plan` | `[story#]` | The ISA's `ISC-N` claims and Test Strategy table, `binding.verify` | `docs/test-plans/{issue}-plan.md` with P0/P1/P2 tiers; `## iai-test-plan` sentinel | No |
| `task-create` | `[story#]` | ISA claims, `binding.unitOfWork`, `references/sizing-criteria.md` | One sub-issue per unit of work, labels `type:task` + `domain:*`, each anchored to an `ISC-N` | No |
| `task-do` | `[task#]` | Task body, ISA, pack leaf skill, `references/branch-and-pr-model.md` | `task/{n}-{slug}` branch, commits prefixed `#{issue}:`, PR targeting the story branch, `status:in-progress` | **Yes** — if `binding.gate.irreversibleAction` is in scope |
| `task-verify` | `[task#]` | Evidence on disk, the anchored `ISC-N`, `references/verification.md` | `docs/evidence/{issue}-{ts}.md`; `## iai-evidence` sentinel; `status:resolved`; explicit issue close | No |
| `story-verify` | `[story#]` | All task evidence, the full test plan, `binding.verify.rungs` | Story-level evidence artifact; integration PR marked ready; `status:resolved` | **Yes** — never merges; a human merges |
| `status` | `[scope?]` | GitHub labels, ISA frontmatter `phase`/`progress`, Current→Ideal percentages | Nothing. Read-only report | No |
| `size` | `[issue#]` | Issue body, ISA, `references/sizing-criteria.md`, `binding` thresholds | A sizing verdict comment; may add `status:blocked` | No |
| `replan` | `[story#]` | Sizing verdicts, blocked tasks, ISA dependency graph | Re-cut Task sub-issues, updated ISA claims, closed superseded issues with reasons | No |
| `checkpoint` | `[session?]` | Live session state, open branches, uncommitted work | Checkpoint comment on the active issue plus `MEMORY/` entry; enough to cold-start | No |
| `resume` | `[issue#?]` | Latest checkpoint, GitHub labels, disk state — re-read, never remembered | Restored working context; a reconciliation note if disk and GitHub disagree | No |
| `learn` | `[issue#\|failure]` | Failure evidence, post-mortems, the diff between planned and actual | `MEMORY/` entry (Cortex-lite, tier A/B/C); optionally a proposed edit to a reference | No |

### Correspondence to forge skills

| iAI Tier-1 verb | forge skill | What changed |
|-----------------|-------------|--------------|
| `task-do` | `task-implement` | Renamed because in `health` or `wealth` the unit of work is not implemented, it is *performed*. Delegates the domain-specific act to a Tier-2 leaf |
| `story-verify` | `story-test` | Renamed because `binding.verify` may be a backtest, a reconciliation or an attestation, not a test suite. Retains the never-merge gate |
| `learn` | `enhance-debugger` | Generalised from debugging code to learning from any failed verification in any domain |
| `story-design` | `story-design` | Same name; output format is now the LifeOS ISA rather than a freeform design doc |
| `goal-create` | — | Net-new. forge has no intent layer above the Milestone; this is where TELOS attaches |
| `checkpoint` / `resume` | — | Net-new as a first-class pair, replacing Cortex as the primary continuity mechanism |

---

## Tier 2 — Domain packs

Each pack ships one `domain.md` binding plus a set of leaf skills. Leaves are
invoked *by* Tier-1 verbs, not directly by the user. Packs never import each
other — cross-domain work is a Story dependency, not a code dependency.

```
skills/
├── dev/
│   ├── domain.md            binding: unit = build target
│   ├── code-review/         independent review of a task diff
│   ├── debug/               reproduce, isolate, minimal fix
│   ├── refactor/            behaviour-preserving change with a proof obligation
│   ├── test-gen/            tests from ISC-N claims, not from code
│   ├── arch-audit/          drift between ARCHITECTURE Build Targets and the tree
│   ├── dep-audit/           dependency risk, licence, and staleness review
│   └── release/             version, changelog, tag, and release PR
│
├── trade/
│   ├── domain.md            binding: unit = strategy / position
│   ├── thesis/              written, falsifiable claim with an invalidation trigger
│   ├── screen/              candidate generation against the thesis universe
│   ├── backtest/            historical evaluation with declared assumptions
│   ├── risk-check/          risk-officer VETO surface; mandate conformance
│   ├── paper-trade/         paper rung execution and tracking
│   ├── live-order/          the gated irreversible action; human, per order
│   ├── portfolio-review/    exposure, correlation, and drawdown review
│   ├── journal/             per-trade log entry with rationale at time of entry
│   └── post-mortem/         closed-position analysis feeding `learn`
│
├── health/
│   ├── domain.md            binding: unit = protocol / biomarker
│   ├── ingest/              healthsync connectors: oura, eightsleep, apple, labs, hae
│   ├── trend/               longitudinal movement per biomarker
│   ├── anomaly/             out-of-band flagging; never a diagnosis
│   ├── protocol/            an intervention with a measurable target and duration
│   ├── lab-review/          lab panel delta against prior panels
│   ├── clinician-brief/     drafted questions for a human clinician
│   ├── sleep-review/        sleep architecture and debt
│   └── training-load/       load, strain, and recovery balance
│
├── wealth/
│   ├── domain.md            binding: unit = account / obligation
│   ├── reconcile/           statement against ledger, to the cent
│   ├── cashflow/            income and expense projection
│   ├── obligation-audit/    recurring commitments, renewals, and creep
│   ├── tax-prep/            document gathering and category assembly
│   ├── net-worth/           consolidated position across accounts
│   └── goal-track/          progress against a FINANCES `goal` object
│
└── know/
    ├── domain.md            binding: unit = source / claim
    ├── capture/             source snapshot with provenance
    ├── distill/             claims extracted from a source, each cited
    ├── contradict/          conflict detection across held claims
    ├── cite/                citation resolution and permalink pinning
    └── digest/              periodic synthesis across recent captures
```

---

## The binding contract

The central type from ARCHITECTURE, expanded with its sub-types:

```ts
export interface DomainBinding {
  id: "dev" | "trade" | "health" | "wealth" | "know"
  unitOfWork: UnitSpec          // what a Task is in this domain
  verify:     VerifySpec        // what "passing" means, and the rungs to get there
  gate:       GateSpec          // the irreversible action, and who may authorise it
  evidence:   EvidenceSpec      // artifact kind, sentinel, path template
  labels:     { namespace: string; extra: LabelDef[] }
}

export interface UnitSpec {
  noun:        string           // singular, lowercase; appears in Task titles
  description: string           // one line, used by task-create when decomposing
  minSize:     string           // below this, fold into a sibling Task
  maxSize:     string           // above this, `size` fails and `replan` runs
  leafSkill:   string           // Tier-2 skill task-do delegates the act to
}

export interface Rung {
  id:          string           // ordered; index 0 is always the safe default
  name:        string
  entryCriteria: string[]       // must all hold before promotion to this rung
  verifier:    "deterministic" | "judged" | "attested"
  reversible:  boolean          // false implies this rung is behind gate
}

export interface VerifySpec {
  rungs:       Rung[]           // promotion ladder, safest first
  defaultRung: string           // the rung a new Story starts on
  passing:     string           // one line: what "verified" means here
  evidenceRequired: true        // no domain may close an issue without disk evidence
}

export interface GateSpec {
  irreversibleAction: string    // the one thing that cannot be undone
  authoriser:  string           // who may permit it, and at what granularity
  killSwitch?: string           // command that halts in-flight irreversible work
  vetoAgent?:  string           // agent holding an absolute, non-overridable veto
  autoDeny:    string[]         // conditions under which permission.ask denies flat
}

export interface EvidenceSpec {
  kind:         string          // human name for the artifact
  sentinel:     string          // `## iai-*` comment marker on the issue
  pathTemplate: string          // disk location; `{issue}` and `{ts}` interpolate
  budgetChars:  number          // 60000, against GitHub's 65536 hard limit
  pinned:       boolean         // link by SHA-pinned permalink, never by branch
}
```

### Worked example — the `trade` binding

```ts
export const tradeBinding: DomainBinding = {
  id: "trade",

  unitOfWork: {
    noun:        "strategy",
    description: "One falsifiable trading thesis, its rules, and its risk limits",
    minSize:     "a single entry rule with one invalidation trigger",
    maxSize:     "one instrument universe, one holding period, one sizing rule",
    leafSkill:   "trade/backtest",
  },

  verify: {
    defaultRung: "research",
    passing:     "Backtested edge survives paper execution with slippage, and " +
                 "the risk mandate is signed and unexpired",
    evidenceRequired: true,
    rungs: [
      {
        id: "research",
        name: "Research",
        entryCriteria: ["thesis written", "invalidation trigger stated"],
        verifier: "judged",
        reversible: true,
      },
      {
        id: "backtest",
        name: "Backtest",
        entryCriteria: [
          "data window >= 5 years or full instrument history",
          "assumptions declared: slippage, fees, survivorship",
          "out-of-sample window held back",
        ],
        verifier: "deterministic",
        reversible: true,
      },
      {
        id: "paper",
        name: "Paper",
        entryCriteria: [
          "backtest Sharpe and max drawdown recorded in evidence",
          "position sizing rule fixed",
          "minimum 30 sessions of paper execution planned",
        ],
        verifier: "deterministic",
        reversible: true,
      },
      {
        id: "live",
        name: "Live",
        entryCriteria: [
          "written risk mandate on disk, unexpired",
          "risk-officer has not vetoed",
          "kill switch armed and verified this session",
          "per-order human authorisation available",
        ],
        verifier: "attested",
        reversible: false,
      },
    ],
  },

  gate: {
    irreversibleAction: "place live order",
    authoriser:  "human, per-order",
    killSwitch:  "iai trade halt --all",
    vetoAgent:   "risk-officer",
    autoDeny: [
      "rung != live",
      "risk mandate missing or expired",
      "order notional > mandate.maxPositionNotional",
      "kill switch unverified this session",
      "market data staler than 60s",
    ],
  },

  evidence: {
    kind:         "trade log + equity curve",
    sentinel:     "## iai-evidence",
    pathTemplate: "docs/evidence/{issue}-{ts}.md",
    budgetChars:  60000,
    pinned:       true,
  },

  labels: {
    namespace: "domain:trade",
    extra: [
      { name: "rung:research", color: "0e8a16" },
      { name: "rung:backtest", color: "1d76db" },
      { name: "rung:paper",    color: "fbca04" },
      { name: "rung:live",     color: "b60205" },
      { name: "risk:vetoed",   color: "b60205" },
    ],
  },
}
```

Read the `autoDeny` list as the executable form of the second "never" rule.
`rung != live` sits first because the default rung is `research`, so the common
case denies without evaluating anything expensive.

---

## Skill frontmatter contract

Every skill is written **once**, lives in `skills/`, is installed to
`.claude/skills/<name>/SKILL.md`, and is loaded by both hosts from that identical
file. That only works if the frontmatter stays inside the intersection of what
the two hosts accept.

| Field | Required | Constraint | Claude Code | opencode |
|-------|----------|------------|-------------|----------|
| `name` | Yes | `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars, **must match the directory name** | Read | Read |
| `description` | Yes | 1–1024 chars; this is what the host shows the model when deciding to invoke | Read | Read |
| `license` | No | SPDX identifier string | Read | Read |
| `compatibility` | No | Host/version constraint string | Read | Read |
| `metadata` | No | Map of string → string, values must be strings | Read | Read |
| `argument-hint` | No | Claude-Code-only | Read | **Ignored** |
| `allowed-tools` | No | Claude-Code-only | Read | **Ignored** |
| `disable-model-invocation` | No | Claude-Code-only | Read | **Ignored** |

Two behaviours to hold in mind at once:

1. **opencode silently ignores unknown fields.** It will not warn you that
   `allowed-tools` did nothing. A skill that relies on `allowed-tools` for safety
   is unguarded on the opencode target and you will get no signal.
2. **`metadata` is a string→string map on both hosts.** Numbers and booleans must
   be quoted. Nested objects are not portable.

Therefore: **put anything host-specific under `metadata:`**, and never let a
guarantee depend on a field only one host reads. Real guardrails live in
`iai-core/guards/` where both adapters can call them.

Example — `skills/trade/backtest/SKILL.md`:

```yaml
---
name: trade-backtest
description: >-
  Run a historical evaluation of a trading strategy defined in a Story ISA.
  Declares slippage, fee and survivorship assumptions, holds out an
  out-of-sample window, and writes an equity curve plus a metrics table to
  docs/evidence/. Read-only with respect to any broker. Use when a trade Story
  is on the research or backtest rung and needs deterministic evidence before
  promotion to paper.
license: MIT
compatibility: ">=0.1.0"
metadata:
  tier: "2"
  domain: "trade"
  category: "ultrabrain"
  rung: "backtest"
  verifier: "deterministic"
  invoked-by: "task-do"
  classification: "PRIVATE"
  argument-hint: "[story#] [--window 5y] [--oos 20%]"
---
```

Note `category: "ultrabrain"` rather than a model ID. Categories resolve through
`references/model-routing.md`, which is the only place model IDs appear — so a
model change is a routing-table edit, never sixty frontmatter edits.

---

## Routing

The `iai` router resolves a user verb plus an issue number into exactly one
execution path:

```
1. Parse the verb from the argument             → e.g. "task"
2. Read the issue from GitHub (never memory)    → gh issue view 41 --json labels,body
3. Extract the domain: label                    → domain:trade
4. Load that pack's binding                     → skills/trade/domain.md
5. Map the Tier-1 verb to the pack's leaf       → binding.unitOfWork.leafSkill
6. Check the gate before any irreversible act   → binding.gate.autoDeny
7. Invoke Tier-1, which invokes the leaf
```

Steps 2 and 3 are the whole trick: the `domain:` label is the routing key, and
it is stored where the state machine already lives. There is no separate
registry to keep in sync.

### Worked trace

User types:

```
/iai task 41
```

| Step | Action | Result |
|------|--------|--------|
| 1 | Router parses verb | `task` → Tier-1 candidate set `{task-create, task-do, task-verify}` |
| 2 | `gh issue view 41 --json labels,title,body,parent` | Labels: `type:task`, `domain:trade`, `status:in-progress`, `rung:backtest` |
| 3 | `type:task` + `status:in-progress` disambiguates the verb | Tier-1 verb resolved: `task-do` |
| 4 | Read `domain:trade` → load `skills/trade/domain.md` | `tradeBinding` in scope |
| 5 | `binding.unitOfWork.leafSkill` | `trade/backtest` |
| 6 | Evaluate `binding.gate.autoDeny` | `rung != live` is true → the irreversible path is not in scope; no human gate required for this Task |
| 7 | Load Tier 1 `task-do`, then Tier 2 `trade/backtest` | Branch `task/41-momentum-oos-window`; commits prefixed `#41:` |
| 8 | Leaf writes evidence | `docs/evidence/41-20260825T1412Z.md`, `## iai-evidence` sentinel, SHA-pinned permalink |

If step 2 had returned `domain:health` instead, steps 4–7 would load
`skills/health/domain.md` and its leaf. **No Tier-1 code changes.** That is the
rule restated as a trace.

If step 6 had found `rung:live`, `autoDeny` would fall through to the mandate
and kill-switch checks, `risk-officer` would be consulted for a veto, and
`task-do` would stop and request per-order human authorisation rather than act.

---

## Context budget

| Tier | Loaded when | Approx cost | What is loaded |
|------|-------------|-------------|----------------|
| **Tier 0 — skill** | Always, every session | ~2k tokens | The `iai` router skill only. References are *not* loaded here |
| **Tier 1 — lifecycle** | On route, after the verb resolves | ~4k tokens | One verb's `SKILL.md`. The other thirteen are never loaded |
| **Tier 2 — domain pack** | On demand, after the `domain:` label is read | ~3k tokens | One `domain.md` binding plus one leaf skill. Other packs are never loaded |
| **References** | Never automatically | ~1–3k each | Read by explicit path, by the skill that needs the contract, at the moment it needs it |

Loading rule, stated as an invariant:

> A session that does nothing costs ~2k. A session that runs one Task in one
> domain costs roughly 2k + 4k + 3k plus the two or three references that Task
> actually reads — call it 12–15k. It never costs the sum of the tree.

Consequences worth designing around:

| Rule | Reason |
|------|--------|
| References are never listed as skills | Listing them would put twelve descriptions in every session's working set for content that is read by path |
| A skill reads at most 3 references | Beyond that, the skill is doing too many jobs and should be split |
| `description` is written for the router, not the human | It is the only part of a Tier-1 or Tier-2 skill that may be resident before invocation, so it must be discriminative in one paragraph |
| Bindings are data, not prose | `domain.md` is parsed, not read into context as narrative; a verbose binding is a per-invocation tax |
| Evidence stays on disk behind a sentinel | The 60000-char artifact budget exists precisely so large payloads never enter the model's context — the issue carries a pointer, not the payload |
