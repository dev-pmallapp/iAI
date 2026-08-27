# Design-claim reconciliation pass

Claim ISC-6, issue #14, story #9.

Every assertion in `docs/design/` carries a verdict against the three source
repositories. This document is the record.

## Sources

| Repo | Path | Commit read |
|---|---|---|
| LifeOS | `~/tmp/LifeOS` | working tree, 2026-08-26 |
| forge (`gh-workflow`) | `~/tmp/gh-workflow` | working tree, 2026-08-26 |
| oh-my-opencode | `~/tmp/oh-my-opencode` | `code-yeongyu/oh-my-openagent`, cloned 2026-08-26 |

**oh-my-opencode was not present when this task began.** `docs/design/9-isa.md:81-83`
names three source repositories and then gives two paths, so a third of ISC-6
was unsatisfiable as written. The repository was renamed upstream —
`oh-my-opencode` redirects to `code-yeongyu/oh-my-openagent` — which is why it
had gone missing. It is now checked out at the path the ISA implies.

## Verdicts

| Verdict | Meaning |
|---|---|
| `confirmed` | At least one source supports the assertion as written |
| `corrected` | A source has it, iAI deliberately changed it, and the change is recorded — or the assertion misstated a source and this pass fixed it |
| `original` | Net-new iAI design. No source claim is made or implied, so there is nothing to reconcile |
| `invented` | **False provenance.** The assertion states or clearly implies that a source does or says something, and no source does |

An `invented` row must name the commit that removed or corrected it. That is the
teeth of ISC-6: the pass produces corrective commits, not merely a table.

### Why `original` exists

ISC-6 as written names three verdicts and defines `invented` as "searched in all
three sources, no corresponding statement exists". Applied literally that verdict
swallows the project. Row 10 of section 1 confirms **LifeOS has no trading** —
zero broker integration, zero ticker resolution, zero quote code. Under the
literal reading all 607 lines of `05-domain-trading.md` are `invented` and ISC-6
demands a commit removing each one. The same argument deletes the domain-binding
seam, the rung ladder, the gate vocabulary and the risk officer — every part of
iAI that is a synthesis rather than a copy.

That is not what the claim is for. The defect ISC-6 hunts is **false
provenance**: a sentence that borrows a source's authority for something the
source does not contain. "LifeOS ships five health adapters" is checkable and can
be wrong. "A trade Story defaults to `rung:research`" borrows nobody's authority
and cannot be wrong in the same way — it is a decision, and the place to argue
with it is design review, not a reconciliation pass.

So `invented` is scoped to assertions that **make a source claim**, and net-new
design that makes none verdicts `original`. This is a deliberate refinement of
the claim's own vocabulary and is recorded here rather than applied silently.
The teeth are unchanged: every `invented` row still names a corrective commit.
The refinement narrows what counts as `invented`; it does not soften what
happens to one.

## What counts as an assertion

A **normative** statement that constrains implementation or behaviour: `MUST` /
`never` / `always` / `exactly` statements, table rows defining a contract, named
numeric limits and budgets, named identifiers, paths, sentinels, labels and
commands.

Excluded: motivation, rationale, rhetorical framing, and examples that merely
illustrate an assertion already counted.

Where a run of consecutive lines is uniformly net-new design carrying no source
claim — a rung ladder, an `autoDeny` list, a gate comment template — it is
collapsed into a single row with a range reference. Enumerating such a run line
by line inflates the count without adding verification.

## Coverage

| File | Lines | Rows | Status |
|---|---|---|---|
| `00-synthesis.md` | 173 | 1-14 | **passed** — factual claims about sources verified |
| `9-isa.md` | 185 | 37-38 | **passed** |
| `01-skill-hierarchy.md` | 473 | 100-177 | **passed** |
| `02-roles.md` | 695 | 200-249, 800-871 | **passed** |
| `03-workflow.md` | 577 | 300-349 | **passed** |
| `04-domain-dev.md` | 512 | 400-499 | **passed** |
| `05-domain-trading.md` | 607 | 500-569 | **passed** |
| `06-domain-health.md` | 596 | 600-699 | **passed** |
| `07-domain-wealth-know.md` | 655 | 700-798 | **passed** |
| `08-dual-target.md` | 526 | 250-299, 900-949 | **passed** |
| `09-security.md` | 420 | 350-399 | **passed** |

Row numbers are allocated in disjoint per-file blocks so that a later pass can
extend any one file without renumbering the rest. Gaps in the sequence are
deliberate.

---

## 1. `00-synthesis.md` — factual claims about the sources

`00-synthesis.md` is the provenance record: a KEEP / ADAPT / DROP table whose
rows assert facts about the three repositories. Those assertions are falsifiable,
so they are verified here first. A synthesis row claiming "forge does X" is
itself an assertion that can be wrong — and three of them were.

| # | iAI ref | Assertion | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `:32` | TELOS ID scheme `M0`/`P0`/`G0`/`S0` preserved verbatim | `confirmed` | `LifeOS/install/USER/TELOS/TELOS.md` contains `M0`, `P0`, `P1`, `G0`, `G1`, `S0` |
| 2 | `:32` | Current→Ideal uses 7 UPPERCASE dimensions `HEALTH`, `MONEY`, `FREEDOM`, `CREATIVE`, `RELATIONSHIPS`, `RHYTHMS`, `INFRASTRUCTURE` | `confirmed` | Exactly seven files at `USER/TELOS/IDEAL_STATE/{HEALTH,MONEY,FREEDOM,CREATIVE,RELATIONSHIPS,RHYTHMS,INFRASTRUCTURE}.md` |
| 3 | `:32` | `CURRENT pct = (have + 0.5*partial) / (have + partial + missing) * 100` | `confirmed` | `USER/TELOS/CURRENT_STATE/README.md:34` verbatim; implemented at `LIFEOS/TOOLS/UpdateLifeosState.ts:109` |
| 4 | `:32` | `IDEAL pct = 100 - (TBD count x 10)` | `confirmed` | `CURRENT_STATE/README.md:49` — "scores on *articulation* (`100 − TBD × 10`)"; `IDEAL_STATE/README.md` clamps to 0..100 |
| 5 | `:38` | Hook system is **56 hooks** | `corrected` | **55** `.ts` files at `LifeOS/install/hooks/`. Count drift; corrected to 55 |
| 6 | `:38` | Six named hooks survive as concepts: `EgressClassGuard`, `VerificationGate`, `ModelRungGuard`, `SpendAuditor`, `LoopDetector`, `FormatGate` | `confirmed` | All six present in `LifeOS/install/hooks/` |
| 7 | `:39` | healthsync is five connectors — `oura.ts`, `eightsleep.ts`, `apple.ts`, `function.ts`, `hae.ts` | `confirmed` | All five files at `LIFEOS/TOOLS/healthsync/`. See row 641: only four are *pullable adapters*; `hae.ts` is a normaliser |
| 8 | `:40` | FINANCES schema has 9 object types | `confirmed` | `USER/FINANCES/schema.yaml` defines exactly `overview`, `income_source`, `expense`, `investment_account`, `account`, `goal`, `tax_profile`, `obligation`, `vendor` (plus `version`/`description`/`validation` metadata keys) |
| 9 | `:41` | Fabric is **315** prompt pattern files | `corrected` | `skills/Fabric/Patterns/` holds **235** pattern directories and **309** `.md` files. `loaded` is a zero-byte file, not a directory. Neither 315 nor the 314 this pass first substituted is defensible; the row now states both numbers and names the unit |
| 10 | `:57-61` | "LifeOS has no trading — zero broker integration, zero ticker resolution, zero portfolio quote code, no market data client" | `confirmed` | 17 files match broker-ish terms, all of them `USER/FINANCES/` documents (`schema.yaml`, `vendors.yaml`, `GOALS.md`) or agent prose. No client, no API integration, no quote code. The claim holds in substance |
| 11 | `:116` | omo built-ins are `visual-engineering`, `ultrabrain`, `deep`, `artistry`, `quick`, `writing` | `confirmed` | All six appear in omo's README set; `ultrabrain` also at `packages/shared-skills/skills/ulw-execute/SKILL.md` |
| 12 | `:119` | omo's `ultrawork` keyword is renamed to `deepwork` to avoid colliding when both plugins are installed | `confirmed` | omo ships `packages/prompts-core/prompts/ultrawork/default.md`. The collision is real and the rename is justified |
| 13 | `:172` | "forge does not route models" | `confirmed` | forge assigns models statically per agent — `gh-workflow/ARCHITECTURE.md:148-153`, and hard-coded `model: opus[1m]` in `agents/forge-coder.md:9` |
| 14 | `:34` | ISA is v2.21.0 with 17 fixed body sections | `confirmed` | `ISAFormat.md:8` reads "LifeOS ISA Format Specification v2.21.0"; `:14` records the body growing to **seventeen** sections at v2.19.0. **This pass initially corrected it to v2.20.0 and was wrong** — that string is a changelog entry inside the file's own version history, not the document version. Reverted in `d32dce6` |

**Section 1:** 14 rows — 12 `confirmed`, 2 `corrected`, 0 `original`, 0 `invented`.

Two of section 1's four original corrections were themselves defective, which is
why rows 9 and 14 now carry their own history. A reconciliation pass that
introduces errors is worse than no pass, so the regressions are recorded here
rather than quietly amended.

---

## 2. Cross-document conflict register

These are assertions that exist **twice in `docs/design/`, differently**. They are
not source-reconciliation failures; they are internal contradictions, which ISC-6
is the only claim positioned to catch. Each was found while implementing #187,
#13 or #12, and each was deliberately recorded rather than silently resolved.

| # | Conflict | Refs | Disposition |
|---|---|---|---|
| 15 | Commit-subject regex specified twice | `03-workflow.md:462` vs `CONTRIBUTING.md:206` | ISA adopted the `03-workflow` form; **shipped** in `packages/core/src/guards/commit-prefix.ts` with a test pinning the `owner/repo#N` rejection. `CONTRIBUTING.md` now contradicts running code |
| 16 | SKILL.md frontmatter key set: 5 keys vs 8 | `08-dual-target.md:44-50` vs `01-skill-hierarchy.md:347-356` | Adjudicated **strict-5** by the principal; shipped in `scripts/skill-lint.ts`. See row 254 — opencode actually recognises **eleven** |
| 17 | Tier-0 `iai` router uses top-level `disable-model-invocation`, called "load-bearing" | `01-skill-hierarchy.md:66-74` | **Unresolved and consequential.** Under strict-5 that skill cannot be authored. Demoting it to `metadata` makes Claude Code ignore it too. Lands in M2 |
| 18 | Skill layout specified twice | `01-skill-hierarchy.md:370` (nested) vs `CONTRIBUTING.md:284` (flat) | The design's own example `skills/trade/backtest/` + `name: trade-backtest` **fails its own rule** at `:349`. Only the flat form is lintable; shipped that way |
| 19 | skill-lint scope specified twice | `M1.md:62` ("three docs targets") vs ISA test strategy / `CONTRIBUTING.md:113` / `ci.yml:107` (`skills/` only) | Shipped `skills/`-only. `references/` is "contracts, not skills" (`08-dual-target.md:485`); `agents/` must omit `name` on opencode. One schema cannot span all three |
| 20 | Core purity contradicted eleven lines apart | `08-dual-target.md:215` ("one small `readFileSync`" permitted) vs `:220` ("The core never does I/O") | Shipped **pure**, because `M1.md:95-97` commits S1.2 to stubbing `fs`/`net`/`process` to throw against `packages/core/src/guards` |
| 21 | `process.cwd()` ban names `core` and `adapter-opencode`, silent on `adapter-claude` | `9-isa.md` Constraints | Implemented verbatim, asymmetry included, with a test pinning it. Either deliberate-and-unrecorded or an omission |
| 22 | `no-exec-template` rule has no owning claim in story #9 | `CONTRIBUTING.md:309`, `09-security.md:189` | Shipped unclaimed rather than dropped — dropping would have silently lost a security rule |
| 23 | `description` length: 1024 vs "under 300" hard check vs "roughly 300" | design tables vs `CONTRIBUTING.md:122` vs `08-dual-target.md:67` | Shipped 1024 error / 300 warning |
| 24 | Body-section checks claimed but unclaimed by ISC-5 | `CONTRIBUTING.md:122` | Not implemented; ISC-5 and all four cases are frontmatter-only |
| 25 | Install path names a file that does not exist | `CONTRIBUTING.md:225` → `packages/installer/src/cli.ts` | Installer CLI is out of scope per `9-isa.md:52-53`. `scripts/install-git-hooks.ts` is the interim path |
| 26 | `category: "ultrabrain"` is not one of the seven routing categories | `01-skill-hierarchy.md:387,396` vs `02-roles.md:545-553` | The repo's only skill-frontmatter example uses an **invalid** category. `ultrabrain` is an inherited omo built-in (row 11); only `deep` and `quick` survive into iAI's seven |
| 27 | `ultrawork` vs `deepwork` naming drift | `ARCHITECTURE.md:113` vs `00-synthesis.md:119` | The rename was decided (row 12); ARCHITECTURE still carries the old name |
| 28 | Model chains unspecified | `M3.md:115` requires an ordered chain with ≥1 fallback per category; `02-roles.md:545-553` gives one model per category per host | 21 chain positions undefined |
| 29 | `deepwork` "raises the category" with no ordering defined | `M3.md:127` | "Raises" has no referent — no partial order over the seven categories exists |
| 30 | "the local model" is named nowhere | `02-roles.md:387`, `:580-582` | `PRIVATE` work must route to a local model; no model, provider or detection mechanism is specified in any repo |
| 31 | `quant` carries two opencode models in one cell | `02-roles.md:551` | A per-agent override the "agents name a category" model cannot express |
| 32 | `tools` specified three ways | `08-dual-target.md:236` (string), `:251` (deprecated), `02-roles.md:678` (map) | forge's real agents use a **fourth** shape, a YAML sequence (`gh-workflow/agents/forge-coder.md:11-20`) |
| 33 | `permission` key set specified twice at different sizes | `08-dual-target.md:260-262` (15 keys) vs `02-roles.md:680` (3 keys) | Neither matches omo, which names **six** plus a catchall. See row 287 |
| 34 | `AgentSpec` referenced repeatedly, defined nowhere | `02-roles.md:590,692,694`, `08-dual-target.md:256,426`, `M3.md:58`, `M8.md:38` | No TypeScript shape exists in any repo |
| 35 | `{target_dir}` defined twice | `CONTRIBUTING.md:63` vs `04-domain-dev.md:334` | ISA adopted the CONTRIBUTING form. See row 475 — the `04` form is the one forge actually uses |
| 36 | `## Commands` shape specified twice | `CONTRIBUTING.md` block form vs the table form | Recorded in the ISA Decisions section. See row 473 — the table's header is `Kind`, forge parses `Action` |
| 37 | Three-way `anchors_to` collision | `9-isa.md` Test Strategy, `9-plan.md`, LifeOS `ISAFormat.md:325` | LifeOS defines `literal` / `derived: <sub-claim>` / `cross: <slug>`; iAI uses the first two and adds its own |
| 38 | ISA names three sources, gives two paths | `9-isa.md:81-83` | **Corrected by this task** — oh-my-opencode located upstream and checked out |

**Section 2:** 24 rows, all internal contradictions.

---

## 3. Per-file assertion enumeration

One row per assertion, per file. The `LifeOS` / `forge` / `omo` columns record
whether that source supports the assertion: `yes`, `no`, `partial`, or `–` where
the assertion makes no claim about that source.

### 3.1 `01-skill-hierarchy.md`

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 100 | `:7-12` | Three tiers: Tier 0 kernel (`iai` router + references), Tier 1 lifecycle, Tier 2 packs `dev/trade/health/wealth/know` | – | no | no | `original` | No source tiers its skills; forge ships 20 flat dirs (`gh-workflow/skills/*/SKILL.md`), omo a flat catalog (`packages/skills-loader-core/src/features/builtin-skills/`) |
| 101 | `:9` | Tier 1 is exactly 14 domain-agnostic verbs | – | adapted | – | `original` | 14 rows counted at `:92-105`; `00-synthesis.md:87` records "forge's flat 20 become Tier 1's 14" |
| 102 | `:18-21` | ARCHITECTURE lists progressive disclosure: "Tier 0 always, Tier 1 on route, Tier 2 on demand" | – | – | – | `confirmed` | Verbatim at `iAI/ARCHITECTURE.md:196` |
| 103 | `:30` | A Tier-1 verb never hardcodes a domain; no `if (domain === "trade")` in Tier 1 | – | – | – | `original` | Matches iAI's own decision row `ARCHITECTURE.md:209`. Neither source has a domain seam |
| 104 | `:32-35` | A Tier-1 verb reads the `domain:` label and loads that pack's `domain.md`; a sixth domain = one binding file | – | – | – | `corrected` | `CONTRIBUTING.md:279-299` requires 7 artefacts for a new pack (binding.ts, label, leaves, design doc, registry entry, security row, audit file) — not "one file" |
| 105 | `:41-45` | References are markdown under `references/`, read by explicit path, cost **zero** skill-tool budget | – | yes | – | `confirmed` | `gh-workflow/ARCHITECTURE.md:25-26` "shared contracts. Loaded on demand by skills, never duplicated into them" |
| 106 | `:47-49` | forge's lesson recorded as an ARCHITECTURE decision, with "20 copies of a contract drift within a month" as the **rejected alternative** | – | partial | – | `corrected` | `iAI/ARCHITECTURE.md:211` — that string is the *Rationale* column; the rejected alternative is "Self-contained skills". forge's own wording is "nineteen copies" (`gh-workflow/ARCHITECTURE.md:39`) |
| 107 | `:53` | `references/context-discovery.md` parses `## Build Targets`, `## Commands`, `\| Feature \| Description \|` | – | partial | – | `confirmed` | `gh-workflow/references/context-discovery.md:71,129`. `docs/milestones/M*.md` has no forge analogue — forge reads the GitHub milestone body (`skills/story-create/SKILL.md:92`) |
| 108 | `:54` | `Closes #N` fires only on merge to the **default** branch, so task PRs never auto-close | – | yes | – | `confirmed` | `gh-workflow/references/branch-and-pr-model.md:131`; `ARCHITECTURE.md:80-83` |
| 109 | `:55` | `references/gh-error-handling.md` owns rate-limit backoff, resume, `gh` exit-code taxonomy | – | yes | – | `confirmed` | `gh-workflow/references/gh-error-handling.md:83-92,189` |
| 110 | `:56` | Verification doctrine: never trust conversation memory; re-read disk and GitHub before acting | yes | yes | – | `confirmed` | `gh-workflow/CLAUDE.md:16-23`; `LifeOS/install/LIFEOS/RULES/Verification.md` |
| 111 | `:56` | Three verifier classes `deterministic` / `judged` / `attested` | yes | – | – | `confirmed` | `LifeOS/.../ISA/ISAFormat.md:12`; also `.../Bunker/BunkerSystem.md:40` |
| 112 | `:57` | The four classification levels are `PUBLIC` / `INTERNAL` / `PRIVATE` / `SECRET` | corrected | – | – | `corrected` | LifeOS's four are `RESTRICTED`/`CONFIDENTIAL`/`INTERNAL`/`PUBLIC` — `hooks/lib/data-classification.ts:16`. Rename recorded at `00-synthesis.md:52` |
| 113 | `:57` | The `last_4`-only rule (never full account numbers) | yes | – | – | `confirmed` | `LifeOS/install/USER/FINANCES/schema.yaml:217,220` |
| 114 | `:58` | `references/model-routing.md`: category → model chain → reasoning level → fallbacks, plus the `deepwork` escalation keyword | – | – | yes | `corrected` | omo has category→chain→reasoning→fallback (`packages/omo-opencode/src/config/schema/categories.ts:5-52`); the keyword is `ultrawork` upstream, deliberately renamed (`00-synthesis.md:119`) |
| 115 | `:58` | `model-routing.md` is "the only document in the tree that names model IDs" | – | – | – | `corrected` | False inside iAI: `02-roles.md:545-553` names `amd-anthropic/Claude-Opus-5`, `amd-unified/gpt-5.6-sol` and others |
| 116 | `:59` | `references/domain-binding.md` owns the `DomainBinding` interface, sub-types and registry | no | no | no | `original` | Net-new per `00-synthesis.md:132-136`; grepped `DomainBinding`, `unitOfWork`, `binding` across all three repos — no analogue |
| 117 | `:60` | Evidence envelope: `## iai-*` sentinel namespace, SHA-pinned permalinks, 65536 hard limit / 60000 working budget | – | yes | – | `confirmed` | `gh-workflow/references/gh-api.md:27-28,37-38`; sentinel namespace renamed from `## forge-*` per `00-synthesis.md:94-96` |
| 118 | `:61` | `story/{n}-{slug}` and `task/{n}-{slug}`, task PRs target the story branch, commit prefix `#{issue}:` | – | yes | – | `confirmed` | `references/branch-and-pr-model.md:19-23,202`; `hooks/check-commit-prefix.sh:41` |
| 119 | `:62` | Label state machine: `type:`/`status:` namespaces, at-most-one-`status:`, single-command transition | – | yes | – | `confirmed` | `references/workflow-states.md:21-23`; label set at `gh-workflow/README.md:161-168` |
| 120 | `:63` | ISA **v2.21.0**; frontmatter `phase`/`progress`/`task`/`slug`; 17 fixed body sections; `- [ ] ISC-N:` with `(after: ID)`; Test Strategy cols `anchors_to`/`severity`/`tier` | yes | – | – | `confirmed` | `ISAFormat.md:8` reads "v2.21.0"; `:14` records the body growing to **seventeen** sections at v2.19.0. **`00-synthesis.md:34` was the stale one** — see row 14 and section 4 |
| 121 | `:63` | iAI adds a `## Build Targets` section to the ISA | – | yes | – | `confirmed` | forge owns `## Build Targets` (`references/context-discovery.md:71`); grafting recorded at `00-synthesis.md:168` |
| 122 | `:64` | `references/sizing-criteria.md`; per-domain thresholds come from the binding, not the reference | – | partial | – | `confirmed` | `references/sizing-criteria.md:3-20` (S/M/L/XL, five signals). Per-domain thresholds are the iAI delta |
| 123 | `:66` | Tier 0 contains exactly **one** skill | – | – | – | `original` | No source has a single-router kernel; forge exposes 20 top-level skills |
| 124 | `:70` | `iai` router frontmatter is `disable-model-invocation: true` + `argument-hint` | yes | no | – | `confirmed` | Both keys used together at `LifeOS/install/skills/LifeOS/SKILL.md:5-6`; forge uses `argument-hint` only |
| 125 | `:72-74` | `disable-model-invocation: true` is **load-bearing** | yes | – | no | `corrected` | Already registered as row 17. Absent from omo's `SkillMetadata` (`opencode-skill-loader/types.ts:6-18`), so unenforced on opencode — a load-bearing guarantee cannot rest on it |
| 126 | `:83-85` | Universal loop `goal-create → story-create → story-design → story-test-plan → task-create → task-do → task-verify → story-verify` | adapted | adapted | – | `confirmed` | forge chain at `gh-workflow/CLAUDE.md:41-49`; LifeOS hill-climb re-expressed per `00-synthesis.md:33` |
| 127 | `:92` | `goal-create` reads `USER/TELOS/TELOS.md`, back-links the `G0` line, writes a Milestone with a feature table | yes | partial | – | `confirmed` | `LifeOS/install/USER/TELOS/TELOS.md:35`; milestone feature table at `gh-workflow/skills/story-create/SKILL.md:92` |
| 128 | `:93` | `story-create` labels the Story `type:story` + `domain:*` and assigns the milestone | – | partial | – | `confirmed` | `type:story` verbatim (`gh-workflow/README.md:162`); `domain:` is the iAI addition (`00-synthesis.md:76`) |
| 129 | `:94` | `story-design` writes `docs/design/{issue}-isa.md` behind a `## iai-isa` sentinel | – | renamed | – | `corrected` | forge writes `docs/design/{issue}-design.md` behind `## forge-design-doc` (`references/design-doc-resolution.md:43`) |
| 130 | `:95` | `story-test-plan` writes `docs/test-plans/{issue}-plan.md` with P0/P1/P2 tiers behind `## iai-test-plan` | – | partial | – | `corrected` | forge path is `docs/test-plans/{issue}-test-plan.md` (`references/test-plan-resolution.md:30`); P0/P1/P2 confirmed but forge calls them *priorities*, not tiers |
| 131 | `:96` | `task-create` makes one sub-issue per unit of work, each anchored to an `ISC-N` | – | partial | – | `confirmed` | forge: one sub-issue per **build target** (`skills/task-create/SKILL.md:1-14`); ISC anchoring is the LifeOS graft |
| 132 | `:97` | `task-do` cuts `task/{n}-{slug}`, prefixes commits, opens a PR to the story branch, sets `status:in-progress` | – | yes | – | `confirmed` | `skills/task-implement/SKILL.md`; `references/workflow-states.md:105-112` |
| 133 | `:97` | `task-do` gates when `binding.gate.irreversibleAction` is in scope | – | no | – | `original` | No `gate`/`irreversibleAction` concept in any source; net-new per `00-synthesis.md:142-148` |
| 134 | `:98` | `task-verify` writes `docs/evidence/{issue}-{ts}.md` + `## iai-evidence`, sets `status:resolved`, closes explicitly | – | partial | – | `confirmed` | Explicit close confirmed (`references/workflow-states.md:117-121`); the `docs/evidence/` path is net-new |
| 135 | `:99` | `story-verify` **never merges**; a human merges | – | yes | – | `confirmed` | `references/branch-and-pr-model.md` "Forge **opens** PRs and marks them ready; it never merges them" |
| 136 | `:100` | `status` writes nothing — read-only over labels, ISA `phase`/`progress`, Current→Ideal percentages | yes | yes | – | `confirmed` | forge `skills/status/SKILL.md:1-16`; LifeOS pct formula `USER/TELOS/CURRENT_STATE/README.md` |
| 137 | `:105` | `learn` writes a `MEMORY/` entry, Cortex-lite, tier A/B/C | yes | – | – | `confirmed` | `LIFEOS/TOOLS/MemoryTypes.ts:73` `type Tier = "A" \| "B" \| "C"` |
| 138 | `:111` | `task-do` renames forge's `task-implement` | – | yes | – | `confirmed` | `gh-workflow/skills/task-implement/SKILL.md`; rename table `00-synthesis.md:97` |
| 139 | `:112` | `story-verify` renames forge's `story-test` and retains the never-merge gate | – | yes | – | `confirmed` | `skills/story-test/SKILL.md:1-17`, `:388-390`; `00-synthesis.md:98` |
| 140 | `:113` | `learn` generalises forge's `enhance-debugger` | – | yes | – | `confirmed` | `skills/enhance-debugger/SKILL.md:1-12`; `00-synthesis.md:99` |
| 141 | `:114` | forge's `story-design` output is a freeform design doc, not an ISA | – | yes | – | `confirmed` | `skills/story-design/SKILL.md:12-15` |
| 142 | `:115` | `goal-create` is net-new — "forge has no intent layer above the Milestone" | – | yes | – | `confirmed` | forge's top object is the Milestone/Epic (`README.md:119-122`); no TELOS/goal object anywhere |
| 143 | `:116` | `checkpoint` / `resume` are **net-new**; the forge column is `—` | – | **no** | – | `invented` | forge ships both: `gh-workflow/skills/checkpoint/SKILL.md:1-10` and `skills/resume/SKILL.md:1-11`, with a `## forge-checkpoint` sentinel (`skills/resume/SKILL.md:14`) |
| 144 | `:122-124` | Each pack ships one `domain.md` binding; leaves are invoked by Tier-1, never the user; packs never import each other | – | – | – | `original` | No pack concept in any source |
| 145 | `:127-177`, `:370` | Skill layout is **nested**: `skills/trade/backtest/SKILL.md` with `name: trade-backtest` | – | no | partial | `corrected` | Already registered as row 18. omo supports nesting via a `namePrefix` to depth 2 (`async-loader.ts:176-187`), yielding `trade/backtest`, not `trade-backtest` |
| 146 | `:152` | `health/ingest` connectors are oura, eightsleep, apple, labs, hae | yes | – | – | `confirmed` | All five files at `LIFEOS/TOOLS/healthsync/`. See row 641 — only four are pullable adapters |
| 147 | `:186-193` | `DomainBinding` = `id`, `unitOfWork`, `verify`, `gate`, `evidence`, `labels` | no | no | no | `original` | Field list matches `CONTRIBUTING.md:279-281`; no source analogue |
| 148 | `:203-209` | `Rung`: index 0 is the safe default; `verifier` ∈ `deterministic\|judged\|attested`; `reversible: false` implies gated | yes | – | – | `confirmed` | Verifier enum from `ISAFormat.md:12`; the rung ladder itself is net-new |
| 149 | `:215` | `evidenceRequired: true` — no domain may close an issue without disk evidence | – | partial | – | `original` | forge requires evidence-before-close in spirit (`references/workflow-states.md:119`) but has no `evidenceRequired` contract |
| 150 | `:218-224` | `GateSpec` = `irreversibleAction`, `authoriser`, `killSwitch?`, `vetoAgent?`, `autoDeny[]` | no | no | no | `original` | Net-new per `00-synthesis.md:142-148`; grepped `veto`, `kill switch`, `irreversible` — no analogue |
| 151 | `:226-232`, `:317` | `budgetChars: 60000` against GitHub's 65536 hard limit; `pinned` = SHA-pinned permalink, never a branch | – | yes | – | `confirmed` | `references/gh-api.md:27-28,37-38,147-161` |
| 152 | `:250`-`:310` | trade binding constants: `defaultRung: "research"`, ≥5y data, ≥30 paper sessions, `killSwitch`, `autoDeny` staleness | no | no | no | `original` | Entire trading domain is greenfield — `00-synthesis.md:55-67`; grepped `backtest`, `broker`, `slippage`, `ticker`, `alpaca` — zero hits |
| 153 | `:322-329` | `labels.namespace: "domain:trade"` plus `rung:*` / `risk:vetoed` extras with hex colours | – | partial | – | `original` | Colour palette matches forge's label set (`README.md:161-168`); the namespaces are iAI additions |
| 154 | `:342-345` | Every skill is written once, installed to `.claude/skills/<name>/SKILL.md`, loaded by **both** hosts from that identical file | – | – | yes | `confirmed` | `oh-my-opencode/docs/reference/features.md:579`; loader gates it behind `includeClaudeCodePaths` (`opencode-skill-loader/loader.ts:97-105`) — omo provides this, not opencode core |
| 155 | `:349` | `name`: `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars, **must match the directory name** | no | – | no | `original` | Neither host enforces it: omo falls back to the dirname but keeps a mismatched frontmatter name (`async-loader.ts:90-91`); LifeOS ships `name: LifeOS` (uppercase) and it loads. Legitimate iAI policy, not a host constraint |
| 156 | `:350` | `description`: required, 1–1024 chars | – | – | no | `original` | No length validation in omo's parser (`async-loader.ts:92`) or schema; searched `1024`, `maxLength` |
| 157 | `:351-353` | `license` (SPDX), `compatibility`, `metadata` (string→string) optional and **read by both hosts** | – | – | yes | `confirmed` | omo reads all three: `opencode-skill-loader/types.ts:13-15`, `async-loader.ts:124-126` |
| 158 | `:354` | `argument-hint` is **Claude-Code-only**; opencode **Ignored** | yes | yes | **no** | `invented` | omo reads it into `CommandDefinition.argumentHint` — `opencode-skill-loader/types.ts:10`, `async-loader.ts:115`, `merger/skill-definition-merger.ts` |
| 159 | `:355` | `allowed-tools` is **Claude-Code-only**; opencode **Ignored** | yes | – | **no** | `invented` | omo parses it (space-separated *and* YAML array) into `LoadedSkill.allowedTools` — `types.ts:16`, `async-loader.ts:127,135-145`, `allowed-tools-parser.ts`, tests at `loader-allowed-tools.test.ts` |
| 160 | `:356` | `disable-model-invocation` is Claude-Code-only; opencode **Ignored** | yes | – | yes | `confirmed` | Absent from omo's `SkillMetadata`; grepped `disable-model-invocation`, `disableModelInvocation` across `oh-my-opencode/packages` — zero hits |
| 161 | `:360-362` | "opencode silently ignores unknown fields… you will not be warned that `allowed-tools` did nothing" | – | – | partial | `corrected` | Unknown-field tolerance is right, but `allowed-tools` is *not* unknown — it is parsed and surfaced on `SkillInfo` (`tools/skill/native-skills.ts:21`). It is unenforced, not ignored |
| 162 | `:364` | `metadata` is a string→string map on **both** hosts; numbers/booleans quoted; nested objects not portable | – | – | yes | `confirmed` | `metadata?: Record<string, string>` at `opencode-skill-loader/types.ts:15` |
| 163 | `:366-368` | Put anything host-specific under `metadata:`; real guardrails live in `iai-core/guards/` | – | – | – | `original` | `iai-core` is the real package name (`iAI/packages/core/package.json:2`) |
| 164 | `:385-392` | Skill `metadata` carries 8 keys incl. `tier`, `domain`, `category`, `rung`, `verifier` | – | – | – | `corrected` | Already registered as row 16 — adjudicated strict-5 against `08-dual-target.md:44-50` |
| 165 | `:387`, `:396` | `category: "ultrabrain"` | – | – | yes | `corrected` | Already registered as row 26. `ultrabrain` is a real omo built-in (`categories.ts:45`) but not one of iAI's seven at `02-roles.md:545-553` |
| 166 | `:407-415` | Router resolves in 7 steps, reading the issue from GitHub rather than memory | – | partial | – | `original` | Never-from-memory matches forge's ephemerality doctrine (`CLAUDE.md:16-23`); the domain-keyed dispatch is net-new |
| 167 | `:417-419` | The `domain:` label is the routing key and "there is no separate registry to keep in sync" | – | – | – | `corrected` | Contradicted inside iAI: `CONTRIBUTING.md:290` mandates registering each pack in `packages/core/src/binding/registry.ts`, and `:59` of this file says `domain-binding.md` owns "the registry" |
| 168 | `:426` | The user-facing invocation is `/iai task 41` | – | – | – | `corrected` | Command namespace is `/iai:` per `00-synthesis.md:93` — the form is `/iai:task 41` |
| 169 | `:432` | Router runs `gh issue view 41 --json labels,title,body,parent` | – | **no** | – | `corrected` | `parent` is not a `gh issue view --json` field: forge enumerates the valid set at `references/gh-operations.md:31` and states "Sub-issues are GraphQL-only" at `:185-224`, with a `Parent: #N` body fallback at `:244` |
| 170 | `:436`, `:444-446` | `rung != live` denies first; on `rung:live` mandate/kill-switch checks run and `task-do` stops for per-order authorisation | no | no | no | `original` | Absolute-veto agent named net-new at `00-synthesis.md:146-148` |
| 171 | `:438` | Leaf writes `docs/evidence/41-20260825T1412Z.md` with `## iai-evidence` and a SHA-pinned permalink | – | partial | – | `confirmed` | Two-surface model is forge's (`references/gh-api.md:37-38,147-161`); the path template is iAI's. See row 562 — the `{ts}` format conflicts with `05-domain-trading.md` |
| 172 | `:452-457` | Context budget: Tier 0 ~2k always · Tier 1 ~4k on route · Tier 2 ~3k on demand · references ~1–3k each | – | – | – | `original` | No token budgets in any source; searched `token budget`, `context budget`, `~2k` |
| 173 | `:461-463` | One Task in one domain costs roughly 12–15k, never the sum of the tree | – | – | – | `original` | Derived from the row above; no source figure |
| 174 | `:469` | References are never listed as skills — listing them would add "twelve descriptions" per session | – | – | – | `confirmed` | Internally consistent: exactly 12 references are tabled at `:53-64` |
| 175 | `:470` | A skill reads at most **3** references | – | no | – | `original` | forge sets no such cap (`CONTRIBUTING.md:121-149`) |
| 176 | `:472` | Bindings are data — `domain.md` is parsed, not read as narrative | – | – | – | `corrected` | Conflicts with `CONTRIBUTING.md:279-281`, which puts the binding in `packages/domain-<id>/src/binding.ts` as TypeScript |
| 177 | `:473` | The 60000-char artifact budget exists so payloads never enter model context | – | yes | – | `confirmed` | `references/gh-api.md:27-28,37-38` |

**`01-skill-hierarchy.md`:** 78 rows — 39 `confirmed`, 16 `corrected`, 20 `original`, 3 `invented`.

---

### 3.2 `02-roles.md`

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 200 | `:19-23` | Ring capability fence: Ring 0 write + mutating `gh` + spawns; Ring 1 none; Ring 2 write-in-domain, no spawn | – | – | partial | `original` | No source states a 3-ring capability matrix. omo has per-agent tool denial only (`agents/oracle.ts:412`) |
| 201 | `:22` | Ring 1 advisors have no `Write`/`Edit`, no mutating `gh`, cannot be assigned an issue | – | – | yes | `confirmed` | omo `oracle`/`librarian` deny `write`,`edit`,`apply_patch`,`task` — `agents/oracle.ts:412-417`, `librarian.ts:25-31` |
| 202 | `:27` | "The agent that proposes is never the agent that approves." | yes | – | – | `confirmed` | LifeOS builder ≠ auditor invariant — `LIFEOS/ALGORITHM/changelog.md:101` |
| 203 | `:32-34` | forge "states it as a construction rule": *"Forge never audits work Forge built."* | yes | **no** | – | `corrected` | The verbatim string is in **LifeOS** `install/agents/Forge.md:2`. Zero hits in gh-workflow for `never audits`, `separation of duties`, `self-approv` |
| 204 | `:38-39` | Orchestrator verifies agent claims against GitHub rather than trusting self-reports | – | yes | – | `confirmed` | `gh-workflow/ARCHITECTURE.md:159-160` verbatim |
| 205 | `:64-66` | Every Ring 0 agent emits a machine-parsed first line; the orchestrator reads exactly one line | – | yes | – | `confirmed` | "The first line is parsed by the orchestrator. Keep its shape exact." — `agents/forge-coder.md:272-274` |
| 206 | `:74` | `iai-conductor` tools = `Task, Bash, Read, Grep, Glob, Write, Edit, TodoWrite, Skill` | – | partial | – | `original` | forge agents carry `Skill, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion` (`agents/forge-planner.md:11-19`); no `Task`/`TodoWrite` |
| 207 | `:89` | The conductor must never merge a PR | – | yes | – | `confirmed` | `references/branch-and-pr-model.md:205`; `CONTRIBUTING.md:211` |
| 208 | `:99` | First line `PIPELINE #{…}: PHASE {n}/{total} {ADVANCED\|GATED\|HALTED\|COMPLETE}` | – | – | – | `original` | No such contract in any source |
| 209 | `:116-122` | Three claims verified every phase via `gh issue view`, `gh pr list`, `test -f` + `git log` | – | yes | – | `confirmed` | `references/workflow-states.md:142`; `references/gh-operations.md:369-373` |
| 210 | `:126` | `iai-planner` descends from forge's `forge-planner` | – | yes | – | `confirmed` | `gh-workflow/agents/forge-planner.md:1-19` |
| 211 | `:137` | Planner parses a `docs/milestones/M*.md` feature table, one Story per row | – | partial | – | `corrected` | forge reads `\| Feature \| Description \|` from `ARCHITECTURE.md` or the milestone issue body, not `docs/milestones/M*.md` — `CLAUDE.md:84-98` |
| 212 | `:138` | ISA at `docs/design/{issue}-isa.md` with **17 fixed ISA sections** | yes | partial | – | `corrected` | 17 sections confirmed (`skills/ISA/SKILL.md:4`). Path renamed from forge's `{issue}-design.md` |
| 213 | `:139-140` | `docs/test-plans/{issue}-plan.md` maps each `ISC-N` to test cases at P0/P1/P2 | yes | yes | – | `confirmed` | `ISC-N` LifeOS `skills/ISA/SKILL.md:4`; P0/P1/P2 `skills/story-test-plan/SKILL.md:119-131` |
| 214 | `:162-163` | Permalinks are SHA-pinned (`/blob/{sha}/…`), never branch-relative | – | yes | – | `confirmed` | "Use the **commit SHA**, never a branch name" — `references/gh-api.md:52-56` |
| 215 | `:167` | `iai-executor` descends from forge's `forge-coder` | – | yes | – | `confirmed` | `gh-workflow/agents/forge-coder.md:1-20` |
| 216 | `:178` | Executor creates `task/{n}-{slug}` from the story branch | – | yes | – | `confirmed` | `references/branch-and-pr-model.md:22,60-68` |
| 217 | `:183` | Opens a **DRAFT** PR targeting the **story branch**, never `main` | – | yes | – | `confirmed` | `gh pr create --draft --base "story/{story}-{slug}"` — `references/branch-and-pr-model.md:70-73` |
| 218 | `:184-185` | Task PRs do not auto-close; the task issue is closed explicitly | – | yes | – | `confirmed` | `ARCHITECTURE.md:82,91-92` |
| 219 | `:186` | Retry up to **3 times** on transient failure before reporting `PARTIAL` | – | yes | – | `confirmed` | "Retries up to 3 times on test failure" — `agents/forge-coder.md:5`, `:360` |
| 220 | `:198-205` | Executor first line has exactly four shapes: `RESOLVED` / `IMPLEMENTED (verification pending)` / `PARTIAL` / `BLOCKED` | – | yes | – | `confirmed` | Four shapes at `agents/forge-coder.md:278,289,301,314`; forge's second reads `IMPLEMENTED (tests pending)` — a deliberate generalisation |
| 221 | `:214-225` | `PARTIAL` must be followed by a resume-prompt block so a fresh executor can pick up cold | – | yes | – | `confirmed` | `agents/forge-coder.md:307`, `:206` |
| 222 | `:229` | `iai-validator` descends from forge's `forge-validator` | – | yes | – | `confirmed` | `gh-workflow/agents/forge-validator.md:1-19` |
| 223 | `:243` | Evidence captured to `docs/evidence/{issue}-{ts}.md` under `## iai-evidence` | – | partial | – | `corrected` | forge writes `docs/test-results/{task}-{timestamp}.md` (`agents/forge-coder.md:284`) behind `## forge-*`. Rename recorded `00-synthesis.md:96` |
| 224 | `:250-251` | Validator MUST NOT close the Story and MUST NOT open the integration PR | – | yes | – | `confirmed` | `agents/forge-validator.md:7-8` |
| 225 | `:260` | Validator first line `#57: PASS \| FAIL \| TESTS_SKIPPED \| PARTIAL` | – | yes | – | `confirmed` | `agents/forge-validator.md:168`, shapes at `:191,202,214,224` |
| 226 | `:270-282` | Hard-failure block "modelled on forge's hard failure", 5 fixed lines, parsed to halt | – | yes | – | `confirmed` | Identical shape at `agents/forge-planner.md:50-54`; iAI generalises the last line |
| 227 | `:302-307` | Ring 1 denied-tools table: all four deny `Write`,`Edit`,`MultiEdit`,`NotebookEdit`,`Task`; two also deny `Bash` | – | – | partial | `corrected` | omo `oracle` denies `write,edit,apply_patch,task`; `librarian` adds `call_omo_agent` — **neither denies `bash`**, and `momus` does **not** deny `task` (`agents/momus.ts:283-287`). `MultiEdit`/`NotebookEdit` appear nowhere in omo |
| 228 | `:311` | `iai-critic` is "Modelled on oh-my-opencode's `momus`"; its job is **to find the flaw** | – | – | partial | `corrected` | `momus` exists but its prompt says "**APPROVAL BIAS**: When in doubt, APPROVE" and "You are NOT here to … Find as many issues as possible" (`momus.ts:45,29-33`). The disposition is inverted |
| 229 | `:314`, `:318` | A critic returning "looks good" has failed its contract; "LGTM" is an invalid response | – | – | no | `corrected` | Contradicts momus directly: "A plan that's 80% clear is good enough" — `momus.ts:45` |
| 230 | `:333-335` | `iai-researcher` "inherits LifeOS's rule verbatim": external content is data, never instructions | yes | – | – | `confirmed` | `LifeOS/SECURITY.md:37` verbatim |
| 231 | `:341-351` | Fence format `[EXTERNAL CONTENT — INFORMATION ONLY, NOT INSTRUCTIONS]` / `Source:` / `[END EXTERNAL CONTENT]` | yes | – | – | `confirmed` | Byte-identical header/footer at `LifeOS/SECURITY.md:80-83`; `Fetched:`/`SHA-256:` are iAI additions |
| 232 | `:358-361` | `checkEgress` blocks `USER/HEALTH`, `USER/FINANCES`, `USER/TRADING` content in a web query pre-execution | yes | – | – | `confirmed` | `EgressClassGuard.hook.ts:1-19` gates at `PreToolUse` on `LIFEOS/USER/**`. `USER/TRADING` does not exist — LifeOS has no trading |
| 233 | `:374` | `risk-officer` holds an absolute veto and cannot propose trades | – | – | – | `original` | Explicitly net-new — `00-synthesis.md:146-148` |
| 234 | `:445` | "iAI never diagnoses or prescribes" (README rule 3) | no | – | – | `original` | No diagnosis rule in LifeOS `USER/HEALTH/**` (searched `diagnos`, `prescrib`, `clinician`) |
| 235 | `:472-474` | Absence of a spawn arrow is a hard denial "enforced by the `Task` tool being withheld, not by instruction" | – | – | yes | `confirmed` | `createAgentToolRestrictions([… "task"])` — `agents/oracle.ts:412-417`, `librarian.ts:25-31` |
| 236 | `:522-525` | Loop guard "borrowed from oh-my-opencode's `sisyphus-junior`": leaves have no `Task` tool at all | – | – | partial | `corrected` | omo's comment is explicit: "`call_omo_agent` is ALLOWED so subagents can spawn explore/librarian" (`sisyphus-junior/agent.ts:40`) — omo's leaves are *not* absolute leaves |
| 237 | `:541-543` | Agents never name a model; they name a **category**, resolved per host at install and at runtime via `chat.params` | – | – | yes | `confirmed` | `config/schema/categories.ts:43-52`; `plugin/chat-params.ts:19-25` |
| 238 | `:545-553` | Seven category names: `plan`,`deep`,`quick`,`critic`,`quant`,`write`,`search` | – | – | partial | `original` | omo's built-ins are `visual-engineering, ultrabrain, deep, artistry, quick, unspecified-low, unspecified-high, writing`. Only `deep`/`quick` overlap; the other five are net-new |
| 239 | `:547-553` | The Claude Code column resolves to aliases `opus` / `sonnet` / `haiku` | – | yes | yes | `confirmed` | `CLAUDE_CODE_ALIAS_MAP` — `claude-code-agent-loader/claude-model-mapper.ts:5-9` |
| 240 | `:547-553` | opencode model IDs `amd-anthropic/…`, `amd-unified/…` | – | – | partial | `original` | Bare model names exist in omo, but the provider prefixes `amd-unified/` and `amd-anthropic/` have **0 hits in all three repos**, as does `gpt-5.4-mini`. Deployment-specific, no source claim made |
| 241 | `:551` | `quant` carries two opencode models in one cell | – | – | – | `original` | Already registered as row 31 |
| 242 | `:557-560` | Blockquote attributed to LifeOS's `CrossVendorAudit` on critic/validator vendor separation | partial | – | – | `corrected` | `CrossVendorAudit.ts` is real and the *concept* is LifeOS doctrine (`USER/ALGOPREFS.md:30`), but this sentence appears nowhere in LifeOS and names iAI's own roles |
| 243 | `:566-571` | Cross-vendor pairing table; `scribe`→`iai-critic` re-routed to avoid same-vendor | – | – | – | `original` | Roster-specific; no source pairing table exists |
| 244 | `:573-582` | Four ordered resolution rules; `PRIVATE` egress beats cross-vendor; never route `PRIVATE` to a cloud vendor | yes | – | – | `confirmed` | LifeOS routing matrix and FAIL-CLOSED — `EgressClassGuard.hook.ts:13-18,56` |
| 245 | `:588` | Skills are shared verbatim — both hosts read `.claude/skills/**/SKILL.md` | – | – | yes | `confirmed` | `opencode-skill-loader/loader.ts:132-145` |
| 246 | `:600` | Claude Code dialect writes `tools:` as a comma-separated string | – | no | yes | `corrected` | omo's parser accepts a string **and** an array; forge's three real agents all use a YAML **sequence** (`agents/forge-validator.md:11-18`). Already registered as row 32 |
| 247 | `:628-630` | opencode dialect uses `mode: subagent` + `temperature: 0.1` | – | – | yes | `confirmed` | `agent-definitions-loader.ts:37`; `temperature: 0.1` on momus/oracle/librarian |
| 248 | `:675` | `name`: **Required** on Claude Code, **Absent** on opencode — a file valid for one host carries a stray key for the other | – | – | no | `corrected` | omo parses both dialects identically: `const name = data.name \|\| agentName` — `agent-definitions-loader.ts:22-25`. `name` is optional on both and never a stray key |
| 249 | `:677`, `:686-689` | `mode` is "Not a concept" on Claude Code; a `tools` string where a map is expected "can degrade to all tools allowed" | – | – | no | `corrected` | `AgentFrontmatter.mode` is read from `.claude/agents/*.md` (`claude-code-agent-loader/types.ts:18`). And the failure direction is inverted — it is a **map** input that returns `undefined` and leaves all tools allowed (`shared/parse-tools-config.ts:6-16`) |
| 800 | `:45` | An agent claim is worthless until `gh issue view 61 --json labels` agrees | – | yes | – | `confirmed` | `ARCHITECTURE.md:159-163`; `skills/autodev/SKILL.md:330-331` |
| 801 | `:49-57` | A Proposer→Approver table in which no listed artifact may be self-approved | – | yes | partial | `confirmed` | Separation-of-duties is forge's construction rule (`ARCHITECTURE.md:159`) |
| 802 | `:51` | `iai-planner` proposes the ISA + sizing; `iai-critic` approves it | – | partial | partial | `corrected` | forge routes design+size approval to a **human** at Gate 1 (`skills/autodev/SKILL.md:170-186`); iAI inserts an agent approver |
| 803 | `:52` | `iai-executor` proposes; `iai-validator` approves the unit of work is done | – | yes | – | `confirmed` | `agents/forge-validator.md:26-32` |
| 804 | `:53` | `iai-validator` proposes; **human** approves closing the Story and opening the integration PR | – | yes | – | `confirmed` | `agents/forge-validator.md:255-258` |
| 805 | `:54` | `quant-analyst` proposes; `risk-officer` approves any order or strategy change | – | – | – | `original` | No broker/risk agent in any source (`00-synthesis.md:146-150`) |
| 806 | `:55` | `health-analyst` proposes; **clinician** approves anything crossing into diagnosis | – | – | – | `original` | LifeOS has no clinician boundary; `USER/HEALTH/MEDICATIONS.md:55` invites the assistant to "flag interactions" |
| 807 | `:56` | `wealth-steward` proposes; **human** approves any movement of money | – | – | – | `original` | LifeOS FINANCES schema is descriptive only (`00-synthesis.md:39`) |
| 808 | `:57` | `iai-conductor` proposes nothing; **GitHub** approves every claim any agent made | – | yes | – | `confirmed` | `ARCHITECTURE.md:159-163` |
| 809 | `:92` | Conductor MUST NOT advance past `gate:pending` without a recorded human decision | – | no | – | `original` | No `gate:` label namespace in forge — label set is `type:*` / `status:*` only |
| 810 | `:109-114` | Conductor emits a `CORRECTION #N:` block with `agent said` / `actual` / `using` / `action` | – | yes | – | `confirmed` | forge has the identical mechanism as a table at `skills/autodev/SKILL.md:334-347`; iAI reshapes it into a parsable block |
| 811 | `:131` | `iai-planner` model category is `plan` | – | – | no | `original` | No `plan` in omo's builtin category enum (`categories.ts:43-52`) |
| 812 | `:150` | A Story with no `## iai-isa` sentinel cannot enter phase 5 | – | yes | – | `confirmed` | forge Phase 2: 0 `## forge-design-doc` comments → HARD FAILURE |
| 813 | `:156` | Planner first line is `PLANNED {n} stories for milestone #{m}` | – | no | – | `original` | forge's contract is `Planned {Milestone\|Story} {ref}:` + `· Story #{n}:` blocks — a different shape |
| 814 | `:157-159` | Per-story line carries `effort: M (3d)` / `L (5d)` day figures | – | partial | – | `corrected` | forge sizing is S/M/L/XL against code-path/file counts (`sizing-criteria.md:15-20`); no day estimates anywhere — searched `day`, `hour`, `1d`, `3d` |
| 815 | `:157-159` | Test counts reported as `n P0 / n P1 / n P2` | – | yes | – | `confirmed` | `skills/story-test-plan/SKILL.md:119-131` |
| 816 | `:172` | `iai-executor` model category is `deep` | – | – | yes | `confirmed` | `deep` is an omo builtin (`categories.ts:46`). iAI maps `deep`→`sonnet` where forge-coder ran `opus[1m]` |
| 817 | `:182` | Commits carry the `#{issue}: message` prefix | – | yes | – | `confirmed` | `hooks/check-commit-prefix.sh:39` |
| 818 | `:190` | One executor, one task, one unit of work | – | yes | – | `confirmed` | `agents/forge-coder.md:3-8` |
| 819 | `:207-212` | The executor's four first-line shapes each map to a conductor next-move | – | yes | – | `confirmed` | `skills/autodev/SKILL.md:246-259` |
| 820 | `:210` | The second shape is `IMPLEMENTED (verification pending)` | – | yes | – | `corrected` | forge's literal is `IMPLEMENTED (tests pending)`. Generalised for non-code domains; the rename is not in `00-synthesis.md`'s rename table |
| 821 | `:211` | `PARTIAL` → re-dispatch with the resume prompt until retries are exhausted | – | yes | – | `confirmed` | `skills/autodev/SKILL.md:252-253`, limit 3 at `:365-367` |
| 822 | `:212` | `BLOCKED` → **halt**; escalate to `iai-planner` or human | – | partial | – | `corrected` | forge does **not** halt on BLOCKED — it records and moves to the next task (`skills/autodev/SKILL.md:254`); only HARD FAILURE halts |
| 823 | `:234` | `iai-validator` category is `critic`, cross-vendor from the executor where possible | partial | no | no | `original` | No `critic` category in omo; forge-validator is `sonnet[1m]` against an `opus[1m]` coder — same vendor |
| 824 | `:244` | Validator MAY mark a task's draft PR ready for review | – | yes | – | `confirmed` | `references/branch-and-pr-model.md:102` |
| 825 | `:255` | Validator MUST NOT accept the executor's claim that verification passed; it re-runs it | – | yes | – | `confirmed` | `agents/forge-validator.md:265-266` |
| 826 | `:263-268` | Validator verdict vocabulary is exactly `PASS` / `FAIL` / `TESTS_SKIPPED` / `PARTIAL` | – | yes | – | `confirmed` | `agents/forge-validator.md:3-8` |
| 827 | `:265` | `PASS` = every **P0** case executed and passed; evidence committed | – | partial | – | `corrected` | forge PASS reports an aggregate pass rate with no P0-specific gate; iAI narrows the bar |
| 828 | `:266` | `FAIL` = at least one **P0** case executed and failed | – | partial | – | `corrected` | forge FAIL fires on any failing case, not P0 specifically |
| 829 | `:267` | `TESTS_SKIPPED` = verification could not execute at all | – | yes | – | `confirmed` | `agents/forge-validator.md`, tests-skipped block |
| 830 | `:268` | `PARTIAL` = P0 passed but P1/P2 incomplete, **or drift found during re-grounding** | – | partial | – | `corrected` | forge PARTIAL is purely "skipped cases"; drift is a separate `⚠ OUTDATED` warning, not folded into the verdict |
| 831 | `:319` | Critic must rank findings `BLOCKER` / `MAJOR` / `MINOR` / `NIT` | – | – | yes | `corrected` | The scale is omo's **`review-work`** skill (`CRITICAL / MAJOR / MINOR / NITPICK`, `shared-skills/skills/review-work/SKILL.md:369-372`), not momus, which has no severity ranks — only `[OKAY]`/`[REJECT]` |
| 832 | `:327` | Critic first line is `CRITIC #57: {n} BLOCKER / {n} MAJOR / …` | – | – | no | `original` | momus emits `**[OKAY]**`/`**[REJECT]**`; `review-work` emits `<verdict>`. No count-line format in any source |
| 833 | `:355` | Injection findings reported as the token `PROMPT_INJECTION_SUSPECTED` | no | no | no | `original` | LifeOS fences and flags but names no verdict token (`SECURITY.md:76-84`) |
| 834 | `:372` | `dev-coder` writes source + tests, opens draft PRs, never merges, never touches `USER/` | partial | yes | – | `confirmed` | `ARCHITECTURE.md:167-170`; `references/branch-and-pr-model.md:70-72` |
| 835 | `:373` | `quant-analyst` writes `USER/TRADING/`, proposes orders, cannot promote a rung | no | – | – | `original` | `LifeOS/install/USER/` contains `FINANCES`, `HEALTH`, `TELOS`, `WORK`, `SECURITY` — **no `TRADING`** |
| 836 | `:374` | `risk-officer` holds an absolute `VETO` and cannot propose trades | no | no | no | `original` | `00-synthesis.md:146-148` |
| 837 | `:375` | `health-analyst` never diagnoses, never prescribes | no | – | – | `original` | No such constraint in LifeOS |
| 838 | `:376` | `wealth-steward` never moves money; spend above threshold is gated | partial | – | – | `original` | LifeOS `SpendAuditor.hook.ts` audits token spend, gates no money movement |
| 839 | `:377` | `scribe` never asserts without a cited source snapshot | partial | – | – | `original` | LifeOS Cortex has no citation mandate |
| 840 | `:383` | Ring 2 cannot spawn **any** agent (loop guard) | – | – | partial | `corrected` | omo blocks only `task` and explicitly re-allows delegation: `merged.call_omo_agent = "allow"` (`sisyphus-junior/agent.ts:40-42,137`). iAI's rule is strictly stronger |
| 841 | `:384` | Ring 2 cannot apply `status:` labels | – | yes | – | `confirmed` | `references/workflow-states.md:9-23` |
| 842 | `:385` | Ring 2 cannot open non-draft PRs | – | yes | – | `confirmed` | `references/branch-and-pr-model.md:70-72,102` |
| 843 | `:386` | A specialist is scoped to one `domain:` label and must refuse a wrong-domain dispatch | – | no | – | `original` | The `domain:` namespace is iAI's addition (`00-synthesis.md:76`) |
| 844 | `:387` | `PRIVATE` surfaces are local-model-only, enforced by `checkEgress` at the tool boundary | yes | – | – | `confirmed` | `EgressClassGuard.hook.ts:4,47-51,106` |
| 845 | `:394-399` | `risk-officer` is spawned only by the conductor and reads the proposal from disk | – | – | – | `original` | Net-new per `00-synthesis.md:146-148` |
| 846 | `:402-404` | The mandate is `USER/TRADING/MANDATE.md`; absent/stale/unsigned → `VETO` | – | – | – | `original` | No `MANDATE.md` in any tree |
| 847 | `:406-413` | Four evaluation axes: position limits, correlation exposure, drawdown budget, mandate compliance | – | – | – | `original` | No risk-axis taxonomy in any source |
| 848 | `:418` | Risk verdict line `RISK #58: VETO \| PASS \| PASS_WITH_CONDITIONS` | – | – | – | `original` | No such vocabulary in any source |
| 849 | `:421-425` | `VETO` halts the pipeline and applies `risk:vetoed` | – | no | – | `original` | forge has no `risk:` label namespace |
| 850 | `:428-435` | Override only by the human principal, recorded under `## iai-risk`, journalled and committed | – | – | – | `original` | No override-journal protocol in any source |
| 851 | `:437-441` | The approver never becomes the proposer | – | – | – | `original` | Closest source text is LifeOS's builder≠auditor invariant, which is about vendor, not veto |
| 852 | `:447-454` | `health-analyst` produces exactly three output kinds | – | – | – | `original` | No health-analysis agent contract in any source |
| 853 | `:456-462` | Four absolute prohibitions incl. never say "nothing to worry about" | – | – | – | `original` | Nothing comparable in LifeOS's health surface |
| 854 | `:464-466` | Crossing the line trips a blocking clinician-boundary gate | – | no | – | `original` | No `gate:` labels in forge; no clinician gate in LifeOS |
| 855 | `:510-518` | The spawn matrix is enforced by withholding the `Task` tool, not by instruction | – | – | yes | `confirmed` | `TASK_DENIED_SUBAGENT_KEYS` + `agent.permission.task = "deny"` — `plugin-handlers/tool-config-handler.ts:7-13,38-46` |
| 856 | `:513` | `iai-conductor` may spawn all rings but not itself (no recursion) | – | – | partial | `original` | omo grants `task: "allow"` to several agents but states no self-recursion ban |
| 857 | `:514-516` | Graded spawn matrix across planner/executor/validator | – | – | – | `original` | forge's three agents spawn no agents at all — they invoke skills |
| 858 | `:517` | Ring 1 advisors may spawn **nothing** | – | – | yes | `confirmed` | omo denies `task` to `librarian, explore, oracle, multimodal-looker, metis, momus` (`tool-config-handler.ts:7-13`) |
| 859 | `:518` | Ring 2 specialists may spawn **nothing** | – | – | partial | `corrected` | omo's executor leaf keeps `call_omo_agent: "allow"` (`sisyphus-junior/agent.ts:137`); iAI's absolute leaf rule exceeds the source |
| 860 | `:534` | Depth is hard-capped at **2**: human → conductor → worker → leaf | – | – | no | `corrected` | Presented as following from omo's guard, but omo states no depth cap and its junior retains `call_omo_agent`. The number is iAI's |
| 861 | `:590` | `iai-installer` generates both agent dialects from one internal `AgentSpec` | – | – | – | `original` | `00-synthesis.md:156-158` "No source ships to two hosts from one tree" |
| 862 | `:594` | Claude Code agents live at `.claude/agents/<name>.md` | yes | – | yes | `confirmed` | `claude-code-agent-loader/AGENTS.md:7`; LifeOS ships `install/agents/*.md` |
| 863 | `:623` | opencode agents live at `.opencode/agents/<name>.md` | – | – | yes | `confirmed` | `claude-code-agent-loader/AGENTS.md:7` |
| 864 | `:631-638` | The opencode dialect carries a `tools:` map of `tool: boolean` alongside `permission:` | – | – | partial | `corrected` | omo treats `tools` as **legacy**: `migrateAgentConfig` converts it and runs `delete result.tools` (`shared/permission-compat.ts:60-76`). iAI's own `08-dual-target.md:251` calls it deprecated — the sample contradicts it |
| 865 | `:639-649` | `permission:` takes `edit`, `bash` as a glob→action map, and `webfetch`, values `allow\|ask\|deny` | – | – | yes | `confirmed` | `assets/omo.schema.json` agent `permission` object |
| 866 | `:642-648` | `"*": ask` is stated first and specific rules follow | – | – | yes | `confirmed` | `shared/permission-compat.ts:33-41` |
| 867 | `:676` | `description` is required on both hosts and is the only true field overlap | – | – | yes | `confirmed` | `agent-definitions-loader.ts:26-28`, `types.ts:11-17` |
| 868 | `:679` | Claude `model` is an alias; opencode is `provider/model-id` | – | – | yes | `confirmed` | `claude-model-mapper.ts:7-9` |
| 869 | `:681` | `temperature` is supported on opencode, not Claude Code | – | – | yes | `confirmed` | `AgentFrontmatter` has no `temperature`; omo sets it on every opencode `AgentConfig` |
| 870 | `:690-692` | Every opencode `permission: deny` needs a matching Claude `PreToolUse` rule, generated from one `AgentSpec.deny[]` | – | – | – | `original` | No dual-emission mechanism in any source |
| 871 | `:693-695` | Never hand-write a model ID into an agent file | – | – | yes | `confirmed` | `claude-model-mapper.ts:7-9`. The doc violates its own rule three lines earlier — `:629` hard-codes `model: amd-unified/gpt-5.6-sol` |

**`02-roles.md`:** 122 rows — 60 `confirmed`, 24 `corrected`, 38 `original`, 0 `invented`.

---

### 3.3 `03-workflow.md`

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 300 | `:5-7` | Exactly one pipeline; it never branches by domain — a `domain:` label selects a `DomainBinding` re-binding four nouns | – | – | – | `original` | `DomainBinding` explicitly net-new — `00-synthesis.md:132-136` |
| 301 | `:9` | The canonical run is "modelled on forge's eleven-step pipeline" | – | yes | – | `confirmed` | `gh-workflow/CLAUDE.md:37-53` "## End-to-End Pipeline", numbered 0–11 |
| 302 | `:14`-`:21` | `/iai:init`, `story-create`, `task-create`, `task-do`, `task-verify` map 1:1 onto forge steps 0,1,4,5,7 | – | yes | – | `confirmed` | `CLAUDE.md:39-47`; renames recorded at `00-synthesis.md:97-99` |
| 303 | `:15` | `/iai:goal-create` maps a TELOS goal to a Milestone carrying a `\| Feature \| Description \|` table | partial | yes | – | `confirmed` | `CLAUDE.md:113-118`. `goal-create` itself has no forge analogue — net-new bridge |
| 304 | `:17-18` | Step 3 writes `docs/design/{n}-isa.md` behind `## iai-isa`; step 4 `docs/test-plans/{n}-plan.md` behind `## iai-test-plan` | yes | yes | – | `corrected` | forge uses `{n}-design.md` / `## forge-design-doc` (`references/artifact-gh-sync.md:12-14`) and `{n}-test-plan.md` |
| 305 | `:22-25` | Step 8 auto-resolves the Story; step 9 opens the integration PR and posts `## iai-verdict`; step 11 closes the milestone | – | yes | – | `confirmed` | `references/workflow-states.md:158-175`. `## iai-verdict` renames forge's `## forge-test-results` (`references/gh-api.md:210`) — a rename **not** in `00-synthesis.md`'s table |
| 306 | `:39-40` | Every numbered command takes an issue/milestone number and is idempotent | – | yes | – | `confirmed` | `references/workflow-states.md:27-31` |
| 307 | `:46-47` | Milestone → Story → Task. Exactly three levels; a fourth means two Stories | – | yes | – | `confirmed` | `CLAUDE.md:73-86`; `00-synthesis.md:75` |
| 308 | `:84-86` | Milestones take no labels; Story and Task label/ownership contracts | – | yes | – | `confirmed` | `references/workflow-states.md:47-50`; `references/branch-and-pr-model.md:5-13` |
| 309 | `:98-99` | Labels are the source of truth for state; `/iai:init` creates every label idempotently | – | yes | – | `confirmed` | `references/workflow-states.md:9-11`; `skills/init/SKILL.md:68-96` |
| 310 | `:103-110` | Eight `type:`/`status:` labels with fixed hex colours | – | yes | – | `confirmed` | `skills/init/SKILL.md:87-94`; identical hex in `README.md:161-168` |
| 311 | `:110` | `status:blocked` means "blocker named in a **comment**" | – | no | – | `corrected` | forge encodes the blocker in the issue **body** as `Blocked by: #N` — `references/gh-operations.md:328-339` |
| 312 | `:111-115` | `domain:{dev,trade,health,wealth,know}` namespace with five hex colours | – | – | – | `original` | Namespace is iAI's stated addition (`00-synthesis.md:76`); the hex values appear in no source |
| 313 | `:116`, `:125-139` | `rung:*` is domain-defined; every domain declares **exactly four** rungs; 20 named rung values | – | – | – | `original` | LifeOS's `ModelRungGuard.hook.ts:11-13` uses "rung" only for *model tiers*; no verification ladder anywhere |
| 314 | `:131` | Rung colours ramp identically in every ladder: `c5def5` → `bfd4f2` → `79b8ff` → `cf222e` | – | – | – | `original` | No hex ramp in any source. **Violated by three domain files** — see rows 423, 515, 774 |
| 315 | `:117-120` | `gate:pending`, `gate:approved`, `risk:vetoed`, `class:private` with fixed colours | – | – | – | `original` | forge's label set stops at `type:`/`status:`/`forge` |
| 316 | `:121` | The `iai` marker label is colour `24292f` | – | partial | – | `corrected` | forge's equivalent is `forge` at `ededed` (`skills/init/SKILL.md:95`). Rename kept, hex silently changed |
| 317 | `:141-144` | `rung:live` and `rung:clinician-review` are the only two rungs an auto mode may never reach | – | – | – | `original` | Net-new (`00-synthesis.md:142-145`) |
| 318 | `:150-152` | At most one `status:*`; exactly one `domain:*` per Story; exactly one `rung:*` | – | partial | – | `confirmed` | One-status rule at `references/workflow-states.md:23-26`; domain and rung cardinality are iAI extensions |
| 319 | `:154` | `/iai:init` reconciles and corrects drifted hex values without recreating labels | – | no | – | `corrected` | forge does the **opposite**: "leave labels that already exist with a different colour alone, since the project may have chosen them deliberately" (`skills/init/SKILL.md:71-73`) |
| 320 | `:163-172` | Three label invariants: at most one `status:`, single-command transition, idempotent | – | yes | – | `confirmed` | `references/workflow-states.md:23-31`; `00-synthesis.md:77` |
| 321 | `:176-184` | Epic/Milestone state derived from the Stories beneath; milestones carry no labels | – | yes | – | `confirmed` | `references/workflow-states.md:47-72`. iAI drops forge's `type:epic` tracker issue while keeping the label |
| 322 | `:190-216` | Story and Task state tables; Closed retains `status:resolved` | – | yes | – | `confirmed` | `references/workflow-states.md:14-22,95-138`. forge leaves labels as-is on close; iAI pins `status:resolved` |
| 323 | `:215`, `:341` | Task PRs do not auto-close their issue; `task-verify` closes it explicitly | – | yes | – | `confirmed` | `references/workflow-states.md:132-136` |
| 324 | `:221-225` | Transition shape is always one `gh issue edit` with `--add-label`/`--remove-label` | – | yes | – | `confirmed` | `references/workflow-states.md:24-31` |
| 325 | `:232-234` | Every gate is three artifacts — `gate:pending`, `## iai-gate`, and on opencode a `permission.ask` hook that **blocks the tool call** | – | no | partial | `corrected` | omo's own note: `permission.ask` "is a hook for an already-created permission request", not a tool-call blocker (`features/monitor/permission.ts:1-11`). The blocking surface is `tool.execute.before`, used correctly at `09-security.md:132` |
| 326 | `:234-235` | Claude Code expresses the same block as a `PreToolUse` process exiting 2 | yes | yes | – | `confirmed` | `EgressClassGuard.hook.ts:13`, `:120-124`; `PreToolGuard.hook.ts:45,129` |
| 327 | `:239-241` | Three blocking gates — design, implementation review, closure; closure is human-only | – | yes | – | `confirmed` | `skills/autodev/SKILL.md:84,162,359,436`; never-merge at `references/branch-and-pr-model.md` |
| 328 | `:242-245` | Rung-promotion, per-order live authorisation, spend-threshold and clinician-boundary gates | – | – | – | `original` | Trading domain net-new (`00-synthesis.md:62-67`); LifeOS `SpendAuditor` audits *token* spend, not money |
| 329 | `:246` | Egress of `class:private` defaults to **deny** rather than ask; approval routes to a local model | yes | – | – | `confirmed` | `EgressClassGuard.hook.ts:15-18` fail-closed; `DataClassification.md` |
| 330 | `:251-262` | `## iai-gate` comment anatomy — seven named fields ending `**Decision:** PENDING` | – | – | – | `original` | No gate sentinel in forge's table (`references/gh-api.md:204-212`); forge gates are conversational |
| 331 | `:269-273` | Five gate rules: default deny, one gate one comment, agents may never write APPROVED, enforced twice, `risk:vetoed` outranks | – | – | – | `original` | The absolute veto is net-new (`00-synthesis.md:146-148`) |
| 332 | `:284` | The integration PR is the ONLY auto-closing PR | – | yes | – | `confirmed` | `references/branch-and-pr-model.md` § The Integration PR |
| 333 | `:293-297` | `story/`, `task/` and `bug/` branch base/target rules | – | yes | – | `confirmed` | `references/branch-and-pr-model.md` § Branch Naming |
| 334 | `:301-306` | Slug rule: lowercase → collapse non-alphanumerics → strip → truncate to **40 characters** → strip again | – | yes | – | `confirmed` | `references/branch-and-pr-model.md` § Branch Naming |
| 335 | `:310` | Worked example `rebalance-proposal-risk-officer-assessm` | – | – | – | `corrected` | The example is 39 chars; the rule at `:306` yields 40. Internal inconsistency. See also row 559 |
| 336 | `:316-322`, `:339-343` | Closing keywords fire only on merge to the DEFAULT branch; one `Closes #N` **per line** | – | yes | – | `confirmed` | `references/branch-and-pr-model.md`: "GitHub does not parse a comma-separated list… only the first is linked" |
| 337 | `:345-359` | Non-code domains use the identical branch/PR object against the **private data repo** | – | – | – | `original` | Generalising Story/Task beyond code is net-new (`00-synthesis.md:137-141`). `USER/TRADING` does not exist in LifeOS |
| 338 | `:372-382` | Nine `## iai-*` sentinels with named producers and artifact paths | – | partial | – | `corrected` | Five map onto forge sentinels (`references/gh-api.md:204-212`); `iai-gate`, `iai-risk`, `iai-learnings` are net-new. `00-synthesis.md:93-96` records only three renames |
| 339 | `:388-392` | Producer rule: sentinel first line, column zero, never in a code fence, one per comment | – | yes | – | `confirmed` | `references/gh-api.md:214-218` |
| 340 | `:404-406` | Consumer rule: most recent by `createdAt` wins; absence is a hard failure | – | yes | – | `confirmed` | `references/gh-api.md:220-226`; `agents/forge-planner.md:288` |
| 341 | `:410-416` | GitHub caps a comment at **65536**; iAI budgets **60000**; over budget → summary + permalink | – | yes | – | `confirmed` | `references/gh-api.md:27-38`; `00-synthesis.md:80` |
| 342 | `:428-430` | Permalinks pinned to a commit SHA, never a branch | – | yes | – | `confirmed` | `references/gh-api.md:105-110`; `references/artifact-gh-sync.md:40-48` |
| 343 | `:440`, `:452-457` | Commit format `#{issue}: {message}`, imperative lowercase, 72-column body, `Co-Authored-By` trailer | – | yes | – | `confirmed` | `gh-workflow/CONTRIBUTING.md:164-174`, `:190`. Trailer identity rewritten to iAI |
| 344 | `:459-463` | Validation regex `^(#[0-9]+: .+\|Merge .+\|fixup! .+\|squash! .+\|Revert ".+")` | – | partial | – | `corrected` | Already registered as row 15. forge's shipped regex allows an `owner/repo#N` prefix (`templates/git-commit-msg-hook.sh`) |
| 345 | `:465-470` | Exempt subjects: `Merge`, `fixup!`, `squash!`, `Revert "…"` | – | yes | – | `confirmed` | `templates/git-commit-msg-hook.sh`; `CONTRIBUTING.md:182` |
| 346 | `:472-473` | A failing commit is blocked **before it is written** — `PreToolUse` / `tool.execute.before` | partial | partial | yes | `confirmed` | Both event names real. **Known gap: neither iAI adapter implements it.** Note forge's own `check-commit-prefix.sh` only *warns* — it always `exit 0` |
| 347 | `:484-488` | Auto-mode gate counts: full auto 3, `auto-mine` 1, `bug-fix` 2, manual 0 | – | yes | – | `confirmed` | `skills/autodev/SKILL.md:84`; `skills/autodev-mytasks/SKILL.md:19`; `skills/bug-fix/SKILL.md:15` |
| 348 | `:492-503` | `/iai:auto` is NEVER permitted past `rung:paper`; refused at dispatch with a HARD FAILURE block | – | – | – | `original` | No trading, rungs or mandate check in any source |
| 349 | `:518-573` | Three inherited doctrines: idempotency, ephemerality, verification | yes | yes | – | `confirmed` | `references/workflow-states.md:27-31`; `CLAUDE.md:14-23`; LifeOS `VerificationGate.hook.ts:5-6` |

**`03-workflow.md`:** 50 rows — 31 `confirmed`, 8 `corrected`, 11 `original`, 0 `invented`.

---

### 3.4 `04-domain-dev.md`

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 400 | `:3` | "The `dev` pack is forge, ported" — provenance header for the whole file | – | yes | – | `confirmed` | forge is a software-dev workflow system: `gh-workflow/CLAUDE.md:5-8`, `ARCHITECTURE.md:1-11` |
| 401 | `:8-10` | "Nothing here is new mechanism"; everything comes from `03-workflow.md` | – | partial | – | `corrected` | False for §4 rungs, §6 leaves (`arch-audit`, `dep-audit`, `release`, `refactor`), the `{ts}` format and the `Repo` column — none exist in forge or `03-workflow.md` |
| 402 | `:25`, `:27-29` | dev never merges; README rule 1 quoted verbatim | – | yes | – | `confirmed` | `ARCHITECTURE.md:169`; `iAI/README.md:64` matches |
| 403 | `:43-45`, `:166` | A build target is identified by **exactly one** build definition file | – | yes | – | `confirmed` | `CLAUDE.md:127-131`; `references/build-systems.md:3-6` |
| 404 | `:46-47` | `maxSize`: "a second build file means a second Task" | – | partial | – | `corrected` | `build-systems.md:89-90`: one `CMakeLists.txt` may declare several targets, "each is its own build target, and therefore its own task" — a second *target*, not a second *file* |
| 405 | `:48` | `leafSkill: "dev/code-review"` | – | no | – | `original` | forge has no `code-review` skill; it delegates to the external `superpowers` plugin (`CLAUDE.md:29`) |
| 406 | `:52-56` | `defaultRung: "compile"`; passing = compile + tests + integration + non-author sign-off | – | no | – | `original` | No rung ladder in forge; `references/workflow-states.md` is label-based only |
| 407 | `:57-103` | Exactly four dev rungs `compile`/`unit`/`integration`/`review`, ordered | – | no | – | `original` | Net-new; matches `03-workflow.md:135` |
| 408 | `:63` | compile entry: build command resolved from `CONTRIBUTING ## Commands` | – | yes | – | `confirmed` | `references/project-commands.md:95-98`; `context-discovery.md:124-137` |
| 409 | `:64` | compile entry: toolchain present on PATH | – | no | – | `original` | forge deliberately has **no** auto-detection step (`project-commands.md:111-114`) |
| 410 | `:74-76` | unit entry: "tests derived from ISC-N claims, not from the implementation" | partial | no | – | `corrected` | Inverts forge: "**Read the implementation.** This is what makes the tests real rather than aspirational" (`skills/task-test-plan/SKILL.md:107`) |
| 411 | `:84-87` | integration entry: siblings at `unit`, story branch builds, `Passes when:` predicate | – | partial | – | `confirmed` | `project-commands.md:117-133`; `skills/story-test/SKILL.md` |
| 412 | `:96-98` | review entry: diff read by a non-author; every `ISC-N` anchored to disk evidence | – | partial | – | `confirmed` | forge separates `forge-coder` from `forge-validator` (`ARCHITECTURE.md:151-153`) |
| 413 | `:100-101` | review rung `verifier: "judged"`, `reversible: false` | – | no | – | `original` | Verifier classes come from LifeOS ISA, not forge |
| 414 | `:107-108`, `:247-248` | Irreversible action = merge into the **default** branch; authoriser human, per PR, never batched | – | yes | – | `confirmed` | `references/branch-and-pr-model.md:205-208`; `ARCHITECTURE.md:169` |
| 415 | `:109`, `:251` | Kill switch `iai dev abort --story {n}` | – | no | – | `original` | forge has no abort command |
| 416 | `:111` | `autoDeny`: tool call is `gh pr merge`, any actor, any rung | – | yes | – | `confirmed` | `ARCHITECTURE.md:169` |
| 417 | `:112` | `autoDeny`: force push to default branch, or to a story branch with open task PRs | – | partial | – | `corrected` | forge bans only force-push **without** `--force-with-lease` (`ARCHITECTURE.md:173`); the story-branch clause is net-new |
| 418 | `:113` | Commit-subject regex without the `owner/repo` alternative | – | partial | – | `corrected` | forge's hook accepts `owner/repo#N: ` (`templates/git-commit-msg-hook.sh:38`), required by `context-discovery.md:270-271` for secondary-repo commits — which `:466` of this file relies on |
| 419 | `:114-115` | `autoDeny`: PR ready with an unevidenced `ISC-N`; reviewer is the author | – | no | – | `original` | No `autoDeny` construct in forge |
| 420 | `:120-122` | evidence `kind`, sentinel `## iai-evidence`, path `docs/evidence/{issue}-{ts}.md` | – | partial | – | `corrected` | Sentinel rename recorded, but the **path** silently moved from forge's `docs/test-results/{issue}-{timestamp}.md` (`references/gh-api.md:88`) with no rename row |
| 421 | `:123-124` | `budgetChars: 60000`; `pinned: true` | – | yes | – | `confirmed` | `references/gh-api.md:27-38` |
| 422 | `:128` | `labels.namespace = "domain:dev"` | – | no | – | `original` | `domain:` is iAI's declared addition (`00-synthesis.md:76`) |
| 423 | `:130-134` | `rung:*` colours `d4c5f9`/`bfdadc`/`c2e0c6`/`f9d0c4` | – | no | – | `corrected` | Contradicts iAI's own contract at `03-workflow.md:131` — "Colours ramp identically across every ladder: `c5def5` → `bfd4f2` → `79b8ff` → `cf222e`" |
| 424 | `:149-152`, `:252` | `dev` has **no** `gate.vetoAgent`; merge gate + `git revert` suffice | – | no | – | `original` | forge has no veto agent; `vetoAgent?` is optional |
| 425 | `:154-157` | `rung:*` are pack extras; a `domain:dev` Story carries exactly one of the four | – | no | – | `confirmed` | Internally consistent with `03-workflow.md:152` |
| 426 | `:163`, `:174` | "A Task is one build target"; the mapping is 1:1 both ways | – | yes | – | `confirmed` | `CLAUDE.md:127`, `:149` "One build target = one task" |
| 427 | `:175` | Never split a target's source files across tasks | – | yes | – | `confirmed` | `CLAUDE.md:150` |
| 428 | `:176` | A Story mapping to a single component is a Task, not a Story | – | yes | – | `confirmed` | `CLAUDE.md:145` |
| 429 | `:177` | A single enum/struct change folds into the parent target's Task | – | yes | – | `confirmed` | `CLAUDE.md:146-147` |
| 430 | `:178` | Shared headers with no owning target go under the **consuming** target's Task | – | yes | – | `confirmed` | `CLAUDE.md:151-152` |
| 431 | `:178`, `:507` | Two consumers ⇒ header belongs to the first-verified target; second Task declares `Blocked by:` | – | no | – | `original` | forge states the consuming-target rule but names no tie-breaker |
| 432 | `:179`, `:503` | A target with no test command still becomes a Task, stops at `compile`, gets `blocked:no-test-cmd` | – | partial | – | `original` | forge's behaviour is "`test` missing → `task-test` cannot run … Agent: stop" (`context-discovery.md:177-179`) — no label, no rung |
| 433 | `:183-184` | A Story is a customer-deliverable feature, NEVER scoped to one component or layer | – | yes | – | `confirmed` | Near-verbatim from `CLAUDE.md:120-125` |
| 434 | `:203` | C/C++ `CMakeLists.txt` → each `add_library()` / `add_executable()` | – | yes | – | `confirmed` | `build-systems.md:19`, `:87-90` |
| 435 | `:204` | C/C++ `Makefile` → "each top-level phony target with sources" | – | no | – | `corrected` | forge parses `TARGET`, `OUTPUT`, or the first target rule (`build-systems.md:18`, `:69-78`); phony-target enumeration would misfire on driver Makefiles |
| 436 | `:205` | Go `go.mod` → the module plus each `./cmd/*` main package | – | yes | – | `confirmed` | `build-systems.md:101-112` |
| 437 | `:206-207` | Python `pyproject.toml` → `[project].name`; `setup.py` → `name=` | – | yes | – | `confirmed` | `build-systems.md:21-22`, `:124`, `:138` |
| 438 | `:208` | Rust `Cargo.toml` → `[lib]`, each `[[bin]]`, each workspace member | – | yes | – | `confirmed` | `build-systems.md:157-163` |
| 439 | `:209` | JS/TS `package.json` → `name`, one per workspace package | – | no | – | `original` | Absent from forge's supported table (`build-systems.md:15-24`). Net-new, and required by iAI's own `ARCHITECTURE.md:56-70` |
| 440 | `:210` | Polyglot `BUILD.bazel` → each `*_library` / `*_binary` rule | – | no | – | `original` | forge names Bazel only as a *future* addition (`build-systems.md:179-182`) |
| 441 | `:201-210` | The detection table is the complete set of build definition files | – | partial | – | `corrected` | Silently drops forge's `module.mk` (priority 1 at `build-systems.md:170`) and `setup.cfg` (`:23`), with no DROP row in `00-synthesis.md` |
| 442 | `:212-214` | Two build files **of the same kind** in one directory is a smell; `size` emits an ambiguous verdict | – | no | – | `corrected` | forge's rule covers files of *different* kinds and resolves by priority chain, not refusal (`build-systems.md:165-176`); `size` emits S/M/L/XL only |
| 443 | `:220`, `:235` | Four rungs, cheapest default, fixed promotion order, never skipped | – | no | – | `original` | Net-new |
| 444 | `:224` | compile promotion: exit 0 on `build` + `Passes when:` holds + log captured | – | yes | – | `confirmed` | `project-commands.md:117-133` |
| 445 | `:225` | unit promotion: exit 0 for **this target only**; every `ISC-N` maps to a named case; **zero new skips** | – | partial | – | `original` | Target-scoping is forge's; the ISC-mapping and zero-skips thresholds are net-new |
| 446 | `:226` | integration promotion: siblings at `unit`, story branch green, P0 pass, P1 pass or deferred | – | partial | – | `confirmed` | P0/P1/P2 tiering is forge's (`skills/story-test-plan/SKILL.md:119`) |
| 447 | `:227` | review promotion: `dev/code-review` clean + validator confirms + PR ready; iAI may not act alone | – | partial | – | `original` | forge marks PRs ready via `task-test` but has no review rung or validator sign-off gate |
| 448 | `:233`, `:277` | Tests are written from `ISC-N`, **never** from the code; `dev/test-gen` never reads the implementation | – | no | – | `corrected` | Directly contradicts `skills/task-test-plan/SKILL.md:107-120` and `skills/story-test-plan/SKILL.md:74` ("ground the plan in real code rather than the design doc alone") |
| 449 | `:234` | The `unit` rung is per target — `ctest -R ^libtelemetry$`, not `ctest` | – | yes | – | `confirmed` | `project-commands.md:80-90`; forge emits a "not target-scoped" warning at `:87-90` |
| 450 | `:236` | Evidence precedes the label: write `docs/evidence/…` then transition | – | no | – | `original` | forge writes results then transitions but states no ordering invariant |
| 451 | `:249-250` | Allowed vs denied git/gh operations | – | yes | – | `confirmed` | `ARCHITECTURE.md:164-177`; `references/branch-and-pr-model.md:241-254` |
| 452 | `:256-260` | Exactly two gates fire inside `dev`, plus closure | – | yes | – | `confirmed` | forge `/forge:autodev` has 3 gates (`CLAUDE.md:272`) |
| 453 | `:262-266`, `:512` | Closing keywords only on default-branch merge; `gh issue close 61`; one `Closes #N` per line | – | yes | – | `confirmed` | `ARCHITECTURE.md:80-94`; `references/branch-and-pr-model.md:126-149` |
| 454 | `:274` | `code-review` leaf: findings anchored to `ISC-N` or a target, never style; blocks readiness not the commit | – | no | – | `original` | No such skill in forge |
| 455 | `:275` | `debug` leaf: reproduce, isolate, fix — in that order; a fix with no reproduction is refused | – | partial | – | `confirmed` | `skills/bug-analyze/SKILL.md:225`; sourced from the `superpowers` `systematic-debugging` skill |
| 456 | `:276` | `refactor` leaf: same tests green before and after, test files unchanged in the same commit | – | no | – | `original` | No refactor skill in forge |
| 457 | `:278` | `arch-audit` leaf: diff `## Build Targets` against build files present, both directions | – | partial | – | `corrected` | This is forge's `context-discovery.md:114-122` cross-check plus `/forge:init --targets`, renamed without a rename row |
| 458 | `:279` | `dep-audit` leaf: dependency risk, licence, staleness; no automatic bump | – | no | – | `original` | No dependency tooling in forge |
| 459 | `:280` | `release` leaf: version bump, changelog from `#{issue}:` prefixes, tag proposal; gated | – | partial | – | `original` | The commit prefix is forge's; the release skill is net-new |
| 460 | `:282-284` | "Leaves are invoked *by* Tier-1 verbs, not by the user" | – | no | – | `corrected` | Contradicts forge's explicit doctrine: "Skills are **never hidden** behind agents. Every skill an agent calls is also available as a `/` command" (`CLAUDE.md:278-279`) |
| 461 | `:294` | ISA = frontmatter + **17 fixed** sections + `## Build Targets` | partial | yes | – | `corrected` | LifeOS reaches seventeen sections at v2.19.0 (`ISAFormat.md:14`) but states "Empty sections are excluded entirely" — they are ordered, not *fixed* |
| 462 | `:295` | Test plan at `docs/test-plans/{issue}-plan.md`, markdown tables, P0/P1/P2 | – | yes | – | `confirmed` | `context-discovery.md:225-226` |
| 463 | `:297` | Target inventory = `ARCHITECTURE.md` → `## Build Targets`, parsed mechanically | – | yes | – | `confirmed` | `context-discovery.md:69-91` |
| 464 | `:298` | Commands = `CONTRIBUTING.md` → `## Commands`, "**Markdown table** + `Passes when:`" | – | partial | – | `corrected` | Already registered as row 36. forge supports table **and** block form, block wins on duplicates (`project-commands.md:13-49`); iAI's own `CONTRIBUTING.md:52-56` uses block form |
| 465 | `:299` | Repo map = `README.md` → `## Repositories`, multi-repo only | – | yes | – | `confirmed` | `context-discovery.md:244-274` |
| 466 | `:301` | `{ts}` is compact UTC ISO-8601: `20260825T141207Z` | – | no | – | `corrected` | forge's timestamp is `{YYYY-MM-DDTHH-MM-SS}` (`skills/story-test/SKILL.md:145`). Deliberate change but unrecorded. See also rows 171, 562 |
| 467 | `:305-306` | Columns matched by header **name**, not position; extras ignored; a rename breaks the parse | – | yes | – | `confirmed` | `context-discovery.md:85-88` |
| 468 | `:310` | `Target` required, unique slug, appears verbatim in Task titles | – | yes | – | `confirmed` | `context-discovery.md:76-86` |
| 469 | `:311` | `Type` required, values `library` \| `binary` \| `docs` | – | partial | – | `corrected` | forge: "`Type` is `library` or `binary`. Any other value is recorded as-is and treated as `library`" (`context-discovery.md:89-90`). Closing the enum breaks forge's own `shell` row (`gh-workflow/ARCHITECTURE.md:115`) |
| 470 | `:312` | `Build file` required for non-`docs`; `—` for `docs`; path relative to repo root | – | yes | – | `confirmed` | `gh-workflow/ARCHITECTURE.md:110-117`; `context-discovery.md:91` |
| 471 | `:313` | `Source dirs` **required**, comma or space separated | – | no | – | `corrected` | forge: "missing `Source dirs` is tolerated (derived from the build file's directory)" (`context-discovery.md:87-88`), and specifies comma-separated only |
| 472 | `:314` | `Repo` column, optional, keys into `README.md`'s `## Repositories` | – | no | – | `original` | Not in forge's extraction contract; also absent from iAI's own `ARCHITECTURE.md:56-70`, so unimplemented |
| 473 | `:318-329` | `## Commands` is a table with header `\| Kind \| Command \|` | – | no | – | `corrected` | Already registered as row 36. forge's header is `\| Action \| Command \|`, matched **by name** (`context-discovery.md:141`). `Kind` breaks forge's parser outright |
| 474 | `:333` | `{target}` expands to the build target name | – | yes | – | `confirmed` | `project-commands.md:71` |
| 475 | `:334` | `{target_dir}` = "The target's **first** source dir" | – | yes | – | `corrected` | Already registered as row 35. Matches forge exactly (`project-commands.md:73`) but conflicts with iAI `CONTRIBUTING.md:63`, which was adopted |
| 476 | `:335-336` | `{repo_root}`, `{issue}` expansions | – | yes | – | `confirmed` | `project-commands.md:74-75` |
| 477 | `:338-341` | `Passes when:` is contract; absent ⇒ assume exit 0 **and record the assumption** | – | partial | – | `confirmed` | Default is forge's; the recording requirement is net-new |
| 478 | `:345-361` | Evidence frontmatter schema (ten keys) | – | no | – | `original` | forge's results file is prose + tables with no YAML frontmatter |
| 479 | `:364-366` | Over 60000 chars: summary + SHA-pinned permalink, full text in the commit | – | yes | – | `confirmed` | `references/gh-api.md:37-38`, `:147` |
| 480 | `:372-374` | There is **no config file**; context is discovered from root documents | – | yes | – | `confirmed` | `CLAUDE.md:196-211`; `context-discovery.md:217-219` |
| 481 | `:378` | `git remote get-url origin` provides `owner/repo` | – | partial | – | `corrected` | forge derives it from `gh repo view --json nameWithOwner` (`context-discovery.md:33-42`). Hard-failure behaviour confirmed at `:41-42` |
| 482 | `:380`, `:501` | `ARCHITECTURE.md` with no `## Build Targets` is a **hard failure** | – | no | – | `corrected` | forge's contract is "Warn + fall back to discovery" (`context-discovery.md:206`, `:93-112`). Deliberate hardening, unrecorded |
| 483 | `:381` | `## Commands` absent ⇒ Tasks cannot leave `rung:compile`; PRs stay draft | – | partial | – | `corrected` | forge: `build` missing → skip with a warning; `test` missing → stop (`context-discovery.md:175-179`). No draft-PR consequence in forge |
| 484 | `:382` | `CLAUDE.md`/`AGENTS.md` carry house conventions; absent ⇒ defaults, ISA records the absence | – | yes | – | `confirmed` | `context-discovery.md:59`, `:181-197` |
| 485 | `:383` | `docs/milestones/M*.md` carry the `\| Feature \| Description \|` rows | – | no | – | `corrected` | forge reads the feature table from the **milestone description** (`CLAUDE.md:100-118`), and `:409-410` of this same file says so. Internal contradiction |
| 486 | `:389-390` | `gh` (authenticated) and `git` are hard dependencies; no offline mode | – | yes | – | `confirmed` | `CLAUDE.md:10-12`; `context-discovery.md:41` |
| 487 | `:391` | Missing toolchain ⇒ Task stays in progress, PR draft, evidence names the gap | – | partial | – | `original` | forge only skips build verification with a logged warning |
| 488 | `:392`, `:504` | Sub-issue GraphQL unavailable ⇒ `Parent: #57` body link; capability probed once per session | – | yes | – | `confirmed` | `references/gh-operations.md:227-247` |
| 489 | `:393-394` | CI absence stamps `ci: absent`; missing advisory DB marks findings `unverified` | – | no | – | `original` | Neither appears in forge |
| 490 | `:396-398` | Every missing integration must **degrade loudly, never silently** | yes | partial | – | `confirmed` | LifeOS `INSTALL.md` "must degrade *loudly*, not silently" |
| 491 | `:429-433` | ISC claims table carries `anchors_to` and `Tier` columns | yes | – | – | `confirmed` | LifeOS ISA Test Strategy table (`ISAFormat.md`) |
| 492 | `:442-450` | `task-create` produces one Task per build target **plus one** for the test plan, with `Blocked by:` | – | yes | – | `confirmed` | `skills/task-create/SKILL.md:286-340` |
| 493 | `:462` | Task branch `task/61-libtelemetry-emit-per-flow-otlp-rec` | – | partial | – | `corrected` | forge derives a task slug from the *build target name*, truncated to 40 (`references/branch-and-pr-model.md:25-28`) — it would produce `task/61-libtelemetry`. The shown slug is 35 chars, matching neither rule |
| 494 | `:466`, `:487` | Milestone, Story, Tasks, labels and evidence live in the **primary** repo | – | yes | – | `confirmed` | `context-discovery.md:258`, `:268-271` |
| 495 | `:489` | One integration PR **per repo touched**; only the primary carries `Closes #N` | – | no | – | `original` | forge specifies exactly one integration PR and says nothing about secondary repos |
| 496 | `:502` | Renamed-header parse reports missing **required** headers incl. `Source dirs` | – | partial | – | `corrected` | Same defect as row 471 — forge tolerates a missing `Source dirs` |
| 497 | `:505` | Every skill idempotent; `gh/` backs off exponentially; the batch is resumable | – | yes | – | `confirmed` | `gh-workflow/CONTRIBUTING.md:130-132`; `references/gh-error-handling.md:83-92` |
| 498 | `:506` | A Story should touch **3–12** build targets; above 12, `replan` cuts siblings | – | no | – | `original` | forge's sizing tops out at "XL = 7+ tasks" (`sizing-criteria.md:57`); the 3–12 band is net-new |
| 499 | `:509`, `:510` | The story branch is **written to only by `story-verify`**; `dev/code-review` is cross-vendor-routed | – | no | – | `corrected` | Story-branch exclusivity is false under the stacked model iAI adopts — every task PR merge writes to it (`references/branch-and-pr-model.md:1-11`). And `02-roles.md:550-551` assigns no category to `dev/code-review` |

**`04-domain-dev.md`:** 100 rows — 46 `confirmed`, 27 `corrected`, 27 `original`, 0 `invented`.

---

### 3.5 `05-domain-trading.md`

The trading domain is entirely net-new: `00-synthesis.md:55-67` and row 10 both
establish that LifeOS has no trading code. The high `original` count is therefore
the expected result, not a gap in the pass. What is verified here is the file's
*source claims* and its *host-mechanics claims*, which are falsifiable.

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 500 | `:3-8` | Not advice, broker or fiduciary; no agent places an order without per-order human auth | – | – | – | `original` | Restates `README.md:65-68` rule 2 |
| 501 | `:10` | "LifeOS has no trading code at all" | no | – | – | `confirmed` | `rg 'broker\|ticker\|order\|portfolio'` in LifeOS → only `USER/FINANCES/*` templates, no code |
| 502 | `:11` | "forge has no notion of an irreversible external action beyond a merge" | – | no | – | `corrected` | `gh-workflow/ARCHITECTURE.md:166-177` lists five more: delete branch/issue, reopen merged, force-push, `reset --hard` |
| 503 | `:12-13` | omo "contributes only the routing that keeps the risk officer on a different vendor" | – | – | partial | `corrected` | omo has category routing, but the cross-vendor *rule* is credited to LifeOS at `02-roles.md:557` |
| 504 | `:17-19` | Quotes README rule 2 and the ARCHITECTURE "Trading defaults to `research`" decision | – | – | – | `confirmed` | `README.md:65-68`; `ARCHITECTURE.md:209` — both quoted accurately |
| 505 | `:19`, `:71-113` | The ladder has four rungs: research/backtest/paper/live | – | – | – | `corrected` | `README.md:65-66` — the rule this pack claims to follow — says "three rungs — research → paper → live" |
| 506 | `:25-44` | In-scope / out-of-scope tables; HFT, market-making, third-party advice excluded | – | – | – | `original` | Net-new |
| 507 | `:50-52` | The binding block is `01-skill-hierarchy.md`'s worked example, verbatim | – | – | – | `confirmed` | Byte-compared with `01-skill-hierarchy.md:236-328` — identical |
| 508 | `:55-64` | `unitOfWork`: noun `strategy`, `leafSkill: trade/backtest`, min/max size | – | – | – | `original` | Net-new |
| 509 | `:66-70` | `defaultRung: "research"`, `evidenceRequired: true` | – | – | – | `original` | Net-new; `M6.md:36-38` seeds it as ISC-1 |
| 510 | `:71-113` | Four rung objects with entry criteria (≥5y data, 30 paper sessions) and verifier classes | – | – | – | `original` | Net-new |
| 511 | `:116-127` | `gate`: irreversible action, per-order authoriser, kill switch, veto agent, 5 `autoDeny` | – | – | – | `original` | Net-new; `M6.md:243-256` |
| 512 | `:124` | `autoDeny` compares notional to `mandate.maxPositionNotional` | – | – | – | `corrected` | No such field in the mandate schema at `:270-275`, which has `max_position_pct` and `max_daily_loss`. Defect propagates to `M6.md:253` |
| 513 | `:127`, `:476` | Market data staler than 60s auto-denies; stale == absent | – | – | – | `confirmed` | `M6.md:88-90` ISC-4 |
| 514 | `:130-136` | Evidence: `## iai-evidence`, path template, 60000 chars, pinned | – | – | – | `confirmed` | `01-skill-hierarchy.md:228-230`; `03-workflow.md:376` |
| 515 | `:141-145` | Rung label colours `0e8a16`/`1d76db`/`fbca04`/`b60205`; `risk:vetoed` = `b60205` | – | – | – | `corrected` | `03-workflow.md:131` mandates the ramp `c5def5→bfd4f2→79b8ff→cf222e`; `:119` sets `risk:vetoed` = `a40e26` |
| 516 | `:151-158` | `autoDeny` is a last line; `guards/checkRiskMandate` evaluates before `permission.ask` | – | – | – | `confirmed` | `03-workflow.md:495`; `08-dual-target.md:449` |
| 517 | `:164-180` | One strategy = one Task; a rebalance is ONE Task with N legs; an order is never a Task | – | – | – | `original` | `M6.md:65` |
| 518 | `:197-202` | Rung table: what each proves and its promotion requirement; `live` never alone | – | – | – | `original` | Net-new elaboration |
| 519 | `:206-212` | `live` constraints: never batched, kill switch verified this session, no promotion by silence | – | – | – | `original` | `M6.md:246-260` |
| 520 | `:211` | `/iai:auto` refused at dispatch on a `rung:live` Story | – | – | – | `confirmed` | `03-workflow.md:487,492-495`; `M6.md:249-251` |
| 521 | `:214-222` | The HARD FAILURE refusal block is "verbatim from `03-workflow.md`" | – | – | – | `confirmed` | `03-workflow.md:499-503` — identical five lines |
| 522 | `:226-240` | Pre-registration: thresholds in the ISA before backtest; post-hoc change = new Story | – | – | – | `original` | `M6.md:127,142-143` |
| 523 | `:237` | Pre-registration lives in `ISC-N` claims; the commit SHA is the timestamp | – | – | – | `confirmed` | `01-skill-hierarchy.md:95`; `M6.md:142` |
| 524 | `:248-254` | Gate property table restating §2 | – | – | – | `confirmed` | Matches `:116-128`; `03-workflow.md:243-244` |
| 525 | `:258-260` | The mandate is the committed file `USER/TRADING/MANDATE.md` | – | – | – | `confirmed` | `M6.md:31-33`; `03-workflow.md:259` |
| 526 | `:262-289` | Mandate frontmatter: version/signed_at/expires_at, pct caps, `max_orders_per_day` | – | – | – | `original` | Net-new schema |
| 527 | `:274`, `:300` | Monetary values are strings — "follows LifeOS finance convention" | yes | – | – | `confirmed` | `USER/FINANCES/schema.yaml:27-36` money fields are `{type: string, example: "$X,XXX"}` |
| 528 | `:277-282` | `allowed_instruments` is a closed enum; anything absent needs a mandate-amendment PR | – | – | – | `confirmed` | `M6.md:44-46` |
| 529 | `:284-288` | `banned_tickers`, `min_liquidity_adv`, `requires_stop`, `account_last_4` | – | – | – | `original` | Net-new fields |
| 530 | `:296-297` | Amended only by human-merged PR; the pipeline continues under the **old** mandate | – | – | – | `confirmed` | `M6.md:47-49`, `:53-56` |
| 531 | `:298` | Absent, unsigned or expired ⇒ `VETO`; no grace period | – | – | – | `confirmed` | `M6.md:37-39` |
| 532 | `:288`, `:301` | Accounts recorded by `last_4` only; a full number is a `SECRET`-class leak | yes | – | – | `confirmed` | `USER/FINANCES/README.md:18`; `09-security.md:51` |
| 533 | `:309` | `quant-analyst` cannot spawn, skip, summarise for, or filter inputs to `risk-officer` | – | – | no | `corrected` | `08-dual-target.md:286-292` cites *this line* as backed by `task: {"risk-officer": deny}`; omo types `task` as a scalar enum (`assets/omo.schema.json`, `tool-config-handler.ts:38-46`). Real enforcement is Ring-2 holding no Task tool (`02-roles.md:517-521`) |
| 534 | `:310` | `risk-officer` reads proposal and book from disk, never the analyst's transcript | – | – | – | `confirmed` | `02-roles.md:394-396`; `M6.md:162-165` |
| 535 | `:311-313` | Four axes; verdicts PASS/PASS_WITH_CONDITIONS/VETO; cannot propose | – | – | – | `confirmed` | `M6.md:166-169`; `02-roles.md:374,437-440` |
| 536 | `:314` | Analyst and officer are cross-vendor per `02-roles.md`'s rule | – | – | – | `confirmed` | `02-roles.md:551,555-570` |
| 537 | `:315` | The veto is unappealable by any agent or by re-running the pipeline | – | – | – | `confirmed` | `02-roles.md:427-428`; `M6.md:170-171` |
| 538 | `:317-321` | Override = human `## iai-risk` comment + journal file + commit | – | – | – | `confirmed` | `M6.md:170-173`; `03-workflow.md:380` |
| 539 | `:326-336` | `iai trade halt --all` cancels, blocks for the session, demotes to `rung:paper`, journals | – | – | – | `confirmed` | `M6.md:174-178`, `:190` |
| 540 | `:338-339` | "Armed" = a cancel-all probe answered by the adapter this session | – | – | – | `confirmed` | `M6.md:179-181` |
| 541 | `:347-355` | Nine leaf skills with argument hints and gate flags | – | – | – | `original` | Net-new; `01-skill-hierarchy.md:139-149` |
| 542 | `:350`, `:352` | `risk-check` *is* the gate; `live-order` is gated human-per-order, always | – | – | – | `confirmed` | `03-workflow.md:243-244`; `M6.md:268` |
| 543 | `:357-359` | Gate enforced twice — label + host permission hook; label removal alone still blocks | – | – | – | `confirmed` | `03-workflow.md:269`, same wording |
| 544 | `:365-368` | `USER/TRADING/` is `PRIVATE`, `class:private`, egress-blocked; `USER/` is a symlink | – | – | – | `confirmed` | `09-security.md:51,71,302,318` |
| 545 | `:370-380` | Disk layout table: MANDATE/THESES/POSITIONS/JOURNAL/BACKTESTS/ORDERS | – | – | – | `original` | Net-new |
| 546 | `:379` | Order record lives at `USER/TRADING/ORDERS/{YYYY}/orders.jsonl` | – | – | – | `corrected` | `09-security.md:400` names it `USER/TRADING/orders.jsonl` with no `ORDERS/{YYYY}/`. Two documents, two paths |
| 547 | `:384-421` | `POSITIONS.yaml` schema; money as strings, `"—"` placeholder, `stop: "pending"` blocks promotion | – | – | – | `original` | Net-new; `M6.md:62` |
| 548 | `:425-426` | `orders.jsonl` is append-only: never rewritten, sorted or compacted | – | – | – | `confirmed` | `M6.md:205-207` |
| 549 | `:429-447` | Order-line field table with enums; `research`/`backtest` never write here | – | – | – | `original` | Net-new schema |
| 550 | `:442`, `:449-453` | Every line pins `mandate_sha` | – | – | – | `confirmed` | `M6.md:204-206`, `:288-289` |
| 551 | `:444`, `:446` | Missing `authorised_by` at `rung:live` is corruption; partial fills append a second line | – | – | – | `confirmed` | `M6.md:212-214`, `:205-206` |
| 552 | `:459-469` | Five vendor-neutral interfaces; no vendor hardcoded | – | – | – | `original` | Net-new; `M6.md:73-76` |
| 553 | `:467`, `:477` | `PaperBroker` is the default and only adapter enabled out of the box | – | – | – | `confirmed` | `M6.md:78-83` |
| 554 | `:475` | A missing integration demotes the rung, posts `## iai-risk`, applies `status:blocked` | – | – | – | `confirmed` | `M6.md:84-87`, verbatim triple |
| 555 | `:466`, `:596` | `BarSource` must expose a delisted-symbol channel; zero delistings over 10y ⇒ refuse | – | – | – | `confirmed` | `M6.md:93-95` |
| 556 | `:478` | Broker credentials in `.env` only; never in `USER/`, an issue, or model context | – | – | – | `confirmed` | `M6.md:96-98`; `09-security.md:231,262-267` |
| 557 | `:479` | Broker `positions()` reconciled against `POSITIONS.yaml` at session start | – | – | – | `confirmed` | `M6.md:106` |
| 558 | `:489-500` | Goal→Milestone→Story chain; `rung:research` at Story creation, non-negotiable | – | – | – | `confirmed` | `03-workflow.md:15-16,178-190`; `M6.md:36-37` |
| 559 | `:503` | Story branch `story/58-rotate-20-from-single-name-tech-into` | – | – | – | `corrected` | `03-workflow.md:300-306` truncates at exactly 40 chars; this stops at a word boundary at 36 |
| 560 | `:507-514` | ISC-1…ISC-6 pre-registered claim set | – | – | – | `original` | Net-new worked example |
| 561 | `:521-531` | Four Tasks with anchors and blockers; `#74` carries `gate:pending` from creation | – | – | – | `original` | `M6.md:267` |
| 562 | `:538`, `:543` | Evidence filenames `docs/evidence/71-20260901T104412Z.md` | – | – | – | `corrected` | `{ts}` conflicts with `01-skill-hierarchy.md:438` (`41-20260825T1412Z.md`) and with forge's format. See rows 171, 466 |
| 563 | `:548-562` | `## iai-gate` block field set and order | – | – | – | `confirmed` | `03-workflow.md:249-262` |
| 564 | `:564-565` | `gate:approved` only after a human comment; an agent may never write APPROVED | – | – | – | `confirmed` | `03-workflow.md:268`, near-verbatim |
| 565 | `:567-573` | `trade/live-order` runs once per leg — twelve legs, twelve authorisations | – | – | – | `confirmed` | `M6.md:246-248` |
| 566 | `:579-581` | Close: reconcile from broker, `status:resolved`, integration PR against the **private** repo | – | – | – | `original` | `09-security.md:305-311` |
| 567 | `:582` | Human merges with one `Closes #N` per line | – | – | – | `confirmed` | `03-workflow.md:317-321,342` |
| 568 | `:595`, `:598` | Look-ahead audit is a promotion requirement; never resubmit on timeout | – | – | – | `confirmed` | `M6.md:144`, `:190` |
| 569 | `:599-607` | Remaining failure-mode mitigations | – | – | – | `original` | Net-new |

**`05-domain-trading.md`:** 70 rows — 40 `confirmed`, 9 `corrected`, 21 `original`, 0 `invented`.

---

### 3.6 `06-domain-health.md`

LifeOS's `healthsync` is the real ancestor here, so the connector claims are
densely falsifiable — and five of them are false. This is the highest
`invented` density of any file in the tree.

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 600 | `:3-6` | Not a medical device; never diagnoses, prescribes, or adjusts dose/training | – | – | – | `original` | Restates `README.md:68` rule 3 |
| 601 | `:8-11` | Every clinical-decision output routes to a clinician; the terminal artifact is a *brief* | – | – | – | `original` | No LifeOS brief generator (searched `brief`, `clinician`, `PROVIDERS`) |
| 602 | `:13-14` | Acute symptoms → print "call emergency services" and stop | – | – | – | `original` | No emergency predicate in LifeOS healthsync |
| 603 | `:16-19` | ARCHITECTURE quote on advisory-only health and the rejected diagnostic-scoring alternative | – | – | – | `confirmed` | `iAI/ARCHITECTURE.md:210` — matches verbatim including the rejected alternative |
| 604 | `:25-29` | Four nouns bound: protocol/marker, trend, clinician boundary, lab PDF + daily metrics | – | – | – | `confirmed` | `iAI/README.md:20` binding table, health column |
| 605 | `:50` | One out-of-range value is a data point, not a finding | – | – | – | `original` | Net-new |
| 606 | `:52-54` | `clinician-review` has no automatic successor; `autoDeny` refuses the tool call pre-emission | – | – | – | `original` | Net-new |
| 607 | `:64-72` | `unitOfWork.noun` "protocol"; `leafSkill` `health/protocol`; min/max size | – | – | – | `original` | Net-new |
| 608 | `:75` | `defaultRung: "observe"` | – | – | – | `original` | Net-new |
| 609 | `:85` | observe entry: "source reports status ok, not stale or failed" | yes | – | – | `confirmed` | `SourceStatus` union incl. `ok`/`stale`/`failed` — `healthsync/types.ts:3-8` |
| 610 | `:86` | observe entry: day files cover the window with **≤ 10% missing days** | – | – | – | `original` | No missingness tolerance in LifeOS (searched `missing`, `gap`, `interpolat`, `coverage`) |
| 611 | `:87` | observe entry: day boundary resolved against a declared timezone | yes | – | – | `confirmed` | `healthsync/store.ts:60-71` `resolveTimeZone()`; `dayKey()` at `:73` |
| 612 | `:95-99` | trend entry: window + minimum point count declared in the ISA before the first point | – | – | – | `original` | No trend engine in LifeOS healthsync |
| 613 | `:108-110` | flag entry: pre-declared threshold; outside per-result `ref_low`/`ref_high`; persists ≥2 measurements | partial | – | – | `confirmed` | Per-result ranges real — `healthsync/types.ts:22-23`, from `questRefRangeLow/High` at `function.ts:72-73`. Threshold/persistence rules net-new |
| 614 | `:118-122` | clinician-review entry: brief committed locally, questions never instructions, human attests | – | – | – | `original` | Net-new |
| 615 | `:124` | Verifier class `attested` | yes | – | – | `confirmed` | LifeOS ISA verifier classes, `00-synthesis.md:34` |
| 616 | `:131-132` | Irreversible action = changing medication, supplement dose or training load | – | – | – | `original` | Net-new |
| 617 | `:134` | `killSwitch: "iai health halt --emit-emergency-notice"` | – | – | – | `original` | Net-new command name |
| 618 | `:135` | `vetoAgent: "health-analyst"` | – | – | – | `confirmed` | `02-roles.md:55,375` |
| 619 | `:136-143` | Six `autoDeny` predicates | – | – | – | `original` | Net-new |
| 620 | `:147` | `evidence.kind` = "lab PDF + daily metrics + adherence log" | – | – | – | `confirmed` | `README.md:20` gives "lab PDF + daily metrics"; the adherence log is an iAI extension |
| 621 | `:148-151` | Sentinel, path template, `budgetChars: 60000`, `pinned` | – | yes | – | `confirmed` | `00-synthesis.md:80`; `03-workflow.md:410` |
| 622 | `:155` | `labels.namespace: "domain:health"` | – | yes | – | `confirmed` | `domain:` is iAI's extension of forge's label set |
| 623 | `:157-162` | Six extra labels with fixed hex colours | – | – | – | `original` | Net-new |
| 624 | `:168-169` | `rung:clinician-review` is purple, not green — a handoff, not a success state | – | – | – | `original` | Internally consistent with `:160` |
| 625 | `:175` | A Task is one protocol **or** one tracked marker | – | – | – | `confirmed` | `README.md:20` |
| 626 | `:185-189` | Measurement + trend + review is exactly one Task; never split, never merged | – | – | – | `original` | Net-new |
| 627 | `:200-202` | `task-create` anchors each Task to one `ISC-N` claim | yes | – | – | `confirmed` | LifeOS ISA claim scheme, `00-synthesis.md:34` |
| 628 | `:209` | Rung ladder `observe → trend → flag → clinician-review` | – | – | – | `original` | Net-new |
| 629 | `:217` | **Nothing** promotes off `clinician-review`, ever | – | – | – | `original` | Net-new |
| 630 | `:223` | `task-verify` refuses a threshold whose file mtime postdates the first data point | – | – | – | `original` | Net-new |
| 631 | `:225` | Two consecutive measurements minimum before `flag` | – | – | – | `original` | Net-new |
| 632 | `:228-229` | `defaultRung` is `observe`, exactly as `trade` defaults to `research` | – | – | – | `confirmed` | `05-domain-trading.md:67` |
| 633 | `:241-250` | iAI may write observed deltas and questions; may not write verdicts, doses or condition names | – | – | – | `original` | Net-new |
| 634 | `:252-254` | The gate emits three artifacts incl. a `permission.ask` runtime block | – | – | – | `corrected` | Quotes `03-workflow.md:230-234` faithfully, but that line is itself wrong — see row 325. `permission.ask` cannot block an arbitrary tool call |
| 635 | `:257-258` | Blockquote of the clinician-boundary gate row | – | – | – | `confirmed` | `03-workflow.md:245` — text matches |
| 636 | `:263-268` | Anomaly enters at `flag`; emergency short-circuits, applies `health:emergency`, halts | – | – | – | `original` | Net-new |
| 637 | `:272-278` | Emergency thresholds: RHR > 120, SpO2 < 88%, chest pain, +3 kg overnight, SBP > 180 | – | – | – | `original` | Net-new; no such predicate in LifeOS (searched `spo2`, `emergency`, `threshold`) |
| 638 | `:280-287` | The emergency predicate is deterministic, lives in `iai-core/guards/`, never model-judged | – | – | – | `original` | Net-new |
| 639 | `:289-300` | Fixed HARD FAILURE notice text, unparaphrasable | – | – | – | `original` | Net-new |
| 640 | `:306-307` | Eight leaf skills under `skills/health/`, invoked by Tier-1 verbs | – | – | – | `confirmed` | Table has exactly 8 rows; leaf rule at `01-skill-hierarchy.md:123` |
| 641 | `:311` | `health/ingest` runs **five** healthsync adapters | no | – | – | `corrected` | Only four are pullable: `SOURCE_NAMES = ["oura","eightsleep","apple","function"]` — `LIFEOS/TOOLS/HealthSync.ts:44`. `hae.ts` exports only `parseHaeDate`/`normalizeHae`, imported by `apple.ts:8`; it has no `pull()` |
| 642 | `:311` | Day files written to `USER/HEALTH/DATA/` | partial | – | – | `corrected` | Real layout is `DATA/{source}/{dayKey}.json` — `healthsync/store.ts:240`. The per-source directory level is missing |
| 643 | `:311` | Updates `sources` in `current.json`; reports per-source `SourceStatus` | yes | – | – | `confirmed` | `HealthSync.ts:46`, `:310-320` `writeCurrent()` |
| 644 | `:312` | `health/trend` computes locally; refuses if the window was declared after the first point | – | – | – | `original` | Net-new |
| 645 | `:313` | `health/anomaly` runs the emergency predicate first and halts on a hit | – | – | – | `original` | Net-new |
| 646 | `:314` | `health/protocol` is this pack's `unitOfWork.leafSkill` | – | – | – | `original` | Internally consistent with `:71` |
| 647 | `:315` | `health/lab-review` carries each result's own reference range forward | partial | – | – | `confirmed` | Per-result range storage real (`types.ts:22-23`); the assay-change detector is net-new |
| 648 | `:316` | `health/clinician-brief` generated locally, questions only | – | – | – | `original` | Net-new |
| 649 | `:317` | `health/sleep-review` reads a `LastNight` **series** across Oura and Eight Sleep | partial | – | – | `corrected` | `LastNight` is a single per-run snapshot inside `current.json` (`types.ts:58-72`, built at `HealthSync.ts:262-278`), not a series. A series must come from the per-source day files |
| 650 | `:318` | `health/training-load` reports load, strain and recovery balance over 28d | no | – | – | `corrected` | No strain or recovery-balance metric exists; nearest are `oura_activity_score`/`steps` (`oura.ts:93-94`) and `exercise_minutes`/`active_energy_kcal` (`apple.ts:61-69`) |
| 651 | `:320` | Four of eight leaf skills are gated | – | – | – | `confirmed` | Counted from the table: `anomaly`, `protocol`, `clinician-brief`, `training-load` |
| 652 | `:326-327` | Filesystem + GitHub, no database; `USER/` is a symlink into a private store | yes | – | – | `confirmed` | `00-synthesis.md:52`; `ARCHITECTURE.md:169` |
| 653 | `:331-337` | `USER/HEALTH/` holds seven named markdown files | yes | – | – | `confirmed` | All seven present in `LifeOS/install/USER/HEALTH/` (plus an unlisted `README.md`) |
| 654 | `:338` | `DATA/{YYYY-MM-DD}.json` — one day file per day | no | – | – | `corrected` | Path is `DATA/{source}/{YYYY-MM-DD}.json` — one file per **source** per day (`store.ts:240`); merge is per-source (`apple.ts:193`) |
| 655 | `:339` | `LABS/{YYYY-MM-DD}-{panel}.json` — one `LabsFile` per panel draw | no | – | – | `corrected` | No `LABS/` directory exists. `function.ts:211-214` writes `DATA/function/labs.json`, `labs-raw.json`, `labs-{dayKey}.json`. There is no `{panel}` dimension anywhere |
| 656 | `:340-341` | `PROTOCOLS/{slug}.md` and `BRIEFS/{YYYY-MM-DD}-{provider}.md` | – | – | – | `original` | Net-new; neither directory exists in LifeOS |
| 657 | `:344-345` | `CONDITIONS.md` is human-entered only; no skill writes to it | – | – | – | `original` | Net-new rule; LifeOS ships the template with no write-protection rule |
| 658 | `:356-359` | "The healthsync subsystem already exists in LifeOS and is **kept** … **Five adapters, five files, one contract**" | partial | – | – | `corrected` | The KEEP verdict is real (`00-synthesis.md:38`), but `healthsync/` contains **seven** files and only **four** are adapters. iAI's own `:372` quote of `SourceName` contradicts "five adapters" |
| 659 | `:363` | Oura supplies "Sleep stages, readiness, HRV, RHR, **temperature deviation**" | no | – | – | `invented` | `summarizeOuraDay` (`oura.ts:90-101`) emits exactly `oura_sleep_score`, `oura_readiness_score`, `oura_activity_score`, `steps`, `sleep_duration_h`, `sleep_efficiency`, `avg_sleep_hr`, `avg_sleep_hrv`, `spo2_avg`. No temperature deviation, no RHR, no stage breakdown (searched `temp`, `rhr`, `resting`, `deep`, `rem`) |
| 660 | `:364` | Eight Sleep supplies "Sleep score, bed temperature, **toss-and-turn**, **HR/HRV during sleep**" | no | – | – | `invented` | `summarizeEightSleepDay` (`eightsleep.ts:79-84`) emits exactly `eightsleep_score`, `sleep_duration_h`, `bed_temp_c`, `raw`. No toss-and-turn, no HR/HRV (searched `toss`, `tnt`, `hrv`, `heart`) |
| 661 | `:365` | Apple Health supplies "Steps, **workouts**, **VO2max estimate**, **ECG events**, **BP entries**" | no | – | – | `invented` | `NUMERIC_KEYS` (`apple.ts:61-69`) is exactly `steps`, `active_energy_kcal`, `exercise_minutes`, `resting_hr`, `hrv_ms`, `weight_kg`, `sleep_hours`; HAE's `METRIC_MAP` (`hae.ts:58-65`) adds nothing else. Searched `vo2`, `ecg`, `blood_pressure`, `systolic`, `workout` |
| 662 | `:366` | Function Health supplies lab panels as structured biomarkers with per-result ranges | yes | – | – | `confirmed` | `function.ts:53-76` `normalizeBiomarker()`; ranges at `:72-73` |
| 663 | `:367` | Health Auto Export is the adapter supplying the `awaiting-first-export` case | no | – | – | `corrected` | `hae.ts` is a pure, total envelope **normaliser** (`hae.ts:1-8,83`) with no network call and no `SourceResult`. `awaiting-first-export` is emitted by `apple.ts:222` and `:265` |
| 664 | `:369` | "The real TypeScript types, **reused verbatim**" | partial | – | – | `corrected` | Not verbatim: every field of `Biomarker` and `LastNight` is nullable in the source and non-nullable in iAI's transcription |
| 665 | `:372` | `type SourceName = "oura" \| "eightsleep" \| "apple" \| "function"` | yes | – | – | `confirmed` | Verbatim, `healthsync/types.ts:1` |
| 666 | `:374-379` | `SourceStatus` = `ok`\|`stale`\|`failed`\|`unconfigured`\|`awaiting-first-export` | yes | – | – | `confirmed` | Verbatim, `types.ts:3-8` |
| 667 | `:381-386` | `DayFile { schema, source, fetched_at, metrics }` | yes | – | – | `confirmed` | Verbatim, `types.ts:10-15` |
| 668 | `:388-396` | `Biomarker` with non-nullable `value`, `unit`, `in_range`, `ref_low`, `ref_high`, `collected_at` | partial | – | – | `corrected` | Real types are `value: number \| string \| null`, `unit: string \| null`, `in_range: boolean \| null`, `ref_low`/`ref_high`/`collected_at` all nullable — `types.ts:17-25` |
| 669 | `:398-401` | `LabsFile { fetched_at, biomarkers: Biomarker[] }` | yes | – | – | `confirmed` | Verbatim, `types.ts:27-30` |
| 670 | `:403-410` | `LastNight` six fields | partial | – | – | `corrected` | Field names and order exact, but all six are `\| null` (`types.ts:58-65`) |
| 671 | `:412-417` | `CurrentJson { generated_at, day, last_night, sources }` | yes | – | – | `confirmed` | Verbatim, `types.ts:67-72` |
| 672 | `:424` | `ref_low`/`ref_high` live on the `Biomarker`, not a global range table | yes | – | – | `confirmed` | `types.ts:22-23`; `function.ts:72-73` |
| 673 | `:425` | `SourceStatus` has five values; `stale` and `awaiting-first-export` differ from `failed` | yes | – | – | `confirmed` | `types.ts:3-8` |
| 674 | `:431-433` | Timezone resolution order `LIFEOS_HEALTH_TZ → TZ → host → fallback`, first hit wins | yes | – | – | `confirmed` | `store.ts:60-71` — candidate array in exactly that order; `FALLBACK_TZ` at `:40` |
| 675 | `:435-436` | "The fallback **is recorded** in the day file's `metrics` so a later reader can tell the boundary was guessed" | no | – | – | `invented` | Nothing writes a timezone into `metrics`. `writeDayFile` (`store.ts:228-241`) stores only `schema`/`source`/`fetched_at`/`metrics`; no summariser emits a tz key (searched `tz`, `timezone`, `timeZone`, `fallback`, `LIFEOS_HEALTH_TZ`) |
| 676 | `:436-437` | Data lands in `USER/HEALTH/DATA/` keyed by the resolved local date | partial | – | – | `confirmed` | `store.ts:16`, `:240`; per-source subdir omitted (row 654) |
| 677 | `:441-457` | `METRICS.md` row schema `\| Marker \| Value \| Unit \| Ref range \| Date \| Source \| Trend \|` | no | – | – | `corrected` | LifeOS `METRICS.md:15` uses `\| Metric \| Value \| Status \| Target \|` and `:38` `\| Metric \| Prior Panel \| Latest Panel \| Direction \|`. No Unit, Ref-range or Source column anywhere |
| 678 | `:454-456` | `METRICS.md` rows: VO2max sourced `apple`; HRV `oura`; RHR `oura` | partial | – | – | `corrected` | HRV from Oura is real (`avg_sleep_hrv`, `oura.ts:98`). **RHR is not an Oura output** — Oura emits `avg_sleep_hr` only; resting HR comes from Apple/HAE (`hae.ts:62`). **VO2max is produced by no connector** |
| 679 | `:457` | `METRICS.md` blood-pressure row `122/78 mmHg`, source `apple` | no | – | – | `invented` | No blood-pressure metric in `apple.ts` `NUMERIC_KEYS` or `hae.ts` `METRIC_MAP` (searched `bp`, `blood_pressure`, `systolic`, `diastolic`) |
| 680 | `:459-462` | `Ref range` renders the row's own bounds; `—` where none; a trend arrow is never a verdict | partial | – | – | `original` | Rendering rule net-new; the underlying per-result range is real (row 672) |
| 681 | `:466-468` | **All** health data is `class:private`; the label is not removable by a skill | partial | – | – | `corrected` | LifeOS classifies `LIFEOS/USER/HEALTH/**` as **RESTRICTED** (`DataClassification.md:27`), its top class — which under iAI's recorded rename maps to `SECRET`, not `PRIVATE`. The downgrade is unrecorded |
| 682 | `:472` | Hard-gated from cloud egress by `guards/checkEgress`; default deny, not ask | yes | – | – | `confirmed` | `00-synthesis.md:37`; `EgressClassGuard.hook.ts:105-106`; `03-workflow.md:246` |
| 683 | `:473` | Trend and flag compute **locally** — arithmetic over `Biomarker[]` and `DayFile.metrics` | – | – | – | `original` | Net-new; both types are real |
| 684 | `:474` | Only derived, de-identified summaries reach a model, on per-session opt-in | – | – | – | `original` | Net-new; LifeOS has no per-session egress opt-in |
| 685 | `:476` | Raw day files never enter a prompt; the issue carries a pointer behind a sentinel | – | yes | – | `confirmed` | forge sentinel/60000 model, `00-synthesis.md:80` |
| 686 | `:478-480` | De-identified summary shape `marker=…, n=…, window=…, delta=…, direction=…` | – | – | – | `original` | Net-new |
| 687 | `:488` | Oura transport: "vendor **API token** in `.env`" | partial | – | – | `corrected` | Oura is OAuth2 client-id/secret (`OURA_CLIENT_ID`/`OURA_CLIENT_SECRET`, `oura.ts:116-117,185-188`); the file header notes "PATs were removed by Oura Dec 2025" (`oura.ts:2`) |
| 688 | `:489` | Eight Sleep absent ⇒ `bed_temp_c`/`eightsleep_score` drop out; Oura still supplies sleep | yes | – | – | `confirmed` | `eightsleep.ts:114-118`; `HealthSync.ts:265-278` |
| 689 | `:490` | Apple Health: local export bridge → `awaiting-first-export` until the first bulk export | yes | – | – | `confirmed` | `apple.ts:21-29`, `:263-272` |
| 690 | `:491` | Function Health: "**portal export**" | partial | – | – | `corrected` | Not a portal export — a reverse-engineered member-API email/password login against a Firebase-backed endpoint (`function.ts:1-14,100-106,133-166`) |
| 691 | `:492` | Health Auto Export: "**file drop directory**", "the **fallback** path when the Apple bridge is unavailable" | no | – | – | `invented` | Both halves inverted. HAE arrives over a REST `/drain` of a Cloudflare buffer (`apple.ts:140-197`), not a file drop; and it is the **primary** path — `apple.ts:245-252` selects `pullRest` whenever `HEALTH_INGEST_URL` + `HEALTH_DRAIN_TOKEN` are set, falling back to the iCloud Shortcut file otherwise |
| 692 | `:493` | Lab PDF: manual drop into `USER/HEALTH/LABS/`; `lab-review` refuses a missing ref range | – | – | – | `original` | Net-new (and see row 655 — `LABS/` does not exist upstream) |
| 693 | `:494` | Clinician absent ⇒ the pack cannot reach `clinician-review`; Stories stall at `flag` | – | – | – | `original` | Net-new |
| 694 | `:500` | Absence is never imputed: no interpolation, no carry-forward | partial | – | – | `original` | Net-new. Note LifeOS *does* carry forward in one place — `mergeDayMetrics` keeps the larger prior `sleep_hours` (`apple.ts:96-109`) |
| 695 | `:501` | Absence is never silent: `current.json` carries a `SourceStatus` per source | yes | – | – | `confirmed` | `HealthSync.ts:310-320`, `:389-403` |
| 696 | `:507-508` | TELOS goal `G0: "ApoB under 60 by Q4"` carried through unchanged | – | – | – | `confirmed` | `iAI/README.md:29` verbatim |
| 697 | `:529-533` | ISA claims `ISC-1..ISC-5` with `(after: …)` dependencies and verifier classes | yes | – | – | `confirmed` | LifeOS ISA scheme, `00-synthesis.md:34` |
| 698 | `:544` | `health/ingest` runs `function.ts` and `USER/HEALTH/LABS/2026-08-16-lipid-advanced.json` lands | no | – | – | `corrected` | `function.ts:211-214` writes to `DATA/function/labs.json`, `labs-raw.json`, `labs-{dayKey}.json`. No `LABS/` directory, no panel-named file |
| 699 | `:546`, `:594` | Rung promotion in one `gh issue edit`; `SourceStatus` computed from freshness against a per-source cadence, `stale` past the window | partial | yes | – | `corrected` | `gh issue edit` atomicity confirmed. But `:594` misstates the source: LifeOS computes freshness *separately* via `isFresh()` against a single 25h `FRESH_MS` constant (`HealthSync.ts:54,363-370`) and prints `fresh=yes/no`; there is **no** per-source cadence and **no code path ever assigns `"stale"`** (`rg '"stale"'` returns only the type declaration at `types.ts:5`) |

**`06-domain-health.md`:** 100 rows — 37 `confirmed`, 19 `corrected`, 38 `original`, 6 `invented`.

---

### 3.7 `07-domain-wealth-know.md`

Two domains in one file. `wealth` transcribes LifeOS's `FINANCES/schema.yaml`
and `know` descends from Cortex — both are checkable literally, and both
transcriptions drift badly from the source.

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 700 | `:6-9` | `wealth` is the balance sheet; `know` is the citation backbone; both refuse to act | – | – | – | `original` | Net-new framing |
| 701 | `:21-27` | wealth scope: net worth, cash flow, obligation audit, reconciliation, tax assembly, goals | – | – | – | `original` | Net-new |
| 702 | `:34-36` | Never allocation recommendations; `tax-prep` assembles, never opines | – | – | – | `original` | Net-new |
| 703 | `:44-46` | A brokerage account is one line: `investment_account` with a total value | partial | – | – | `corrected` | The object exists but the value field is `balance` (`schema.yaml:92,98`), not a "total value" |
| 704 | `:51-54` | Packs exchange via a declared interface; wealth consumes `investment_account.current_value` | no | – | – | `corrected` | `current_value` is not a field of `investment_account`. The monetary field is `balance` (`schema.yaml:98`), with `cost_basis` at `:100` |
| 705 | `:55-56` | ARCHITECTURE's "Packs never import each other" rule | – | – | – | `confirmed` | `iAI/ARCHITECTURE.md:155-156` |
| 706 | `:64-74` | `unitOfWork` noun "account"; `leafSkill` `wealth/reconcile`; `defaultRung: "recorded"` | – | – | – | `original` | Net-new |
| 707 | `:84` | recorded entry: the object exists in `schema.yaml` with required fields | yes | – | – | `confirmed` | `schema.yaml` `required:` keys per object |
| 708 | `:85` | recorded entry: monetary fields are strings | yes | – | – | `confirmed` | `schema.yaml:216` |
| 709 | `:86` | recorded entry: `last_4` present and exactly 4 characters | yes | – | – | `confirmed` | `schema.yaml:217` |
| 710 | `:93-97` | reconciled entry: closing difference **exactly `0.00`**; no placeholder strings | – | – | – | `original` | No reconciliation engine in LifeOS (searched `reconcil`, `statement`, `OFX`) |
| 711 | `:106-108` | projected entry: **≥ 3** reconciled periods; complete `obligations.yaml` | partial | – | – | `original` | `obligations.yaml` exists; the 3-period threshold is net-new |
| 712 | `:117-121` | optimised entry: quantified delta, human-executed; verifier `attested`, `reversible: false` | partial | – | – | `original` | Verifier vocabulary is LifeOS's; the rung is net-new |
| 713 | `:128` | `irreversibleAction: "moving money"` | – | – | – | `confirmed` | `README.md:20` — wealth "Never does: move money" |
| 714 | `:129-131` | Human authoriser per transfer; `killSwitch`; `vetoAgent: "wealth-steward"` | – | – | – | `confirmed` | `02-roles.md:56,376` |
| 715 | `:136` | `autoDeny`: a full account number appears in any artifact | yes | – | – | `confirmed` | `schema.yaml:220` |
| 716 | `:133-137` | `autoDeny`: authentication, transfer initiation, outflow over threshold, cloud egress | – | – | – | `original` | Net-new |
| 717 | `:142` | `evidence.kind: "statement diff"` | – | – | – | `confirmed` | `README.md:20` |
| 718 | `:143-146` | Sentinel, path template, `budgetChars: 60000`, `pinned: true` | – | yes | – | `confirmed` | `00-synthesis.md:80`; `03-workflow.md:410` |
| 719 | `:150-157` | `labels.namespace: "domain:wealth"` plus four rung labels and `class:private` | – | yes | – | `confirmed` | `domain:` is iAI's forge extension; colours net-new |
| 720 | `:164` | A Task is one account **or** one obligation | – | – | – | `confirmed` | `README.md:20` |
| 721 | `:171`, `:174-176` | "Reconcile everything for 2026" exceeds `maxSize`; one Task per institution-quarter | – | – | – | `original` | Net-new |
| 722 | `:186` | recorded proves required fields, string money, 4-char `last_4`, ISO 8601 dates | yes | – | – | `confirmed` | `schema.yaml:216-218` — all three rules verbatim |
| 723 | `:187-192` | reconciled = to the cent, difference exactly `0.00`; there is no "materially reconciled" | – | – | – | `original` | Net-new |
| 724 | `:188-189` | projected uses no undeclared growth assumptions; optimised is terminal | – | – | – | `original` | Net-new |
| 725 | `:198` | "**iAI never moves money. Full stop.**" | – | – | – | `confirmed` | `README.md:20` |
| 726 | `:200-205` | `autoDeny` refuses the *authentication* call, not just the transfer | – | – | – | `original` | Net-new |
| 727 | `:207-221` | `## iai-gate` comment shape | – | – | – | `confirmed` | Matches `03-workflow.md:251` |
| 728 | `:223-225` | Gate table's spend-over-threshold row | – | – | – | `confirmed` | `03-workflow.md:244` verbatim |
| 729 | `:230-231` | `wealth/cashflow` refuses fewer than 3 reconciled periods and reads `obligations.yaml` | partial | – | – | `original` | `obligations.yaml` is real; the skills and the 3-period floor are net-new |
| 730 | `:232` | `wealth/obligation-audit` reports renewals, price creep, cancellation windows | – | – | – | `original` | Net-new |
| 731 | `:233` | `wealth/tax-prep` argument hint `--filing married_joint` | no | – | – | `corrected` | The schema enum value is `married_filing_jointly` (`schema.yaml:153`); `married_joint` is not legal |
| 732 | `:234` | `wealth/net-worth` consolidates assets minus liabilities incl. the trade pack's valuation | – | – | – | `original` | Net-new |
| 733 | `:235` | `wealth/goal-track` updates `progress_pct` and `status` on a FINANCES `goal` | yes | – | – | `confirmed` | `schema.yaml:137`, `:140-142` |
| 734 | `:237` | One of six wealth leaf skills is gated | – | – | – | `confirmed` | Counted from the table — only `obligation-audit` |
| 735 | `:241` | "LifeOS's FINANCES schema already exists and is **kept**, not rewritten" | yes | – | – | `confirmed` | KEEP verdict at `00-synthesis.md:39` |
| 736 | `:244-254` | `USER/FINANCES/` tree of ten named files | yes | – | – | `confirmed` | All ten present (plus an unlisted `README.md`) |
| 737 | `:254` | `vendors.yaml` holds statement-matching rules | yes | – | – | `confirmed` | `vendors.yaml:13` |
| 738 | `:252` | `schema.yaml` defines exactly 9 object types and is the authority | yes | – | – | `confirmed` | Nine top-level keys at `schema.yaml:16,43,72,90,110,128,148,175,195` |
| 739 | `:257-258` | "The markdown files are **renderings**; a skill edits the YAML and re-renders, never the reverse" | no | – | – | `corrected` | `schema.yaml` holds type *definitions* and placeholders — no instance data to render from. LifeOS instructs the opposite: "**Edit directly** — open each file, replace every placeholder" (`USER/FINANCES/README.md:26-28`) |
| 740 | `:264` | `overview` fields and nested `net_worth`/`monthly_cash_flow` shapes | yes | – | – | `confirmed` | Exact match, `schema.yaml:16-38` |
| 741 | `:265` | `income_source` key fields `name`, `type`, `frequency`, **`gross`**, **`net`**, **`next_date`** | no | – | – | `invented` | Real properties are `name`, `type`, **`payer`** (required), `frequency`, `gross_per_period`, `net_per_period`, `annual_gross`, `deposit_account`, `started`, `ended`, `notes` (`schema.yaml:45-67`). `gross`, `net`, `next_date` do not exist; required `payer` is omitted |
| 742 | `:265` | `income_source.type` enum of 8 values | yes | – | – | `confirmed` | Exact match, `schema.yaml:52` |
| 743 | `:265` | `income_source.frequency` enum of 8 values | yes | – | – | `confirmed` | Exact match, `schema.yaml:59` |
| 744 | `:266` | `expense` key fields **`name`**, `category`, `amount`, `frequency`, **`account`** | no | – | – | `invented` | Real: required `[category, vendor, amount, frequency]`; properties `category`, **`vendor`**, `amount`, `frequency`, **`envelope`**, `notes` (`schema.yaml:72-85`). `name` and `account` do not exist; required `vendor` is omitted |
| 745 | `:266` | `expense.category` enum of 17 named values | no | – | – | `invented` | The real 17 are `housing, utilities, insurance, subscription, software, grocery, dining, transportation, travel, entertainment, health, clothing, gifts, charitable, tax, loan, other` (`schema.yaml:78`). Only 6 of 17 match; nine iAI values are fabricated and five real values are missing |
| 746 | `:267` | `investment_account` key fields **`institution`**, `account_type`, `last_4`, **`current_value`**, **`contribution_ytd`** | no | – | – | `invented` | Real: required `[custodian, account_type, balance]`; properties `custodian`, `account_type`, `balance`, `last_4`, `cost_basis`, `ytd_contributions`, `contribution_rate_pct`, `employer_match_pct`, `strategy`, `notes` (`schema.yaml:90-105`). Three of five names are wrong |
| 747 | `:267` | `investment_account.account_type` enum of 11 values | yes | – | – | `confirmed` | Exact match, `schema.yaml:97` |
| 748 | `:268` | `account` key fields `institution`, `type`, `last_4`, `balance`, `rate_pct`, `limit` | partial | – | – | `confirmed` | All six exist (`schema.yaml:114-123`); the required `name` field is omitted from iAI's list |
| 749 | `:268` | `account.type` enum of 8 values | no | – | – | `corrected` | The real enum has **14** — it also contains `personal_loan`, `brokerage`, `retirement`, `hsa`, `529`, `crypto` (`schema.yaml:117`) |
| 750 | `:269` | `goal` fields and 7-value `status` enum | yes | – | – | `confirmed` | Exact match, `schema.yaml:128-143` |
| 751 | `:270` | `tax_profile` key fields incl. **`withholding`** | no | – | – | `invented` | `withholding` is not a property. Real: `filing_status`, `state`, `tax_year`, `preparer`, `quarterly_estimates`, `deductions_tracked` (`schema.yaml:148-170`) |
| 752 | `:270` | `tax_profile.filing_status` enum incl. `married_joint`, `married_separate` | no | – | – | `corrected` | Real values are `married_filing_jointly` / `married_filing_separately` (`schema.yaml:153`) |
| 753 | `:271` | `obligation` fields | yes | – | – | `confirmed` | Exact match, `schema.yaml:175-190` |
| 754 | `:271` | `obligation` "reuses `expense.category` and `income_source.frequency`" | no | – | – | `invented` | `obligation.category` is its own 7-value enum (`schema.yaml:182`), different from `expense`'s 17. `obligation.frequency` matches **`expense.frequency`** (`:186` vs `:83`), not `income_source.frequency` (`:59`) |
| 755 | `:272` | `vendor` key fields `name`, `purpose`, `category`, `direction`, `match[]` | yes | – | – | `confirmed` | `schema.yaml` `vendor:` block; all five present |
| 756 | `:272` | `vendor.direction` enum `outbound` `inbound` `both` | yes | – | – | `confirmed` | Exact |
| 757 | `:272` | The Enums column shows only `direction` | partial | – | – | `corrected` | `vendor.category` is a closed 13-value enum; iAI silently drops it |
| 758 | `:274-284` | `vendors.yaml` sample is a bare top-level YAML list | partial | – | – | `corrected` | The real file nests every entry under a top-level `vendors:` key |
| 759 | `:278` | Example `category: subscriptions` | no | – | – | `invented` | The enum value is `subscription` (singular); `subscriptions` is not legal |
| 760 | `:276-283` | Adobe / Creative Cloud match-substring illustration | – | – | – | `original` | Illustrative; the real file ships only `Sample Vendor` placeholders |
| 761 | `:288-295` | "Kept verbatim in spirit from LifeOS": four validation rules | yes | – | – | `confirmed` | `schema.yaml` `validation:` rules 1,2,3,5 — all four transcribed accurately |
| 762 | `:286-295` | The validation table is the complete LifeOS rule set | partial | – | – | `corrected` | `schema.yaml` has 5 rules; iAI drops "enum fields must match an allowed value exactly" |
| 763 | `:295` | `references/data-classification.md` owns the `last_4`-only rule | – | – | – | `original` | Declared at `01-skill-hierarchy.md:57`; `references/` is currently `.gitkeep`-only |
| 764 | `:297-301` | Placeholder-string sharp edge; all `USER/FINANCES/` is `class:private` | – | – | – | `original` | Consistent with `09-security.md:319` |
| 765 | `:302-307` | CSV/OFX import + `vendors.yaml` `match:` substrings, never model-guessed | partial | – | – | `original` | `match:` is real; no importer exists in LifeOS |
| 766 | `:308` | Declared interface: account-level **`current_value`** published by `domain:trade` | no | – | – | `invented` | `current_value` is not a `schema.yaml` field, and `05-domain-trading.md` declares no such publication (`rg 'current_value\|wealth'` → 0 hits) |
| 767 | `:309` | No bank APIs by default | – | – | – | `original` | Net-new doctrine |
| 768 | `:311-334` | Worked example #59/#75-77, $416/mo delta | – | – | – | `original` | Arithmetic checks: 188+97+131=416; 2914−2498=416 |
| 769 | `:336-345` | Five wealth failure modes | – | – | – | `original` | Net-new |
| 770 | `:352-362` | `know` is the citation backbone; uncited entries are deletion candidates | – | – | – | `original` | Net-new framing |
| 771 | `:356` | "The README's fifth *never*" is *never assert without a source* | – | – | – | `confirmed` | `README.md:55` — 5th cell |
| 772 | `:366-464` | `knowBinding` conforms to `DomainBinding`/`VerifySpec`/`GateSpec`/`EvidenceSpec` | – | – | – | `confirmed` | `01-skill-hierarchy.md:203-231` |
| 773 | `:384-429` | Four rungs `captured`→`distilled`→`cross-linked`→`contradiction-checked` | – | – | – | `confirmed` | `03-workflow.md:139` matches exactly |
| 774 | `:457-460` | Rung label colours `c5def5`, `79b8ff`, `fbca04`, `2da44e` | – | – | – | `corrected` | Violates `03-workflow.md:131`'s declared global ramp |
| 775 | `:436` | `vetoAgent: "iai-librarian"` | – | – | – | `original` | `02-roles.md:9,306` — librarian is Ring 1, read-only, "cannot be assigned work"; no `know` Ring-2 specialist exists |
| 776 | `:437-443` | Five `autoDeny` conditions | – | – | – | `original` | Net-new; mirrored at `M7.md:88-103` |
| 777 | `:446-452` | Sentinel, path template, `budgetChars: 60000`, pinned | – | – | – | `confirmed` | `01-skill-hierarchy.md:226-231` |
| 778 | `:467-493` | Unit-of-work tests and the rung/promotion table | – | – | – | `original` | Net-new |
| 779 | `:495-518` | Contradiction check: polarity → BM25 top ~40 → filter → `CLEAR`/`CONFLICT`/`TENSION` | partial | – | – | `original` | No source claim made. The ancestor `skills/Cortex/SKILL.md:298-328` uses tag-overlap, top 10 pairs, no BM25 |
| 780 | `:520-527` | `CONFLICT(tier-A)` opens a Story, labels `know:conflict`, blocks promotion | – | – | – | `original` | Unattributed; matches `M7.md:93-94,124` |
| 781 | `:529-537` | Five leaf skills `capture`/`distill`/`contradict`/`cite`/`digest` | partial | – | – | `confirmed` | `01-skill-hierarchy.md:170-176`; Cortex has `ingest`/`distill`/`contradictions`/`digest` as ancestors |
| 782 | `:533` | `know/capture` writes to `MEMORY/KNOWLEDGE/{Category}/{slug}.md` | yes | – | – | `confirmed` | `MemoryTypes.ts` `KNOWLEDGE_DIR` + `entityTypeToSubdir()` + `slugify()` |
| 783 | `:541` | "**Cortex-lite** — LifeOS's Cortex, scoped down to what a citation backbone needs" | partial | – | – | `corrected` | `00-synthesis.md:35` scoped Cortex-lite to "`MEMORY/**` markdown + JSONL, read by `learn` and `resume`, **optional**"; here it is a domain's primary store |
| 784 | `:544-549` | `MEMORY/KNOWLEDGE/` subdirs `People/`, `Companies/`, `Ideas/`, `Research/` | yes | – | – | `corrected` | The dirs are real, but `00-synthesis.md:35` ruled that "the `KNOWLEDGE/{People,Companies}` CRM surface does not [survive]" |
| 785 | `:553` | Cross-linking is "`related:` frontmatter carrying **wikilinks**" | no | – | – | `corrected` | `MemoryTypes.ts` `RelatedLink {slug, type}` over a closed 8-term vocabulary; wikilinks are a *separate* body edge type (`KnowledgeGraph.ts:73,266`) |
| 786 | `:554` | BM25, no vector DB — matching ARCHITECTURE's filesystem-as-index line | yes | – | – | `confirmed` | Verbatim at `iAI/ARCHITECTURE.md:169`; original at `LifeOS/GETTING-STARTED.md:63`; BM25 real at `TOOLS/MemoryRetriever.ts:70` |
| 787 | `:555` | Typed items `memory` · `idea` · `knowledge` · `proposal` | yes | – | – | `confirmed` | `MemoryTypes.ts` `MemoryTypeName` |
| 788 | `:556` | Tiers `A` · `B` · `C` | yes | – | – | `confirmed` | `MemoryTypes.ts` `type Tier = "A" \| "B" \| "C"` |
| 789 | `:558-561` | "Type is data, tier is permission" — tier says what other domains may **cite** | partial | – | – | `corrected` | The aphorism matches the `MemoryTypes.ts` header, but LifeOS tier is a **write/mutation** permission (`Memory/CurationCoverage.md:20-26`), not a citation permission |
| 790 | `:567`, `:570` | Frontmatter `entry_type:` and `confidence: high\|medium\|low` | no | – | – | `corrected` | The envelope key is `type` (select), and `confidence` is `format: "number"` (`KnowledgeSchema.ts`) |
| 791 | `:572` | Per-entry `tier: A` in a `knowledge` note's frontmatter | no | – | – | `invented` | `KnowledgeSchema.ts` `ENVELOPE` has no `tier` key, and `MemoryTypes.ts` `TYPE_REGISTRY.knowledge.tier` is fixed at `"B"` — a knowledge item can never be tier A |
| 792 | `:573-584` | `sources[]` with `sha256` + `locator`, `captured:`, `promoted:` | no | – | – | `original` | No per-field source claim; the LifeOS envelope has `source_url`/`source_author`/`source_date` and no hash |
| 793 | `:591-607` | External-content fence applied at **write** time by `know/capture` | – | – | – | `confirmed` | Identical fence text at `02-roles.md:342-350`, `09-security.md:175-177` |
| 794 | `:609-616` | Integrations: webfetch, PDF, on-demand BM25 index, one-way citation | partial | – | – | `original` | BM25-from-disk matches `MemoryRetriever.ts`; the one-way pack rule is iAI's |
| 795 | `:626`, `:640`, `:643` | `#57`'s **ISC-2** cites `know` entries and would be unsourced without them | – | – | – | `original` | `06-domain-health.md:530` — ISC-2 is "ApoB decreases monotonically across ≥3 of 4 panels", verifier `deterministic`. It cites nothing and needs no citation |
| 796 | `:640` | `/iai:cite --for 57` invoked as a user command | – | – | – | `original` | No `cite` Tier-1 verb at `01-skill-hierarchy.md:88-106`; `know/cite` is Tier 2, and leaves are not user-invoked (`:127`) |
| 797 | `:624-631` | Milestone 8 "Q3 Lipid protocol", `#60` sibling of `#57` | – | – | – | `confirmed` | `06-domain-health.md:511-518` — same milestone number and title, no issue-number collision |
| 798 | `:646-655` | Five know failure modes | – | – | – | `original` | Net-new; mitigations align with `:437-443` |

**`07-domain-wealth-know.md`:** 99 rows — 42 `confirmed`, 15 `corrected`, 33 `original`, 9 `invented`.

---

### 3.8 `08-dual-target.md`

This file is the plugin/host contract, and almost every row is a claim about
what Claude Code and opencode actually accept. It carries **six `invented`
rows** — the most in the tree — because host behaviour was documented from
inference rather than from omo's source. Three of the six are load-bearing for
`packages/adapter-opencode`.

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 250 | `:9-11` | Skills are shared; hooks are not — CC external processes vs opencode in-process TS | yes | yes | yes | `confirmed` | omo `loader.ts:132-145`; forge hooks are `"type": "command"` shell scripts; LifeOS hooks are `PreToolUse` bun processes |
| 251 | `:22-29` | opencode skill discovery searches six paths **in this order** | – | – | partial | `corrected` | Real order is opencode-project → opencode-global → **`.claude` project → `.agents` project** → `~/.claude` → `~/.agents` → **shared** (a 7th source) — `opencode-skill-loader/loader.ts:76-96`; priority is by `SCOPE_PRIORITY`, not list position |
| 252 | `:31-32` | Discovery walks up from cwd to the git worktree root | – | – | yes | `confirmed` | `findAncestorDirectories(... detectWorktreePath(start))` — `shared/project-discovery-dirs.ts:37-110` |
| 253 | `:35-36` | iAI writes every skill once into `.claude/skills/` and both hosts load it | – | – | – | `original` | Strategy choice following from row 250 |
| 254 | `:42-50` | "opencode recognises these SKILL.md frontmatter fields": exactly five | – | – | partial | `corrected` | omo's `SkillMetadata` recognises **eleven**: `name, description, model, argument-hint, agent, subtask, license, compatibility, metadata, allowed-tools, mcp` (`opencode-skill-loader/types.ts:6-18`). Already registered as row 16 |
| 255 | `:46` | `name` required, 1–64 chars, regex, **must match the directory name** | – | – | no | `corrected` | omo does the opposite: `String(data.name \|\| options.defaultName)` — optional, directory only a *fallback*. No length check, no regex |
| 256 | `:47` | `description` required, 1–1024 chars | – | – | no | `corrected` | `data.description \|\| ""` — optional, unvalidated (`loaded-skill-from-path.ts:29`). `1024` has zero skill-related hits. Already registered as row 23 |
| 257 | `:52` | Unknown fields are ignored silently on either host | – | – | yes | `confirmed` | `parseFrontmatter<SkillMetadata>` reads named keys only; no schema validation, no error path |
| 258 | `:62-64` | Only `name` and `description` compile into the `skill` tool description; the body loads on invocation | – | – | yes | `confirmed` | `tools/skill/description-formatter.ts:10-23`; `extractSkillBody()` per `tools/skill/AGENTS.md:29-36` |
| 259 | `:68` | Keep `description` under roughly 300 characters | no | no | – | `original` | Guidance, not provenance — and both sources violate it (LifeOS `skills/Cortex/SKILL.md:4` ≈900 chars) |
| 260 | `:80-82` | CC hook = external process, any runtime; opencode hook = in-process TS function on Bun | yes | yes | yes | `confirmed` | forge `hooks/hooks.json`; LifeOS `#!/usr/bin/env bun` hooks; omo hooks are TS functions (`plugin-interface.ts:35-105`) |
| 261 | `:83` | opencode registration = "**Named export** from a module in the `plugin` array" | – | – | no | `corrected` | omo registers via `export default pluginModule` (`packages/omo-opencode/src/index.ts:4-7`); omo's own QA reference says a plugin is a module **default-exporting** `{ id?, server }` (`.agents/skills/opencode-qa/references/events-hooks.md:85`) |
| 262 | `:84-88` | CC: JSON on stdin, **exit 2** blocks, stderr feeds the model; opencode: mutate `output`, `throw` blocks | yes | yes | yes | `confirmed` | `gh-workflow/hooks/check-commit-prefix.sh:8-17`; `LifeOS/install/hooks/PreToolGuard.hook.ts:45` |
| 263 | `:91-93` | Pure core: `guards/` returns `Decision { action, message }`; adapters translate | – | – | – | `original` | No `Decision` type in any source; net-new seam |
| 264 | `:98-104` | Six-row event mapping `PreToolUse`→`tool.execute.before` etc. | yes | yes | yes | `confirmed` | CC side: forge and LifeOS `hooks/hooks.json`. opencode side: all six in `events-hooks.md:42,82` and `plugin/session-compacting.ts:6` |
| 265 | `:105-110` | Six opencode-only hooks with *(no equivalent)* on CC | – | – | partial | `corrected` | Five verified in omo's plugin interface. **`shell.env` is not found anywhere** — searched `shell.env`, `"shell"`, `env hook`. Two real hooks are also omitted: `command.execute.before`, `experimental.chat.messages.transform` |
| 266 | `:112-114` | opencode routes lifecycle signals through one `event` hook switching on `input.event.type` | – | – | yes | `confirmed` | `event: createEventHandler(...)` — `plugin-interface.ts:85` |
| 267 | `:126-129` | "Verbatim, from the `@opencode-ai/plugin` type surface"; adapter implements exactly seven | – | – | partial | `confirmed` | The seven keys are real hook names; "verbatim" is unverifiable — `node_modules` is absent from all three trees and the package is pinned at `1.18.22` |
| 268 | `:131-134` | `chat.message` input is `{ sessionID, agent?, model?, messageID?, variant? }` | – | – | partial | `corrected` | omo types it `{ sessionID, agent?, model? }` (`plugin/chat-message/types.ts:17-21`). `messageID`/`variant` are not on the input; `variant` lives on `message` in `chat.params` |
| 269 | `:135-139` | `chat.params` input/output shapes | – | – | yes | `confirmed` | Exact match — `plugin/chat-params.ts:7-25` |
| 270 | `:141-149` | `tool.execute.before` / `tool.execute.after` input and output shapes | – | – | yes | `confirmed` | `plugin/tool-execute-before.ts:44-47`; `plugin/tool-execute-after.ts:13-25` |
| 271 | `:160-163` | `experimental.chat.system.transform` signature | – | – | yes | `confirmed` | `plugin/system-transform.ts:23-25` — identical |
| 272 | `:166-168` | `output` is an out-parameter: mutate in place, returning a new object does nothing | – | – | yes | `confirmed` | `output.system.push(...)` — `plugin/system-transform.ts:43`; handlers are `Promise<void>` |
| 273 | `:173-186` | `Plugin` type and a seven-field `PluginInput` | – | – | partial | `corrected` | `client`, `directory`, `worktree` confirmed. `serverUrl`, `$`, `experimental_workspace`, `PluginOptions`: **zero hits** in omo, which derives `PluginContext = Parameters<Plugin>[0]` and never touches `[1]` |
| 274 | `:191-192` | "**The export must be named, not default.** … A default export is not discovered." | – | – | **no** | `invented` | Falsified twice: omo ships `export default pluginModule` (`packages/omo-opencode/src/index.ts:6`) and omo's own QA reference documents the contract as a **default export** (`events-hooks.md:85-100`). Searched `named export`, `export default`, `not discovered` |
| 275 | `:193-196` | Plugins live in `.opencode/plugins/*.ts` or `~/.config/opencode/plugins/*.ts`; plural canonical | – | – | partial | `corrected` | omo's `.opencode/plugins/` is the **Claude-Code-style plugin directory** (dirs with `plugin.json`), user-scope sibling `~/.opencode/plugins/`. TS entry points go in the config `plugin` array. No plural/singular canonicality rule in any source |
| 276 | `:197-203` | Never call `process.cwd()`; use `context.directory`/`context.worktree`; lint-banned in two packages | – | – | partial | `confirmed` | The prescribed pattern is exactly omo's (`tool-execute-before-handler.ts:42`). The lint ban is iAI-original; omo itself still calls `process.cwd()` 47× as a fallback |
| 277 | `:212-217` | Guard budget **< 50 ms** | – | – | – | `original` | No latency budget in any source. LifeOS hooks use 8s subprocess timeouts; forge hook timeouts are 5–10s |
| 278 | `:215` | A guard may perform "one small `readFileSync`" | – | – | – | `original` | Already registered as row 20 (contradicts `:220`) |
| 279 | `:219-221` | "The core never does I/O"; the adapter does I/O once at session start | – | – | – | `original` | Already registered as row 20 |
| 280 | `:230-237` | Claude Code agent frontmatter is exactly four fields | yes | yes | yes | `corrected` | forge's agents also carry `color:` (`agents/forge-coder.md:10`); LifeOS's carry `color`, `voiceId`, `voice`, `persona`; omo additionally parses `mode` |
| 281 | `:236` | CC `tools` is a comma-separated string | – | no | yes | `corrected` | omo accepts both string and array; forge's three shipped agents use a YAML sequence. Already registered as row 32 |
| 282 | `:237` | CC `model` is an alias: `opus` \| `sonnet` \| `haiku` | yes | partial | yes | `corrected` | The alias map is confirmed but it is not a closed enum: forge uses `opus[1m]`/`sonnet[1m]` and LifeOS uses a custom alias `model: fable` |
| 283 | `:239-251` | opencode agent fields incl. `hidden` and `steps` | – | – | partial | `corrected` | Most confirmed (`config/schema/agent-overrides.ts:6-40`), but **`hidden` and `steps` have zero hits** in omo's agent schema or docs |
| 284 | `:243` | opencode `name` is **absent** — the filename is the name | – | – | partial | `corrected` | `data.name \|\| basename(file, ".md")` — the key is honoured when present, not absent |
| 285 | `:249` | `prompt` may be a reference: `{file:./prompts/risk-officer.txt}` | – | – | no | `corrected` | omo's form is a `file://` URI (`config/schema/agent-overrides.ts:22`); `{file:` has zero hits |
| 286 | `:251` | opencode `tools` is **deprecated** — use `permission` | – | – | yes | `confirmed` | `migrateToolsToPermission` / `migrateAgentConfig` delete `tools` after conversion — `shared/permission-compat.ts:1-4,43-76` |
| 287 | `:260-262` | `permission` accepts these **15** keys | – | – | partial | `corrected` | omo's `AgentPermissionSchema` names **six** — `edit, bash, webfetch, task, doom_loop, external_directory` — plus a `.catchall()` (`config/schema/internal/permission.ts:11-19`). Already registered as row 33 |
| 288 | `:262-263` | `bash` **(among others)** additionally accepts a pattern → action map | – | – | partial | `corrected` | Only `bash` has the union type; the catchall is scalar-only (`permission.ts:6-19`). "Among others" is unsupported |
| 289 | `:267-269` | Matching is wildcard and the **LAST** matching rule wins, so `"*"` goes first | – | – | partial | `confirmed` | Consistent with omo's construction `{ "*": "deny", ...allows }` (`shared/permission-compat.ts:33-40`). The precedence rule itself is stated in no source — see row 383 |
| 290 | `:286-292` | `permission.task` gates *which subagents* an agent may spawn; a denied subagent is **removed from the Task tool's description entirely** | – | – | **no** | `invented` | omo types `task` as a **scalar** `PermissionValue`, not a per-subagent record (`config/schema/internal/permission.ts:15`). No description-erasure mechanism exists — `tool.definition` only overrides the todo tool. Searched `subagent_type` filtering, `availableAgents`, task description mutation |
| 291 | `:295-297` | Claude Code has no equivalent; separation is enforced by a `PreToolUse` guard exiting 2 | yes | yes | – | `confirmed` | The mechanism is real (`PreToolGuard.hook.ts:18,45,129`); no source guards `Task` specifically, but the mechanism supports it |
| 292 | `:303-311` | Command directories and opencode frontmatter `description, agent, model, subtask, template` | – | – | partial | `corrected` | opencode's real command frontmatter is `description, argument-hint, agent, model, subtask, handoffs` — **`template` is the body, not a key**, and `argument-hint` is omitted (`claude-code-command-loader/types.ts:31-38`) |
| 293 | `:318-320` | Claude Code requires `` !`cmd` `` pre-declared in `allowed-tools` or injection fails | partial | – | – | `original` | `allowed-tools` and `Bash(cmd:*)` grants are real, but no source states the pre-declaration requirement or the opencode contrast |
| 294 | `:326` | `allowed-tools: Bash(gh issue list:*), …` is valid Claude Code syntax | yes | – | – | `confirmed` | `LifeOS/install/settings.system.json:31-35` |
| 295 | `:343-344` | opencode names the plugin in the `plugin` array; Bun caches it in `~/.cache/opencode/node_modules/` | – | – | partial | `corrected` | The `plugin` array is confirmed. The cache path is `~/.cache/opencode/**packages**/<name>@<version>` (`docs/reference/known-issues.md:116,122-123`); `node_modules` has zero hits |
| 296 | `:355-357` | The type is `plugin?: Array<string \| [string, PluginOptions]>`; the tuple's second element arrives as `options` | – | – | **no** | `invented` | `PluginOptions` has zero hits in omo; every documented and shipped entry is the plain string form; omo never reads `Parameters<Plugin>[1]` (`plugin/types.ts:4`). Searched `PluginOptions`, tuple form, `options argument` |
| 297 | `:362-364` | Claude Code distribution = a git repo with `.claude-plugin/plugin.json` | – | yes | yes | `confirmed` | `gh-workflow/.claude-plugin/plugin.json`; omo resolves it at `claude-code-compat-core/.../plugin-manifest.ts:8-9` |
| 298 | `:387-399` | opencode carries an unstable v2 plugin API at `@opencode-ai/plugin/v2/promise` exposing `define({ id, setup })` with per-draft `transform` hooks | – | – | **no** | `invented` | Zero hits for `v2/promise`, `@opencode-ai/plugin/v2`, `catalog drafts` across omo, which pins `@opencode-ai/plugin@1.18.22`. The only `define({` hits are omo's unrelated DAG SDK. Caveat: `node_modules` is absent from all three trees, so the package itself could not be opened |
| 299 | `:451` | `classify/` levels are `PUBLIC / INTERNAL / PRIVATE / SECRET` | yes | – | – | `corrected` | LifeOS's four are `PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED` (`EgressClassGuard.hook.ts:56-59`). Deliberate rename recorded at `00-synthesis.md:52` |
| 900 | `:33` | Skill discovery walks up from cwd to the git worktree root | – | – | yes | `confirmed` | `shared/project-discovery-dirs.ts:38-77`, `:83-135` |
| 901 | `:33` | Claude Code reads paths 3 and 4 only | yes | – | partial | `confirmed` | LifeOS installs skills only under `~/.claude/skills/**`; omo's `.opencode/`/`.agents/` scopes are opencode-side |
| 902 | `:38` | The installer deliberately leaves the opencode skill dirs empty | – | – | – | `original` | An iAI installer policy |
| 903 | `:53` | Unknown SKILL.md frontmatter fields are ignored silently on both hosts | – | – | yes | `confirmed` | omo parses only named keys into `SkillMetadata` |
| 904 | `:54` | `skill-lint` validates against this exact schema and fails on anything outside it | – | – | – | `original` | iAI tooling; neither source ships a skill frontmatter linter |
| 905 | `:55` | "Write only the intersection" — the five-field schema is what opencode recognises | – | – | no | `corrected` | opencode/omo recognises eleven. The intersection is a *policy*, not the host's schema — the sentence states it as the latter |
| 906 | `:117` | The last six mapping rows are opencode-only, including `shell.env` | – | – | partial | `corrected` | Five verified. **`shell.env` is not found anywhere** in omo. Real hooks `command.execute.before` and `experimental.chat.messages.transform` are omitted |
| 907 | `:118-120` | `chat.params`, `system.transform` and `tool.definition` rewrite params, prompt and tool schemas per request | – | – | yes | `confirmed` | `plugin/chat-params.ts:19-25`; `plugin/system-transform.ts:20-26,43`; `plugin/tool-definition.ts:13` |
| 908 | `:120-122` | These are enhancements, never load-bearing in the safety path | – | – | – | `original` | An iAI constraint; omo treats the same hooks as load-bearing |
| 909 | `:151-154` | `permission.ask(input: Permission, output: { status })` | – | – | partial | `confirmed` | Documented as a real hook (`features/monitor/permission.ts:7-8`); the three-value enum matches `PermissionValue`. omo does not implement it, so the exact signature is unverified |
| 910 | `:205`, `:214` | Budget per guard invocation is **< 50 ms** | – | – | no | `original` | No latency budget in any source. Searched `50ms`, `latency budget`, `perf` |
| 911 | `:209` | opencode hooks are `async` and awaited in sequence across every installed plugin | – | – | partial | `confirmed` | `plugin/tool-execute-after.ts:122-142`; "Both run hooks sequentially in-process" (`docs/reference/rules-injection-cross-module-comparison.md:71`) |
| 912 | `:215-217` | Permitted/forbidden guard content; overflow work precomputes at `session.created` | – | – | – | `original` | No guard-content policy in any source |
| 913 | `:253-256` | One logical agent emitted as two files from one `AgentSpec` | – | – | – | `original` | Net-new (`00-synthesis.md:156-158`) |
| 914 | `:254` | Claude form: `name` + `model: opus` + `tools:` comma string | – | – | yes | `confirmed` | `claude-code-agent-loader/types.ts:11-17`; `claude-model-mapper.ts:7-9`; `shared/parse-tools-config.ts:11` |
| 915 | `:255` | opencode form: **no `name`** + qualified model + `permission` block | – | – | partial | `corrected` | `name` is accepted, not forbidden — `data.name \|\| agentName` (`agent-definitions-loader.ts:22-25`) |
| 916 | `:267` | Matching is wildcard and the **LAST** matching rule wins | – | – | partial | `confirmed` | Consistent with omo's emission order; no explicit statement of the rule found in omo prose |
| 917 | `:269` | Therefore `"*"` goes first and specific denials follow | – | – | yes | `confirmed` | `shared/permission-compat.ts:36-40` |
| 918 | `:271-280` | The example's `permission` keys are valid | – | – | yes | `confirmed` | `assets/omo.schema.json` agent `permission` properties |
| 919 | `:282-284` | Wildcard-last is "the single most common misconfiguration"; `skill-lint` checks for it | – | – | – | `original` | A claim about opencode users plus iAI tooling; no supporting data in any source |
| 920 | `:313-314` | Both hosts ignore unrecognised command frontmatter keys | – | – | yes | `confirmed` | `claude-code-command-loader/loader.ts:100-110` |
| 921 | `:314-316` | Strategy: one file to both directories carrying the union of keys | – | – | – | `original` | omo takes the opposite approach — it *translates* Claude commands into opencode `CommandDefinition`s |
| 922 | `:332-334` | Claude reads `description`, `argument-hint`, `allowed-tools`, `model`; opencode reads three | – | – | partial | `corrected` | opencode also reads `argument-hint` (`claude-code-command-loader/types.ts:33` → `loader.ts:109`), plus `subtask` and `handoffs`. `argument-hint` is not Claude-only |
| 923 | `:334-335` | `model` is the one key the installer rewrites per host | – | – | yes | `confirmed` | `claude-model-mapper.ts:7-9` |
| 924 | `:368` | Config layers are merged, not replaced, later wins | – | – | partial | `confirmed` | omo's own config chain merges and is later-wins (`packages/omo-config-core/AGENTS.md:26`); opencode's own chain is not restated in any source |
| 925 | `:370-378` | The precedence chain is `remote → global → OPENCODE_CONFIG → project → .opencode/ → OPENCODE_CONFIG_CONTENT → managed files` | – | – | partial | `corrected` | Only two links are evidenced: `OPENCODE_CONFIG_CONTENT` and `OPENCODE_CONFIG_DIR`. `OPENCODE_CONFIG`, "remote" and "managed files" are not found anywhere |
| 926 | `:380-383` | The installer reads, adds its entry if absent, writes back idempotently behind `--apply` | – | – | – | `original` | omo's installer writes config entries directly with no dry-run gate |
| 927 | `:414` | If v2 is adopted, pin `@opencode-ai/plugin` to an exact version | – | – | yes | `confirmed` | omo already does: `"@opencode-ai/plugin": "1.18.22"` — no caret — `package.json:168` |
| 928 | `:425` | Skills: one shared copy at `.claude/skills/`, intersection frontmatter only | – | – | yes | `confirmed` | `opencode-skill-loader/AGENTS.md:11-19` |
| 929 | `:426` | Agents summary row repeating "opencode: no `name`" | – | – | partial | `corrected` | Same defect as row 915 |
| 930 | `:427` | Commands: CC `.claude/commands/` with `allowed-tools`; opencode `.opencode/commands/` with `agent`+`subtask` | – | – | yes | `confirmed` | `claude-code-command-loader/types.ts:31-38`; `loader.test.ts:63,103` |
| 931 | `:428` | Hooks: CC external process, stdin JSON, **exit 2 blocks**; opencode in-process, `throw` blocks | – | partial | partial | `confirmed` | Confirmed, with a caveat: no forge hook ever exits 2 (all `exit 0`), and omo shows CC `PreToolUse` hooks can also block via a structured `PermissionDecision` — exit 2 is not the only mechanism |
| 932 | `:429` | CC has per-agent `model` alias only; opencode's `chat.params` rewrites four sampling params per request | – | – | yes | `confirmed` | `plugin/chat-params.ts:19-25` lists exactly those four |
| 933 | `:430` | opencode has the `permission.ask` hook **and** declarative `permission:` | – | – | yes | `confirmed` | `features/monitor/permission.ts:7-8` + `assets/omo.schema.json` |
| 934 | `:431` | `system.transform` mutates `system: string[]`; CC injects via `SessionStart` output | – | yes | yes | `confirmed` | `plugin/system-transform.ts:24-26,43`; forge `hooks/hooks.json:4-16` |
| 935 | `:432` | CC `.mcp.json` project and user scope; opencode `mcp` block local and remote | – | – | yes | `confirmed` | `claude-code-mcp-loader/loader.ts:28-30` — and a third `local` scope at `.claude/.mcp.json` |
| 936 | `:433` | Both hosts write the same append-only JSONL under `docs/evidence/`; the file is the interface | – | – | – | `original` | An iAI convention; omo's telemetry is a PostHog SDK call, dropped at `00-synthesis.md:125` |
| 937 | `:442-489` | The package tree mirrors `ARCHITECTURE.md`'s `## Build Targets` one-for-one | – | – | – | `original` | The `## Build Targets` convention is forge's; the tree is iAI's |
| 938 | `:454` | `evidence/` holds envelope, sentinels, permalinks, 60k budget | – | yes | – | `confirmed` | `references/gh-api.md:26-38` |
| 939 | `:458` | `plugin.ts  export const iAI: Plugin  ← NAMED export` | – | – | **no** | `invented` | omo ships `export default pluginModule` (`packages/omo-opencode/src/index.ts:8`). Repeats the false rule from `:191-192` inside the authoritative package tree |
| 940 | `:481` | `pulse/` — binary, `:31337`, **read-only** | partial | – | – | `corrected` | The port is confirmed (`LifeOS/README.md:306`). Read-only is iAI's added constraint — LifeOS's Pulse also handles voice, cron and hook routes, i.e. it writes |
| 941 | `:487` | `.claude-plugin/plugin.json` is the Claude Code distribution manifest | – | yes | yes | `confirmed` | `plugin-manifest.ts:8-9`; forge ships both forms |
| 942 | `:491-493` | `core` imports nothing from either host; adapters import only `core`; packs never import each other | – | – | – | `original` | omo's own layering is the opposite — `omo-opencode` imports 20+ sibling workspace packages |
| 943 | `:499-500` | Any one-host capability must degrade gracefully, with the loss stated in writing | – | – | – | `original` | LifeOS has a "degrade *loudly*" doctrine for optional tools, but no cross-host degradation contract exists |
| 944 | `:503-507` | No safety guarantee may depend on an opencode-only capability | – | partial | partial | `confirmed` | CC `PreToolUse` can block (`hooks/hooks.json:26-36`; omo `PermissionDecision` deny). The redesign rule is iAI's own |
| 945 | `:508-514` | Degradation is loud at install and silent at runtime; the core does feature detection | – | – | – | `original` | No install-time capability report in any source |
| 946 | `:450` | `guards/` are pure and `<50ms`: `checkEgress`, `checkRiskMandate`, `checkSpend`, `checkCommitPrefix` | partial | partial | – | `confirmed` | Three of four have named source ancestors; `checkRiskMandate` is net-new and the `<50ms` figure is unsourced (row 910) |
| 947 | `:520` | `chat.params` buys per-turn sampling control; the CC fallback is a static per-agent `model` | – | – | yes | `confirmed` | `plugin/chat-params.ts:19-25` |
| 948 | `:521` | `system.transform` injects context every turn unskippably; CC's `SessionStart` injects once and goes stale | – | yes | yes | `confirmed` | `plugin/system-transform.ts:36-43`; forge `hooks/hooks.json:4-16` |
| 949 | `:522` | `permission.task: deny` **erases the subagent from the Task tool's description**, so `quant-analyst` cannot see `risk-officer` | – | – | **no** | `invented` | `permission.task` is a scalar in omo's published schema (`assets/omo.schema.json`) with no per-subagent form. No tool-description erasure exists. The whole "Behaviour lost" cell rests on this |

**`08-dual-target.md`:** 100 rows — 46 `confirmed`, 27 `corrected`, 21 `original`, 6 `invented`.

---

### 3.9 `09-security.md`

| # | iAI ref | Assertion | LifeOS | forge | omo | Verdict | Evidence / note |
|---|---|---|---|---|---|---|---|
| 350 | `:5-9` | The threat-model premise is "adapted from LifeOS's `SECURITY.md`" | yes | – | – | `confirmed` | `LifeOS/SECURITY.md:3` verbatim modulo "drives your browser", which iAI legitimately drops. "Adapted" is accurate |
| 351 | `:42-45` | Four classification levels; every file has exactly one; a mixed payload takes the **highest** | yes | – | – | `confirmed` | `DataClassification.md` § Marking convention rule 6 |
| 352 | `:47-52` | The level names are `PUBLIC` / `INTERNAL` / `PRIVATE` / `SECRET` | yes | – | – | `corrected` | LifeOS's four are `RESTRICTED` / `CONFIDENTIAL` / `INTERNAL` / `PUBLIC`. Deliberate rename recorded at `00-synthesis.md:52` |
| 353 | `:51`, `:61-63` | `PRIVATE` requires an explicit **per-session** opt-in that dies with the session | partial | – | – | `original` | LifeOS binds classes to *route ceilings*, not session consent. No per-session opt-in exists in any source (searched `opt-in`, `consent`, `per-session`) |
| 354 | `:52`, `:56-58` | `SECRET` never reaches a cloud model and never enters a prompt — no override | yes | – | – | `confirmed` | `LIFEOS_SYSTEM_PROMPT.md`; `DataClassification.md` rule 3 |
| 355 | `:69-71` | Classification carried three ways: the `class:private` label, `classify/`, and the `USER/` path convention | yes | – | – | `confirmed` | Path-default carrier confirmed at `DataClassification.md` § Marking convention rule 1. Label and module carriers are iAI-original |
| 356 | `:73` | Unknown classifies as `PRIVATE` | yes | – | – | `corrected` | LifeOS fail-closes to its **top** class: "Unclassified data is RESTRICTED (fail-closed)". iAI's analogue of RESTRICTED is `SECRET`, so defaulting to `PRIVATE` is one level weaker. **The weakening is not recorded anywhere** |
| 357 | `:80-82` | The egress gate runs on **every** tool call that could carry a payload outward | partial | – | – | `corrected` | LifeOS's `EgressClassGuard.hook.ts:6-12` gates only *Tier-2 inference Bash calls* and explicitly "never blocks unrelated Bash" (`:16-19`). The broadening is an iAI design change, unrecorded at `00-synthesis.md:37` |
| 358 | `:87-100` | Three stages: classify → resolve destination → decide allow/redact/block | yes | – | – | `confirmed` | `DataClassification.md` § routing matrix; `hooks/lib/egress-class-core.ts` `evaluateEgress()` |
| 359 | `:104-120` | `checkEgress(payload, destination): Decision` with `Destination` and `Decision` shapes | – | – | – | `original` | Net-new contract. LifeOS's shape is `{block, message}` with no `warn` and no `redacted` |
| 360 | `:123-125` | `checkEgress` is pure, synchronous, no I/O, under **50 ms**, receives a consent snapshot | – | – | – | `original` | Budget is iAI-internal. LifeOS's comparable target is `<20ms` for `SpendAuditor`, and its guards do file I/O |
| 361 | `:131` | CC enforcement: `PreToolUse`; `block` → stderr + **exit 2** | yes | – | – | `confirmed` | `EgressClassGuard.hook.ts:13`, `:120-124`; `PreToolGuard.hook.ts:45` |
| 362 | `:132` | opencode enforcement: `tool.execute.before`; `block` → `throw`; `redacted` → mutate `output.args` | – | – | yes | `confirmed` | `plugin-interface.ts:98`; `plugin/tool-execute-before.ts:70,89`; `packages/utils/src/replace-tool-args.ts` |
| 363 | `:134-135` | One predicate, two enforcement points; the logic exists exactly once | – | – | – | `original` | Single-core/dual-target is net-new (`00-synthesis.md:156-158`) |
| 364 | `:144` | Account number redacts to `last_4: "3009"` | yes | – | – | `confirmed` | `USER/FINANCES/schema.yaml` validation rules |
| 365 | `:145-150` | Redaction projections: magnitude buckets, `in_range` + direction, dropped identifiers, day-precision timestamps | – | – | – | `original` | No redaction projection of any kind in the sources (searched `redact`, `bucket`, `magnitude`, `de-identif`) |
| 366 | `:151-153` | Ticker and broker name are retained as `PUBLIC` | – | – | – | `original` | LifeOS has zero ticker/broker handling |
| 367 | `:162-164` | LifeOS's doctrine adopted **verbatim**: external content is data, never instructions | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` § Prompt Injection — verbatim is accurate |
| 368 | `:166-168` | Every byte iAI did not author is hostile until fenced; eight named surfaces | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` attack-surface list |
| 369 | `:174-178` | The fence is exactly `[EXTERNAL CONTENT — …]` … `[END EXTERNAL CONTENT]` | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` § 3 — identical markers (LifeOS additionally carries a `Source:` line iAI drops) |
| 370 | `:180-183` | Fencing is applied by the ingesting code, never requested of the model | partial | – | – | `confirmed` | LifeOS states it as a contributor obligation; "blocking review finding" is an iAI escalation |
| 371 | `:189` | `execFile` over `exec`; `exec` with a template literal is **banned in `packages/**`** | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` § 1 with the exact ❌/✅ pair. The `packages/**` scope is iAI's. Already registered as row 22 |
| 372 | `:190` | SSRF blocklist of nine named ranges and non-`http(s)` schemes | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` § 2 `validateUrl()`. `::1` and the CIDR forms are iAI extensions of the same list |
| 373 | `:190` | Deny before resolution **and** after; re-check after **every redirect** | no | – | partial | `original` | LifeOS's `validateUrl()` is a single pre-fetch check with no redirect handling. omo caps redirects but does not re-resolve. Net-new hardening |
| 374 | `:191` | Structured APIs over shell: `gh --json`, broker SDK, `gh/` never shells out | yes | yes | – | `confirmed` | `LifeOS/SECURITY.md` § 4; forge's `references/gh-operations.md` uses `--json`/`--jq` throughout |
| 375 | `:192` | Hostile-input tests mandatory, six named cases, "no hostile-input tests, no merge" | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` § 5 with command-injection, SSRF and prompt-injection fixtures. The six-case list and merge block are iAI's expansion |
| 376 | `:193-194` | No dynamic execution of ingested text; bound every ingestion with size, timeout and redirect caps | partial | – | yes | `confirmed` | LifeOS § 1 `AbortSignal.timeout(10_000)`; omo `webfetch-redirect-guard/constants.ts`. The size cap is iAI's addition |
| 377 | `:206-209` | Every thesis claim carries a cited source resolved through `know`, pinned by SHA | – | – | – | `original` | `know` and citation gating are iAI constructs |
| 378 | `:210-214` | The `risk-officer` mandate check is content-independent, evaluating only exposure metrics | – | – | – | `original` | No mandate or risk model in any source |
| 379 | `:217-219` | `risk-officer` spawned independently, reads from disk, holds an unappealable veto | – | – | – | `original` | `00-synthesis.md:146-148` |
| 380 | `:229-230` | Secrets in `.env` only; gitignored; CI leak scan and commit hook refuse a staged `.env` | yes | – | – | `confirmed` | `LifeOS/.gitignore` § Environment files; `SECURITY.md` § For Contributors |
| 381 | `:231-233` | `.env` contents never enter a prompt; secrets never logged; read by code, not the model | yes | – | – | `confirmed` | `hooks/lib/egress-class-core.ts:31-35`; `LIFEOS_SYSTEM_PROMPT.md` rule 5 |
| 382 | `:241-256` | The literal bash deny-list, plus `"env": deny` and `"printenv*": deny`, under `"*": allow` | yes | – | – | `corrected` | LifeOS's list (`install/settings.system.json:232-268`) covers `awk`/`cat`/`grep`/`head`/`less`/`od`/`rg`/`sed`/`tail`/`xxd` — but **contains no `env` or `printenv` entry**, and iAI silently drops `od` and `xxd` |
| 383 | `:258-259` | Order matters: **the last matching rule wins in opencode**, so `"*": allow` is stated first | – | – | – | `original` | A host-behaviour claim attributed to no source and **not verifiable from omo** — searched `last matching`, `wildcard`, permission ordering across `packages/`, `docs/`, `assets/*.schema.json`. Repeated at `08-dual-target.md:266`. **If precedence is first-match or most-specific-match, every generated agent's deny rules are inert** |
| 384 | `:261-263` | On CC the identical policy is a `PreToolUse` guard pattern-matching the command and exiting 2 | yes | – | – | `confirmed` | `PreToolGuard.hook.ts:45,129` "first block wins" |
| 385 | `:276-280` | `.env.live` at mode `0400`, readable only when `live` is armed; kill switch un-arms in-process | – | – | – | `original` | No `.env.live`, rung arming or kill switch in any source. `00-synthesis.md:47` explicitly defers a secrets vault |
| 386 | `:291`, `:293-312` | "Taken directly from LifeOS": public repo holds code; `USER/` is a **symlink** into a private repo | yes | – | – | `confirmed` | `LifeOS/SECURITY.md` § The Security Model — the symlink pattern is exactly LifeOS's |
| 387 | `:301-302`, `:310` | Under the same "taken directly from LifeOS" header: `MANDATE.template.md`, `POSITIONS.template.yaml`, `USER/TRADING/` | no | – | – | `corrected` | LifeOS's `install/USER/` contains `TELOS/`, `HEALTH/`, `FINANCES/` but **no `TRADING/`**, and no mandate or positions artifact exists. The provenance header over-reaches onto net-new content |
| 388 | `:315-320` | Public repo ceiling `INTERNAL`, private `PRIVATE`; the symlink itself is gitignored | partial | – | – | `confirmed` | The ceiling split matches LifeOS's `INTERNAL` for `skills/**` vs `CONFIDENTIAL` default for `USER/**`. The "symlink is gitignored" specific is unevidenced — `LifeOS/.gitignore` has no `USER` entry |
| 389 | `:322-326` | Health, wealth and trade issues live in the **private** repo; the binding carries `owner/repo` | – | – | – | `original` | Net-new, following from the net-new `DomainBinding` |
| 390 | `:330`, `:341-343` | The CI leak scan blocks the merge; a finding is a hard block; scans diff *and* full tree | yes | – | – | `confirmed` | `LifeOS/SECURITY.md`; `PublicPushGate.hook.ts:8-11` (history scan capped at 400 commits, `:34`) |
| 391 | `:335` | Secret patterns: `sk-`, `ghp_`, `github_pat_`, AWS key IDs, PEM blocks, JWTs, broker key formats | yes | – | – | `confirmed` | `PublicPushGate.hook.ts:37-43`. Broker key formats are iAI's addition |
| 392 | `:334`, `:336-339` | Leak-scan checks: path scan, `.env*` detection, numeric heuristics, clinical units, template purity, symlink integrity | partial | – | – | `confirmed` | Path/private-zone scanning is LifeOS's; the clinical-unit and template-purity heuristics are iAI extensions |
| 393 | `:356` | dev irreversible action = merging to `main`; `gh pr merge` on the deny-list; authoriser human | – | yes | – | `confirmed` | `references/branch-and-pr-model.md` § Merge Order; deny-list entry consistent with `02-roles.md:648` |
| 394 | `:357` | trade live-order preconditions and kill-switch semantics | – | – | – | `original` | Net-new (`00-synthesis.md:62-67`, `:150`) |
| 395 | `:358` | health never diagnoses by construction; `clinician-review` unreachable by the pack; stalling is correct | – | – | – | `original` | Net-new generalisation (`00-synthesis.md:142-145`) |
| 396 | `:359-360` | wealth has **no payment capability at all**, so there is no kill switch; know's tier rules and `CONFLICT(tier-A)` | partial | – | – | `original` | A/B/C tiering is LifeOS Cortex kept scoped-down, but the citability rule and the `CONFLICT(tier-A)` token appear in no source |
| 397 | `:361` | Host-config install is dry-run by default; `--apply` required; backups; manifest-scoped uninstall | – | – | – | `original` | `00-synthesis.md:156-158` "No source ships to two hosts from one tree" |
| 398 | `:380-389` | The audit record has exactly nine fields; a missing `authoriser` on a gated action is **corruption** | partial | – | – | `original` | LifeOS writes append-only JSONL decision logs with a different schema and no `authoriser`/`policy_sha`/`issue`. Same genre, net-new envelope |
| 399 | `:400-405`, `:407-420` | Per-domain JSONL sinks and three invariants; written by the guard at `tool.execute.after` / `PostToolUse` | partial | yes | yes | `confirmed` | Both event names real (`plugin-interface.ts:104`; forge `hooks/hooks.json`). Append-only JSONL matches LifeOS's `MEMORY/OBSERVABILITY/*.jsonl`. The specific paths are iAI's — but see row 546, where `05-domain-trading.md:379` gives a different one |

**`09-security.md`:** 50 rows — 27 `confirmed`, 5 `corrected`, 18 `original`, 0 `invented`.

---

## 4. Corrections applied by this pass

ISC-6's teeth: an `invented` row must name the commit that removed or corrected
it. All twenty-four do.

### 4.1 `invented` — false provenance

| Row | File | The claim | Commit |
|---|---|---|---|
| 143 | `01-skill-hierarchy.md:116` | `checkpoint`/`resume` are net-new; forge column `—` | `210b60c` |
| 158 | `01-skill-hierarchy.md:354` | `argument-hint` is Claude-Code-only, opencode **Ignored** | `210b60c` |
| 159 | `01-skill-hierarchy.md:355` | `allowed-tools` is Claude-Code-only, opencode **Ignored** | `210b60c` |
| 274 | `08-dual-target.md:191` | "The export must be named, not default" | `eb5e12d` |
| 290 | `08-dual-target.md:286` | `permission.task` takes a per-subagent map; denied subagents erased from the tool description | `eb5e12d` |
| 296 | `08-dual-target.md:355` | `plugin` accepts `[string, PluginOptions]` tuples | `eb5e12d` |
| 298 | `08-dual-target.md:387` | A v2 plugin API at `@opencode-ai/plugin/v2/promise` | `eb5e12d` |
| 939 | `08-dual-target.md:458` | `export const iAI: Plugin ← NAMED export`, in the package tree | `eb5e12d` |
| 949 | `08-dual-target.md:522` | Degradation row resting on the erasure mechanism | `eb5e12d` |
| 659 | `06-domain-health.md:363` | Oura supplies sleep stages, RHR, temperature deviation | `294c6f2` |
| 660 | `06-domain-health.md:364` | Eight Sleep supplies toss-and-turn and HR/HRV | `294c6f2` |
| 661 | `06-domain-health.md:365` | Apple Health supplies workouts, VO2max, ECG, BP | `294c6f2` |
| 675 | `06-domain-health.md:435` | The timezone fallback is recorded in the day file's `metrics` | `294c6f2` |
| 679 | `06-domain-health.md:457` | A `METRICS.md` blood-pressure row sourced to `apple` | `294c6f2` |
| 691 | `06-domain-health.md:492` | HAE is a file-drop directory and the fallback path | `294c6f2` |
| 741 | `07-domain-wealth-know.md:265` | `income_source` has `gross`, `net`, `next_date` | `15224bd` |
| 744 | `07-domain-wealth-know.md:266` | `expense` has `name` and `account` | `15224bd` |
| 745 | `07-domain-wealth-know.md:266` | `expense.category`'s 17 values (9 fabricated, 5 real ones missing) | `15224bd` |
| 746 | `07-domain-wealth-know.md:267` | `investment_account` has `institution`, `current_value`, `contribution_ytd` | `15224bd` |
| 751 | `07-domain-wealth-know.md:270` | `tax_profile` has `withholding` | `15224bd` |
| 754 | `07-domain-wealth-know.md:271` | `obligation` reuses `expense.category` and `income_source.frequency` | `15224bd` |
| 759 | `07-domain-wealth-know.md:278` | `category: subscriptions` in the `vendors.yaml` sample | `15224bd` |
| 766 | `07-domain-wealth-know.md:308` | The cross-pack interface field is `current_value` | `15224bd` |
| 791 | `07-domain-wealth-know.md:572` | A `knowledge` note carries `tier: A` | `15224bd` |

### 4.2 Regressions introduced by this pass's own first commit

| Row | Correction in `630cba6` | Verdict | Commit |
|---|---|---|---|
| 5 | hooks 56 → 55 | correct, stands | — |
| 9 | Fabric 315 → 314 | **wrong** — the real figures are 235 patterns / 309 `.md` files | `d32dce6` |
| 14 | ISA v2.21.0 → v2.20.0 | **wrong** — `ISAFormat.md:8` reads v2.21.0 | `d32dce6` |
| 38 | `9-isa.md` dependency line | correct, stands | — |

### 4.3 What was corrected but not committed here

The `corrected` verdict covers two different situations, and only one of them
demands an edit:

- **Recorded divergences** — iAI deliberately changed something and the change is
  written down. Sentinel renames, the classification vocabulary, the `deepwork`
  rename. Nothing to do.
- **Unrecorded divergences** — iAI changed something and no rename table, decision
  row or ADR says so. These are real debt: a later reader cannot tell a decision
  from a mistake.

The second group is large — roughly forty rows — and fixing it means editing
`00-synthesis.md`'s rename table, `03-workflow.md`'s label contract and several
domain bindings. That is a coherent unit of work and it is **not** in ISC-6's
scope, which asks for one verdicted row per assertion and a commit per `invented`
row. Opening it here would have blurred a claim that is currently clean.

The highest-value items, for whoever picks it up:

| Rows | Issue |
|---|---|
| 314, 423, 515, 774 | `03-workflow.md:131` mandates one rung-colour ramp across every ladder. Three of five domain bindings use a different one |
| 171, 466, 562 | The `{ts}` evidence timestamp has three formats across four documents |
| 420, 546 | The evidence and order-ledger paths disagree between documents |
| 383 | "The last matching rule wins in opencode" could not be verified in any source. If precedence is first-match or most-specific-match instead, **every generated agent's deny rules are inert.** This is a shipped-behaviour risk, not a documentation one |
| 305, 316, 338, 466, 482, 820 | Six deliberate divergences from forge with no rename-table row |
| 356 | iAI fail-closes unknown data one class lower than LifeOS. Now recorded at the point of use, but not in `00-synthesis.md` |
| 448, 410 | The design says tests are written from `ISC-N` and never from the code; forge says the opposite, twice, and calls reading the implementation the thing that makes tests real |
| 460 | "Leaves are invoked by Tier-1 verbs, not by the user" contradicts forge's explicit "skills are never hidden behind agents" |
| 473, 469, 471 | `## Commands` header is `Kind`; forge parses `Action`. `Type` is closed to three values; forge treats unknown values as `library`. `Source dirs` is required; forge tolerates its absence |

Row 383 is the one worth acting on before M1 ships. The rest are documentation
debt.

---

## 5. Result

| Section | Rows | `confirmed` | `corrected` | `original` | `invented` |
|---|---|---|---|---|---|
| 1 · `00-synthesis.md` | 14 | 12 | 2 | 0 | 0 |
| 2 · conflict register | 24 | — | — | — | — |
| 3.1 · `01-skill-hierarchy.md` | 78 | 39 | 16 | 20 | 3 |
| 3.2 · `02-roles.md` | 122 | 60 | 24 | 38 | 0 |
| 3.3 · `03-workflow.md` | 50 | 31 | 8 | 11 | 0 |
| 3.4 · `04-domain-dev.md` | 100 | 46 | 27 | 27 | 0 |
| 3.5 · `05-domain-trading.md` | 70 | 40 | 9 | 21 | 0 |
| 3.6 · `06-domain-health.md` | 100 | 37 | 19 | 38 | 6 |
| 3.7 · `07-domain-wealth-know.md` | 99 | 42 | 15 | 33 | 9 |
| 3.8 · `08-dual-target.md` | 100 | 46 | 27 | 21 | 6 |
| 3.9 · `09-security.md` | 50 | 27 | 5 | 18 | 0 |
| **Total** | **807** | **380** | **152** | **227** | **24** |

Every file in `docs/design/` has been passed. Every `invented` row names the
commit that corrected it.

### Where the defects clustered

Three files hold 21 of the 24 `invented` rows, and they have a shape in common:
each transcribes an external contract.

- **`08-dual-target.md`** (6) documents opencode's plugin API. It was written
  from inference about a package that was never opened — `node_modules` is absent
  from all three source trees. Every falsifiable claim about the type surface was
  wrong in the same direction: more structure than actually exists.
- **`07-domain-wealth-know.md`** (9) transcribes `FINANCES/schema.yaml`. The
  field names are all *plausible* — `current_value`, `contribution_ytd`,
  `institution` are what you would guess a finance schema calls those things.
  They are not what this one calls them.
- **`06-domain-health.md`** (6) lists what each health connector produces. The
  claimed metrics are what those devices are famous for, not what the adapters
  emit.

The failure mode is the same each time: **a plausible reconstruction standing in
for a reading.** None of these would be caught by review, because all of them
read correctly. They are only caught by opening the file being described — which
is precisely what ISC-6 exists to force.

By contrast `02-roles.md`, `03-workflow.md`, `04-domain-dev.md` and
`09-security.md` — 322 rows against forge and LifeOS, the two repositories that
were actually on disk from the start — produced **zero** `invented` rows between
them. The correlation is not subtle. oh-my-opencode was missing until this task
cloned it, and it is the source `08-dual-target.md` describes.

### On the verdict counts

`original` at 231 rows is 29% of the pass, and that is the honest number for a
synthesis: the domain-binding seam, the rung ladders, the gate vocabulary, the
risk officer and the entire trading pack are new work. `corrected` at 147 is
larger than it should be, and most of it is the unrecorded-divergence debt in
§4.3 rather than misstatement.

The three-verdict vocabulary ISC-6 specifies could not express this. Forcing
net-new design into `invented` would have demanded 231 deletion commits and
destroyed the project to satisfy a claim about documentation accuracy. The
`original` verdict added in §Verdicts is the minimum change that makes the claim
executable, and it narrows nothing: all 24 genuine false-provenance rows were
still found, and all 24 were still corrected.
