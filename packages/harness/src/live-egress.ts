// The live rung's egress gate (Task #324, case 15 of
// docs/test-plans/293-plan.md, anchoring NEVER-293.10).
//
// THIS IS A SECURITY REQUIREMENT, NOT A TEST-DESIGN DETAIL. Decision (raised
// but not gated) at docs/design/stories/293.md:636-639 says so in terms:
// "The live rung is an egress question, not a test-design detail." A `USER/`
// -derived payload is `PRIVATE` by fail-safe default
// (packages/core/src/classify/path.ts's `USER/` rule, CLAIM-15.2) and
// reaches no cloud model UNDER ANY CONSENT — not granted, not withheld, not
// omitted, not malformed. That is Decision 2 of docs/design/stories/243.md,
// enforced in packages/core/src/guards/egress.ts and proved inert by
// NEVER-243.6 (packages/core/test/egress.test.ts, case 13 especially): the
// `consent` parameter accepted below is PROVABLY INERT for the PRIVATE/cloud
// cell this module exists to guard, on purpose, forever, unless a later
// Story explicitly revisits that Decision. Passing `{ granted: true }` here
// buys nothing for a PRIVATE payload against a cloud destination.
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import —
// same standing decision as packages/core/src/classify and
// packages/core/src/guards (CLAIM-15.6). This module only calls the two
// pure predicates it wraps.
//
// THE GATE THE LIVE RUNNER MUST CLEAR. `admitToLiveModel` is the single
// call a live runner makes before any payload reaches a cloud model. It
// returns a value ONLY when the payload is admitted; a blocked payload
// THROWS a typed `LiveEgressRefusal` instead of returning a boolean the
// caller could examine and ignore. There is no code path through this
// module that hands back "false" for a caller to skip past — the runner
// either receives an admitted result, or unwinds through the refusal, same
// as any other exception. `inspectLiveEgress` is provided alongside it for
// callers (tests, diagnostics) that want the class-and-decision pair
// without the throw.
import {
  CONSENT_WITHHELD,
  checkEgress,
  classify,
  type DataClass,
  type Destination,
  type EgressConsent,
  type EgressDecision,
} from "iai-core";

export interface LiveEgressInspection {
  readonly dataClass: DataClass;
  readonly decision: EgressDecision;
}

export interface LiveEgressAdmitted {
  readonly dataClass: DataClass;
  readonly decision: EgressDecision & { readonly action: "allow" };
}

/** Classify `payload`, check it against `destination`, and return BOTH the
 *  class and the decision — never merely one or the other. Never throws
 *  (`classify` and `checkEgress` are both total functions that fail closed
 *  internally); this is the inspection primitive `admitToLiveModel` below is
 *  built on, exposed separately for callers that need to observe a block
 *  without catching an exception. */
export function inspectLiveEgress(
  payload: unknown,
  destination: Destination,
  consent: EgressConsent = CONSENT_WITHHELD,
): LiveEgressInspection {
  const dataClass = classify(payload);
  const decision = checkEgress(payload, destination, consent);
  return { dataClass, decision };
}

/** Thrown by `admitToLiveModel` when the egress gate blocks. Carries the
 *  class and the decision that produced the refusal, so a caller that does
 *  catch it can still report why, without having to re-run the check. */
export class LiveEgressRefusal extends Error {
  readonly dataClass: DataClass;
  readonly decision: EgressDecision & { readonly action: "block" };

  constructor(dataClass: DataClass, decision: EgressDecision & { readonly action: "block" }) {
    super(decision.message);
    this.name = "LiveEgressRefusal";
    this.dataClass = dataClass;
    this.decision = decision;
  }
}

/** THE GATE. A live runner calls this immediately before handing `payload`
 *  to a cloud model at `destination`. On a block, this THROWS
 *  `LiveEgressRefusal` — it never returns a falsy value the caller could
 *  check and route around. On an allow, it returns the admitted result;
 *  there is nothing further to check because there is no other way to reach
 *  this return.
 *
 *  `consent` defaults to `CONSENT_WITHHELD`, matching `checkEgress`'s own
 *  fail-closed default (NEVER-15.8): an omitted consent is never treated as
 *  more permissive than an explicit withheld one. Passing a granted consent
 *  changes nothing for a PRIVATE payload against a cloud destination — see
 *  the module header. */
export function admitToLiveModel(
  payload: unknown,
  destination: Destination,
  consent: EgressConsent = CONSENT_WITHHELD,
): LiveEgressAdmitted {
  const { dataClass, decision } = inspectLiveEgress(payload, destination, consent);
  if (decision.action === "block") {
    throw new LiveEgressRefusal(dataClass, decision);
  }
  return { dataClass, decision: decision as EgressDecision & { readonly action: "allow" } };
}
