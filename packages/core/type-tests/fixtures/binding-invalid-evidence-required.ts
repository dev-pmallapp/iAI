// Case 2 (P0, CLAIM-31.1): `evidenceRequired` is the literal type `true`, per
// docs/design/01-skill-hierarchy.md:215, so `false` is a compile error rather
// than merely an untested branch.
//
// This fixture is why CLAIM-31.4's second half is unreachable from well-typed
// code, and therefore why #33 builds its runtime fixture through a cast
// (Decision 4). Widening this field to `boolean` to make the runtime check
// reachable would delete the protection this fixture proves exists.
import type { VerifySpec } from "../../src/binding/domain";

const verify: VerifySpec = {
  rungs: [
    { id: "compile", name: "Compile", entryCriteria: [], verifier: "tool-checked", reversible: true },
  ],
  defaultRung: "compile",
  passing: "it builds",
  // @ts-expect-error
  evidenceRequired: false,
};

export { verify };
