// Positive control for case 30/31: an allow decision carrying a redacted
// continuation is valid EgressDecision shape and must compile cleanly.
import type { EgressDecision } from "../../src/decision";

const valid: EgressDecision = { action: "allow", message: "ok, de-identified", redacted: { safe: true } };

export { valid };
