# The universal workflow

## One loop, five domains

There is exactly one pipeline. It does not branch by domain. A Story's
`domain:` label selects a `DomainBinding`, and the binding re-binds four
nouns — unit of work, verification, gate, evidence. The verbs never change.

The canonical run, modelled on forge's eleven-step pipeline but stripped of
every code-specific assumption:

| # | Command | Does | Produces |
|---|---------|------|----------|
| 0 | `/iai:init` | Bootstrap the repo. Once, ever. | Root docs, label set, `docs/` skeleton |
| 1 | `/iai:goal-create` | TELOS goal → GitHub milestone | Milestone with a `\| Feature \| Description \|` table in its description |
| 2 | `/iai:story-create 7` | One Story issue per feature-table row of milestone 7 | Stories `#57`, `#58`, `#59` … each labelled `type:story` + `domain:*` |
| 3 | `/iai:story-design 57` | Write the ISA | `docs/design/stories/57.md`, `## iai-isa` sentinel, story branch |
| 4 | `/iai:story-test-plan 57` | ISA verifiable claims (`ISC-N`) → verification plan | `docs/test-plans/57-plan.md`, `## iai-test-plan` sentinel |
| 5 | `/iai:task-create 57` | One task sub-issue per unit of work | `#61`, `#62`, `#63` … `type:task`, parented to `#57` |
| 6 | `/iai:task-do 61` | Execute the unit | `task/61-*` branch, commits, **draft** PR → story branch |
| 7 | `/iai:task-verify 61` | Run the verification | Evidence artifact, PR marked ready, `#61` `status:resolved` and closed |
| 8 | *(automatic)* | All tasks resolved → Story flips | `#57` gains `status:resolved` |
| 9 | `/iai:story-verify 57` | Run the full plan; open the integration PR | `## iai-verdict`, integration PR `story/57-* → main` |
| 10 | *(automatic)* | Integration PR merged into `main` | `#57` and all its tasks close via closing keywords |
| 11 | `/iai:learn 7` | Extract learnings | KB PRs, `## iai-learnings`, milestone closed |

Read the same eleven steps as prose, per domain, to see that nothing about them
is about software:

| Step | dev | trade | health |
|------|-----|-------|--------|
| 3 design | Component API + data flow | Strategy thesis + edge hypothesis | Protocol + target biomarker |
| 4 test plan | Unit + integration cases | Backtest windows, paper criteria, live criteria | Lab panel schedule + wearable deltas |
| 6 do | Write the build target | Implement + run the backtest | Log the protocol, collect the panel |
| 7 verify | Tests pass | Backtest meets the stated edge, out of sample | Trend moves in the stated direction |
| 9 story-verify | Integration suite | Paper-rung results over the full window | Full panel vs. baseline |
| 10 merge | Code lands on `main` | Thesis lands in `USER/TRADING/` | Protocol lands in `USER/HEALTH/` |

Steps 0, 8 and 10 take no argument or no command at all. Everything else takes
an issue or milestone number and is **idempotent** — see *Doctrines*.

---

## Hierarchy

Milestone → Story → Task sub-issue. Three levels, no more. A Story that needs a
fourth level is two Stories.

```
Milestone 7 — "Q1 Metabolic + Portfolio Reset"
│  Epic. Description carries the | Feature | Description | table.
│
├── #57  [type:story] [domain:health] [status:in-progress]
│    │   "Drive ApoB under 60 by end of Q1"
│    │   ISA:  docs/design/stories/57.md          (ISC-1 .. ISC-6)
│    │   Plan: docs/test-plans/57-plan.md     (4 P0 / 6 P1 / 2 P2)
│    │   Branch: story/57-apob-protocol
│    │
│    ├── #61 [type:task] "Baseline lipid panel + 90d wearable export"   [resolved]
│    ├── #62 [type:task] "Protocol v2 — dose, timing, adherence log"    [in-progress]
│    └── #63 [type:task] "Draft clinician question set for Q1 review"   [open]
│
├── #58  [type:story] [domain:trade] [status:blocked] [risk:vetoed]
│    │   "Reset portfolio to mandate-compliant sector weights"
│    │   ISA:  docs/design/stories/58.md
│    │   Rung: rung:paper   (rung:live NOT authorised)
│    │   Branch: story/58-portfolio-reset
│    │
│    ├── #64 [type:task] "Correlation cluster analysis of current book"  [resolved]
│    ├── #65 [type:task] "Rebalance proposal + risk-officer assessment"  [blocked]
│    └── #66 [type:task] "Paper-rung execution over Q4 window"           [open]
│
└── #59  [type:story] [domain:dev] [status:resolved]
     │   "Ship acme/telemetry metric export"
     │   ISA:  docs/design/stories/59.md
     │   Branch: story/59-telemetry-export
     │
     ├── #67 [type:task] "OTLP exporter in packages/core/src/telemetry"  [resolved]
     └── #68 [type:task] "Integration test against acme/telemetry v2"    [resolved]
```

| Level | GitHub object | Labelled | Owns |
|-------|---------------|----------|------|
| Epic | Milestone | — (milestones take no labels) | The feature table |
| Story | Issue | `type:story` + `domain:*` + one `status:*` | ISA, test plan, story branch, integration PR |
| Task | Sub-issue of a Story | `type:task` + one `status:*` | One unit of work, one task branch, one draft PR |

`#58` above is the interesting row: a `domain:trade` Story sitting at
`status:blocked` with `risk:vetoed`, because `risk-officer` refused `#65`. The
milestone cannot complete until a human either revises the proposal or logs an
override to the trade journal. That is the whole design working as intended.

---

## Labels

Labels are the **source of truth** for state. Not issue state, not project
columns, not the conversation. `/iai:init` creates every label below and is
idempotent — re-running reconciles colours and descriptions without churn.

| Label | Colour | Description |
|-------|--------|-------------|
| `type:epic` | `5319e7` | Epic-level work; tracked as a milestone reference |
| `type:story` | `0e8a16` | One end-to-end deliverable outcome |
| `type:task` | `1d76db` | One unit of work within a Story |
| `type:bug` | `d73a4a` | Defect against shipped work |
| `status:in-progress` | `fbca04` | Actively being worked |
| `status:resolved` | `0e8a16` | Work complete, awaiting closure |
| `status:reopened` | `d93f0b` | Was resolved, regressed or rejected |
| `status:blocked` | `b60205` | Cannot proceed; blocker named in a comment |
| `domain:dev` | `1f6feb` | Software development pack |
| `domain:trade` | `8250df` | Stock trading pack |
| `domain:health` | `1a7f37` | Health monitoring pack |
| `domain:wealth` | `bf8700` | Wealth and obligations pack |
| `domain:know` | `0969da` | Knowledge and sources pack |
| `rung:*` | varies | Domain-defined verification ladder. See the rung table below |
| `gate:pending` | `fbca04` | A human decision is required before this can advance |
| `gate:approved` | `2da44e` | Human decision recorded; pipeline may proceed |
| `risk:vetoed` | `a40e26` | `risk-officer` VETO. Unappealable except by logged human override |
| `class:private` | `6e7781` | Contains `PRIVATE` data; egress to cloud models is blocked |
| `iai` | `24292f` | Created or managed by iAI |

### The rung namespace

`rung:*` is **domain-defined, not global**. Every domain declares exactly four
rungs in its `DomainBinding.verify.rungs`, forming a ladder from cheapest and
most reversible to most expensive and least reversible. A Story carries exactly
one rung at a time, and promotion is a gate.

Colours ramp identically across every ladder so the progression is readable at a
glance regardless of domain: `c5def5` → `bfd4f2` → `79b8ff` → `cf222e`.

| Domain | Rung 1 | Rung 2 | Rung 3 | Rung 4 |
|--------|--------|--------|--------|--------|
| `dev` | `rung:compile` | `rung:unit` | `rung:integration` | `rung:review` |
| `trade` | `rung:research` | `rung:backtest` | `rung:paper` | `rung:live` |
| `health` | `rung:observe` | `rung:trend` | `rung:flag` | `rung:clinician-review` |
| `wealth` | `rung:recorded` | `rung:reconciled` | `rung:projected` | `rung:optimised` |
| `know` | `rung:captured` | `rung:distilled` | `rung:cross-linked` | `rung:contradiction-checked` |

Only two rung-4 values are irreversible in the sense that matters:
`rung:live` commits real capital, and `rung:clinician-review` puts a human
clinician in the loop. Those two are the only rungs an auto mode may never
reach. See *Gates*.

Label rules:

| Rule | Detail |
|------|--------|
| One status | At most **one** `status:*` label per issue. Zero means Open. |
| One domain | Exactly one `domain:*` on every Story. Tasks inherit their Story's domain. |
| One rung | Every Story carries exactly one `rung:*` drawn from its own domain's ladder. Default is that domain's rung 1. |
| Additive markers | `gate:*`, `risk:vetoed`, `class:private`, `iai` are orthogonal and may coexist |
| Colours are reconciled | `/iai:init` corrects drifted hex values without recreating labels |

---

## State machine

Labels are the source of truth. GitHub's `open`/`closed` state is a *derived*
signal, useful for filtering but never authoritative on its own.

Three invariants:

1. **At most one `status:` label.** Zero `status:` labels on an open issue means
   Open. Two is a corruption and the conductor emits a hard failure.
2. **Every transition is a single command.** One `gh issue edit` with an
   `--add-label` and a `--remove-label` in the same invocation. Never two
   commands, so there is no window where the issue has zero or two statuses.
3. **Every transition is idempotent.** Re-applying a label already present is a
   no-op and must not error. Re-running a transition skill re-derives the target
   state and issues the transition only if it differs.

### Epic (Milestone)

| State | GitHub state | Status label | Enters when | Leaves when |
|-------|--------------|--------------|-------------|-------------|
| Open | milestone open, 0 stories | — | `/iai:goal-create` | First Story created |
| In Progress | milestone open, ≥1 story | — | `/iai:story-create` | All Stories resolved |
| Resolved | milestone open, all stories resolved | — | Last Story resolves | `/iai:learn` |
| Closed | milestone closed | — | `/iai:learn {m}` completes | Reopened manually |

Milestones carry no labels — GitHub does not support them. Epic state is derived
from the Stories underneath.

### Story

| State | GitHub state | Status label | Enters when | Leaves when |
|-------|--------------|--------------|-------------|-------------|
| Open | open | *(none)* | `/iai:story-create` | Design starts |
| In Progress | open | `status:in-progress` | `/iai:story-design` begins | All tasks resolved |
| Blocked | open | `status:blocked` | Hard failure, refused gate, or `risk:vetoed` | Blocker cleared |
| Resolved | open | `status:resolved` | Last task resolves (step 8, automatic) | Integration PR merges |
| Closed | closed | `status:resolved` | Integration PR merges into `main` (step 10) | Regression found |
| Reopened | open | `status:reopened` | Verdict `FAIL` after closure, or regression | Re-resolved |

```
Open ──story-design──▶ In Progress ──all tasks resolved──▶ Resolved
  ▲                        │  ▲                                │
  │                        ▼  │                          integration PR
  │                    Blocked │                            merged
  │                        └───┘                                │
  │                                                             ▼
  └────────────────── Reopened ◀──── regression / FAIL ──── Closed
```

### Task

| State | GitHub state | Status label | Enters when | Leaves when |
|-------|--------------|--------------|-------------|-------------|
| Open | open | *(none)* | `/iai:task-create` | `/iai:task-do` starts |
| In Progress | open | `status:in-progress` | `iai-executor` claims it | Unit of work lands |
| Blocked | open | `status:blocked` | Executor reports `BLOCKED` | Blocker cleared |
| Resolved | open | `status:resolved` | Verification passes in `/iai:task-verify` | Explicitly closed |
| Closed | closed | `status:resolved` | iAI closes it explicitly (task PRs do **not** auto-close) | Regression found |
| Reopened | open | `status:reopened` | Validator finds drift, or story-verify `FAIL` | Re-resolved |

Transition shape, always:

```bash
gh issue edit 61 --add-label "status:resolved" --remove-label "status:in-progress"
```

For an issue entering its first status, the `--remove-label` is simply omitted;
for a no-op transition the command is skipped after reading current labels.

---

## Gates

A gate is a **stop before an irreversible action**. Every gate is the same three
artifacts: a `gate:pending` label, a `## iai-gate` sentinel comment carrying the
decision request, and — on opencode only — a matching `permission.ask` hook that
blocks the tool call at runtime. Claude Code expresses the same block as a
`PreToolUse` process exiting 2.

| Gate | Triggers when | Who approves | Blocking? |
|------|---------------|--------------|-----------|
| Design approval | ISA written, before `/iai:task-create` | Human, informed by `iai-critic` | Yes |
| Implementation review | Draft PR ready, before marking ready-for-review | Human, informed by `iai-validator` | Yes |
| Closure | `story-verify` returns `PASS`, before integration PR merges | Human only | Yes — **iAI never merges** |
| Rung promotion | `rung:research` → `rung:paper`, or `rung:paper` → `rung:live` | Human principal + `risk-officer` `PASS` | Yes — `rung:live` additionally requires a signed mandate and an armed kill switch |
| Live order authorisation | Every single order at `rung:live` | Human principal, **per order** | Yes — never batched, never delegated, never remembered across orders |
| Spend over threshold | `wealth-steward` proposes an outflow above the configured limit | Human principal | Yes |
| Clinician boundary | `health-analyst` output would name a condition or alter a therapy | Human; rewritten as a clinician question | Yes — output is held, never emitted |
| Egress of PRIVATE data | Any `class:private` content would reach a cloud model or an external request | Human; default is **deny**, not ask | Yes — auto-denied by `checkEgress`; approval routes to a local model instead |

### Gate anatomy

```markdown
## iai-gate

**Gate:** rung-promotion
**Story:** #58
**Request:** promote domain:trade from rung:paper to rung:live
**Proposed by:** quant-analyst
**Risk assessment:** RISK #58: PASS_WITH_CONDITIONS (max 4% single-name, hard stop -8%)
**Preconditions:**
- [x] Written mandate at USER/TRADING/MANDATE.md, signed 2026-01-04
- [x] Paper-rung results over full Q4 window committed to docs/evidence/58-*.md
- [ ] Kill switch armed and verified
**Decision:** PENDING
```

Rules:

| Rule | Detail |
|------|--------|
| Default is deny | An unanswered gate never times out into approval |
| One gate, one comment | Re-running a skill updates the existing `## iai-gate` comment; it does not stack new ones |
| Approval is a human comment | An agent may never write `**Decision:** APPROVED`. The `gate:approved` label is applied only after a human comment exists |
| Blocking is enforced twice | Label + hook. Removing the label without the hook approving still blocks the tool call |
| `risk:vetoed` outranks gates | A veto is not a gate. No approval path exists for another agent |

`/iai:auto` at `rung:live` does not exist. See *Auto modes*.

---

## Branches and PRs

```
main
 │
 ├─◀── integration PR  (story/57-apob-protocol → main)   ← the ONLY auto-closing PR
 │
 └── story/57-apob-protocol
      │
      ├─◀── draft PR  (task/61-baseline-panel → story/57-apob-protocol)
      ├─◀── draft PR  (task/62-protocol-v2   → story/57-apob-protocol)
      └─◀── draft PR  (task/63-clinician-qs  → story/57-apob-protocol)
```

| Kind | Pattern | Cut from | Targets | Example |
|------|---------|----------|---------|---------|
| Story | `story/{n}-{slug}` | `main` | `main` (integration PR) | `story/57-apob-protocol` |
| Task | `task/{n}-{slug}` | the story branch | the story branch | `task/61-baseline-lipid-panel` |
| Bug | `bug/{n}-{slug}` | `main` | `main` | `bug/72-exporter-drops-labels` |

### Slug rule

| Step | Rule |
|------|------|
| 1 | Lowercase the issue title |
| 2 | Collapse every run of non-alphanumeric characters to a single `-` |
| 3 | Strip leading and trailing `-` |
| 4 | Truncate to **40 characters**, then strip any trailing `-` again |

```
"Baseline lipid panel + 90d wearable export"  →  baseline-lipid-panel-90d-wearable-export
"Rebalance proposal & risk-officer assessment" →  rebalance-proposal-risk-officer-assessm
"Ship acme/telemetry metric export"            →  ship-acme-telemetry-metric-export
```

### The closing-keyword gotcha

**GitHub's closing keywords only fire when a PR merges into the repository's
DEFAULT branch. Task PRs target the story branch, not `main`, so `Closes #61` in
a task PR body does NOTHING — the task issue is never auto-closed. iAI closes
task issues explicitly with `gh issue close`. Only the integration PR
(`story/57-* → main`) closes issues automatically, and its body needs one
`Closes #N` PER LINE, because GitHub does not parse comma-separated lists —
`Closes #57, #61, #62` closes `#57` and silently ignores the rest.**

Correct integration PR body:

```markdown
Closes #57
Closes #61
Closes #62
Closes #63
```

Wrong, and it will look like it worked:

```markdown
Closes #57, #61, #62, #63
```

| Merge target | Closing keywords fire? | Who closes the issue |
|--------------|------------------------|----------------------|
| task PR → story branch | **No** | `/iai:task-verify` runs `gh issue close 61` |
| story PR → `main` | **Yes** | GitHub, one `Closes #N` per line |
| bug PR → `main` | **Yes** | GitHub |

### Non-code domains use branches and PRs too

This is the key insight that makes one workflow serve all five domains. A health
protocol change is a PR. A trade thesis is a PR. A reconciliation of last
quarter's statements is a PR. They target the **private data repo** rather than
the public code repo, but they are the same object: a proposed diff, reviewable,
attributable, revertible, and mergeable only by a human.

| Domain | What the PR contains | Repo |
|--------|----------------------|------|
| `dev` | Source, tests, docs | public code repo |
| `trade` | Thesis, backtest output, mandate deltas, journal entries | private data repo (`USER/TRADING/`) |
| `health` | Protocol revision, panel results, trend notes, clinician questions | private data repo (`USER/HEALTH/`) |
| `wealth` | Statement diffs, obligation schedule, spend model | private data repo (`USER/FINANCES/`) |
| `know` | Source snapshots, extracted claims, contradiction findings | KB repo or `MEMORY/` |

The consequence: your ApoB protocol has a diff, a reviewer, a merge commit and a
revert path — exactly like a code change. Nothing about the state machine, the
labels, the gates or the evidence model needs a special case.

---

## Evidence and sentinels

A **sentinel** is a magic heading that makes an issue comment machine-findable.
It is how the pipeline reads its own history without a database.

| Sentinel | Producer | Artifact path |
|----------|----------|---------------|
| `## iai-isa` | `/iai:story-design` | `docs/design/stories/{n}.md` |
| `## iai-test-plan` | `/iai:story-test-plan` | `docs/test-plans/{n}-plan.md` |
| `## iai-evidence` | `/iai:task-verify`, `/iai:story-verify` | `docs/evidence/{n}-{ts}.md` |
| `## iai-verdict` | `/iai:story-verify` | inline (comment only) |
| `## iai-checkpoint` | `/iai:checkpoint`, `session.idle` | inline (comment only) |
| `## iai-gate` | any gate trigger | inline (comment only) |
| `## iai-risk` | `risk-officer` | `USER/TRADING/JOURNAL/{date}-*.md` |
| `## iai-effort` | `/iai:size`, `/iai:replan` | inline (comment only) |
| `## iai-learnings` | `/iai:learn` | KB PR + `MEMORY/**` |

### Producer rule

| Requirement | Detail |
|-------------|--------|
| First line | The sentinel is the **first line of the comment body**. Nothing precedes it — no greeting, no blank-line-prefixed preamble |
| Not indented | Column zero. A leading space breaks the match |
| Not fenced | Never inside a code fence. A fenced `## iai-isa` is documentation, not a sentinel |
| Exact | Lowercase, hyphenated, `##` heading level. `### iai-isa` does not match |
| One per comment | A comment carries exactly one sentinel |

### Consumer rule

Query, then disambiguate:

```bash
gh issue view 57 --json comments \
  --jq '[.comments[] | select(.body | startswith("## iai-verdict"))]
        | sort_by(.createdAt) | last'
```

If multiple comments match a sentinel, **use the most recent by `createdAt`**.
Earlier ones are history, not state — never merge them, never average them.
Absence of a required sentinel is a hard failure, not a default.

### The 60000-character budget

GitHub caps an issue comment body at **65536 characters**. iAI budgets **60000**
and treats the remainder as headroom for the sentinel, metadata and permalinks.

| Artifact size | Strategy |
|---------------|----------|
| ≤ 60000 chars | Inline the full content below the sentinel |
| > 60000 chars | Post a summary plus an **SHA-pinned permalink** to the committed artifact |

```markdown
## iai-evidence

**Story:** #57 · **Run:** 2026-01-14T09:22:11Z · **Verdict:** PASS
**Cases:** 4/4 P0, 6/6 P1, 1/2 P2 (1 deferred — see drift)

Full output (184 kB) exceeds the inline budget:
https://github.com/acme/telemetry/blob/4f2a1c9e/docs/evidence/57-20260114T092211.md
```

Permalinks are pinned to a commit SHA, never to a branch name. A
`blob/main/...` link rots the moment the file moves; a `blob/4f2a1c9e/...` link
is permanent and is what makes the evidence trail auditable months later.

---

## Commit convention

Every commit is prefixed with the issue it belongs to. This is the thread that
ties a diff to a unit of work to a Story to a goal.

```
#{issue}: {message}
```

```
#61: add baseline lipid panel importer with unit normalisation

Parses the Q4 panel PDF into USER/HEALTH/panels/2026-01-09.yaml and
normalises mg/dL vs mmol/L per the ISA's ISC-2.

Co-Authored-By: iAI <noreply@iai.dev>
```

| Element | Rule |
|---------|------|
| Prefix | `#` + issue number + `: ` — no space between `#` and the number |
| Message | Imperative mood, lowercase first word, no trailing period |
| Body | Optional; wrap at 72 columns |
| Trailer | `Co-Authored-By: iAI <noreply@iai.dev>` on every agent-authored commit |

Validation regex, enforced by `guards/checkCommitPrefix`:

```
^(#[0-9]+: .+|Merge .+|fixup! .+|squash! .+|Revert ".+")
```

| Exemption | Why |
|-----------|-----|
| `Merge …` | Generated by git; no issue context available |
| `fixup! …` | Autosquash marker; inherits its target's prefix on rebase |
| `squash! …` | Same |
| `Revert "…"` | Generated by `git revert`; carries the original subject |

A commit failing the regex is blocked before it is written — `PreToolUse` on
Claude Code, `tool.execute.before` throwing on opencode.

---

## Auto modes

Auto modes run several pipeline steps without stopping between them. They never
remove a gate; they only remove the pauses *between* gates.

| Mode | Command | Scope | Gates |
|------|---------|-------|-------|
| Full auto | `/iai:auto <milestone\|story>` | Steps 3–9 for every Story in scope | **3** — design approval, implementation review, closure |
| My tasks | `/iai:auto-mine` | Steps 6–7 for every open task assigned to you | **1** — implementation review |
| Bug fix | `/iai:bug-fix <issue>` | Reproduce → fix → verify → PR | **2** — fix approval, closure |
| Trading | `/iai:auto` on a `domain:trade` Story | Steps 3–9, **capped at `rung:paper`** | 3 + rung promotion + per-order |
| Manual | individual `/iai:*` skills | One step | **0** — you are the gate |

### The trading hard rule

> **`/iai:auto` is NEVER permitted past `rung:paper`.**

This is not a default, a setting, or a confidence threshold. It is a hard rule in
`guards/checkRiskMandate`. An auto run against a `rung:live` Story is refused at
dispatch, before any agent is spawned:

```
HARD FAILURE in Phase 6 (task-do):
- Story: #58
- Expected: rung:research or rung:paper for an /iai:auto run
- Found: rung:live
- Action: Pipeline cannot continue. Fix and re-run.
```

`rung:live` work is manual only, one order at a time, each with its own human
authorisation gate, against a signed mandate, with the kill switch armed. There
is no batch mode for real capital and there never will be.

The same shape applies elsewhere: auto mode is refused when a Story carries
`risk:vetoed`, when a `class:private` artifact would egress, or when a
clinician-boundary gate is pending.

---

## Doctrines

Three inherited rules that every skill, agent and hook is written against. They
are short because they are absolute.

### Idempotency

> **Every skill is idempotent. Re-running detects what exists and addresses only
> the gaps. Agents die and get respawned.**

An agent can be killed mid-phase by a timeout, a context limit, a crash, or a
human hitting escape. The recovery strategy is not a transaction log — it is
re-running the same command. `/iai:story-design 57` on a Story that already has
an ISA reads it, finds the gaps, and fills only those. It does not overwrite, it
does not duplicate the sentinel comment, and it does not create a second branch.

| Skill | Detects | Fills only |
|-------|---------|-----------|
| `/iai:init` | Existing labels, docs, dirs | Missing ones; reconciles drifted colours |
| `/iai:story-create` | Stories already created for the milestone | Feature-table rows with no Story |
| `/iai:task-create` | Existing task sub-issues | Units of work with no task |
| `/iai:task-do` | Branch, commits, draft PR | Whichever is absent |

### Ephemerality

> **Never assume files, code or artifacts exist based on earlier conversation
> context. Verify actual state on disk and on GitHub before acting.**

Conversation memory is not state. It is a *hypothesis about* state that was true
at some point and may not be now — because a hook rewrote a file, because a human
force-pushed, because a sibling agent landed a commit, because the session was
compacted and the detail was dropped. The only truth is `test -f`, `git log`,
and `gh issue view`.

| Do not | Do |
|--------|-----|
| "I created the ISA earlier" | `test -f docs/design/stories/57.md && git log -1 -- docs/design/stories/57.md` |
| "The task is resolved" | `gh issue view 61 --json labels,state` |
| "The PR is open" | `gh pr list --head task/61-baseline-lipid-panel --json number,isDraft` |
| "Tests passed" | Re-run them and capture the output |

### Verification

> **Verify, don't assume.** The orchestrator checks GitHub rather than trusting
> agent self-reports.

An agent's output is a claim. `#61: RESOLVED` is a claim. Claims are checked
against the system of record before the pipeline advances one step, and when the
claim and the record disagree, the record wins and the conductor emits a
correction:

```
CORRECTION #61:
  - agent said: RESOLVED (draft PR #94 ready)
  - actual:     status:in-progress, PR #94 still draft, 0 verification files
  - using:      actual
  - action:     re-dispatch iai-executor with resume prompt
```

This closes the loop with separation of duties (`02-roles.md`): the agent that
proposes is never the agent that approves, and the approver reads the record,
not the transcript.
