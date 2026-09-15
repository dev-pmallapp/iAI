// Tests for Task #324, case 15 of docs/test-plans/293-plan.md, anchoring
// NEVER-293.10: "The live runner refuses a PRIVATE-class payload."
//
// Corpus: synthetic. A `USER/`-derived payload cannot be committed to a
// public tree (that is the whole point of `USER/` being gitignored,
// packages/core/src/classify/path.ts), so the PRIVATE fixture here is a
// synthetic stand-in shaped like one, never a real one.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  classify,
  classifyPath,
  CONSENT_WITHHELD,
  DATA_CLASSES,
  type DataClass,
  type Destination,
  type EgressConsent,
} from "iai-core";
import { admitToLiveModel, inspectLiveEgress, LiveEgressRefusal } from "../src/index";

const CLOUD: Destination = { vendor: "anthropic", locality: "cloud" };
const CONSENT_GRANTED: EgressConsent = { granted: true };

// A payload per class, over the same corpus shape egress.test.ts uses, so
// this file's fixtures classify exactly as documented rather than by
// coincidence.
const PAYLOAD_BY_CLASS: Record<DataClass, unknown> = {
  PUBLIC: { ticker: "AAPL", broker: "Schwab", doi: "10.1000/xyz" },
  INTERNAL: { design_doc: "docs/design/09-security.md", issue_title: "egress guard" },
  PRIVATE: { ldl: 130, account_balance: 1200 },
  SECRET: { api_key: "sk-abcdefgh12345678" },
};

// A `USER/`-derived payload: PRIVATE by the fail-safe path rule
// (packages/core/src/classify/path.ts), never a real private-repo path.
const USER_DERIVED_PAYLOAD = { source_path: "USER/HEALTH/labs.yaml", contents: "synthetic-only, not a real record" };

describe("inspectLiveEgress (P0, NEVER-293.10): all 4 classes, denominator read from the classifier", () => {
  // DENOMINATOR NON-ZERO FIRST.
  test("0. DATA_CLASSES is non-empty, and the corpus below covers every member", () => {
    expect(DATA_CLASSES.length).toBeGreaterThan(0);
    expect(Object.keys(PAYLOAD_BY_CLASS).length).toBe(DATA_CLASSES.length);
  });

  // Documented matrix, per packages/core/src/guards/egress.ts's header
  // comment: PUBLIC/INTERNAL allow to cloud regardless of consent; PRIVATE
  // and SECRET block to cloud regardless of consent.
  const EXPECTED_CLOUD_ACTION: Record<DataClass, "allow" | "block"> = {
    PUBLIC: "allow",
    INTERNAL: "allow",
    PRIVATE: "block",
    SECRET: "block",
  };

  for (const dataClass of DATA_CLASSES) {
    test(`${dataClass}: classifies to itself, and cloud decision matches the documented matrix`, () => {
      const payload = PAYLOAD_BY_CLASS[dataClass];
      const inspection = inspectLiveEgress(payload, CLOUD, CONSENT_WITHHELD);
      expect(inspection.dataClass).toBe(dataClass);
      expect(inspection.decision.action).toBe(EXPECTED_CLOUD_ACTION[dataClass]);
    });
  }

  test("all 4 classes were exercised, not a silently short loop", () => {
    let count = 0;
    for (const dataClass of DATA_CLASSES) {
      count += 1;
      expect(EXPECTED_CLOUD_ACTION[dataClass]).toBeDefined();
    }
    expect(count).toBe(DATA_CLASSES.length);
    expect(count).toBe(4);
  });
});

describe("admitToLiveModel (P0, NEVER-293.10): the live gate allows PUBLIC to cloud", () => {
  test("a PUBLIC payload is admitted, not refused (the block is not vacuous)", () => {
    const admitted = admitToLiveModel(PAYLOAD_BY_CLASS.PUBLIC, CLOUD, CONSENT_WITHHELD);
    expect(admitted.dataClass).toBe("PUBLIC");
    expect(admitted.decision.action).toBe("allow");
  });
});

// Issue #336. `classify()` (packages/core/src/classify/classify.ts) imports
// only `./levels` and `./recognisers` -- it never imports `./path`, so
// `classifyPath` and its `USER/` root rule (packages/core/src/classify/
// path.ts) are NOT consulted by `classify()`. The test below this comment
// used to be named "classify resolves USER/-derived content to PRIVATE",
// which read as if the `USER/` rule were the reason. It is not: the
// `USER_DERIVED_PAYLOAD` object has keys `source_path` and `contents`,
// neither of which `classifyKeyName` recognises, so it lands on PRIVATE by
// the unrecognised-key fail-safe default (the same default that resolves an
// empty object, `null`, or any other unrecognised shape to PRIVATE) --
// exactly as if the string "USER/HEALTH/labs.yaml" were replaced by "x". The
// control payload below makes that swap explicit.
//
// This does NOT invalidate case 15 of docs/test-plans/293-plan.md ("The live
// runner refuses a PRIVATE-class payload"). That case's own wording is
// "`USER/`-derived content is `PRIVATE` by fail-safe default", which is
// precisely the unrecognised-key rule demonstrated here -- case 15 passes
// honestly and continues to do so.
//
// NEVER-293.10 ("The live runner refuses a PRIVATE-class payload") also
// still holds: the guard in packages/core/src/guards/egress.ts blocks
// everything it is handed that classifies PRIVATE, and it is handed a
// PRIVATE class here -- just not for the reason its class name might
// suggest. The gap #336 identifies is in CLASSIFICATION (`classify()` not
// consulting `classifyPath`), not in the GUARD, which does exactly what it
// is documented to do with whatever class it receives.
//
// No caller is known to exploit this today, and the live rung itself stays
// protected: its fixture (`USER_DERIVED_PAYLOAD` above) is a declared
// synthetic literal with no redirection path from a real `USER/`-rooted
// source, so nothing here routes real private-repo content anywhere.
describe("admitToLiveModel (P0, NEVER-293.10): a USER/-derived payload classifies PRIVATE by the unrecognised-key fail-safe default, NOT the USER/ path rule (issue #336)", () => {
  test("classify resolves USER/-derived content to PRIVATE by the unrecognised-key fail-safe default, not the USER/ path rule", () => {
    // The payload this whole file's live-gate tests exercise: PRIVATE.
    const inspection = inspectLiveEgress(USER_DERIVED_PAYLOAD, CLOUD, CONSENT_WITHHELD);
    expect(inspection.dataClass).toBe("PRIVATE");

    // THE CONTROL: a payload with an unrecognised key and no "USER/"
    // anywhere in it classifies to the exact same answer. If the `USER/`
    // rule were what produced PRIVATE above, this payload -- which never
    // mentions `USER/` -- would have no reason to land on PRIVATE too.
    const NO_USER_ANYWHERE_PAYLOAD = { zzz_unrelated: "x" };
    expect(classify(NO_USER_ANYWHERE_PAYLOAD)).toBe(classify(USER_DERIVED_PAYLOAD));
    expect(classify(NO_USER_ANYWHERE_PAYLOAD)).toBe("PRIVATE");

    // The `USER/` rule EXISTS: classifyPath (packages/core/src/classify/
    // path.ts) resolves a `USER/`-rooted path to PRIVATE on its own.
    expect(classifyPath("USER/HEALTH/labs.yaml")).toBe("PRIVATE");

    // ...but `classify()` never reaches it: the identical string, placed at
    // a key `classifyKeyName` does not recognise, resolves INTERNAL --
    // content shaped exactly like the PRIVATE fixture above would clear a
    // cloud destination under the documented matrix (PUBLIC/INTERNAL allow,
    // PRIVATE/SECRET block) if it arrived through `classify()` this way.
    expect(classify({ work_state: "USER/HEALTH/labs.yaml" })).toBe("INTERNAL");
  });

  // TRIPWIRE for #336. If someone later wires `classifyPath` into
  // `classify()` (e.g. adds `import { classifyPath } from "./path";` to
  // classify.ts), this assertion goes red -- forcing a deliberate revisit of
  // this test file and the case-15 record in docs/test-plans/293-plan.md,
  // rather than silently changing what this file's green has meant.
  test("tripwire: classify.ts does not import ./path (issue #336) -- update this file and 293-plan.md case 15 deliberately if it ever does", () => {
    const classifySource = readFileSync(
      new URL("../../core/src/classify/classify.ts", import.meta.url),
      "utf8",
    );
    expect(classifySource.length).toBeGreaterThan(0);
    expect(classifySource).not.toMatch(/from\s+["']\.\/path["']/);
  });
});

describe("admitToLiveModel (P0, NEVER-293.10): USER/-derived PRIVATE content reaches no cloud model under any consent", () => {
  test("consent withheld: the gate throws LiveEgressRefusal, never returns", () => {
    expect(() => admitToLiveModel(USER_DERIVED_PAYLOAD, CLOUD, CONSENT_WITHHELD)).toThrow(LiveEgressRefusal);
  });

  test("consent GRANTED: the gate STILL throws LiveEgressRefusal — consent does not unlock it", () => {
    expect(() => admitToLiveModel(USER_DERIVED_PAYLOAD, CLOUD, CONSENT_GRANTED)).toThrow(LiveEgressRefusal);
  });

  test("consent omitted entirely: the gate still throws (fail-closed default)", () => {
    expect(() => admitToLiveModel(USER_DERIVED_PAYLOAD, CLOUD)).toThrow(LiveEgressRefusal);
  });

  test("the refusal names the class and the decision, over both consent states", () => {
    for (const consent of [CONSENT_WITHHELD, CONSENT_GRANTED]) {
      let caught: unknown;
      try {
        admitToLiveModel(USER_DERIVED_PAYLOAD, CLOUD, consent);
        throw new Error("admitToLiveModel did not throw; the gate failed to block");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LiveEgressRefusal);
      const refusal = caught as LiveEgressRefusal;
      expect(refusal.dataClass).toBe("PRIVATE");
      expect(refusal.decision.action).toBe("block");
    }
  });

  test("2/2 across both consent states: allowCount stays 0 -- no consent value produces an admitted result", () => {
    let admittedCount = 0;
    for (const consent of [CONSENT_WITHHELD, CONSENT_GRANTED]) {
      try {
        admitToLiveModel(USER_DERIVED_PAYLOAD, CLOUD, consent);
        admittedCount += 1;
      } catch {
        // expected: a refusal, not an admission.
      }
    }
    expect(admittedCount).toBe(0);
  });
});

describe("admitToLiveModel (P0, NEVER-293.10): the gate cannot be bypassed by ignoring its result", () => {
  // THE SHAPE CHOSEN: a block THROWS rather than returning a boolean a
  // caller could examine and skip past. This test demonstrates that a
  // caller who calls `admitToLiveModel` and then writes code AS IF it had
  // returned normally can never reach that code on a block -- the throw
  // unwinds straight past it, and the only way to "proceed anyway" would be
  // to wrap the call in a try/catch and explicitly disregard the caught
  // `LiveEgressRefusal`, which is a visible, greppable act, not an ignored
  // return value.
  test("code written after the call, with no exception handling, never executes when the payload is PRIVATE", () => {
    let reachedAfterCall = false;
    expect(() => {
      admitToLiveModel(USER_DERIVED_PAYLOAD, CLOUD, CONSENT_GRANTED);
      // If admitToLiveModel returned instead of throwing, this line would
      // run and the payload would proceed to a cloud model.
      reachedAfterCall = true;
    }).toThrow(LiveEgressRefusal);
    expect(reachedAfterCall).toBe(false);
  });

  test("there is no boolean return value to ignore: the function's return type carries no field named allowed/ok/blocked that a caller could fail to check", () => {
    const admitted = admitToLiveModel(PAYLOAD_BY_CLASS.PUBLIC, CLOUD, CONSENT_WITHHELD);
    // The only way to obtain a result at all is for the gate to have already
    // allowed it -- `decision.action` is narrowed to the literal "allow" at
    // the type level for anything admitToLiveModel returns without
    // throwing, so there is no reachable "block" value to inspect and
    // ignore.
    expect(admitted.decision.action).toBe("allow");
    expect("allowed" in admitted).toBe(false);
    expect("ok" in admitted).toBe(false);
  });
});
