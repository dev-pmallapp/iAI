// Case 30 (P1, NEVER-15.7): a "warn" egress decision must not compile.
// EgressDecision has no member whose action is "warn", so this assignment
// is a type error, not merely an untested branch.
import type { EgressDecision } from "../../src/decision";

// @ts-expect-error
const invalid: EgressDecision = { action: "warn", message: "should not compile" };

export { invalid };
