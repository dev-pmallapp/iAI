import type { Decision } from "iai-core";

export function applyDecision(decision: Decision): void {
  if (decision.action === "block") {
    throw new Error(decision.message);
  }
}
