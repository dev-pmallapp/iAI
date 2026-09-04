// The binding contract (issue #32, CLAIM-31.1).
//
// "A Tier-1 verb reads the issue's `domain:` label, loads that pack's binding,
//  and executes against the binding. There is no `if (domain === "trade")`
//  anywhere in Tier 1." — docs/design/01-skill-hierarchy.md:32-35
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Not yet covered by `no-io-in-pure-modules`; that is NEVER-31.7, in #272.
//
// THE SOURCE OF TRUTH IS docs/design/01-skill-hierarchy.md:185-233, and
// CLAIM-31.1 binds this file to it field-for-field. `binding-types.test.ts`
// parses that block at run time and asserts every field name it finds is
// declared here, rather than restating the list — a restatement would be a
// third copy to drift, which is the failure S1.4's case 15 was written to
// avoid.
//
// SEVEN TYPES, NOT FOUR. docs/milestones/M1.md:197 says "four sub-specs" and
// CLAIM-31.1 enumerates UnitSpec, VerifySpec, GateSpec and EvidenceSpec. That
// is a miscount, ruled on at the design-approval gate as Decision 3 of
// docs/design/stories/31.md:
//
//   - `Rung` is a full exported interface at :203-209 that every restatement
//     omits, and CLAIM-31.4 reads `verify.rungs[0].reversible`, so it must
//     exist and must be validated.
//   - `LabelDef` is referenced at :192 and at ARCHITECTURE.md:103 and is
//     DECLARED NOWHERE in this repository. CLAIM-31.1 asks to compile every
//     type from a file that does not contain one of them. Its shape is
//     inferred from the five `labels.extra` literals in the tree.
//
// EVERY FIELD IS `readonly`, AND THAT IS LOAD-BEARING RATHER THAN COSMETIC.
// Decision 11 validates at registration so that resolution is total: a binding
// that reached the registry is valid by construction. That only holds if it
// cannot be mutated afterwards. A mutable `verify.evidenceRequired` would let a
// caller flip a validated binding to an invalid one and every later resolution
// would hand out the invalid value — NEVER-31.9's exact failure. Assignability
// is unaffected: a mutable object literal is assignable to a readonly type, and
// `Rung[]` to `readonly Rung[]`, so every binding literal written in the design
// documents still compiles. `type-tests/fixtures/valid-documented-literal.ts`
// pins that against the worked example at :238-331.

// Decision 1 — THE ID UNION IS OPEN, AND THE DEVIATION IS RECORDED.
//
// CLAIM-31.1 requires the closed union of five at
// docs/design/01-skill-hierarchy.md:187. CLAIM-31.3
// (docs/milestones/M1.md:209-211) requires a domain to register "without
// editing any file under packages/core/src". The two are jointly unsatisfiable
// while the union is closed and lives here: a sixth domain cannot produce a
// conforming binding, and `nullBinding` — mandated by CLAIM-31.3,
// docs/milestones/M1.md:24 and PLAN.md:59 — has no legal id at all.
//
// `KnownDomainId` keeps all five literals, in the order they are declared at
// :187, so CLAIM-31.6's allowance for the literals to appear in core "in the
// `id` union type and test fixtures" is satisfied literally, and an editor
// still completes the five. `DomainId` widens for assignment only.
//
// Three alternatives were tried and rejected, recorded in Decision 1: typing
// `id: string` discards the five names CLAIM-31.6 expects to find; making
// `nullBinding` masquerade as `dev` makes the conformance suite lie about what
// it proves; and widening the union in core per new domain is the
// `if (domain === "trade")` failure in slower motion, which ARCHITECTURE.md:208
// names as the thing this whole abstraction exists to prevent.
export type KnownDomainId = "dev" | "trade" | "health" | "wealth" | "know";

// eslint-disable-next-line @typescript-eslint/ban-types -- `string & {}` is the
// documented idiom for an open union that still completes its known members.
export type DomainId = KnownDomainId | (string & {});

// The five, as data. This is the only place in packages/core/src where the
// domain literals may appear (CLAIM-31.6). It is documentation and a lookup for
// callers that want to ask "is this one of the packs the design names"; it is
// NOT a membership rule. #33 validates `id` as a shape, because membership is
// exactly what Decision 1 keeps open.
export const KNOWN_DOMAIN_IDS: readonly KnownDomainId[] = [
  "dev",
  "trade",
  "health",
  "wealth",
  "know",
];

// Referenced at docs/design/01-skill-hierarchy.md:192 and ARCHITECTURE.md:103;
// declared in neither. The shape is inferred from the five `labels.extra`
// literals — 01-skill-hierarchy.md:324-328, 04-domain-dev.md:130-134,
// 05-domain-trading.md:141-145, 06-domain-health.md:157-162,
// 07-domain-wealth-know.md:152-156 and :463-467 — all of which carry exactly
// `name` and `color`, American spelling, hex without a leading `#`.
//
// `description` is OPTIONAL and that is a recorded compromise, not an
// oversight. CONTRIBUTING.md:294-295 requires a new label to be added "with its
// colour and description", and scripts/bootstrap-github.sh:81 declares the
// three-field record `name|hex colour|description`. But no binding literal in
// the tree carries one, so making it required would fail all five documented
// bindings on their first validation. Optional keeps the documented literals
// legal and lets a pack supply the description the label scheme wants.
export interface LabelDef {
  readonly name: string;
  readonly color: string;
  readonly description?: string;
}

// docs/design/01-skill-hierarchy.md:195-201 — what a Task is in this domain.
//
// `minSize` and `maxSize` are prose, and they stay prose. Four documents call
// them thresholds the binding supplies — docs/milestones/M2.md:206-207, :220,
// docs/design/01-skill-hierarchy.md:64, docs/milestones/M5.md:95-97 — and the
// declared type is a sentence. Decision 6 refuses to invent a numeric or
// predicate form here against zero real callers, and records the consequence
// rather than hiding it: `size` is MODEL-JUDGED against a written bound, not
// tool-checked against a number. Adding a structured field beside the prose one
// later is a widening that keeps every existing binding compiling.
export interface UnitSpec {
  readonly noun: string;
  readonly description: string;
  readonly minSize: string;
  readonly maxSize: string;
  readonly leafSkill: string;
}

// docs/design/01-skill-hierarchy.md:207 and :56 both give the three verifier
// classes in the hyphenated form, and all twenty rung literals in the tree use
// it. docs/design/verification-pass.md rows 111, 148, 413, 615 and 712 give
// `deterministic | judged | attested` instead and mark them `confirmed` — that
// is the upstream LifeOS vocabulary quietly propagated into five rows, and it
// is a documentation defect rather than an alternative spec.
export type RungVerifier = "tool-checked" | "model-judged" | "human-attested";

// docs/design/01-skill-hierarchy.md:203-209.
//
// ORDERING IS BY ARRAY INDEX AND THERE IS NO SUCCESSOR FIELD. `:204` says
// "ordered; index 0 is always the safe default", which CLAIM-31.4 depends on.
// Decision 6 records what that costs downstream: CLAIM-111.4
// (docs/milestones/M5.md:92-94) requires "a test that enumerates every
// promotion transition in the binding and requires the `clinician-review`
// successor set to be empty", and against an array the last element's successor
// set is trivially empty — so the claim is VACUOUS as written and M5 must
// either add a `promotesTo` field or rewrite it against the ordering.
//
// `entryCriteria` is prose for the same reason `minSize` is. CLAIM-111.3
// (docs/milestones/M5.md:89-91) requires each criterion to be "evaluated as a
// predicate over disk state"; a string of English cannot be evaluated, only
// asserted about. Named in Decision 6, deferred to M5.
export interface Rung {
  readonly id: string;
  readonly name: string;
  readonly entryCriteria: readonly string[];
  readonly verifier: RungVerifier;
  readonly reversible: boolean;
}

// docs/design/01-skill-hierarchy.md:211-216.
//
// `evidenceRequired` IS THE LITERAL TYPE `true`, NOT `boolean`, exactly as
// declared at :215. `false` is therefore a compile error, which makes
// CLAIM-31.4's second half unreachable from well-typed code — and #33
// implements the runtime check anyway, per Decision 4, for the three paths the
// type system does not see: a pack authored in JavaScript, a binding that
// crossed a `JSON.parse` or a markdown parser, and an `as` cast. Do not widen
// this to `boolean` to make the check reachable; the negative fixture is built
// through a cast instead.
//
// There is no demotion surface. CLAIM-137.3 (docs/milestones/M6.md:87-89) and
// CLAIM-147.5 (:175-177) both demote a Story's rung and no field expresses it.
// Named in Decision 6, deferred to M6.
export interface VerifySpec {
  readonly rungs: readonly Rung[];
  readonly defaultRung: string;
  readonly passing: string;
  readonly evidenceRequired: true;
}

// docs/design/01-skill-hierarchy.md:218-224 — the irreversible action and who
// may authorise it.
//
// `killSwitch` and `vetoAgent` are optional as declared. Decision 7 gives that
// optionality a MEANING rather than leaving it ambiguous: an absent field is
// the domain asserting capability absence, which is how `dev` already uses
// `vetoAgent`'s absence deliberately at docs/design/04-domain-dev.md:149-152.
// docs/milestones/M8.md:127-130 (CLAIM-182.3) requires a test per inventory row
// proving "its kill switch or its capability absence", and this is the reading
// that makes both testable from one field.
//
// Note that the bindings and docs/design/09-security.md:355-362 disagree about
// kill switches in FOUR DOMAINS OF FIVE — `wealth` declares one where the
// inventory says the control is capability absence, and `know` omits one where
// the inventory supplies it. That is each pack's Story to resolve; the field is
// declared as specified.
//
// `autoDeny` is prose, per Decision 6. CLAIM-157.4 (docs/milestones/M6.md:253-256)
// requires each condition to independently refuse an order and name itself, and
// :269 makes the array ORDER normative — `rung != live` first so the common
// case denies cheaply. Order is preserved here; evaluation is M6's.
export interface GateSpec {
  readonly irreversibleAction: string;
  readonly authoriser: string;
  readonly killSwitch?: string;
  readonly vetoAgent?: string;
  readonly autoDeny: readonly string[];
}

// docs/design/01-skill-hierarchy.md:226-232 — the artifact, its sentinel and
// its budget.
//
// #33 validates all four rules of CLAIM-31.5 against the constants S1.4
// exported for exactly this purpose — SENTINEL_NAMESPACE_PREFIX,
// isKnownSentinelName, ARTIFACT_BEARING_SENTINELS and BUDGET_CHARS, each marked
// `EXPORTED FOR S1.5` at their declaration. Decision 11 of
// docs/design/stories/26.md exists so this directory never restates them, and
// case 13 greps for the literals to prove it did not.
export interface EvidenceSpec {
  readonly kind: string;
  readonly sentinel: string;
  readonly pathTemplate: string;
  readonly budgetChars: number;
  readonly pinned: boolean;
}

// docs/design/01-skill-hierarchy.md:186-193 — the central type.
//
// `labels` is an INLINE anonymous object type, not a named sub-spec, exactly as
// declared at :192. It is left inline because CLAIM-31.1 binds this file to
// that declaration field-for-field; naming it would be a nicety that changes
// what the claim is checked against.
export interface DomainBinding {
  readonly id: DomainId;
  readonly unitOfWork: UnitSpec;
  readonly verify: VerifySpec;
  readonly gate: GateSpec;
  readonly evidence: EvidenceSpec;
  readonly labels: { readonly namespace: string; readonly extra: readonly LabelDef[] };
}
