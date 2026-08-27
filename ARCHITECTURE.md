# Architecture

iAI is a monorepo that produces **one npm package** (for opencode) and **one
plugin directory** (for Claude Code) from a **single source of truth**.

The governing constraint, from research into both hosts:

> Claude Code hooks are **external processes** (stdin JSON → exit code + stdout JSON).
> opencode hooks are **in-process TypeScript functions** that mutate an `output`
> object and block by `throw`.
>
> **No hook code can be shared directly.** Therefore: a pure core with two thin
> adapter shims.

But the single biggest lever cuts the other way:

> opencode natively reads `.claude/skills/<name>/SKILL.md`.

So **every skill is written once**, lives in `skills/`, is installed to
`.claude/skills/`, and both hosts load the identical file. Skills are the bulk of
iAI. Only hooks, agents and commands need per-host generation.

---

## Layer diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  SURFACE            Claude Code            │        opencode      │
├────────────────────┬───────────────────────┼──────────────────────┤
│  Skills            │  .claude/skills/**/SKILL.md  (SHARED, 1 copy)│
├────────────────────┼───────────────────────┼──────────────────────┤
│  Agents            │  .claude/agents/*.md  │ .opencode/agents/*.md│
│  Commands          │  .claude/commands/    │ .opencode/commands/  │
│  Hooks             │  hooks.json + procs   │ plugin[] + Hooks{}   │
│                    │      ▲                │        ▲             │
│                    │  adapter-claude       │  adapter-opencode    │
├────────────────────┴───────────┬───────────┴──────────────────────┤
│  CORE  (pure TypeScript, no host imports)                         │
│    intent · routing · guards · classification · gh · evidence     │
├───────────────────────────────────────────────────────────────────┤
│  DOMAIN PACKS   dev · trade · health · wealth · know              │
│    each exports a DomainBinding {unit, verify, gate, evidence}    │
├───────────────────────────────────────────────────────────────────┤
│  SYSTEM OF RECORD    GitHub (issues, milestones, PRs) + git repo  │
│  SIDECAR             Pulse daemon :31337 (optional, read-only UI) │
└───────────────────────────────────────────────────────────────────┘
```

---

## Build Targets

<!-- forge parses this table mechanically. Columns matched by header name. -->

| Target | Type | Build file | Source dirs |
|--------|------|------------|-------------|
| iai-core | library | packages/core/package.json | packages/core/src |
| iai-adapter-opencode | library | packages/adapter-opencode/package.json | packages/adapter-opencode/src |
| iai-adapter-claude | library | packages/adapter-claude/package.json | packages/adapter-claude/src |
| iai-installer | binary | packages/installer/package.json | packages/installer/src |
| iai-domain-dev | library | packages/domain-dev/package.json | packages/domain-dev/src |
| iai-domain-trade | library | packages/domain-trade/package.json | packages/domain-trade/src |
| iai-domain-health | library | packages/domain-health/package.json | packages/domain-health/src |
| iai-domain-wealth | library | packages/domain-wealth/package.json | packages/domain-wealth/src |
| iai-domain-know | library | packages/domain-know/package.json | packages/domain-know/src |
| iai-pulse | binary | packages/pulse/package.json | packages/pulse/src |
| iai-skills | docs | — | skills |
| iai-agents | docs | — | agents |
| iai-references | docs | — | references |

`Type` is one of `library`, `binary`, `docs`. `docs` targets have no build file;
they are validated by the frontmatter linter rather than compiled.

---

## Components

### `iai-core` — the pure kernel

No host imports. No `process.cwd()`. Everything is a pure function from input to a
**decision object** that an adapter applies.

| Module | Responsibility |
|--------|----------------|
| `intent/` | TELOS parsing, ISA read/write, Current→Ideal delta, goal→milestone mapping |
| `routing/` | Category → model chain resolution, reasoning level, fallbacks |
| `guards/` | Pure predicates: `checkEgress`, `checkRiskMandate`, `checkSpend`, `checkCommitPrefix` |
| `classify/` | Data classification (`PUBLIC` / `INTERNAL` / `PRIVATE` / `SECRET`) |
| `gh/` | `gh` command construction + response parsing. Never shells out itself |
| `evidence/` | Artifact envelope, sentinel comments, permalink pinning, 60k budget |
| `binding/` | `DomainBinding` interface and registry |

The central type:

```ts
export interface DomainBinding {
  id: "dev" | "trade" | "health" | "wealth" | "know"
  unitOfWork: UnitSpec          // what a Task is in this domain
  verify:     VerifySpec        // what "passing" means, and the rungs to get there
  gate:       GateSpec          // the irreversible action, and who may authorise it
  evidence:   EvidenceSpec      // artifact kind, sentinel, path template
  labels:     { namespace: string; extra: LabelDef[] }
}
```

### `iai-adapter-opencode`

Exports a named `Plugin` per the opencode contract:

```ts
export const iAI: Plugin = async ({ client, project, directory, worktree, $ }) => ({
  "chat.message":        async (i, o) => { /* intent gate, ultrawork keyword */ },
  "chat.params":         async (i, o) => { /* category → model, reasoning level */ },
  "tool.execute.before": async (i, o) => { /* guards; throw = block */ },
  "tool.execute.after":  async (i, o) => { /* evidence capture */ },
  "permission.ask":      async (i, o) => { /* risk mandate auto-deny */ },
  event:                 async ({ event }) => { /* session.idle → checkpoint */ },
  "experimental.chat.system.transform": async (i, o) => { /* TELOS injection */ },
})
```

opencode-only capabilities that Claude Code cannot match — and which we therefore
treat as **enhancements, never load-bearing**: `chat.params` model rewriting,
`tool.definition` rewriting, `experimental.chat.system.transform`.

### `iai-adapter-claude`

A set of tiny CLI binaries registered in `hooks/hooks.json`. Each reads JSON on
stdin, calls the same core function, and writes stdout JSON + an exit code.

| Claude Code event | opencode equivalent | Core function |
|---|---|---|
| `SessionStart` | `event` → `session.created` | `session.start()` |
| `UserPromptSubmit` | `chat.message` | `intent.gate()` |
| `PreToolUse` | `tool.execute.before` | `guards.evaluate()` |
| `PostToolUse` | `tool.execute.after` | `evidence.capture()` |
| `Stop` | `event` → `session.idle` | `session.stop()` |
| `PreCompact` | `experimental.session.compacting` | `context.preserve()` |

Exit code 2 blocks in Claude Code; `throw` blocks in opencode. Both map from the
same `Decision { action: "allow" | "warn" | "block", message }`.

### `iai-installer`

`npx iai install [--host claude|opencode|both]`. Writes host-native artifacts:
generates agent markdown in each dialect (model IDs differ:
`"opus"` vs `"amd-anthropic/Claude-Opus-5"`), merges hook registrations without
clobbering, and links `skills/` into place. **Dry-run by default** — `--apply`
required, a lesson taken directly from LifeOS's install tooling.

### Domain packs

Each pack is a library exporting one `DomainBinding` plus any domain tools. Packs
never import each other. Cross-domain work is expressed as a Story dependency, not
a code dependency.

### `iai-pulse`

Optional read-only dashboard on `:31337`, modelled on LifeOS's Pulse. Renders the
GitHub state, the ISA tree, and per-domain surfaces. Never writes. If absent,
everything still works — `/iai:status` is the text-mode equivalent.

---

## Data model

**Filesystem + GitHub. No database.** Inherited from LifeOS's
*"treats the filesystem as its index instead of a vector store."*

| Kind | Location | Format |
|---|---|---|
| Intent | `USER/TELOS/TELOS.md` | Markdown, `G0`/`P0`/`S0` IDs |
| Story design (ISA) | `docs/design/{issue}-isa.md` | YAML frontmatter + 17 fixed sections |
| Test plan | `docs/test-plans/{issue}-plan.md` | Markdown tables, P0/P1/P2 |
| Evidence | `docs/evidence/{issue}-{ts}.md` | Markdown + committed raw data |
| Memory | `MEMORY/**` | Markdown + JSONL append-only |
| Domain data | `USER/{HEALTH,FINANCES,TRADING}/` | Markdown + YAML with declared schema |
| Work state | GitHub issues | Labels are the source of truth |

**Private data never enters the repo.** `USER/` is a symlink into a private store,
exactly as LifeOS does it. The public repo holds code, skills and *templates only*.

---

## Cross-cutting concerns

| Concern | Mechanism |
|---|---|
| Idempotency | Every skill re-runs safely; detect state, address only gaps |
| Verification | Never trust conversation memory; re-read disk and GitHub before acting |
| Egress | `classify/` + `guards/checkEgress` block `PRIVATE` data to cloud models |
| Secrets | `.env` only; deny-list on `cat/grep/rg` against it |
| Rate limits | `gh/` backs off; batch operations are resumable |
| Traceability | Every commit prefixed `#{issue}:`; every artifact has a sentinel comment |
| Context budget | Progressive disclosure — Tier 0 always, Tier 1 on route, Tier 2 on demand |

---

## Design decisions

| Decision | Rationale | Rejected alternative |
|---|---|---|
| GitHub as system of record for **all** domains | One state machine, one query language, free UI and history | Separate stores per domain |
| Skills in `.claude/skills/` | Both hosts read it natively — one copy, zero drift | Duplicate trees per host |
| Pure core + thin adapters | Hook runtimes are fundamentally incompatible | Lowest-common-denominator hooks |
| No config file for project context | forge's lesson: root docs carry the same info and help humans too | `iai-config.yaml` |
| Domain binding as data, not code branches | A sixth domain is one file, not fourteen edits | `if (domain === "trade")` |
| Trading defaults to `research` rung | The irreversible action must be opt-in, explicit and gated | Paper-trading default |
| Health is advisory-only, by construction | No medical authority; avoids the entire liability surface | Diagnostic scoring |
| References hold contracts, skills hold workflows | forge's lesson: 20 copies of a contract drift within a month | Self-contained skills |
| TypeScript on Bun | opencode loads plugins as in-process ES modules exporting async hooks, with no external-process escape hatch; the sub-50 ms guard budget has no out-of-process equivalent | A Python core behind a thin TS shim — splits the hottest and most safety-critical path across two languages, loses `tsc` drift detection between core and adapters, and forfeits the five inherited healthsync connectors |
