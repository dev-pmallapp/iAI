export type Action = "allow" | "warn" | "block";

export interface Decision {
  action: Action;
  message: string;
}

export function decide(action: Action, message: string): Decision {
  return { action, message };
}
