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
// docs/design/stories/15.md as revised by Decision 2 of
// docs/design/stories/243.md (#243, #245):
//
//   | class    | on-device | cloud, consent withheld | cloud, consent granted |
//   |----------|-----------|--------------------------|-------------------------|
//   | PUBLIC   | allow     | allow                    | allow                   |
//   | INTERNAL | allow     | allow                    | allow                   |
//   | PRIVATE  | allow     | block                    | block                   |
//   | SECRET   | block     | block                    | block                   |
//
// PRIVATE/cloud/granted used to be "allow + redacted" (S1.2, CLAIM-15.4). It
// is now "block", unconditionally. #243 ruled that no PRIVATE data reaches a
// cloud vendor, ever — not de-identified, not under a per-session opt-in, not
// under any condition. See the WHY block above `EgressConsent` below for
// what that means for the retained `consent` parameter.
//
// `locality` is inert for SECRET (Decision 5 of stories/15.md): the
// on-device and cloud columns are identical, and consent changes nothing
// either. A SECRET block carries no `redacted` continuation —
// `EgressDecision` (decision.ts) makes that unrepresentable at the type
// level, so `blockEgress` is the only call this file ever makes for that
// row. PRIVATE/cloud now shares that same shape: every cloud cell for
// PRIVATE is a plain `blockEgress`, with no `redacted` continuation either,
// because this module no longer hands any PRIVATE payload to the
// de-identification projection in guards/redact.ts before reaching a cloud
// destination — see CLAIM-243.4, verified by grep rather than by reading
// this comment: nothing in this file, including this sentence, spells out
// that projection's export name.
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

export interface Destination {
  vendor: string;
  locality: "on-device" | "cloud";
  region?: string;
}

// The per-session consent snapshot (Decision 1 of stories/15.md). A VALUE
// handed in by the caller, never a lookup: `checkEgress` cannot go and ask a
// config layer or a store whether consent was granted, because that would be
// I/O, which CLAIM-15.6 forbids this module from performing. `granted` is
// the only field the matrix needs; there is no scope, expiry or
// vendor-specificity here because Decision 1 only requires ONE opt-in axis
// (cloud, this session) and inventing more would be a config layer this
// guard cannot have.
//
// WHY THIS TYPE, `CONSENT_WITHHELD` AND THE THIRD PARAMETER ARE STILL HERE,
// EVEN THOUGH NOTHING IN THIS FILE NOW BRANCHES ON `granted`:
//
// Decision 2 of docs/design/stories/243.md ruled to retain the consent
// mechanism rather than delete it, and to make it PROVABLY INERT instead.
// Under the strict posture #243 adopted, no consent value — granted,
// withheld, omitted, or malformed — can change `checkEgress`'s verdict for a
// PRIVATE payload against a cloud destination. It is `block`, full stop.
//
// That is deliberately more dangerous than deletion would have been. A
// future maintainer who reads `consent: EgressConsent` still threaded
// through this module's signature will reasonably infer that granting it
// does something. It does not, and it must never be made to again: the
// moment a `consent`-gated branch reappears on the PRIVATE/cloud cell, this
// module has reopened the exact leak path #243 closed. `NEVER-243.6`
// (see packages/core/test/egress.test.ts, case 13 especially) asserts
// inertness over the whole consent corpus for exactly this reason — so that
// re-enabling this path fails a test that says in plain terms why it must
// not be re-enabled, rather than failing silently or not at all.
//
// The parameter earns its keep for the classes it was never gating in the
// first place (PUBLIC and INTERNAL allow regardless of consent, same as
// before) and for whatever consent may legitimately affect later; it is kept
// so that signature remains stable for that future, honest use. It buys
// nothing for PRIVATE, on purpose, forever, unless a later Story explicitly
// revisits Decision 2.
export interface EgressConsent {
  readonly granted: boolean;
}

// The default a caller gets for free by omitting the third argument. A
// forgotten consent argument must deny, never allow — this is the whole
// point of NEVER-15.8, and the reason the default lives in the signature
// (case 26 below) rather than in caller discipline. Since #243, "deny" is
// the only outcome PRIVATE/cloud ever has anyway, but PUBLIC and INTERNAL
// still allow regardless, so the default keeps mattering for what it always
// meant: an omitted consent is never treated as more permissive than an
// explicit withheld one.
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

// Per Decision 2 and Decision 3 of docs/design/stories/243.md: PRIVATE data
// never reaches a cloud vendor, so this message no longer offers "or obtain
// the opt-in" as an alternative — there is no consent value that changes
// this outcome. The only route named is a reroute to a local model; no
// specific model is named because none has been chosen yet (Decision 3
// files that absence as a blocking dependency on M5, tracked as #247).
const PRIVATE_CLOUD_BLOCK_MESSAGE =
  "egress blocked: this payload contains PRIVATE-class data, which may never " +
  "reach a cloud vendor, de-identified or not, under any consent state; route " +
  "this request through an on-device destination running a local model instead";

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

function checkEgressInternal(
  payload: unknown,
  destination: Destination,
  // Deliberately unused. See the WHY block above `EgressConsent` for why
  // this parameter is retained but must never gate an outcome here — this
  // signature is the one place a maintainer could quietly wire it back in.
  _consent: EgressConsent,
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

  // dataClass === "PRIVATE" from here on. `locality === "cloud"` blocks
  // unconditionally here — `_consent` is never consulted, per Decision 2 of
  // docs/design/stories/243.md. See NEVER-243.6 (packages/core/test/
  // egress.test.ts) for the tests that make this inertness provable rather
  // than merely stated.
  if (locality === "on-device") {
    return allowEgress("egress allowed: PRIVATE data may reach an on-device destination unredacted");
  }

  return blockEgress(PRIVATE_CLOUD_BLOCK_MESSAGE);
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
