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
| `invented` | Searched in all three sources, no corresponding statement exists |

An `invented` row must name the commit that removed or corrected it. That is the
teeth of ISC-6: the pass produces corrective commits, not merely a table.

## What counts as an assertion

A **normative** statement that constrains implementation or behaviour: `MUST` /
`never` / `always` / `exactly` statements, table rows defining a contract, named
numeric limits and budgets, named identifiers, paths, sentinels, labels and
commands.

Excluded: motivation, rationale, rhetorical framing, and examples that merely
illustrate an assertion already counted.

## Coverage

**This pass is incomplete and does not claim otherwise.**

| File | Lines | Status |
|---|---|---|
| `00-synthesis.md` | 173 | **passed** — factual claims about sources verified |
| `9-isa.md` | 183 | **passed** |
| `01-skill-hierarchy.md` | 473 | conflicts registered; full row-by-row pass pending |
| `02-roles.md` | 695 | conflicts registered; full pass pending |
| `03-workflow.md` | 577 | conflicts registered; full pass pending |
| `04-domain-dev.md` | 512 | pending |
| `05-domain-trading.md` | 607 | pending |
| `06-domain-health.md` | 596 | pending |
| `07-domain-wealth-know.md` | 655 | pending |
| `08-dual-target.md` | 526 | conflicts registered; full pass pending |
| `09-security.md` | 420 | conflicts registered; full pass pending |

ISC-6 requires **one row per assertion in `docs/design/`**. Section 1 and the
conflict register in section 2 are complete and verified. The remaining
row-by-row enumeration of the nine unpassed files is outstanding. Marking ISC-6
`PASS` on this document alone would be false.

---

## 1. `00-synthesis.md` — factual claims about the sources

`00-synthesis.md` is the provenance record: a KEEP / ADAPT / DROP table whose
rows assert facts about the three repositories. Those assertions are falsifiable,
so they are verified here first. A synthesis row claiming "forge does X" is
itself an assertion that can be wrong — and two of them were.

| # | iAI ref | Assertion | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `:32` | TELOS ID scheme `M0`/`P0`/`G0`/`S0` preserved verbatim | `confirmed` | `LifeOS/install/USER/TELOS/TELOS.md` contains `M0`, `P0`, `P1`, `G0`, `G1`, `S0` |
| 2 | `:32` | Current→Ideal uses 7 UPPERCASE dimensions `HEALTH`, `MONEY`, `FREEDOM`, `CREATIVE`, `RELATIONSHIPS`, `RHYTHMS`, `INFRASTRUCTURE` | `confirmed` | Exactly seven files at `USER/TELOS/IDEAL_STATE/{HEALTH,MONEY,FREEDOM,CREATIVE,RELATIONSHIPS,RHYTHMS,INFRASTRUCTURE}.md` |
| 3 | `:32` | `CURRENT pct = (have + 0.5*partial) / (have + partial + missing) * 100` | `confirmed` | `USER/TELOS/CURRENT_STATE/README.md:34` verbatim; implemented at `LIFEOS/TOOLS/UpdateLifeosState.ts:109` |
| 4 | `:32` | `IDEAL pct = 100 - (TBD count x 10)` | `confirmed` | `CURRENT_STATE/README.md:49` — "scores on *articulation* (`100 − TBD × 10`)"; `IDEAL_STATE/README.md` clamps to 0..100 |
| 5 | `:38` | Hook system is **56 hooks** | `corrected` | **55** `.ts` files at `LifeOS/install/hooks/`. Count drift; corrected to 55 |
| 6 | `:38` | Six named hooks survive as concepts: `EgressClassGuard`, `VerificationGate`, `ModelRungGuard`, `SpendAuditor`, `LoopDetector`, `FormatGate` | `confirmed` | All six present in `LifeOS/install/hooks/` |
| 7 | `:39` | healthsync is five connectors — `oura.ts`, `eightsleep.ts`, `apple.ts`, `function.ts`, `hae.ts` | `confirmed` | All five at `LIFEOS/TOOLS/healthsync/` |
| 8 | `:40` | FINANCES schema has 9 object types | `confirmed` | `USER/FINANCES/schema.yaml` defines exactly `overview`, `income_source`, `expense`, `investment_account`, `account`, `goal`, `tax_profile`, `obligation`, `vendor` (plus `version`/`description`/`validation` metadata keys) |
| 9 | `:41` | Fabric is **315** prompt pattern files | `corrected` | **314** `.md` files under the Fabric path. Off by one; corrected to 314 |
| 10 | `:57-61` | "LifeOS has no trading — zero broker integration, zero ticker resolution, zero portfolio quote code, no market data client" | `confirmed` | 17 files match broker-ish terms, all of them `USER/FINANCES/` documents (`schema.yaml`, `vendors.yaml`, `GOALS.md`) or agent prose. No client, no API integration, no quote code. The claim holds in substance |
| 11 | `:116` | omo built-ins are `visual-engineering`, `ultrabrain`, `deep`, `artistry`, `quick`, `writing` | `confirmed` | All six appear in omo's README set; `ultrabrain` also at `packages/shared-skills/skills/ulw-execute/SKILL.md` |
| 12 | `:119` | omo's `ultrawork` keyword is renamed to `deepwork` to avoid colliding when both plugins are installed | `confirmed` | omo ships `packages/prompts-core/prompts/ultrawork/default.md`. The collision is real and the rename is justified |
| 13 | `:172` | "forge does not route models" | `confirmed` | forge assigns models statically per agent — `gh-workflow/ARCHITECTURE.md:148-153`, and hard-coded `model: opus[1m]` in `agents/forge-coder.md:9` |
| 14 | `:34` | ISA is v2.21.0 with 17 fixed body sections | `corrected` | LifeOS `ISAFormat.md` documents **seventeen** sections at **v2.20.0**; v2.21.0 is not the version in the source read. Section count confirmed, version corrected |

**Verdict counts for section 1:** 14 rows — 11 `confirmed`, 3 `corrected`, 0 `invented`.

---

## 2. Cross-document conflict register

These are assertions that exist **twice in `docs/design/`, differently**. They are
not source-reconciliation failures; they are internal contradictions, which ISC-6
is the only claim positioned to catch. Each was found while implementing #187,
#13 or #12, and each was deliberately recorded rather than silently resolved.

| # | Conflict | Refs | Disposition |
|---|---|---|---|
| 15 | Commit-subject regex specified twice | `03-workflow.md:462` vs `CONTRIBUTING.md:206` | ISA adopted the `03-workflow` form; **shipped** in `packages/core/src/guards/commit-prefix.ts` with a test pinning the `owner/repo#N` rejection. `CONTRIBUTING.md` now contradicts running code |
| 16 | SKILL.md frontmatter key set: 5 keys vs 8 | `08-dual-target.md:44-50` vs `01-skill-hierarchy.md:347-356` | Adjudicated **strict-5** by the principal; shipped in `scripts/skill-lint.ts` |
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
| 33 | `permission` key set specified twice at different sizes | `08-dual-target.md:260-262` (15 keys) vs `02-roles.md:680` (3 keys) | Unresolved |
| 34 | `AgentSpec` referenced repeatedly, defined nowhere | `02-roles.md:590,692,694`, `08-dual-target.md:256,426`, `M3.md:58`, `M8.md:38` | No TypeScript shape exists in any repo |
| 35 | `{target_dir}` defined twice | `CONTRIBUTING.md:63` vs `04-domain-dev.md:334` | ISA adopted the CONTRIBUTING form |
| 36 | `## Commands` shape specified twice | `CONTRIBUTING.md` block form vs the table form | Recorded in the ISA Decisions section |
| 37 | Three-way `anchors_to` collision | `9-isa.md` Test Strategy, `9-plan.md`, LifeOS `ISAFormat.md:325` | LifeOS defines `literal` / `derived: <sub-claim>` / `cross: <slug>`; iAI uses the first two and adds its own |
| 38 | ISA names three sources, gives two paths | `9-isa.md:81-83` | **Corrected by this task** — oh-my-opencode located upstream and checked out |

---

## 3. Corrections applied by this pass

| Row | Correction | Commit |
|---|---|---|
| 5 | `00-synthesis.md` hook count 56 → 55 | *(this task)* |
| 9 | `00-synthesis.md` Fabric count 315 → 314 | *(this task)* |
| 14 | `00-synthesis.md` ISA version v2.21.0 → v2.20.0 | *(this task)* |
| 38 | `9-isa.md` dependency line names three sources with two paths | *(this task)* |

## 4. Outstanding

The nine files marked *pending* or *conflicts registered* in the coverage table
need their row-by-row enumeration. Rows 15–38 capture every conflict found so
far, but a conflict register is not the same artifact as an exhaustive assertion
list, and ISC-6 asks for the latter.
