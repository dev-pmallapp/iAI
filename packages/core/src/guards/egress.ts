// The egress gate (issue #18, CLAIM-15.3, CLAIM-15.4, NEVER-15.7 through
// NEVER-15.9). This is the guard docs/design/stories/15.md calls "the block
// that makes iAI's 'never leaks' rule real" — the single predicate a payload
// must clear before it reaches any destination outside this device.
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Same standing decision as classify/classify.ts, guards/claim-lint.ts and
// guards/path-refs.ts. The whole function is wrapped in a top-level
// try/catch so it can never throw: any internal failure resolves `block`,
// per CLAIM-15.6 and NEVER-15.8's fail-closed constraint.
//
// The twelve-cell class-by-destination matrix, per Decision 3 of
// docs/design/stories/15.md:
//
//   | class    | on-device | cloud, consent withheld | cloud, consent granted |
//   |----------|-----------|--------------------------|-------------------------|
//   | PUBLIC   | allow     | allow                    | allow                   |
//   | INTERNAL | allow     | allow                    | allow                   |
//   | PRIVATE  | allow     | block                    | allow + redacted        |
//   | SECRET   | block     | block                    | block                   |
//
// `locality` is inert for SECRET (Decision 5): the on-device and cloud
// columns are identical, and consent changes nothing either. A SECRET block
// carries no `redacted` continuation — `EgressDecision` (decision.ts) makes
// that unrepresentable at the type level, so `blockEgress` is the only call
// this file ever makes for that row.
//
// Any `locality` outside "on-device" and "cloud" blocks before the class is
// even consulted, per NEVER-15.8 — an unrecognised destination never falls
// through to the (more permissive) cloud branch. A malformed `Destination`
// (missing vendor, a null vendor, a value read only off a polluted
// prototype, a getter that throws) blocks the same way: `vendor` and
// `locality` are read with `Object.prototype.hasOwnProperty.call` so an
// inherited property can never be mistaken for one the caller actually set,
// mirroring classify.ts's rationale for reading only own keys.
import { classify } from "../classify/index";
import { allowEgress, blockEgress, type EgressDecision } from "../decision";
import { deidentifyPrivatePayload } from "./redact";

export interface Destination {
  vendor: string;
  locality: "on-device" | "cloud";
  region?: string;
}

// The per-session consent snapshot (Decision 1). A VALUE handed in by the
// caller, never a lookup: `checkEgress` cannot go and ask a config layer or
// a store whether consent was granted, because that would be I/O, which
// CLAIM-15.6 forbids this module from performing. `granted` is the only
// field the matrix needs; there is no scope, expiry or vendor-specificity
// here because Decision 1 only requires ONE opt-in axis (cloud, this
// session) and inventing more would be a config layer this guard cannot
// have.
export interface EgressConsent {
  readonly granted: boolean;
}

// The default a caller gets for free by omitting the third argument. A
// forgotten consent argument must deny, never allow — this is the whole
// point of NEVER-15.8, and the reason the default lives in the signature
// (case 26 below) rather than in caller discipline.
export const CONSENT_WITHHELD: EgressConsent = Object.freeze({ granted: false });

const LOCALITY_BLOCK_MESSAGE =
  "egress blocked: destination locality is not recognised; a destination must " +
  'declare locality "on-device" or "cloud" before any egress decision can be made';

const DESTINATION_MALFORMED_MESSAGE =
  "egress blocked: destination is malformed (vendor is missing, not a string, or " +
  "not the destination's own property); a well-formed destination is required " +
  "before any egress decision can be made";

const SECRET_BLOCK_MESSAGE =
  "egress blocked: this payload contains SECRET-class data (a credential, token " +
  "or key), which may never leave this device, to any destination, on-device " +
  "included, with or without consent; keep it in .env or the OS keychain and " +
  "remove it from the payload before retrying";

const PRIVATE_CLOUD_WITHHELD_MESSAGE =
  "egress blocked: this payload contains PRIVATE-class data and this destination " +
  "is a cloud destination with no per-session opt-in on record; route this " +
  "request through an on-device destination instead, or obtain the per-session " +
  "cloud opt-in first";

function safeOwnString(destination: unknown, key: string): string | undefined {
  try {
    if (destination === null || destination === undefined) return undefined;
    if (typeof destination !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(destination, key)) return undefined;
    const value = (destination as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function isConsentGranted(consent: EgressConsent): boolean {
  try {
    return consent !== null && typeof consent === "object" && consent.granted === true;
  } catch {
    return false;
  }
}

function checkEgressInternal(
  payload: unknown,
  destination: Destination,
  consent: EgressConsent,
): EgressDecision {
  const locality = safeOwnString(destination, "locality");
  if (locality !== "on-device" && locality !== "cloud") {
    return blockEgress(LOCALITY_BLOCK_MESSAGE);
  }

  const vendor = safeOwnString(destination, "vendor");
  if (vendor === undefined || vendor.length === 0) {
    return blockEgress(DESTINATION_MALFORMED_MESSAGE);
  }

  const dataClass = classify(payload);

  if (dataClass === "SECRET") {
    return blockEgress(SECRET_BLOCK_MESSAGE);
  }

  if (dataClass === "PUBLIC" || dataClass === "INTERNAL") {
    return allowEgress(`egress allowed: ${dataClass} data may reach any destination`);
  }

  // dataClass === "PRIVATE" from here on.
  if (locality === "on-device") {
    return allowEgress("egress allowed: PRIVATE data may reach an on-device destination unredacted");
  }

  if (!isConsentGranted(consent)) {
    return blockEgress(PRIVATE_CLOUD_WITHHELD_MESSAGE);
  }

  const redacted = deidentifyPrivatePayload(payload);
  return allowEgress(
    "egress allowed: PRIVATE data de-identified for a cloud destination under the granted per-session opt-in",
    redacted,
  );
}

export function checkEgress(
  payload: unknown,
  destination: Destination,
  consent: EgressConsent = CONSENT_WITHHELD,
): EgressDecision {
  try {
    return checkEgressInternal(payload, destination, consent);
  } catch {
    return blockEgress("egress blocked: an internal error occurred while evaluating this egress; failing closed");
  }
}
