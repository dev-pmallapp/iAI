import type { Decision } from "iai-core";

export interface HookResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function toExitCode(decision: Decision): number {
  return decision.action === "block" ? 2 : 0;
}

// Renders a Decision into Claude Code's PreToolUse contract without calling
// process.exit, so the mapping stays a pure function the test suite can call
// directly. On block, the message is stderr-only and the process exits 2 —
// Claude Code feeds stderr back to the model so it learns why, per
// docs/design/09-security.md:130. Allow (with or without a redacted
// continuation) carries the decision as stdout JSON instead.
export function renderDecision(decision: Decision): HookResponse {
  const exitCode = toExitCode(decision);
  if (decision.action === "block") {
    return { exitCode, stdout: "", stderr: decision.message };
  }
  return { exitCode, stdout: JSON.stringify(decision), stderr: "" };
}
