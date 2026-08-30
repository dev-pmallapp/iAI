// The decision object every guard returns. Adapters translate it into their
// host's dialect — exit 2 on Claude Code, `throw` on opencode — per
// docs/design/08-dual-target.md:90-93.
//
// This lives in its own module rather than in index.ts so that guards can
// import it without importing the package root, which re-exports the guards.
// That cycle resolves under Bun but is not a foundation to put four more
// guards on.
//
// `redacted` is optional and additive: it was published as part of the
// three-field shape at docs/design/09-security.md:116-120 before this Story
// shipped the narrower two-field `decide()`, so widening rather than
// replacing keeps every existing call site compiling unchanged.
export type Action = "allow" | "warn" | "block";

export interface Decision {
  action: Action;
  message: string;
  redacted?: unknown;
}

export function decide(action: Action, message: string): Decision {
  return { action, message };
}

// `EgressDecision` narrows `Decision` for `checkEgress` alone, per Decision 3
// of docs/design/stories/15.md as amended by the Q2 gate ruling. `warn` and a
// `block` carrying `redacted` are not merely untested on this path — the
// union makes them unrepresentable, so a future change cannot reintroduce
// either by accident. `Action` itself keeps `warn`: the gate left open
// whether any other guard ever needs it, so the narrowing stays local to
// egress rather than removing the member globally. Both arms remain
// assignable to the wider `Decision`, so `toExitCode` and `applyDecision`
// keep taking `Decision` without narrowing their parameter types.
export type EgressDecision =
  | { readonly action: "allow"; readonly message: string; readonly redacted?: unknown }
  | { readonly action: "block"; readonly message: string };

export function allowEgress(message: string, redacted?: unknown): EgressDecision {
  return { action: "allow", message, redacted };
}

export function blockEgress(message: string): EgressDecision {
  return { action: "block", message };
}
