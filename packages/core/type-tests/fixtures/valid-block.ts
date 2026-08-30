// Positive control for case 30/31: a plain block decision with no
// redacted continuation is valid EgressDecision shape and must compile
// cleanly.
import type { EgressDecision } from "../../src/decision";

const valid: EgressDecision = { action: "block", message: "blocked" };

export { valid };
