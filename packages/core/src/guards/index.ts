export { checkCommitPrefix, COMMIT_PREFIX_RE } from "./commit-prefix";
export {
  CLAIM_ID_RE,
  ISC_ALLOWED_PATHS,
  formatClaimId,
  isIscAllowed,
  lintClaimDocs,
  mapStory,
  parseClaimId,
} from "./claim-lint";
export type {
  ClaimDoc,
  ClaimId,
  ClaimRuleId,
  ClaimSeverity,
  ClaimViolation,
} from "./claim-lint";
export { PATH_ALLOW_LIST, isPathAllowed } from "./path-allowlist";
export type { AllowReason, AllowedPath } from "./path-allowlist";
export { extractPathRefs, lintPathRefs } from "./path-refs";
export type { PathRefOptions } from "./path-refs";
export { CONSENT_WITHHELD, checkEgress } from "./egress";
export type { Destination, EgressConsent } from "./egress";
// Retained per Decision 1 of docs/design/stories/243.md: no caller on any
// egress path (CLAIM-243.4), kept exported for M5's locally-rendered
// clinician brief, which never egresses.
export { deidentifyPrivatePayload } from "./redact";
export { checkSpend } from "./spend";
export { checkRiskMandate } from "./risk-mandate";
export type { Rung } from "./risk-mandate";
