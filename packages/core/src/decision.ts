// The decision object every guard returns. Adapters translate it into their
// host's dialect — exit 2 on Claude Code, `throw` on opencode — per
// docs/design/08-dual-target.md:90-93.
//
// This lives in its own module rather than in index.ts so that guards can
// import it without importing the package root, which re-exports the guards.
// That cycle resolves under Bun but is not a foundation to put four more
// guards on.
export type Action = "allow" | "warn" | "block";

export interface Decision {
  action: Action;
  message: string;
}

export function decide(action: Action, message: string): Decision {
  return { action, message };
}
