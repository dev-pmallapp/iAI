import { decide, type Decision } from "../decision";

// Pure comparison only, per Decision 8 of docs/design/stories/15.md:
// docs/design/09-security.md:221 says the spend limit "is a number, not a
// judgement", so this predicate is a comparison, not a gate. It takes
// integer minor units the caller has already parsed — the strict money
// parser and the threshold value itself both belong to later milestones
// (docs/milestones/M6.md:34-36 owns the parser, docs/milestones/M7.md:64
// owns the wealth spend gate). No config is read here and none could be:
// this module does no I/O.
//
// The equality boundary: docs/design/03-workflow.md:244 triggers the gate on
// an outflow "above the configured limit". An amount exactly at the
// threshold is not above it, so equality allows. This is a WHY worth stating
// because the natural instinct is to fail closed at the boundary; the
// governing document is explicit that "above" excludes "equal to".
export function checkSpend(amountMinor: bigint, thresholdMinor: bigint): Decision {
  // Fail closed on incoherent input: a negative amount or a negative
  // threshold has no sensible reading as "an outflow of that size" or "a
  // limit of that size", so this blocks rather than falling through to the
  // numeric comparison below, which would otherwise let a negative amount
  // slip under any non-negative threshold.
  if (amountMinor < 0n || thresholdMinor < 0n) {
    return decide(
      "block",
      `checkSpend received a negative value (amount=${amountMinor}, threshold=${thresholdMinor}); ` +
        "negative amounts and thresholds are incoherent and block rather than compare",
    );
  }

  if (amountMinor > thresholdMinor) {
    return decide(
      "block",
      `spend of ${amountMinor} minor units exceeds the threshold of ${thresholdMinor} minor units`,
    );
  }

  return decide(
    "allow",
    `spend of ${amountMinor} minor units does not exceed the threshold of ${thresholdMinor} minor units`,
  );
}
