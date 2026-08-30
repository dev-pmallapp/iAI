// Case 31 (P1, NEVER-15.7 + CLAIM-15.3): a block carrying a redacted
// continuation must not compile. This is the structural half of
// CLAIM-15.3; case 12 in packages/core/test is the runtime half.
import type { EgressDecision } from "../../src/decision";

// @ts-expect-error
const invalid: EgressDecision = { action: "block", message: "should not compile", redacted: { leaked: true } };

export { invalid };
