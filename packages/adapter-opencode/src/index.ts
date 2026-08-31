import type { Decision } from "iai-core";

export interface ToolOutput {
  args: unknown;
}

// `output` is an out-parameter, per docs/design/08-dual-target.md:165-166:
// mutate it in place and return nothing, since opencode reads the mutation
// off the same object it passed in. `block` throws regardless of `output`.
// The redacted continuation only ever replaces `output.args` — the raw
// value is never assigned once `decision.redacted` is present — per
// docs/design/09-security.md:132.
export function applyDecision(decision: Decision, output?: ToolOutput): void {
  if (decision.action === "block") {
    throw new Error(decision.message);
  }
  if (decision.action === "allow" && decision.redacted !== undefined && output !== undefined) {
    output.args = decision.redacted;
  }
}
