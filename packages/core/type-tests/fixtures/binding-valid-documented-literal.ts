// Positive control for case 2 (P0, CLAIM-31.1): every field of the shipped
// types is `readonly`, and this proves that narrowing did not break a single
// binding literal written in the design documents.
//
// This is the worked example from docs/design/01-skill-hierarchy.md:238-331,
// reproduced as a plain MUTABLE object literal with MUTABLE arrays — exactly as
// a pack author would write it, with no `as const` and no readonly modifiers.
// A mutable literal is assignable to a readonly type and `Rung[]` to
// `readonly Rung[]`, so this compiles; if a future edit made any field
// invariant, this fixture is what fails.
//
// The `readonly` narrowing is load-bearing rather than cosmetic: Decision 11
// validates at registration so resolution is total, which only holds if a
// validated binding cannot be mutated into an invalid one afterwards
// (NEVER-31.9).
import type { DomainBinding } from "../../src/binding/domain";

export const tradeBinding: DomainBinding = {
  id: "trade",

  unitOfWork: {
    noun: "strategy",
    description: "One falsifiable trading thesis, its rules, and its risk limits",
    minSize: "a single entry rule with one invalidation trigger",
    maxSize: "one instrument universe, one holding period, one sizing rule",
    leafSkill: "trade/backtest",
  },

  verify: {
    defaultRung: "research",
    passing:
      "Backtested edge survives paper execution with slippage, and " +
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
    authoriser: "human, per-order",
    killSwitch: "iai trade halt --all",
    vetoAgent: "risk-officer",
    autoDeny: [
      "rung != live",
      "risk mandate missing or expired",
      "order notional > mandate.maxPositionNotional",
      "kill switch unverified this session",
      "market data staler than 60s",
    ],
  },

  evidence: {
    kind: "trade log + equity curve",
    sentinel: "## iai-evidence",
    pathTemplate: "docs/evidence/{issue}-{ts}.md",
    budgetChars: 60000,
    pinned: true,
  },

  labels: {
    namespace: "domain:trade",
    extra: [
      { name: "rung:research", color: "0e8a16" },
      { name: "rung:backtest", color: "1d76db" },
      { name: "rung:paper", color: "fbca04" },
      { name: "rung:live", color: "b60205" },
      { name: "risk:vetoed", color: "b60205" },
    ],
  },
};

// The `dev` binding omits `vetoAgent` deliberately
// (docs/design/04-domain-dev.md:149-152) and `know` omits `killSwitch`
// (docs/design/07-domain-wealth-know.md:438-450). Decision 7 gives that
// optionality a meaning, so a binding with neither must still compile.
export const noGateExtras: DomainBinding = {
  ...tradeBinding,
  gate: {
    irreversibleAction: "merge a pull request into the default branch",
    authoriser: "human, per pull request",
    autoDeny: [],
  },
};
