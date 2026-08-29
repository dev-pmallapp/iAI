# Dual-target: Claude Code and opencode

iAI ships to two hosts from one repository. This document is the contract
between them: what is shared byte-for-byte, what must be generated twice, and
what exists on only one side and therefore may never be load-bearing.

The governing asymmetry, restated from [`ARCHITECTURE.md`](../../ARCHITECTURE.md):

> **Skills are shared.** opencode natively reads `.claude/skills/<name>/SKILL.md`.
> **Hooks are not shared.** Claude Code hooks are external processes; opencode
> hooks are in-process TypeScript. No hook code crosses the boundary.

Everything below follows from those two sentences.

---

## 1. Skills — write once, load twice

This is the single biggest lever in the design. opencode's skill discovery
searches, in order:

| # | Path | Scope |
|---|------|-------|
| 1 | `.opencode/skills/` | project, opencode-native |
| 2 | `~/.config/opencode/skills/` | user, opencode-native |
| 3 | `.claude/skills/` | project, **shared** |
| 4 | `~/.claude/skills/` | user, **shared** |
| 5 | `.agents/skills/` | project, host-neutral |
| 6 | `~/.agents/skills/` | user, host-neutral |

Discovery **walks up from the current working directory to the git worktree
root**, so a skill installed at the repo root is visible from any subdirectory
of the project. Claude Code reads path 3 and 4 only.

**Therefore iAI writes every skill exactly once, into `.claude/skills/`, and
both hosts load the identical file.** There is no per-host skill dialect, no
generation step, and no drift. Path 1 and 2 are left empty by the installer on
purpose — using them would create a second copy that can diverge.

### Frontmatter: the intersection schema

opencode recognises these SKILL.md frontmatter fields:

| Field | Required | Constraint |
|-------|----------|------------|
| `name` | yes | 1–64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`, **must match the containing directory name** |
| `description` | yes | 1–1024 chars |
| `license` | no | free string |
| `compatibility` | no | free string |
| `metadata` | no | `string -> string` map |

**Unknown fields are ignored silently.** That is a gift and a trap: a typo in a
field name produces no error on either host, so `skill-lint` in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) validates against this exact schema
and fails on anything outside it. Write only the intersection.

`name` matching the directory is the rule most often broken by hand-editing.
Renaming a skill means renaming the directory *and* the field, together.

### Progressive disclosure

Only `name` and `description` are compiled into the `skill` tool's description
— that is, into every request's token budget. The **body loads only on
`skill({name})`**. Two consequences that shape how iAI writes skills:

1. The `description` is not a summary, it is a **router**. It must contain the
   phrases a person actually says. Token cost is per-turn and permanent, so
   keep it under roughly 300 characters.
2. The body is free. A 400-line skill costs nothing until invoked, which is why
   iAI's Tier-1 and Tier-2 skills carry full workflows rather than pointers.

This is the mechanism behind ARCHITECTURE's context budget row: Tier 0 always
resident, Tier 1 on route, Tier 2 on demand.

---

## 2. Hooks — the deepest incompatibility

| | Claude Code | opencode |
|---|---|---|
| What a hook *is* | An external process | An in-process TypeScript function |
| Runtime | Anything executable | Bun |
| Registration | JSON in settings | Named export from a module in the `plugin` array |
| Input | JSON on **stdin** | An `input` argument |
| Output | **stdout JSON + exit code** | **Mutate the `output` argument** |
| Block | **exit code 2**; stderr is fed to the model | **`throw new Error(...)`** |
| Language | Agnostic | TypeScript only |
| Isolation | Process boundary; a crash is contained | Shared process; an unhandled throw is a block |

There is no shim that makes one look like the other. iAI's answer is the pure
core: `guards/` returns a `Decision { action, message }`, and each adapter
translates that decision into its host's dialect — exit 2 on one side, `throw`
on the other.

### Event mapping

| Claude Code event | opencode equivalent |
|---|---|
| `PreToolUse` | `tool.execute.before` |
| `PostToolUse` | `tool.execute.after` |
| `UserPromptSubmit` | `chat.message` |
| `Stop` / `SubagentStop` | `event` → `session.idle` |
| `PreCompact` | `experimental.session.compacting` |
| `SessionStart` | `event` → `session.created` |
| *(no equivalent)* | `chat.params` |
| *(no equivalent)* | `chat.headers` |
| *(no equivalent)* | `tool.definition` |
| *(no equivalent)* | `experimental.chat.system.transform` |
| *(no equivalent)* | `permission.ask` |

Note the shape difference in rows 4 and 6: Claude Code has *named events*, while
opencode routes lifecycle signals through a single `event` hook that switches on
`input.event.type`. The adapter, not the core, owns that switch.

The last five rows are opencode-only. `chat.params`,
`experimental.chat.system.transform` and `tool.definition` let opencode rewrite
model parameters, the system prompt and tool schemas **per request** — Claude
Code hooks cannot do any of this, because they run beside the request rather
than inside it. **These are enhancements, never load-bearing.** Any behaviour
that only works when the system prompt can be rewritten is a behaviour Claude
Code users silently lose, which is unacceptable for anything in the safety path.
See [Degradation rules](#degradation-rules).

### The opencode Hooks signatures we use

Verbatim, from the `@opencode-ai/plugin` type surface. iAI's
`adapter-opencode` implements exactly these seven:

```ts
"chat.message"?: (
  input:  { sessionID, agent?, model?, messageID?, variant? },
  output: { message, parts }
) => Promise<void>

"chat.params"?: (
  input:  { sessionID, agent, model, provider, message },
  output: { temperature, topP, topK, maxOutputTokens, options }
) => Promise<void>

"tool.execute.before"?: (
  input:  { tool, sessionID, callID },
  output: { args }
) => Promise<void>

"tool.execute.after"?: (
  input:  { tool, sessionID, callID, args },
  output: { title, output, metadata }
) => Promise<void>

"permission.ask"?: (
  input:  Permission,
  output: { status: "ask" | "deny" | "allow" }
) => Promise<void>

event?: (
  input: { event: Event }
) => Promise<void>

"experimental.chat.system.transform"?: (
  input:  { sessionID?, model },
  output: { system: string[] }
) => Promise<void>
```

Read the `output` parameter as an out-parameter: you **mutate it in place** and
return nothing. `output.args.command = sanitise(output.args.command)` rewrites
the tool call. Returning a new object does nothing.

### The plugin type

```ts
export type Plugin = (
  input: PluginInput
) => Promise<Hooks>

interface PluginInput {
  client                  // the opencode SDK client
  project                 // project metadata
  directory               // the current working directory
  worktree                // the git worktree root
  serverUrl               // the local opencode server
  $                       // Bun shell
  experimental_workspace  // unstable
}
```

Three rules that follow:

1. **The module default-exports the plugin.** `export default plugin`. omo ships
   exactly this shape; a named export alongside it is harmless but is not what
   the loader reads.
2. **A TypeScript plugin is registered through the `plugin` array** in
   `opencode.json`, not by being dropped in a directory. `.opencode/plugins/`
   (project) and `~/.opencode/plugins/` (user) are the Claude-Code-style plugin
   *bundle* directories — folders carrying a `plugin.json` — which is a
   different mechanism. The installer writes the config entry.
3. **Never call `process.cwd()`.** Use `context.directory` or
   `context.worktree` from `PluginInput`. opencode's cwd is not guaranteed to be
   the project root — it follows the invoking shell, and skill discovery walks
   up from it. A guard that resolves `USER/` or `.env` against `process.cwd()`
   will read the wrong tree, or silently read nothing, which for an egress guard
   means **fail-open**. This is a lint rule, not a convention:
   `process.cwd()` is banned in `packages/core` and `packages/adapter-opencode`.

### Latency budget: 50 ms

opencode hooks are `async` and are **awaited in sequence across every installed
plugin**. Your `tool.execute.before` runs after everyone else's and before the
tool does anything. A 300 ms guard on a session that makes 40 tool calls costs
12 seconds of pure stall, and the user perceives it as the model being slow.

| Rule | Value |
|---|---|
| Budget per guard invocation | **< 50 ms** |
| Permitted inside a guard | Pure computation, in-memory cache reads, one small `readFileSync` |
| Forbidden inside a guard | Network calls, `gh` invocations, model calls, directory walks, anything unbounded |
| If work exceeds the budget | Precompute at `session.created` and cache; or move it into a skill where the latency is visible and attributable |

This is why `guards/` in the core is a set of **pure predicates** over data the
adapter has already loaded. The core never does I/O; the adapter does I/O once,
at session start, and hands the guard a snapshot.

---

## 3. Agents — generated per host

Agents cannot be shared. The frontmatter dialects differ in the two fields that
matter most: identity and model.

### Claude Code — `.claude/agents/<name>.md`

| Field | Form |
|---|---|
| `name` | required, and duplicated by the filename |
| `description` | required; drives delegation |
| `tools` | a **comma-separated string**: `Read, Grep, Glob` |
| `model` | an **alias**: `opus` \| `sonnet` \| `haiku` |

### opencode — `.opencode/agents/<name>.md`

| Field | Form |
|---|---|
| `name` | **absent** — the filename is the name |
| `description` | **required** |
| `mode` | `primary` \| `subagent` \| `all` |
| `model` | **fully qualified**: `provider/model-id`, e.g. `amd-anthropic/Claude-Opus-5` |
| `permission` | a structured object — see below |
| `temperature`, `top_p` | numbers |
| `prompt` | inline, or a reference: `{file:./prompts/risk-officer.txt}` |
| `color`, `hidden`, `steps` | presentation and step cap |
| `tools` | **deprecated** — use `permission` |

So `iai-critic` is one logical agent emitted as two files: `name: iai-critic` +
`model: opus` + `tools: Read, Grep, Glob` for Claude Code, and no `name` +
`model: amd-anthropic/Claude-Opus-5` + a `permission` block for opencode. The
installer generates both from one `AgentSpec` in `packages/core`.

### The permission object

`permission` accepts these keys: `edit`, `bash`, `webfetch`, `read`, `glob`,
`grep`, `list`, `task`, `todowrite`, `websearch`, `lsp`, `skill`, `question`,
`doom_loop`, `external_directory`. Each takes `"allow" | "ask" | "deny"`, and
`bash` (among others) additionally accepts a **pattern → action map**.

Two mechanics decide whether your policy actually holds:

> **Matching is wildcard, and the LAST matching rule wins.**

Therefore `"*"` goes **first**, and specific denials follow it:

```yaml
permission:
  bash:
    "*": allow                # broad default, stated first
    "git push --force*": deny # specific, stated later, wins
    "cat .env*": deny
    "rm -rf*": deny
  edit: ask
  external_directory: deny
```

Write it the other way round and every deny is overwritten by the wildcard.
This is the single most common misconfiguration in opencode agents, and
`skill-lint`'s agent pass checks for it.

`permission.task` is a single `allow` / `ask` / `deny` for the Task tool as a
whole — it does not take a per-subagent map, and nothing removes an individual
subagent from the tool's description. Separation of duties therefore has **no
declarative form on either host**. What makes
[`05-domain-trading.md`](05-domain-trading.md)'s *"`quant-analyst` cannot spawn
it, skip it, summarise for it, or filter its inputs"* a runtime fact is
structural rather than declarative: Ring 2 specialists are issued no Task tool
at all, so `quant-analyst` has no spawn capability to misuse.

Claude Code is no different. There, the same separation is enforced by the
`PreToolUse` guard inspecting `Task` invocations and exiting 2. Same policy, two
enforcement points, one core predicate.

---

## 4. Commands — roughly 90% portable

| Aspect | Claude Code | opencode |
|---|---|---|
| Directory | `.claude/commands/` | `.opencode/commands/` |
| Body | Markdown | Markdown |
| All args | `$ARGUMENTS` | `$ARGUMENTS` |
| Positional | `$1` `$2` `$3` | `$1` `$2` `$3` |
| Shell injection | ``!`cmd` `` | ``!`cmd` `` |
| File reference | `@path` | `@path` |
| Frontmatter | `allowed-tools`, `argument-hint`, `model`, `description`, `disable-model-invocation` | `description`, `agent`, `model`, `subtask`, `template` |

The body language is identical. Only the frontmatter differs, and **both hosts
ignore keys they do not recognise** — so the strategy is: write one file,
install it to both directories, carry the union of frontmatter keys, and let
each host read its own subset.

The one real trap: **Claude Code requires a ``!`cmd` `` to be pre-declared in
`allowed-tools`**, or the injection fails. opencode simply runs it. So every
iAI command that shells out must declare it:

```yaml
---
description: Show the current iAI work state across all domains
argument-hint: "[domain]"
allowed-tools: Bash(gh issue list:*), Bash(git status:*)
agent: iai-conductor
model: amd-anthropic/Claude-Opus-5
---
```

Claude Code reads `description`, `argument-hint`, `allowed-tools` and its own
`model`; opencode reads `description`, `agent` and `model`. The `model` value is
opencode-shaped, which Claude Code would reject — so this is the one key the
installer rewrites per host rather than sharing.

---

## 5. Distribution

### opencode

Named in the `plugin` array of `opencode.json`. Bun installs it at startup and
caches it in `~/.cache/opencode/node_modules/`.

```jsonc
{
  "plugin": [
    "iai"
  ]
}
```

The type is `plugin?: string[]`, each entry a package specifier or path.
Deployment-specific configuration — provider naming, telemetry endpoints —
must come from `opencode.json` itself, not from the plugin array.

### Claude Code

A git repository containing `.claude-plugin/plugin.json`, installed with
`/plugin`, or dropped into `~/.claude/plugins/`. No registry, no version
resolution — configuration comes from settings files.

### Config precedence in opencode

Later wins, and configs are **merged, not replaced**:

```
remote
  → global ~/.config/opencode/opencode.json
    → OPENCODE_CONFIG
      → project opencode.json
        → .opencode/ directories
          → OPENCODE_CONFIG_CONTENT
            → managed files
```

Merging is why the installer can add `"iai"` to the `plugin` array without
owning the file, and why it must never rewrite the whole document. It reads,
adds its own entry if absent, and writes back — idempotently, and behind
`--apply`.

### A hypothetical v2 plugin API

No such API has been observed. Searches for `@opencode-ai/plugin/v2` across the
source tree return nothing, and omo pins the package at `1.18.22`. This section
is therefore a contingency, not a description: *if* a registration API of this
shape ever lands, it would delete most of `iai-installer`'s opencode path, which
is a reason to keep that path thin and replaceable.

A speculative sketch of the shape such an API *might* take, purely to reason
about the contingency — this is not a real import and must not be written
against:

```ts
// SPECULATIVE — no such module exists today.
import { define } from "@opencode-ai/plugin/v2/promise"

export default define({
  id: "iai",
  setup: async (ctx) => {
    // ctx would expose agent / command / skill / catalog drafts,
    // each with a `transform` hook
  },
})
```

If something like this ever ships, it would be materially better for iAI's
shape: it would register **many agents, commands and skills from one npm
package**, with a `transform` hook per draft, instead of requiring the
installer to write files into the user's project.

**Do not plan against it.** It does not exist today, so there is nothing to
depend on and nothing to version. The stance:

| Now | If a registration API ever lands |
|---|---|
| v1 `Hooks` API for guards and routing | Re-evaluate once something is actually documented |
| `iai-installer` for agents, commands and skills | Migrate registration only after confirming the API is real and stable |
| — | **Pin `@opencode-ai/plugin` to an exact version** before adopting anything unstable |

Treat this as a contingency worth designing around, not as a
milestone dependency.

---

## Compatibility matrix

| Capability | Claude Code | opencode | iAI strategy |
|---|---|---|---|
| **Skills** | `.claude/skills/**/SKILL.md` | reads the same path natively | **Shared, one copy.** Install to `.claude/skills/`, intersection frontmatter only |
| **Agents** | `.claude/agents/*.md`, `name` + `tools` string + model alias | `.opencode/agents/*.md`, no `name`, `permission` object, qualified model ID | **Generated twice** from one `AgentSpec` by the installer |
| **Commands** | `.claude/commands/`, `allowed-tools` gates ``!`cmd` `` | `.opencode/commands/`, `agent` + `subtask` | **One body, union frontmatter**, installed to both; `model` rewritten per host |
| **Hooks / guards** | External process, stdin JSON, exit 2 blocks | In-process TS, mutate `output`, `throw` blocks | **Pure core `Decision`** + two adapters. No shared hook code |
| **Model routing** | Per-agent `model` alias only; no per-request control | `chat.params` rewrites temperature, topP, topK, maxOutputTokens per request | **Enhancement.** CC gets static per-agent routing; behaviour must be correct without it |
| **Permission prompts** | `PreToolUse` returning a decision; no structured policy file | `permission.ask` hook **and** declarative `permission:` in agent frontmatter | Policy authored once in core; opencode also gets the declarative form as defence in depth |
| **System prompt injection** | Not available to hooks | `experimental.chat.system.transform` mutates `system: string[]` | **Enhancement.** CC injects the same Goals context via `SessionStart` output and skill bodies |
| **MCP servers** | `.mcp.json`, project and user scope | `mcp` block in `opencode.json`, local and remote | Declared per host by the installer; iAI ships **no required MCP server** — every one is optional |
| **Telemetry** | Hook stdout, plus whatever a hook process writes | Plugin can call the SDK client and the local server on `serverUrl` | Both write the **same append-only JSONL** under `docs/evidence/`. The file is the interface, not the host API |

---

## Package layout

Mirrors the `## Build Targets` table in
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) one-for-one.

```
iAI/
├── packages/
│   ├── core/                     iai-core          (library, pure, no host imports)
│   │   └── src/
│   │       ├── intent/           Goals, Design, Current→Ideal delta
│   │       ├── routing/          category → model chain
│   │       ├── guards/           checkEgress, checkRiskMandate, checkSpend,
│   │       │                     checkCommitPrefix — pure, <50ms
│   │       ├── classify/         PUBLIC / INTERNAL / PRIVATE / SECRET
│   │       ├── gh/               command construction + parsing (never shells out)
│   │       ├── evidence/         envelope, sentinels, permalinks, 60k budget
│   │       └── binding/          DomainBinding interface + registry
│   │
│   ├── adapter-opencode/         iai-adapter-opencode  (library)
│   │   └── src/
│   │       ├── plugin.ts         export default plugin  ← default export
│   │       ├── hooks/            one file per Hooks key
│   │       └── decision.ts       Decision → throw | mutate output
│   │
│   ├── adapter-claude/           iai-adapter-claude    (library)
│   │   └── src/
│   │       ├── bin/              one tiny CLI per hook event
│   │       ├── hooks.json        registration template
│   │       └── decision.ts       Decision → exit code + stdout JSON
│   │
│   ├── installer/                iai-installer         (binary)
│   │   └── src/
│   │       ├── cli.ts            iai install --host claude|opencode|both
│   │       ├── emit-agents.ts    AgentSpec → both dialects
│   │       ├── emit-commands.ts  one body, union frontmatter
│   │       ├── link-skills.ts    skills/ → .claude/skills/
│   │       └── merge-config.ts   additive, idempotent, --apply gated
│   │
│   ├── domain-dev/               iai-domain-dev        (library)
│   ├── domain-trade/             iai-domain-trade      (library)
│   ├── domain-health/            iai-domain-health     (library)
│   ├── domain-wealth/            iai-domain-wealth     (library)
│   ├── domain-know/              iai-domain-know       (library)
│   └── pulse/                    iai-pulse             (binary, :31337, read-only)
│
├── skills/                       iai-skills      (docs)  → .claude/skills/  SHARED
├── agents/                       iai-agents      (docs)  → AgentSpec sources
├── references/                   iai-references  (docs)  contracts, not skills
│
├── .claude-plugin/plugin.json    Claude Code distribution manifest
└── package.json                  npm name "iai" → opencode `plugin` array
```

The rule the tree encodes: **`packages/core` imports nothing from either host,
and both adapters import only `core`.** Adapters never import each other, and
domain packs never import each other.

---

## Degradation rules

> Any capability that exists on only one host must degrade gracefully on the
> other, and the plan must state, in writing, which behaviour is lost.

Three non-negotiables:

1. **No safety guarantee may depend on an opencode-only capability.** If a rule
   protects money, health data, or an irreversible action, it must be
   enforceable through `PreToolUse` exit 2 as well. If it cannot be, the feature
   is redesigned, not shipped one-sided.
2. **Degradation is loud at install, silent at runtime.** `iai install --host
   claude` prints exactly which enhancements are unavailable. Mid-session, the
   missing capability produces no warning — nagging every turn about a host
   limitation is noise.
3. **Feature detection, never host detection, inside the core.** The core asks
   *"can this host rewrite the system prompt?"*, not *"is this opencode?"* — so
   a third host, or a new Claude Code release, needs no core change.

### The two opencode-only capabilities

| opencode capability | What it buys | Claude Code fallback | Behaviour lost |
|---|---|---|---|
| `chat.params` — per-request model parameters | Category-based routing rewrites `temperature`, `topP`, `maxOutputTokens` per turn: deterministic (`temperature: 0`) for `risk-check` and reconciliation, exploratory for research | Static per-agent `model` in agent frontmatter, plus a skill-body instruction stating the intended reasoning level | **Per-turn** parameter tuning. A CC agent runs one parameter set for its whole life, so `risk-officer` is authored deterministic and never varies. Routing correctness is unaffected; only adaptivity is |
| `experimental.chat.system.transform` — rewrite `system: string[]` | Goals, active rung and mandate SHA injected into the system prompt for every turn, unskippable and not consuming conversation turns | `SessionStart` hook stdout injects the same context **once** at session start, and Tier-0 skill bodies restate the invariants | **Freshness.** CC's injected context is a snapshot from session start; if `MANDATE.md` changes mid-session it is stale. Mitigation: the mandate SHA is re-read from disk by the guard at gate time, so the *enforced* value is always current even when the *prompted* value is not |

Separation of duties — `quant-analyst` cannot spawn `risk-officer` — is not in
this table because it is not one-sided: Ring 2 specialists are issued no Task
tool at all on either host, so the enforcement is structural and identical,
not an opencode-only capability with a Claude Code fallback.

Read the table as the priority order for any future one-sided capability: it may
improve efficiency, freshness or ergonomics. It may not be the only thing
standing between the system and an irreversible action.
