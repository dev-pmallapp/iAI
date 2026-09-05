// The `nullBinding` conformance fixture (issue #34, CLAIM-31.3).
//
// WHY THIS IS A REAL WORKSPACE PACKAGE AND NOT A FIXTURE FILE INSIDE CORE.
// Decision 12 of docs/design/stories/31.md. CLAIM-31.3
// (docs/milestones/M1.md:209-211) is a claim about PACKAGE BOUNDARIES: "a
// domain is registered without editing any file under packages/core/src". A
// fixture under packages/core/test would satisfy the assertion while proving
// nothing at all, because it would already be inside the package whose
// ignorance is the thing under test. The only way to prove core can register a
// domain it has never heard of is to hand it one from a package core does not
// import.
//
// THE FIXTURE IS DELIBERATELY EMPTY OF MEANING — docs/milestones/M1.md:198-200.
// There is no `null` domain in the design and there never will be. It exists so
// the abstraction can be exercised with no real domain attached.
//
// BUT IT MUST STILL BE VALID. It passes every rule #33 enforces, unmodified. A
// fixture that only registers because validation is lenient proves the opposite
// of what it claims: it would demonstrate that the registry accepts anything,
// not that the contract is satisfiable from outside. Each field below is
// therefore chosen to clear a specific rule in
// packages/core/src/binding/validate.ts, and the comments name which.
//
// THIS FILE MUST NOT EXPORT A TYPE NAMED `DomainId`, AND THAT IS A HARD
// CONSTRAINT RATHER THAN A PREFERENCE. All five packages/domain-*/src/index.ts
// export an interface of that name meaning "an object with one field"; core
// exports a type of that name meaning "a string" (binding/domain.ts:74). The
// two are mutually unassignable, and a barrel that star-exported both fails the
// build with TS2308 — the same collision the `Rung` double-declaration produced
// in #32, which packages/core/src/index.ts resolves by explicit re-export.
import type { DomainBinding } from "iai-core";

export const nullBinding: DomainBinding = {
  // Lowercase label-safe token: `DOMAIN_ID_RE` at validate.ts:78. NOT one of
  // the five known ids, which is the point — Decision 1 opened the union
  // precisely so this binding could exist without a core edit.
  id: "null",

  unitOfWork: {
    noun: "nothing",
    description: "The unit of work of the null domain, which has none.",
    // Prose by Decision 6, not a number. Recorded there as the reason `size`
    // is model-judged rather than tool-checked.
    minSize: "There is no smallest unit; the null domain does no work.",
    maxSize: "There is no largest unit; the null domain does no work.",
    leafSkill: "iai-null-noop",
  },

  verify: {
    rungs: [
      {
        id: "none",
        name: "No verification",
        entryCriteria: ["The null domain is never entered."],
        verifier: "tool-checked",
        // validate.ts:130 — index 0 must be reversible. "Index 0 is always the
        // safe default" (01-skill-hierarchy.md:204); a ladder whose first rung
        // is irreversible has no safe entry point.
        reversible: true,
      },
    ],
    // Must name a rung actually present in the ladder: validate.ts:146.
    defaultRung: "none",
    passing: "none",
    // The literal type `true`, not `boolean` (domain.ts). No domain may close
    // an issue without disk evidence, and the null domain is not an exception.
    evidenceRequired: true,
  },

  gate: {
    irreversibleAction: "There is no irreversible action in the null domain.",
    authoriser: "human",
    autoDeny: [],
    // `killSwitch` and `vetoAgent` are OMITTED, and omission is a statement.
    // Decision 7: an absent field asserts capability absence, which is how
    // `dev` already uses `vetoAgent`'s absence (04-domain-dev.md:149-152).
    // Present-but-empty is rejected by validate.ts so that "not yet decided"
    // cannot masquerade as "there is nothing to kill".
  },

  evidence: {
    kind: "none",
    // Inside the `## iai-` namespace AND one of the nine known sentinel names
    // — both rules, per Decision 5. A pack inventing `## iai-audit` would
    // write a comment no consumer could ever find.
    sentinel: "## iai-evidence",
    // Empty is how a binding declares no artifact path. `evidence` IS
    // artifact-bearing, so a template would be legal here; the null domain
    // writes nothing, so it declares nothing.
    pathTemplate: "",
    budgetChars: 1000,
    pinned: true,
  },

  labels: {
    // Must equal `domainLabelFor(id)` or validation fails: a binding cannot
    // claim one id and answer to a different label.
    namespace: "domain:null",
    extra: [],
  },
};
