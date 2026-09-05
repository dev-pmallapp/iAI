export * from "./decision";
export * from "./guards/index";
export * from "./classify/index";
export * from "./gh/index";
export * from "./evidence/index";
export * from "./binding/index";

// `Rung` IS DECLARED TWICE IN THIS PACKAGE, and the ambiguity is resolved here
// deliberately rather than by dropping an export.
//
// guards/risk-mandate.ts:13 has had `type Rung = "research" | "paper" | "live"`
// since S1.2 — a rung IDENTIFIER, local to `checkRiskMandate`, exported from
// guards/index.ts and imported by no caller anywhere in the tree.
// binding/domain.ts:142 declares the `Rung` of
// docs/design/01-skill-hierarchy.md:203-209 — a rung DEFINITION object, and one
// of the seven types CLAIM-31.1 binds this Story to by name. They are different
// things wearing the same word.
//
// An explicit re-export beats `export *`, so at the package root `Rung` means
// the contract type. Nothing breaks: no file outside guards/ imports the older
// one, and it remains reachable both from guards/index.ts and, aliased, here.
// Renaming either declaration would edit a claim's vocabulary — CLAIM-31.1 for
// one, S1.2's shipped surface for the other — so neither is renamed.
//
// The older union is also three members wide where
// docs/design/03-workflow.md:125-126 requires every domain to declare exactly
// four rungs, and trade's ladder is research/backtest/paper/live. That is a
// latent defect in `checkRiskMandate`, not this Story's to fix; recorded so it
// is found deliberately rather than by someone assuming this alias blessed it.
export type { Rung } from "./binding/domain";
export type { Rung as RiskMandateRung } from "./guards/risk-mandate";
