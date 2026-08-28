# Domain: Development

The `dev` pack is forge, ported. It is the domain the whole state machine was
originally shaped around, so it is also the reference implementation: when a
question about another pack has no obvious answer, ask what `dev` does and bind
the analogue.

Nothing here is new mechanism. The Milestone → Story → Task decomposition, the
label state machine, the branch model, the sentinels and the 60000-character
evidence budget all come straight from `03-workflow.md`. What this document
supplies is the four re-bound nouns: **unit of work**, **verification**,
**gate**, **evidence**.

---

## 1. Purpose and scope

| This domain is for | This domain is **not** for |
|--------------------|----------------------------|
| Shipping software changes across one or many repositories | Managing infrastructure state as a side effect of a merge |
| Turning a Design's `CLAIM-{story}.{n}` claims into tests, then into passing tests | Writing tests against an implementation that already exists |
| Decomposing a feature into independently buildable units | Decomposing a feature by file, by layer, or by "frontend/backend" |
| Independent review of a diff by an agent that did not write it | Self-approval of any kind |
| Keeping `ARCHITECTURE.md` and the tree in agreement | Being the authority on what the architecture *should* be |
| Opening pull requests and marking them ready | **Merging.** Ever. Under any flag. |

The scope boundary that matters most: `dev` owns everything up to the merge
button and stops. README rule 1 — *"iAI never merges. It opens PRs and marks them
ready. A human merges."* — is not a default, it is the shape of the pack.

---

## 2. The binding

The interface is `DomainBinding` from `01-skill-hierarchy.md`, unchanged. This
block is the content of `skills/dev/domain.md`.

```ts
export const devBinding: DomainBinding = {
  id: "dev",

  unitOfWork: {
    noun:        "build target",
    description: "One independently buildable unit — library, binary, package " +
                 "or crate — identified by exactly one build definition file",
    minSize:     "one build target with at least one source file it alone owns",
    maxSize:     "one build target; a second build file means a second Task",
    leafSkill:   "dev/code-review",
  },

  verify: {
    defaultRung: "compile",
    passing:     "Every build target in the Story compiles, its own tests pass, " +
                 "the story branch passes integration, and a reviewer that did " +
                 "not author the diff has signed off",
    evidenceRequired: true,
    rungs: [
      {
        id: "compile",
        name: "Compile",
        entryCriteria: [
          "build definition file identified for the target",
          "build command resolved from CONTRIBUTING ## Commands",
          "toolchain present on PATH",
        ],
        verifier: "tool-checked",
        reversible: true,
      },
      {
        id: "unit",
        name: "Unit",
        entryCriteria: [
          "target compiles clean on the task branch",
          "test command declared for this target",
          "tests derived from CLAIM-{story}.{n} claims, not from the implementation",
        ],
        verifier: "tool-checked",
        reversible: true,
      },
      {
        id: "integration",
        name: "Integration",
        entryCriteria: [
          "every sibling Task of the Story has reached the unit rung",
          "story branch builds as a whole, not target by target",
          "integration command declared, with a Passes when: predicate",
        ],
        verifier: "tool-checked",
        reversible: true,
      },
      {
        id: "review",
        name: "Review",
        entryCriteria: [
          "integration rung green on the story branch",
          "diff read by an agent that did not write it",
          "no unaddressed iai-critic or dev/code-review finding",
          "every CLAIM-{story}.{n} anchored to evidence on disk",
        ],
        verifier: "model-judged",
        reversible: false,
      },
    ],
  },

  gate: {
    irreversibleAction: "merge a pull request into the default branch",
    authoriser:  "human, per pull request",
    killSwitch:  "iai dev abort --story {n}",
    autoDeny: [
      "tool call is gh pr merge, for any actor, at any rung",
      "force push to the default branch or to a story branch with open task PRs",
      "commit subject fails ^(#[0-9]+: .+|Merge .+|fixup! .+|squash! .+|Revert \".+\")",
      "PR marked ready while an anchored CLAIM-{story}.{n} has no evidence on disk",
      "reviewing agent is the authoring agent",
    ],
  },

  evidence: {
    kind:         "build log + test results",
    sentinel:     "## iai-evidence",
    pathTemplate: "docs/evidence/{issue}-{ts}.md",
    budgetChars:  60000,
    pinned:       true,
  },

  labels: {
    namespace: "domain:dev",
    extra: [
      { name: "rung:compile",       color: "d4c5f9" },
      { name: "rung:unit",          color: "bfdadc" },
      { name: "rung:integration",   color: "c2e0c6" },
      { name: "rung:review",        color: "f9d0c4" },
      { name: "blocked:no-test-cmd", color: "e99695" },
    ],
  },
}
```

Two things to read carefully.

**`leafSkill` is `dev/code-review`, not an implement skill.** `dev` is the one
domain where the act itself — editing files, running a compiler — is the host's
native capability and needs no skill to describe it. What needs a skill is the
independent read of the result. So `task-do` writes with native tools and
delegates to `dev/code-review`; in `trade` it delegates the act itself to
`trade/backtest`. The interface is the same; what is worth wrapping differs.

**`gate.vetoAgent` is absent.** `dev` has no absolute veto. `iai-validator` can
reopen and `iai-critic` can block readiness, but neither holds `risk-officer`'s
unappealable power. Nothing in software is irreversible in the way a filled order
is; the merge gate plus `git revert` is sufficient.

The `rung:*` labels above are **pack extras**. `03-workflow.md`'s label table is
the base set that `/iai:init` always creates; extras come from each binding's
`labels.extra`. The one-rung-per-Story rule holds within a domain — a
`domain:dev` Story carries exactly one `rung:compile|unit|integration|review`.

---

## 3. Unit of work

> **A Task is one build target.**

A build target is an independently buildable unit — a library, a binary, a
package, a crate — and it is identified by exactly one **build definition file**.
If you cannot point at the file that defines it, it is not a target and it is not
a Task.

### Granularity rules

| Rule | Detail |
|------|--------|
| One build target = one task | The mapping is 1:1 in both directions. No target spans two Tasks; no Task spans two targets |
| Do not split a target's source files across tasks | "Task A does the headers, Task B does the .cpp" is the single most common bad decomposition. It produces two Tasks that cannot compile independently, so neither can reach the `compile` rung |
| A Story that maps to a single component is a Task | If the proposed Story touches exactly one build target, it was never a Story. Fold it into an existing Story or find the end-to-end outcome it belongs to |
| A single enum/struct change is not a task | Merge it into the parent build target's Task. A Task whose whole diff is one type definition is below `minSize` |
| Shared headers with no owning target | Go under the **consuming** build target's Task. If two targets consume them, the header belongs to whichever target is verified first, and the second Task declares `Blocked by:` the first |
| A target with no tests is still a Task | It reaches `compile` and stops there. See failure modes |

### What a Story is

> **A single end-to-end customer-deliverable feature. Spans as many components
> and repositories as needed. NEVER scoped to a single component or layer.**

The failure this rule exists to prevent is the layered decomposition — "Story 1:
schema, Story 2: API, Story 3: UI" — where no single Story delivers anything a
user can observe and the milestone only becomes real at the end.

| Good Story | Bad Story |
|------------|-----------|
| "Live flow export" — spans `libtelemetry`, `exporter-svc`, the OTLP schema and the CLI flag | "Add OTLP schema types" — one target, no deliverable |
| "Users can revoke a session from any device" | "Refactor the session store" |
| "Nightly reconciliation report reaches the mailbox" | "Write the report renderer" |

### Build system detection

The pack detects targets by looking for build definition files. Detection is
mechanical, and the file — not the directory, not the language — is the identity.

| Ecosystem | Build definition file | Target identity within the file | Typical unit |
|-----------|----------------------|----------------------------------|--------------|
| C / C++ | `CMakeLists.txt` | each `add_library()` / `add_executable()` | `libtelemetry`, `exporter-svc` |
| C / C++ | `Makefile` | each top-level phony target with sources | `all`, `libfoo.a` |
| Go | `go.mod` | the module, plus each `./cmd/*` main package | `exporter-svc` |
| Python | `pyproject.toml` | `[project].name`; one per distribution | `telemetry-tools` |
| Python | `setup.py` | `name=` in `setup()` | legacy packages |
| Rust | `Cargo.toml` | `[lib]`, each `[[bin]]`, each workspace member | `telemetry-core` |
| JS / TS | `package.json` | `name`; one per workspace package | `iai-core` |
| Polyglot | `BUILD.bazel` | each `*_library` / `*_binary` rule | `//pkg/export:lib` |

A repository with several of these is normal. A directory with two build
definition files of the same kind is a smell — resolve it before decomposing, or
`size` will emit an ambiguous verdict.

---

## 4. Verification rungs

Four rungs. The default is the cheapest and the promotion order is fixed.

| Rung | Label | What it proves | Promotion requires | Can iAI act alone? |
|------|-------|----------------|--------------------|--------------------|
| compile | `rung:compile` | The target builds from a clean tree with the declared build command. Syntax, types and link edges are sound | Exit 0 on `build`, and the `Passes when:` predicate holds. Build log captured to the evidence artifact | Yes |
| unit | `rung:unit` | The target's own behaviour matches the CLAIM-{story}.{n} claims it is anchored to, in isolation from its siblings | Exit 0 on `test` for this target only; every anchored `CLAIM-{story}.{n}` maps to at least one named case; zero new skips | Yes |
| integration | `rung:integration` | The Story's targets work *together* on the story branch — the thing the Story promised actually happens | All sibling Tasks at `unit`; story-branch build green; the test plan's P0 cases pass; P1 pass or are explicitly deferred with a reason | Yes |
| review | `rung:review` | A reader who did not write the diff believes it is correct, minimal and consistent with the Design | `dev/code-review` returns no unaddressed finding; `iai-validator` confirms evidence exists on disk; the integration PR is marked ready | **No** — this rung fronts the merge gate |

Notes that keep the ladder honest:

| Rule | Reason |
|------|--------|
| Tests are written from `CLAIM-{story}.{n}`, never from the code | `dev/test-gen` reads the Design, not the implementation. Tests derived from code prove only that the code does what it does |
| The `unit` rung is per target, not per Story | `ctest -R ^libtelemetry$`, not `ctest`. A Task cannot be promoted by a sibling's tests |
| A rung is never skipped | A Task at `compile` with no test command stays at `compile`. It does not "pass" the unit rung by having nothing to run |
| Evidence precedes the label | `evidenceRequired: true`. `task-verify` writes `docs/evidence/{issue}-{ts}.md` and only then transitions the label |

---

## 5. Safety gate

> **The irreversible action is the merge. iAI opens PRs, marks them ready, and
> stops.**

| Property | Value |
|----------|-------|
| Irreversible action | Merge a pull request into the repository's default branch |
| Authoriser | The human, per pull request. Never batched, never inferred from an earlier approval |
| Allowed to iAI | Create branches, commit, push, open PRs, mark ready, request review, comment |
| Denied to iAI | `gh pr merge`, `git push` to the default branch, force-push to a story branch with open task PRs, branch deletion before merge |
| Kill switch | `iai dev abort --story 930` — converts every open PR under the Story back to draft, removes `gate:approved`, applies `status:blocked`, and posts the reason under `## iai-gate` |
| Veto agent | None. `dev` has no absolute veto; see §2 |

Two gates fire inside `dev`, both from `03-workflow.md`'s gate table:

| Gate | Fires when | Approver | Artifact |
|------|-----------|----------|----------|
| Design approval | Design written, before `/iai:task-create` | Human, informed by `iai-critic` | `gate:pending` + `## iai-gate` |
| Implementation review | Draft PR complete, before marking ready | Human, informed by `iai-validator` | `gate:pending` + `## iai-gate` |
| Closure | `story-verify` returns `PASS` | Human only | `## iai-verdict`, then the human merges |

Remember the closing-keyword hazard, because it is where a "merged" Story quietly
leaves four open Tasks: closing keywords fire **only** on merge into the default
branch, so `Closes #931` in a task PR does nothing. `task-verify` closes task
issues explicitly with `gh issue close 931`. The integration PR body carries one
`Closes #N` **per line**.

---

## 6. Leaf skills

| Skill | Argument hint | Description | Gate? |
|-------|---------------|-------------|-------|
| `code-review` | `[task#\|pr#] [--strict]` | Independent read of a task diff by an agent that did not author it. Findings are anchored to `CLAIM-{story}.{n}` or to a build target, never to style preference. Blocks the readiness transition, does not block the commit | No — but blocks `rung:review` |
| `debug` | `[issue#] [--repro]` | Reproduce first, isolate second, fix third, in that order. A fix with no reproduction is refused. Emits the minimal diff plus a regression test | No |
| `refactor` | `[target] [--proof]` | Behaviour-preserving change with an explicit proof obligation: the same test set is green before and after, and the test files are unchanged in the same commit | No |
| `test-gen` | `[story#] [--tier P0]` | Generates cases from the Design's `CLAIM-{story}.{n}` claims and the Test Strategy table's `anchors_to` column. Never reads the implementation while generating | No |
| `arch-audit` | `[--fix]` | Diff between `ARCHITECTURE.md`'s `## Build Targets` table and the build definition files actually present. Reports targets missing from the table and table rows with no build file | No |
| `dep-audit` | `[target] [--licences]` | Dependency risk, licence compatibility and staleness for one target's manifest. Findings carry a severity and a suggested action, not an automatic bump | No |
| `release` | `[version] [--dry-run]` | Version bump, changelog assembly from `#{issue}:` commit prefixes, tag proposal, and a release PR | **Yes** — tag and merge are human |

Leaves are invoked *by* Tier-1 verbs, not by the user. `task-do` invokes
`dev/code-review`; `story-test-plan` invokes `dev/test-gen`; `/iai:learn`
invokes `dev/debug` when the failure is a defect rather than a plan error.

---

## 7. Data model

### Paths

| Kind | Path | Format |
|------|------|--------|
| Story design (Design) | `docs/design/stories/{issue}.md` | YAML frontmatter + 17 fixed sections + `## Build Targets` |
| Test plan | `docs/test-plans/{issue}-plan.md` | Markdown tables, P0/P1/P2 |
| Evidence | `docs/evidence/{issue}-{ts}.md` | YAML frontmatter + build/test output |
| Target inventory | `ARCHITECTURE.md` → `## Build Targets` | Markdown table, parsed mechanically |
| Commands | `CONTRIBUTING.md` → `## Commands` | Markdown table + `Passes when:` line |
| Repo map | `README.md` → `## Repositories` | Markdown table, multi-repo only |

Timestamps in `{ts}` are compact UTC ISO-8601: `20260825T141207Z`.

### `## Build Targets` schema

Columns are matched **by header name, not by position**. Extra columns are
ignored; reordering is harmless; renaming a header breaks the parse.

| Column | Required | Values |
|--------|----------|--------|
| `Target` | Yes | Unique slug within the repo. Appears verbatim in Task titles |
| `Type` | Yes | `library` \| `binary` \| `docs` |
| `Build file` | Yes for non-`docs` | Path relative to the repo root, or `—` for `docs` |
| `Source dirs` | Yes | One or more paths, comma or space separated |
| `Repo` | No | Key into `README.md`'s `## Repositories`. Defaults to the primary repo |

### `## Commands` schema and placeholders

```markdown
## Commands

| Kind | Command |
|------|---------|
| build | `cmake --build build --target {target} -j` |
| test | `ctest --test-dir build -R ^{target}$ --output-on-failure` |
| lint | `clang-tidy -p build $(git ls-files '{target_dir}/**/*.cpp')` |
| integration | `ctest --test-dir build -L integration --output-on-failure` |

Passes when: exit code 0 and no output line matching `^FAILED`.
```

| Placeholder | Expands to | Example |
|-------------|-----------|---------|
| `{target}` | The build target name from `## Build Targets` | `libtelemetry` |
| `{target_dir}` | The target's first source dir | `src/telemetry` |
| `{repo_root}` | Absolute path of the repo owning the target | `/home/you/src/telemetry` |
| `{issue}` | The issue number currently being worked | `931` |

The `Passes when:` line is part of the contract, not decoration. Exit code alone
is not enough — plenty of build tools exit 0 while printing failures. If the line
is absent, the pack assumes `exit code 0` and records that assumption in the
evidence artifact so the weakness is visible later.

### Evidence artifact frontmatter

```yaml
---
issue: 931
story: 930
domain: dev
target: libtelemetry
rung: unit
commit: 4f2a1c9e
commands:
  build: "cmake --build build --target libtelemetry -j"
  test:  "ctest --test-dir build -R ^libtelemetry$ --output-on-failure"
results:
  build: { exit: 0, duration_s: 41 }
  test:  { exit: 0, passed: 128, failed: 0, skipped: 2 }
anchors: [CLAIM-930.1, CLAIM-930.2]
passes_when: "exit code 0 and no line matching ^FAILED"
---
```

Body carries the tail of the build log and the failing-case output if any. Over
60000 characters, the comment carries a summary plus an SHA-pinned permalink and
the full text lives in the commit.

---

## 8. Integrations

There is **no config file.** Project context is discovered from root documents,
because those documents have to exist for the humans anyway, and a config file
drifts from them within a month. Resolution order:

| Source | Provides | If absent |
|--------|----------|-----------|
| `git remote get-url origin` | `owner/repo`, default branch via `gh repo view --json defaultBranchRef` | Hard failure. Without a remote there is no system of record |
| `README.md` | One-paragraph project summary; `## Repositories` table for multi-repo work | Single-repo assumed; summary omitted from the Design context block |
| `ARCHITECTURE.md` → `## Build Targets` | The target inventory `task-create` decomposes against | **Hard failure** for `task-create`. See failure modes |
| `CONTRIBUTING.md` → `## Commands` | build / test / lint / integration commands and the `Passes when:` predicate | Tasks cannot leave `rung:compile`; `size` emits a warning; PRs stay draft |
| `CLAUDE.md` / `AGENTS.md` | House conventions: style, commit rules, forbidden patterns, review expectations | Defaults apply; the Design records that no conventions file was found |
| `docs/milestones/M*.md` | `\| Feature \| Description \|` rows that `story-create` turns into Stories | `story-create` requires an explicit feature argument |

External tools:

| Integration | Used for | When absent |
|-------------|----------|-------------|
| `gh` CLI, authenticated | Every issue, label, milestone and PR operation | Hard failure. The pack has no offline mode |
| `git` | Branches, commits, SHA pinning of permalinks | Hard failure |
| Build toolchain (cmake, go, cargo, uv, node) | The `compile` and `unit` rungs | Task stays `status:in-progress`, PR stays **draft**, `## iai-evidence` records the missing toolchain by name |
| Sub-issue GraphQL API | Real Task↔Story parenting | Degrade to `Parent: #930` in the Task body plus a `## Tasks` checklist on the Story. See failure modes |
| CI checks (Actions or equivalent) | A second, independent run of the same commands | Local evidence becomes the only signal; the artifact is stamped `ci: absent` so the weaker guarantee is auditable |
| Advisory database (e.g. OSV) | `dep-audit` vulnerability findings | `dep-audit` reports staleness and licences only, and marks vulnerability findings `unverified` |

The rule for every row: **degrade loudly, never silently.** A missing integration
always appears in the evidence artifact and, where it changes a verdict, on the
issue.

---

## 9. Worked example

Multi-repo, C++ and Go, `acme/telemetry` as the primary repo. Issue numbers here
are local to this example.

**Goal → Milestone.** Goals entry `G1: "Customers can see their flows live"` →
`/iai:goal-create G1` → **Milestone 7 "Q3 Telemetry"**, whose description carries
the feature table.

**Milestone → Story.** `/iai:story-create 7` reads one row —
`| Live flow export | Stream per-flow records to the customer's collector |` —
and opens:

```
#930  [type:story] [domain:dev] [iai]   Milestone 7
     "Live flow export"
```

End-to-end and multi-component, as required: it spans `libtelemetry` (C++),
`exporter-svc` (Go) and the OTLP schema. It is **not** three Stories.

**Story → Design.** `/iai:story-design 930` writes `docs/design/stories/930.md`, cuts
`story/930-live-flow-export`, and posts `## iai-design` with an SHA-pinned permalink.
The claims:

| Claim | Statement | anchors_to | Tier |
|-------|-----------|-----------|------|
| CLAIM-930.1 | `libtelemetry` emits one OTLP record per completed flow, with no record loss under 10k flows/s | libtelemetry | P0 |
| CLAIM-930.2 | Records carry `flow.id`, `flow.start`, `flow.bytes` and survive a round trip through the schema | libtelemetry | P0 |
| CLAIM-930.3 | `exporter-svc` batches and ships records to a configured collector with at-least-once delivery | exporter-svc | P0 |
| CLAIM-930.4 | Collector outage for 60s causes buffering, not loss, and drains on recovery | exporter-svc | P1 |
| CLAIM-930.5 | End-to-end latency from flow completion to collector receipt is under 5s at P99 | both | P1 |

The Design's `## Build Targets` section, resolved from `ARCHITECTURE.md`:

| Target | Type | Build file | Repo |
|--------|------|-----------|------|
| libtelemetry | library | `src/telemetry/CMakeLists.txt` | `.` (primary) |
| exporter-svc | binary | `services/exporter/go.mod` | `acme/exporter` |

**Design → Tasks.** `/iai:task-create 930` produces one Task per build target, plus
one for executing the test plan:

```
#931 [type:task] libtelemetry: emit per-flow OTLP records      anchors CLAIM-930.1, CLAIM-930.2
#932 [type:task] exporter-svc: batch and ship with buffering   anchors CLAIM-930.3, CLAIM-930.4
#933 [type:task] Execute test plan for #930                    anchors CLAIM-930.5
    Blocked by: #931, #932
```

Note what did **not** happen. The OTLP schema change lives in headers under
`src/telemetry/include/` with no build file of their own, so it went under
`#931` — the consuming target's Task — rather than becoming `#934`. The
`FlowState` enum addition in `exporter-svc` was likewise folded into `#932`
instead of becoming a Task of its own.

**Tasks → work.**

| Step | Command | Effect |
|------|---------|--------|
| 1 | `/iai:task-do 931` | Branch `task/931-libtelemetry-emit-per-flow-otlp-rec` cut from the story branch; commits `#931: add per-flow OTLP record emitter`; **draft** PR → `story/930-live-flow-export`; `status:in-progress`, `rung:compile` |
| 2 | build green | `cmake --build build --target libtelemetry` exits 0 → `rung:unit` |
| 3 | `dev/test-gen 930 --tier P0` | Cases generated from CLAIM-930.1 and CLAIM-930.2, not from the emitter source |
| 4 | `/iai:task-verify 931` | `ctest -R ^libtelemetry$` → 128 passed. Writes `docs/evidence/931-20260825T141207Z.md`, posts `## iai-evidence`, sets `status:resolved`, runs `gh issue close 931` explicitly |
| 5 | `/iai:task-do 932`, `/iai:task-verify 932` | Same shape in `acme/exporter`. The Task issue still lives in the **primary** repo, `acme/telemetry` |
| 6 | `#933` unblocks | Both blockers closed; `/iai:task-do 933` runs the P0/P1 plan across the story branch → `rung:integration` |

**Story → close.**

| Step | Command | Effect |
|------|---------|--------|
| 7 | *(automatic)* | All Tasks resolved → `#930` gains `status:resolved` |
| 8 | `/iai:story-verify 930` | Full plan run: 3/3 P0, 2/2 P1. Writes `docs/evidence/930-20260826T091132Z.md`, posts `## iai-verdict PASS`, opens the integration PR `story/930-live-flow-export → main`, `rung:review`, `gate:pending` |
| 9 | `dev/code-review 930 --strict` | Read by an agent that did not author either diff. One finding on `#932` buffering bounds; addressed; re-reviewed clean |
| 10 | **human merges** | The PR body carries `Closes #930`, `Closes #931`, `Closes #932`, `Closes #933` — one per line. GitHub closes all four |
| 11 | `/iai:learn 7` | `## iai-learnings`, `MEMORY/` entry, milestone 7 closed |

Step 10 is the only step iAI does not perform.

### Multi-repo rule

Code changed in two repositories. **Issues lived in exactly one.**

| Concern | Where it lives |
|---------|----------------|
| Milestone, Story, Tasks, labels, evidence artifacts | The **primary** repo — the row in `README.md`'s `## Repositories` with `Path: .` |
| Branches, commits, task PRs | Each target's own repo |
| Integration PR | One per repo touched, all referenced from the Story; only the primary repo's PR carries the `Closes #N` lines |

One issue tree, one milestone, one Design. A Story that spans five repos still has
one home. The alternative — issues per repo — produces five partial views of one
deliverable and no place to record the verdict.

---

## 10. Failure modes and mitigations

| Failure mode | Symptom | Mitigation |
|--------------|---------|------------|
| `ARCHITECTURE.md` has no `## Build Targets` table | `task-create` has nothing to decompose against and would invent Tasks by file | **Hard failure**, not a guess. `task-create` refuses, posts `## iai-gate` naming the missing section, and offers `dev/arch-audit --fix` to generate the table from discovered build definition files for human review |
| Table exists but headers were renamed | Parse returns zero rows; looks identical to "no table" | Columns are matched by header name and the parser reports which required headers it could not find (`Target`, `Type`, `Build file`, `Source dirs`) rather than reporting an empty table |
| Build target with no test command | Nothing to run at the `unit` rung; a naive pipeline would call it green | Task stays `status:in-progress` at `rung:compile`, PR stays **draft**, `blocked:no-test-cmd` applied, and `## iai-evidence` records `test: absent`. Never promoted by silence |
| Sub-issue GraphQL unavailable (older GHES) | `gh` errors on the sub-issue mutation; Tasks orphaned | Fall back to `Parent: #930` as a body link on each Task plus a `## Tasks` checklist on the Story. `status` derives the tree from those instead. Capability is probed once per session and cached, not retried per Task |
| Rate limits during a large batch | Partial issue creation; a re-run duplicates | Every skill is idempotent — `task-create` reads existing Tasks first and fills only the gaps. `gh/` backs off exponentially and the batch is resumable at the point of failure |
| Monorepo with ~200 build targets | 200 Tasks under one Story; unreviewable, unschedulable | `size` fails the Story before decomposition. Split by deliverable, not by target: a Story should touch **3–12** targets. Above 12, `replan` cuts sibling Stories under the same milestone. Targets not touched by the Story's CLAIM-{story}.{n} claims are never Tasks |
| Shared headers with no owning target | Two Tasks both edit `include/flow.h`, both branches conflict on merge to the story branch | Headers belong to the consuming target's Task. Two consumers means the second Task declares `Blocked by:` the first, and the ordering is recorded in the Design's dependency graph, not discovered at merge time |
| CLAIM-{story}.{n} claim maps to no build target | A claim can never be anchored, so the Story can never reach `review` | `story-test-plan` refuses to emit a plan with unanchored P0 claims. Either the target is missing from `ARCHITECTURE.md` or the claim belongs to a different Story |
| Two agents pushing the same story branch | Non-fast-forward rejection mid-Task; work appears to vanish | One Task, one branch, one agent. Task branches never share a name; the story branch is written to only by `story-verify`. On rejection, `resume` re-reads `git log` and GitHub rather than trusting the transcript |
| Reviewer is the author | Review passes trivially and the gate becomes decorative | `autoDeny` includes `reviewing agent is the authoring agent`; `dev/code-review` is spawned by `iai-conductor`, and the cross-vendor rule routes it to a different vendor from `dev-coder` |
| PR marked ready with no evidence on disk | Story looks mergeable; the audit trail is empty | `evidenceRequired: true` plus the `autoDeny` entry `PR marked ready while an anchored CLAIM-{story}.{n} has no evidence on disk`. `iai-validator` re-reads the disk, never the agent's claim |
| Task issues left open after merge | Milestone shows complete, four Tasks still open | Closing keywords fire only into the default branch. `task-verify` closes each Task explicitly; the integration PR uses one `Closes #N` per line, never a comma-separated list |
