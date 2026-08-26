import type { Decision } from "iai-core";

export function toExitCode(decision: Decision): number {
  return decision.action === "block" ? 2 : 0;
}
