# Contributing

This file is **parsed mechanically by forge**. The `## Commands` section below
is read to discover how to build, test and lint each target — keep its structure
intact when you edit it. Everything else is for humans.

---

## Getting started

### Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **bun** | `>= 1.2` | The runtime, package manager and test runner. opencode plugins execute in Bun, so the dev runtime matches production |
| **node** | `>= 20` | Some tooling still shells out to node; Bun alone is not sufficient |
| **gh** | any recent, **authenticated** | GitHub is the system of record. Run `gh auth status` and fix it before anything else |
| **git** | `>= 2.38` | `--force-with-lease`, worktrees |

```bash
gh auth status                 # must print a logged-in account with repo scope
bun --version                  # must be >= 1.2
```

### Clone and install

```bash
gh repo clone <owner>/iAI
cd iAI
bun install
bun run typecheck              # confirms the workspace resolves before you start
```

`bun install` links every package in `packages/` into the workspace. There is no
build step required to run the tests — Bun executes TypeScript directly.

### The private repo

Real data never lives here. If you are working on a private domain
(`health`, `wealth`, `trade`), you also need the private repo symlinked in:

```bash
ln -s ../iai-private/USER USER    # USER/ is gitignored; the symlink is not committed
```

Without it, private-domain skills operate on `templates/` and the test fixtures.
That is a valid development mode — see
[`docs/design/09-security.md`](docs/design/09-security.md).

---

## Commands

<!-- forge parses this section mechanically. Block form: one `### <action>`
     heading per action, a fenced command, and a `Passes when:` line.
     Block form is used rather than a table because commands contain pipes. -->

Placeholders, substituted by forge from `ARCHITECTURE.md`'s Build Targets table
and the issue being worked:

| Placeholder | Meaning | Example |
|---|---|---|
| `{target}` | The build target name | `iai-core` |
| `{target_dir}` | The target's source directory, less `/src` | `core` |
| `{repo_root}` | Absolute path to the checkout | `/home/you/iAI` |
| `{issue}` | The issue number currently being worked | `61` |

### build

```bash
bun run build --filter {target}
```

Passes when: exit code 0 and no `error TS` lines on stderr. Omit `--filter` to
build every target. `docs` targets (`iai-skills`, `iai-agents`,
`iai-references`) have no build file and are a no-op here — they are validated
by `skill-lint`.

### test

```bash
bun test packages/{target_dir}
```

Passes when: exit code 0 and the summary reports `0 fail`. Run `bun test` with
no path for the whole workspace. Anything that ingests external data must carry
hostile-input cases — see [Adding a skill](#adding-a-skill).

### lint

```bash
bun run lint
```

Passes when: exit code 0 with no errors. Warnings do not fail the build locally
but do fail CI, so fix them. Includes the iAI-specific rules: no `process.cwd()`
in `packages/core` or `packages/adapter-opencode`, no `exec` with a template
literal, no host imports in `packages/core`.

### typecheck

```bash
bun run typecheck
```

Passes when: exit code 0 and `tsc` reports no diagnostics across the workspace.
Run this before every commit; it is the fastest signal that an adapter has
drifted from the core's types.

### skill-lint

```bash
bun run skill-lint skills/
```

Passes when: exit code 0. Validates every `SKILL.md` against the **both-hosts
intersection schema** — `name` (required, 1–64 chars, matching
`^[a-z0-9]+(-[a-z0-9]+)*$`, and **identical to the containing directory
name**), `description` (required, 1–1024 chars), and the optional `license`,
`compatibility`, `metadata`. **Any other frontmatter key is an error**, because
both hosts ignore unknown fields silently and a typo would otherwise ship
unnoticed. Also checks: description length under 300 characters, a Phase 0
context-discovery section, and an Error Handling section.

### install-dry

```bash
bun run packages/installer/src/cli.ts install --host both
```

Passes when: exit code 0 and a complete diff is printed to stdout. **Writes
nothing.** This is the default mode and the one you should run while developing
the installer. Inspect the diff for clobbered hook registrations before you ever
reach for `--apply`.

### install

```bash
bun run packages/installer/src/cli.ts install --host both --apply
```

Passes when: exit code 0, every file in the printed manifest exists on disk, and
re-running produces an empty diff (**idempotence is the acceptance criterion**).
`--apply` is mandatory to touch disk. Existing files are backed up to
`<file>.iai-backup-<ts>`. Use `--host claude` or `--host opencode` to install a
single target.

---

## Branching

Matches [`docs/design/03-workflow.md`](docs/design/03-workflow.md) exactly. Task
branches target the **story branch**, not `main` — only the integration PR
touches `main`.

| Kind | Pattern | Branches from | Merges to | Example |
|---|---|---|---|---|
| **Story** | `story/{n}-{slug}` | `main` | `main`, via the **integration PR** | `story/901-apob-protocol` |
| **Task** | `task/{n}-{slug}` | the **story branch** | the **story branch** | `task/61-baseline-lipid-panel` |
| **Bug** | `bug/{n}-{slug}` | `main` | `main` | `bug/72-exporter-drops-labels` |

```
main
 ├─◀── integration PR   (story/901-apob-protocol → main)   ← the ONLY auto-closing PR
 │
 └── story/901-apob-protocol
      ├─◀── draft PR    (task/61-baseline-panel → story/901-apob-protocol)
      └─◀── draft PR    (task/62-protocol-v2   → story/901-apob-protocol)
```

`{slug}` is the issue title, lowercased, non-alphanumerics collapsed to `-`,
truncated at roughly 40 characters. Never rename a branch after its PR is open.

---

## Commits

Every commit is prefixed with the issue it belongs to. That prefix is the thread
tying a diff to a unit of work to a Story to a goal.

```
#{issue}: {message}
```

```
#905: add baseline lipid panel importer with unit normalisation

Parses the Q4 panel PDF into USER/HEALTH/panels/2026-01-09.yaml and
normalises mg/dL vs mmol/L per the Design's ISC-2.

Co-Authored-By: iAI <noreply@iai.dev>
```

| Element | Rule |
|---|---|
| Prefix | `#` + issue number + `: ` — **no space** between `#` and the number |
| Message | Imperative mood, lowercase first word, no trailing period |
| Body | Optional; wrap at 72 columns |
| Trailer | `Co-Authored-By: iAI <noreply@iai.dev>` on every agent-authored commit |

Validation regex, enforced by `guards/checkCommitPrefix`. It accepts an optional
`owner/repo` prefix so a commit in the public repo can reference an issue in the
private one:

```
^([A-Za-z0-9._-]+/[A-Za-z0-9._-]+)?#[0-9]+: .+
```

| Exemption | Why |
|---|---|
| `Merge …` | Generated by git; no issue context available |
| `fixup! …` | Autosquash marker; inherits its target's prefix on rebase |
| `squash! …` | Same |
| `Revert "…"` | Generated by `git revert`; carries the original subject |

A failing commit is blocked **before it is written** — `PreToolUse` on Claude
Code, a throwing `tool.execute.before` on opencode.

### The optional commit-msg hook

Recommended so that your own hand-written commits get the same check the agent
gets, rather than failing in CI:

```bash
bun run packages/installer/src/cli.ts install-git-hooks --apply
```

It writes `.git/hooks/commit-msg`, which runs `checkCommitPrefix` and exits
non-zero on a violation. Optional, local, and never installed without `--apply`.

---

## Adding a skill

A skill is written once and loaded by both hosts from `.claude/skills/`. Work
through this checklist in order.

- [ ] **Create `skills/<name>/SKILL.md`.** One directory per skill; the
      directory name **is** the skill name.
- [ ] **Frontmatter is the intersection schema only** — `name`, `description`,
      and optionally `license`, `compatibility`, `metadata`. Nothing else. Both
      hosts ignore unknown keys silently, so an invented field fails nowhere and
      works nowhere.
- [ ] **`name` must match the directory name exactly**, and match
      `^[a-z0-9]+(-[a-z0-9]+)*$`. Renaming means renaming both, together.
- [ ] **Write the `description` as the phrases people actually say.** This is
      the routing surface — it is the *only* part of your skill that enters the
      prompt on every turn, and it is what decides whether the skill is ever
      invoked. Write `"check my lab results, review bloodwork, ApoB trend, is my
      cholesterol improving"`, not `"Analyses health biomarker data."` A summary
      routes nothing. Keep it under 300 characters; the cost is per-turn and
      permanent.
- [ ] **Phase 0 must run context discovery.** Every skill opens by establishing
      state from disk and GitHub — never from conversation memory. `context-discovery`
      is Tier 0 for this reason. A skill that assumes it knows the current state
      is a skill that corrupts it.
- [ ] **Cite references, do not restate contracts.** Link
      `references/gh-operations.md` rather than re-documenting the label scheme.
      Twenty copies of a contract drift within a month — that is forge's lesson,
      and it is why `references/` exists as a separate build target.
- [ ] **Add an Error Handling section** pointing at
      `references/gh-error-handling.md`. Cover at minimum: the resource does not
      exist, the resource already exists, rate limiting, and a partial write.
- [ ] **The skill must be idempotent.** Re-running detects existing state and
      addresses only the gaps. Every skill is re-run — after a crash, after a
      context compaction, after a human edits something mid-flight.
- [ ] **Run `bun run skill-lint skills/`** and `install-dry`, then confirm the
      skill loads on **both** hosts before opening the PR.

---

## Adding a domain

A sixth domain is one binding file, not fourteen skill edits. If you find
yourself editing a Tier-1 lifecycle skill to add a domain, the binding is
missing something — fix the binding.

- [ ] **Write `packages/domain-<id>/src/binding.ts`** exporting a
      `DomainBinding` — `id`, `unitOfWork`, `verify`, `gate`, `evidence`,
      `labels`. See `packages/core/src/binding/` for the interface.
- [ ] **Add the `domain:<id>` label** to `scripts/bootstrap-github.sh`, with its
      colour and description, plus any domain-specific `rung:*` labels the
      `verify` spec names.
- [ ] **Add leaf skills under `skills/<id>-*/`.** Tier 2 only. A leaf skill may
      know its own domain; a Tier-1 verb may never know any.
- [ ] **Write `docs/design/NN-domain-<id>.md`** using the standard ten-section
      skeleton: purpose and scope · the binding · unit of work · verification
      rungs · the gate · skills · data model · integration points · worked
      example · failure modes. Match the existing packs section-for-section.
- [ ] **Register the pack in the binding registry** (`packages/core/src/binding/registry.ts`)
      and add its build target row to `ARCHITECTURE.md`.
- [ ] **Add the irreversible-action row to
      [`docs/design/09-security.md`](docs/design/09-security.md)** — domain,
      irreversible action, guard, authoriser, kill switch. A domain with no row
      is a domain whose boundary nobody has thought about. If the honest answer
      is "nothing here is irreversible", write that down explicitly.
- [ ] **Add an audit-trail file** to the section 8 table, using the same record
      shape as every other domain. Do not invent a new one.

---

## Code style

| Rule | Detail |
|---|---|
| **Pure core, no host imports** | `packages/core` imports nothing from `@anthropic-ai/*`, `@opencode-ai/*`, or any host SDK. It is pure functions from input to a `Decision`. Enforced by lint |
| **Guards are pure and fast** | Under **50 ms**, always. opencode awaits hooks in sequence across every installed plugin, so a slow guard stalls every turn for everyone. No network, no `gh`, no directory walks inside a guard. Precompute at session start and cache |
| **Never `process.cwd()`** | In opencode use `context.directory` or `context.worktree` from `PluginInput`. cwd follows the invoking shell and is not the project root; a guard resolving `.env` against the wrong tree **fails open** |
| **`execFile` over `exec`** | Never interpolate an untrusted value into a shell string. `exec` with a template literal is banned in `packages/**` |
| **Never `git add -A` or `git add .`** | Stage explicit paths. Blanket staging is how `.env` files, private data and unrelated work end up in a commit |
| **Never force-push without `--force-with-lease`** | `--force` discards work you never saw. `--force-with-lease` refuses when the remote moved |
| **No emoji** | The only permitted marks are the check and cross used in status output and tables. Nothing else, anywhere — not in code, comments, commits, issues, docs or PR bodies |
| **No comments unless they explain *why*** | Restating the code in prose is noise. A comment earns its place by recording a decision or a non-obvious constraint |
| **Packs never import packs** | Cross-domain work is a Story dependency, not a code dependency |

---

## Pull requests

| Rule | Detail |
|---|---|
| **Draft by default** | Every PR opens as a draft. It is marked ready only after its verification step passes with evidence read from disk |
| **One `Closes #N` per line** | GitHub does **not** parse `Closes #901, #905, #906` — it closes `#901` and silently ignores the rest. One directive per line, always |
| **`Closes` only on integration PRs** | Task PRs target the story branch, so `Closes` there would never fire (GitHub only auto-closes on merge to the default branch). Task PRs reference their issue with `Refs #905` |
| **iAI never merges** | The system opens PRs, marks them ready, and stops. A human merges. This is the first of the three never-rules and it has no exception, no flag and no override |
| **Evidence is linked, not pasted** | Link the committed artifact under `docs/evidence/`. The PR body carries the verdict and the link |
| **Private domains, private repo** | A PR for a `health`, `wealth` or `trade` Story belongs in the private repo. Never paste a biomarker, balance or position into a public PR body |
