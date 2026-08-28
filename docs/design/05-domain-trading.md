# Domain: Stock trading

> **This is a personal decision-support and record-keeping system. It is not
> investment advice, it is not a broker, and it is not a fiduciary. The human
> principal is solely responsible for every order that reaches a market. No
> agent in this system may place an order without that principal's explicit,
> per-order authorisation, and no output of this system should be read by anyone
> else as a recommendation.**

`trade` is the largest greenfield area in iAI. LifeOS has no trading code at all,
forge has no notion of an irreversible external action beyond a merge, and
oh-my-opencode contributes only the routing that keeps the risk officer on a
different vendor from the analyst. Everything below is new, and it is written
safety-first: the design assumes the agent will at some point be confidently
wrong, and arranges for that to cost nothing.

The pack's whole shape follows from README rule 2 — *"iAI never trades live
unattended"* — and from the ARCHITECTURE design decision *"Trading defaults to
`research` rung: the irreversible action must be opt-in, explicit and gated."*

---

## 1. Purpose and scope

| This domain is for | This domain is **not** for |
|--------------------|----------------------------|
| Writing falsifiable theses with named invalidation triggers | Generating trade ideas on request without a thesis |
| Backtesting a coded strategy against pre-registered thresholds | Searching parameter space until a backtest looks good |
| Enforcing a written risk mandate against every proposed order | Deciding what the mandate should say |
| Paper execution over a pre-registered window, with tracking error measured | Treating paper results as a formality before live |
| Journalling rationale **at the time of entry**, and post-mortems after exit | Reconstructing rationale after the outcome is known |
| Portfolio review: exposure, correlation, drawdown, concentration | Portfolio optimisation as an end in itself |
| Optionally, heavily gated, single live orders | Unattended, batched or scheduled live execution |

Explicitly out of scope, by construction and not by configuration:

| Excluded | Why |
|----------|-----|
| High-frequency trading | The architecture is a filesystem and GitHub. Latency is measured in seconds |
| Options market-making, spread quoting | Requires continuous two-sided risk management no gated system can provide |
| Anything requiring sub-second latency | A per-order human gate makes sub-second execution impossible by design |
| Financial advice to third parties | Single-principal system; no output is licensed, reviewed or intended for others |
| Managing other people's money | Introduces a fiduciary duty the design makes no attempt to satisfy |
| Leverage, margin, futures, crypto | Absent from `allowed_instruments` by default; opt-in requires a mandate amendment |

---

## 2. The binding

The interface is `DomainBinding` from `01-skill-hierarchy.md`, unchanged. This
block is the content of `skills/trade/domain.md`, quoted verbatim in
`01-skill-hierarchy.md` as its worked example.

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
        verifier: "model-judged",
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
        verifier: "tool-checked",
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
        verifier: "tool-checked",
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
        verifier: "human-attested",
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

`autoDeny` is the second "never" rule in executable form. `rung != live` sits
first because the default rung is `research`, so the overwhelmingly common case
denies without evaluating anything expensive.

`autoDeny` is a *last* line, not the only one. Before `permission.ask` is ever
reached, `guards/checkRiskMandate` has already evaluated the full mandate — see
§5. A proposal that clears `autoDeny` has not been approved; it has merely failed
to be rejected cheaply.

---

## 3. Unit of work

> **A Task is one strategy, or one position change.**

Two shapes, one rule: a Task is the smallest thing that can be *independently
verified against the mandate*. A strategy is verified by a backtest and then by
paper execution. A position change is verified by a risk check and then by a
fill record.

### Granularity rules

| Rule | Detail |
|------|--------|
| One strategy = one task | One universe, one holding period, one sizing rule, one invalidation trigger. A second sizing rule is a second strategy |
| A rebalance is ONE task, not one per holding | Rotating twelve holdings is a single position change with twelve legs. Twelve Tasks would let six pass risk and six fail, leaving the book in a state nobody designed |
| A new thesis is a **Story**, not a task | A thesis spans research, backtest, paper and possibly live — the full ladder. That is a Story with Tasks under it |
| Below `minSize` | "A single entry rule with one invalidation trigger" is the floor. An entry rule with no invalidation trigger is not a unit of work, it is a hunch |
| Above `maxSize` | Two universes, two holding periods, or a sizing rule that changes by regime. `size` fails and `replan` cuts it into siblings |
| One order is never a Task | Orders are legs of a position-change Task. Each still carries its own human authorisation at `rung:live` |

| Proposed | Verdict |
|----------|---------|
| "Rotate 20% from single-name tech into a factor ETF sleeve" | **Story.** Spans research → backtest → paper → live |
| "Backtest the sleeve over 2014–2024 with 20% out-of-sample" | Task |
| "Sell 40 MSFT, 55 NVDA; buy 300 of the sleeve across 3 ETFs" | **One** Task, six legs |
| "Sell 40 MSFT" | A leg, not a Task |
| "Add a momentum overlay that changes sizing above VIX 25" | Above `maxSize` — a second strategy, a second Story |

---

## 4. Verification rungs

This ladder is the centre of the pack. Every other mechanism exists to keep a
Story from arriving at rung four without having earned rungs one through three.

| Rung | Label | What it proves | Promotion requires | Can iAI act alone? |
|------|-------|----------------|--------------------|--------------------|
| research | `rung:research` | A thesis exists in writing, its sources are cited, and the conditions that would prove it **wrong** are named in advance | `iai-critic` finds no unaddressed falsifier; every claim carries a source; the invalidation trigger is a testable condition, not a feeling | **Yes** — no capital, no orders, fully reversible |
| backtest | `rung:backtest` | The strategy is coded, run over data it was not designed on, and its behaviour is reported as numbers rather than a narrative | Pre-registered thresholds met — CAGR, max drawdown, Sharpe, hit rate, exposure, turnover and the **worst 5 trades** all reported — **and** a look-ahead-bias audit passes | **Yes** — read-only against all data sources |
| paper | `rung:paper` | The strategy survives contact with a live tape: real quotes, real spreads, real partial fills, real timing | Executed against a paper account for the pre-registered minimum window (e.g. 30 sessions, declared before the window opens); live tracking error versus backtest within the pre-registered tolerance; `risk-officer` sign-off | **Yes, within limits** — no capital at risk, but mandate limits are enforced exactly as at live |
| live | `rung:live` | Nothing. This rung proves nothing; it *spends* what the earlier rungs proved | Written, unexpired risk mandate; `risk-officer` verdict `PASS` or `PASS_WITH_CONDITIONS`; armed and verified kill switch; **per-order** human authorisation | **NEVER** — see below |

### The `live` rung, stated absolutely

| Constraint | Detail |
|------------|--------|
| Per-order authorisation | Every single order. Never batched, never delegated, never remembered across orders, never inferred from an approval of the parent Story |
| Armed kill switch | Verified **this session**. A kill switch verified yesterday is not armed today |
| Written risk mandate | On disk, signed, unexpired. Missing, stale or unsigned means `VETO` by default |
| No auto mode | `/iai:auto` is refused at dispatch against a `rung:live` Story, before any agent is spawned. This is a hard rule in `guards/checkRiskMandate`, not a setting |
| No promotion by silence | An unanswered gate never times out into approval. Default is deny |

The refusal, verbatim from `03-workflow.md`:

```
HARD FAILURE in Phase 6 (task-do):
- Story: #940
- Expected: rung:research or rung:paper for an /iai:auto run
- Found: rung:live
- Action: Pipeline cannot continue. Fix and re-run.
```

### Pre-registration

> **Thresholds, position sizing and exit criteria are written into the Design
> BEFORE the backtest runs. Changing them after seeing results is logged as a
> deviation and requires a new Story.**

This single rule kills overfitting-by-iteration — the failure where a strategy is
tuned against its own evaluation until the evaluation stops meaning anything, and
nobody involved ever intended to cheat.

| Mechanism | Detail |
|-----------|--------|
| What is pre-registered | Metric thresholds, out-of-sample split, data window, universe definition, sizing rule, stop and exit criteria, minimum paper window, tracking-error tolerance |
| Where | The Design's `ISC-N` claims, committed **before** the backtest Task starts. The commit SHA is the timestamp |
| Enforcement | `trade/backtest` refuses to run if the anchored `ISC-N` claims are uncommitted or were modified after the previous backtest run for this Story |
| Backtest counter | Every run increments `backtests_run` in the Design frontmatter and appends a row to the Design's run log. Run 7 against the same universe is visible to `iai-critic` and to the human, forever |
| Deviations | A post-hoc threshold change is written to the journal as a deviation, closes the current Story, and opens a new one. The old evidence is not deleted — it is the record of what was tried |

A strategy that only passes on its fourth threshold revision has not passed.

---

## 5. Safety gate

| Property | Value |
|----------|-------|
| Irreversible action | Place a live order |
| Authoriser | Human principal, **per order** |
| Veto agent | `risk-officer` — absolute, unappealable by any agent |
| Kill switch | `iai trade halt --all` |
| Auto-deny | See `gate.autoDeny` in §2, plus the full mandate evaluation below |

### The risk mandate

The mandate is a **committed file**, `USER/TRADING/MANDATE.md`, authored by the
human principal. It is the only document in the system that grants permission to
risk capital.

```yaml
---
version: 3
signed_by: "principal"
signed_at: "2026-01-04"
expires_at: "2026-07-04"          # unsigned or expired => VETO by default
review_cadence: "quarterly"

max_position_pct: "4.0"           # single name, % of portfolio market value
max_sector_pct: "25.0"            # GICS sector cap
max_portfolio_heat: "6.0"         # sum of (entry - stop) * size, as % of equity
max_drawdown_halt_pct: "12.0"     # peak-to-trough; breach auto-fires the kill switch
max_daily_loss: "2500.00"         # currency-denominated, as a STRING
max_orders_per_day: 6

allowed_instruments:              # enum; anything absent is prohibited
  - us_equity
  - etf
  - adr
# NOT enabled: options, futures, crypto, margin, leverage, shorting.
# Enabling any of these requires a mandate amendment PR, reviewed by the human.

banned_tickers: ["GME", "AMC", "DJT"]
min_liquidity_adv: "2000000.00"   # 20-day average dollar volume floor
requires_stop: true               # every entry carries a stop at submission time
currency: "USD"
account_last_4: "4417"            # last 4 only, never the full number
---
```

Rules that make the mandate load-bearing:

| Rule | Detail |
|------|--------|
| Amended only by PR | A pull request against the private data repo, reviewed and merged by the human. Never edited by an agent, and never mid-session |
| An agent may propose, never apply | `quant-analyst` may open a mandate-amendment PR with a rationale. It cannot merge it, and the pipeline continues under the **old** mandate until a human merges |
| Absent, unsigned or expired ⇒ `VETO` | No mandate, no risk-taking. There is no default mandate and no inferred one |
| Pinned per order | Every order records `mandate_sha` — see §7 |
| Monetary values are strings | Follows LifeOS finance convention: strings admit placeholders and never acquire float error |
| Accounts by `last_4` only | Full account numbers never enter any file, any issue, or any model context |

### The `risk-officer` veto

Restated here because it is the pack's strongest guarantee:

| Property | Detail |
|----------|--------|
| Spawned independently | `iai-conductor` spawns `risk-officer`, always. `quant-analyst` cannot spawn it, skip it, summarise for it, or filter its inputs |
| Reads from disk | The proposal artifact and the current book from `USER/TRADING/`, never the analyst's transcript. The proposer never controls the approver's inputs |
| Evaluates four axes | Position limits, correlation exposure, drawdown budget, mandate compliance |
| Verdicts | `PASS`, `PASS_WITH_CONDITIONS` (applied verbatim), `VETO` |
| Cannot propose | It has no authority to size up, suggest an entry, or author a thesis. The approver never becomes the proposer |
| Cross-vendor | Analyst on one vendor, officer on another, per `02-roles.md`'s cross-vendor audit rule |
| Unappealable | Not by `quant-analyst`, not by `iai-conductor`, not by `iai-critic`, not by re-running the pipeline |

Only the human principal may override, and the override is not a decision — it is
a **record**: an explicit human comment under `## iai-risk` on the Story, a
journal entry at `USER/TRADING/JOURNAL/{date}-override.md` carrying the veto text
and the stated reason, and a commit. An override with no journal entry is not an
override; `risk:vetoed` stays and the pipeline stays halted.

### The kill switch

```
iai trade halt --all
```

| Effect | Detail |
|--------|--------|
| Cancels | Every open order at every configured broker adapter |
| Blocks | New orders, at the tool boundary, for the remainder of the session |
| Demotes | Sets `rung:paper` on every open `domain:trade` Story, removing `rung:live` |
| Records | Posts a `## iai-risk` comment on each affected Story and writes `USER/TRADING/JOURNAL/{date}-halt.md` |
| Triggers | Manually by the principal; automatically on a `max_drawdown_halt_pct` breach; automatically on broker API anomaly (unexpected rejection rate, position mismatch, auth failure, or a fill for an order the system did not send) |
| Recovery | Not automatic. Re-arming requires a human, a fresh session, and a `risk-officer` re-assessment of the book as it now stands |

"Verified this session" means the halt path was exercised — the adapter answered
a cancel-all probe — not that the command exists.

---

## 6. Leaf skills

| Skill | Argument hint | Description | Gate? |
|-------|---------------|-------------|-------|
| `thesis` | `[story#] [ticker\|strategy]` | Writes a falsifiable claim with cited sources, an explicit invalidation trigger, and the conditions under which the position is exited regardless of P&L | No |
| `screen` | `[--universe sp500] [--filters ...]` | Candidate generation against the thesis universe. Output is a ranked list with the screen's exact definition attached, so the universe is reproducible | No |
| `backtest` | `[story#] [--window 5y] [--oos 20%]` | Historical evaluation with declared slippage, fee and survivorship assumptions and a held-back out-of-sample window. Read-only with respect to any broker. Increments `backtests_run` | No |
| `risk-check` | `[proposal#]` | The `risk-officer` surface. Evaluates a proposal against the mandate on four axes and returns `PASS` / `PASS_WITH_CONDITIONS` / `VETO` | **Yes** — it *is* the gate |
| `paper-trade` | `[story#] [--sessions 30]` | Executes the strategy against the paper broker for the pre-registered window and records tracking error against the backtest | No — but mandate limits are enforced identically to live |
| `live-order` | `[task#] [--leg n]` | The gated irreversible action. One order, one authorisation, one journal entry, one `orders.jsonl` line | **Yes** — human, per order, always |
| `portfolio-review` | `[--as-of YYYY-MM-DD]` | Exposure, correlation clusters, sector weights, drawdown against budget, and mandate headroom for the current book | No |
| `journal` | `[issue#] [--entry\|--exit]` | Per-trade log entry capturing rationale **at the time of entry**, before the outcome is known | No |
| `post-mortem` | `[issue#]` | Closed-position analysis: thesis versus outcome, whether the invalidation trigger fired and whether it was honoured. Feeds `/iai:learn` | No |

Gated leaves are marked in the pack manifest, and the gate is enforced twice —
by the `gate:pending` label and by the host permission hook. Removing the label
without the hook approving still blocks the tool call.

---

## 7. Data model

All of `USER/TRADING/` is classified `PRIVATE`, labelled `class:private` on every
issue that references it, and hard-blocked from egress to any cloud model by
`guards/checkEgress`. `USER/` is a symlink into a private store; the public repo
holds templates only.

| Path | Contents | Format |
|------|----------|--------|
| `USER/TRADING/MANDATE.md` | The risk mandate | YAML frontmatter + prose rationale |
| `USER/TRADING/THESES/{ticker-or-strategy}.md` | One thesis per file, e.g. `factor-etf-sleeve.md`, `MSFT.md` | Markdown + frontmatter |
| `USER/TRADING/POSITIONS.yaml` | The current book | YAML, schema below |
| `USER/TRADING/JOURNAL/{YYYY-MM-DD}.md` | Daily entries: rationale, overrides, halts | Markdown |
| `USER/TRADING/BACKTESTS/{slug}/results.json` | Metrics for one backtest run | JSON |
| `USER/TRADING/BACKTESTS/{slug}/equity.csv` | Daily equity curve | CSV: `date,equity,drawdown` |
| `USER/TRADING/BACKTESTS/{slug}/trades.csv` | Every simulated trade | CSV: `entry_ts,exit_ts,ticker,side,qty,entry,exit,pnl,r` |
| `USER/TRADING/ORDERS/{YYYY}/orders.jsonl` | **Append-only** order record | JSON Lines, schema below |
| `docs/evidence/{issue}-{ts}.md` | Trade log + equity curve evidence | Markdown, SHA-pinned |

### `POSITIONS.yaml`

```yaml
as_of: "2026-08-25T20:05:00Z"
account_last_4: "4417"
currency: "USD"
equity: "184250.00"            # strings throughout; placeholders permitted
cash: "22110.40"
positions:
  - ticker: "MSFT"
    qty: 120
    avg_cost: "402.15"
    market_value: "51834.00"
    weight_pct: "28.1"         # exceeds max_position_pct: this is why #940 exists
    sector: "information_technology"
    opened: "2024-11-12"
    stop: "365.00"
    thesis: "THESES/MSFT.md"
    issue: 44                  # the Story that authorised it
    rung: "live"
  - ticker: "VFVA"
    qty: 300
    avg_cost: "—"              # placeholder: order not yet filled
    market_value: "—"
    weight_pct: "—"
    sector: "diversified"
    opened: "—"
    stop: "pending"
    thesis: "THESES/factor-etf-sleeve.md"
    issue: 58
    rung: "paper"
```

| Field | Rule |
|-------|------|
| Monetary fields | **Strings**, always. `"—"` is a legal placeholder for unknown or unfilled |
| `account_last_4` | Last four digits only. A full account number in this file is a `SECRET`-class leak |
| `issue` | Every position traces to the Story that authorised it. A position with no issue is an orphan and `portfolio-review` flags it |
| `rung` | The rung the position was opened at. A `paper` position never silently becomes `live` |
| `stop` | Required when `mandate.requires_stop` is true. `"pending"` blocks promotion |

### `ORDERS/{YYYY}/orders.jsonl`

Append-only. Never rewritten, never sorted, never compacted. One JSON object per
line; the file is the audit trail.

```json
{"ts":"2026-09-14T13:41:02Z","issue":74,"ticker":"VFVA","side":"buy","qty":300,"order_type":"limit","limit_price":"96.40","rung":"live","mandate_sha":"a91c4f2","risk_verdict":"PASS_WITH_CONDITIONS","authorised_by":"principal@2026-09-14T13:40:55Z","broker_order_id":"a1b2-c3d4","fill_price":"96.38","status":"filled"}
```

| Field | Type | Meaning |
|-------|------|---------|
| `ts` | string, RFC 3339 UTC | When the order was submitted |
| `issue` | integer | The Task issue that owns the order |
| `ticker` | string | Symbol as submitted |
| `side` | `buy` \| `sell` | Direction |
| `qty` | integer | Share count |
| `order_type` | `market` \| `limit` \| `stop` \| `stop_limit` | Order kind |
| `limit_price` | string | Monetary as string; `"—"` for market orders |
| `rung` | `paper` \| `live` | Which rung produced this order. `research` and `backtest` never write here |
| `mandate_sha` | string | **Short SHA of the commit of `MANDATE.md` that authorised this order** |
| `risk_verdict` | `PASS` \| `PASS_WITH_CONDITIONS` \| `OVERRIDE` | `risk-officer`'s verdict. `VETO` never appears — a vetoed order is not submitted |
| `authorised_by` | string | Principal identifier plus authorisation timestamp. Absent at `rung:live` is a corruption |
| `broker_order_id` | string | Adapter's identifier, for reconciliation |
| `fill_price` | string | Average fill; `"—"` until filled; partial fills append a **second line**, never edit the first |
| `status` | `submitted` \| `partial` \| `filled` \| `cancelled` \| `rejected` | Terminal states are never rewritten |

`mandate_sha` is the point of the whole file. It pins **which version of the
mandate authorised this order**, so a question asked two years later — "what were
the limits when I bought this?" — has a mechanical answer: check out that SHA and
read the frontmatter. A mandate amendment cannot retroactively legitimise or
condemn an order, because the order carries its own copy of the rules.

---

## 8. Integrations

Every integration is behind an interface. **No vendor is hardcoded** — the
adapter is chosen by configuration, and the pack's guarantees must hold for any
of them.

| Integration | Interface | Candidates | When absent |
|-------------|-----------|-----------|-------------|
| Market data | `MarketDataProvider` — `quote()`, `bars()`, `universe()`, `asOf` staleness stamp | Alpaca, IBKR, Polygon; `yfinance` **research-only**, never for execution decisions | Story is pinned to `rung:research`. `paper` and `live` promotion refused. Recorded on the issue, never silent |
| Historical data | `BarSource` with an explicit adjustment policy (splits, dividends) and a delisted-symbol channel | Same as above, plus local CSV archives | `backtest` refuses to run rather than run on a survivorship-biased universe |
| Broker | `BrokerAdapter` — `submit()`, `cancel()`, `cancelAll()`, `positions()`, `mode: "paper" \| "live"` | `PaperBroker` is the default and **the only adapter enabled out of the box**. Live adapters are opt-in, per-account, and require a mandate | No broker means no `paper` rung; the Story stops at `backtest` |
| Calendar / holidays | `MarketCalendar` — sessions, early closes, halts | Exchange calendar packages, broker calendar endpoints | "30 sessions" cannot be counted, so the paper window cannot close. Promotion refused |
| Corporate actions | `CorporateActions` — splits, dividends, symbol changes, delistings | Data vendor feeds, broker notifications | `POSITIONS.yaml` reconciliation flags any unexplained quantity change as an anomaly rather than adjusting silently |

Rules that apply to every row:

| Rule | Detail |
|------|--------|
| Degrade to `research`, never silently | A missing integration demotes the rung, posts a `## iai-risk` comment naming the integration, and applies `status:blocked` where promotion was expected |
| Stale is the same as absent | `autoDeny` includes `market data staler than 60s`. A provider that answers with old data is treated as down |
| `PaperBroker` first | The default configuration can complete the entire ladder up to but not including `live`. Enabling a live adapter is a deliberate, separate, human act |
| Credentials in `.env` only | Never in `USER/`, never in an issue, never in a model's context. The secret deny-list covers `cat`/`grep`/`rg` against it |
| Reconcile before trusting | `positions()` from the broker is compared to `POSITIONS.yaml` at session start. A mismatch blocks all order submission until a human resolves it |

---

## 9. Worked example

The book has drifted: `MSFT` is 28.1% of portfolio value against a
`max_position_pct` of 4.0. The mandate is being violated *right now*, by a
position opened in 2024. This is the ordinary case the pack is built for.

**Goal → Milestone.** TELOS goal `G2: "Portfolio reset"` → `/iai:goal-create G2`
→ **Milestone 9 "Portfolio reset"**, feature table in the description.

**Milestone → Story.** `/iai:story-create 9` opens:

```
#940  [type:story] [domain:trade] [class:private] [rung:research] [iai]
     "Rotate 20% from single-name tech into a factor ETF sleeve"
```

`rung:research` is applied at creation. It is the default and it is not
negotiable at this stage.

**Story → Design, with pre-registration.** `/iai:story-design 940` writes
`docs/design/stories/940.md`, cuts `story/940-rotate-20-from-single-name-tech-into`,
and posts `## iai-design`. The claims are written and **committed before any
backtest runs**:

| Claim | Pre-registered statement |
|-------|--------------------------|
| ISC-1 | Universe: US-listed factor ETFs with 20-day ADV ≥ $2,000,000 and expense ratio ≤ 0.25%. Frozen at design time; membership recorded in the Design |
| ISC-2 | Backtest window 2014-01-01 → 2024-12-31, with 2022-01-01 → 2024-12-31 held out as out-of-sample. Slippage 5bp, fees $0.005/share, delisted names retained |
| ISC-3 | Thresholds: CAGR ≥ 6.0%, max drawdown ≤ 18.0%, Sharpe ≥ 0.60, hit rate ≥ 45%, turnover ≤ 120%/yr. Worst 5 trades reported individually |
| ISC-4 | Sizing: no single ETF above 8.0% of portfolio value; sleeve total 20.0% ± 1.0%; every leg carries a stop at submission |
| ISC-5 | Paper window: 30 consecutive sessions. Tracking error versus backtest ≤ 150bp annualised. Declared before the window opens |
| ISC-6 | Post-rotation, `MSFT` ≤ `max_position_pct` and no GICS sector exceeds `max_sector_pct`, verified against `POSITIONS.yaml` |

The commit SHA of `stories/940.md` is the pre-registration timestamp. Changing ISC-3
after seeing a backtest result closes `#940` and opens a new Story.

**Design → Tasks.** `/iai:task-create 940`:

```
#941 [type:task] Backtest the factor ETF sleeve          anchors ISC-1, ISC-2, ISC-3
#942 [type:task] Risk-check the rotation against MANDATE anchors ISC-4, ISC-6
#943 [type:task] Paper-trade the sleeve for 30 sessions  anchors ISC-5
    Blocked by: #941, #942
#944 [type:task] Execute the live rotation               anchors ISC-4, ISC-6
    Blocked by: #943   [gate:pending]
```

`#944` carries `gate:pending` from the moment it is created. It is never eligible
for `/iai:auto`, and the rotation's twelve legs are **one** Task, not twelve.

**Tasks → evidence.**

| Step | Command | Effect |
|------|---------|--------|
| 1 | `/iai:task-do 941` | `trade/backtest 58 --window 10y --oos 20%`. Writes `USER/TRADING/BACKTESTS/factor-etf-sleeve/{results.json,equity.csv,trades.csv}`. Design `backtests_run: 1` |
| 2 | `/iai:task-verify 941` | Results against ISC-3: CAGR 7.4%, max DD 15.2%, Sharpe 0.71, hit rate 48%, turnover 86%. Look-ahead audit passes — every signal uses only data available at the bar it trades. Worst 5 trades listed. `docs/evidence/941-20260901T104412Z.md`, `## iai-evidence`, close `#941`. Story → `rung:backtest` |
| 3 | `/iai:task-do 942` | `iai-conductor` spawns `risk-officer` **independently**. It reads `MANDATE.md` at SHA `a91c4f2`, `POSITIONS.yaml`, and the proposal from disk — not from `quant-analyst` |
| 4 | verdict | `RISK #940: PASS_WITH_CONDITIONS` — sleeve capped at 20.0%, no single ETF above 6.5% (tighter than ISC-4's 8.0%), hard stop −8% per leg, execution over three sessions to limit market impact. Conditions applied verbatim, written to `USER/TRADING/JOURNAL/2026-09-02.md` under `## iai-risk` |
| 5 | `/iai:task-verify 942` | Conditions recorded in the Design. `#942` closed |
| 6 | `#943` unblocks | `trade/paper-trade 58 --sessions 30` against `PaperBroker`. Each simulated order appends to `ORDERS/2026/orders.jsonl` with `rung: "paper"` |
| 7 | `/iai:task-verify 943` | 30 sessions complete. Tracking error 112bp, inside ISC-5's 150bp. `docs/evidence/943-20260913T210300Z.md` carries the paper equity curve overlaid on the backtest curve. `#943` closed. Story → `rung:paper` |

**The gate.** `#943` closing does **not** promote the Story. Promotion to
`rung:live` is a human gate plus a `risk-officer` `PASS`:

```markdown
## iai-gate

**Gate:** rung-promotion
**Story:** #940
**Request:** promote domain:trade from rung:paper to rung:live
**Proposed by:** quant-analyst
**Risk assessment:** RISK #940: PASS_WITH_CONDITIONS (sleeve 20.0% cap, 6.5%
  per-ETF cap, hard stop -8%, execution across 3 sessions)
**Preconditions:**
- [x] Written mandate at USER/TRADING/MANDATE.md, signed 2026-01-04, expires 2026-07-04 — RENEWED 2026-07-01, sha a91c4f2
- [x] Paper-rung results over the full 30-session window in docs/evidence/943-*.md
- [x] Kill switch armed and verified this session
**Decision:** PENDING
```

The human comments the approval. `gate:approved` is applied only after that
comment exists — an agent may never write `**Decision:** APPROVED`.

**Live execution.** `/iai:task-do 944` runs `trade/live-order` **once per leg**.
Twelve legs, twelve authorisations, over three sessions per the risk conditions.
Each submission appends one line to `ORDERS/2026/orders.jsonl` carrying
`mandate_sha: "a91c4f2"`, `risk_verdict: "PASS_WITH_CONDITIONS"` and
`authorised_by`. Leg 7 partially fills — 180 of 300 — and appends a **second**
line rather than editing the first. `trade/journal 74 --entry` records rationale
at entry, before any outcome is known.

**Close.**

| Step | Effect |
|------|--------|
| `/iai:task-verify 944` | `POSITIONS.yaml` re-read from the broker and reconciled. `MSFT` now 3.6% (≤ 4.0), no sector above 25.0 — ISC-6 satisfied. Evidence written, `#944` closed explicitly |
| *(automatic)* | All Tasks resolved → `#940` gains `status:resolved` |
| `/iai:story-verify 940` | Full plan: 6/6 claims. `## iai-verdict PASS`. Integration PR `story/940-* → main` **of the private data repo**, carrying the thesis, the backtest outputs, the journal entries and the `POSITIONS.yaml` diff |
| **human merges** | One `Closes #N` per line for `#940`, `#941`, `#942`, `#943`, `#944` |
| `trade/post-mortem 58` | Ninety days later: thesis versus outcome, whether the invalidation trigger fired, whether it was honoured. Feeds `/iai:learn 9` and a `MEMORY/` entry |

Nothing in this trace let an agent place an order on its own, and the mandate
version that permitted every one of those twelve legs is recoverable from a
seven-character string.

---

## 10. Failure modes and mitigations

| Failure mode | Symptom | Mitigation |
|--------------|---------|------------|
| **Look-ahead bias** | Backtest uses data unavailable at the bar it trades — same-bar close, restated fundamentals, a later index membership | A look-ahead audit is a **promotion requirement**, not a review nicety. Every signal declares its as-of lag; the audit re-runs the strategy with all inputs shifted one bar and requires the edge to survive. A strategy that collapses under the shift is refused |
| **Survivorship bias** | Universe contains only names that still exist, so the backtest never buys anything that went to zero | `BarSource` must expose a delisted-symbol channel. `trade/backtest` refuses to run against a universe that reports zero delistings over a 10-year window. The universe is frozen in the Design at design time and its membership is committed |
| **Overfitting via repeated backtests** | Run 9 finally clears the thresholds; runs 1–8 are forgotten | Pre-registration plus a **backtest counter**: `backtests_run` in the Design frontmatter, incremented every run, with a run log the human and `iai-critic` both see. Thresholds changed after a run close the Story and require a new one, logged as a deviation |
| **Broker API outage mid-order** | Submission times out; the system does not know whether the order exists | Never resubmit on timeout. Reconcile: query `positions()` and open orders, match against `orders.jsonl` by `broker_order_id`, and if the state is ambiguous, fire the kill switch and stop for a human. An unmatched fill is a broker anomaly and auto-halts |
| **Partial fills** | Position size differs from the size the risk check approved | Fills append lines; they never edit them. After each fill the remaining book is re-checked against the mandate before the next leg. A partial that leaves the book outside `max_position_pct` blocks the remaining legs and raises a gate |
| **Stale market data** | Decisions made on prices from an hour ago | Every provider stamps `asOf`; `autoDeny` refuses at >60s. A provider that cannot stamp staleness is treated as research-only. Stale is treated identically to absent |
| **Correlation blindness** | Two "different" positions are one factor bet; the book looks diversified and is not | `risk-officer` evaluates correlation exposure as one of its four axes, using pairwise and cluster correlation against the existing book. `portfolio-review` reports clusters, not just sector weights. `max_portfolio_heat` caps the aggregate regardless of names |
| **The agent talks itself into a trade** | A fluent, internally consistent case that never touches contrary evidence | Three structural defences: `iai-critic` must find no unaddressed **falsifier** before the research rung passes; `risk-officer` is spawned independently and reads from disk, not the transcript; and the two run on **different vendors**, so they do not share priors or blind spots |
| **Mandate drift** | Limits quietly loosen over months until they permit whatever is being proposed | The mandate is amended only by PR to the private data repo, reviewed by the human, never by an agent mid-session. `review_cadence` forces a scheduled re-read. Every order pins `mandate_sha`, so loosening is visible as a diff and cannot be applied retroactively |
| Mandate expired | Every proposal is refused and the pipeline appears broken | Correct behaviour, stated loudly: `VETO` by default with the expiry date named, plus a Story to renew. There is no grace period and no inferred extension |
| Kill switch never exercised | It exists in code and has never been proven to work | "Armed" means verified **this session** by a cancel-all probe against the adapter. An unverified kill switch is an `autoDeny` condition, so the live rung is simply unreachable |
| `PRIVATE` data reaching a cloud model | Positions or account details in a prompt to an external vendor | `class:private` on every trade issue, `guards/checkEgress` blocking at the tool boundary, default **deny** rather than ask, and re-routing to a local model. Safety beats audit quality — even the cross-vendor rule yields to it |
| Position with no authorising Story | A holding nobody can explain | `POSITIONS.yaml` requires an `issue` per position. `portfolio-review` flags orphans, and an orphan blocks promotion of any Story that would add to the same exposure |
