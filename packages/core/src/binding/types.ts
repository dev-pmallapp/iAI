// Shared result shape for the binding layer (issue #32).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Same standing decision as classify/, guards/, gh/ and evidence/. Note that as
// of this task the `no-io-in-pure-modules` lint rule does NOT yet cover this
// directory — its scope predicate matches `classify`, `guards`, `gh` and
// `evidence` only. Widening it is NEVER-31.7 and lands in #272. Until then the
// purity of this file is a convention rather than an enforced property, which
// is exactly the gap #253 had to close for gh/, #261 closed for evidence/, and
// the reason #272 exists from the start of this Story rather than as a
// follow-up.
//
// WHY NOT `Decision`, AND WHY A THIRD COPY OF THE SAME FOUR LINES:
//
// This is Decision 10 of docs/design/stories/31.md, and it follows the argument
// already made verbatim at packages/core/src/evidence/types.ts:16-21.
//
// `Decision` from ../decision is an allow/warn/block verdict about whether an
// action may proceed. #33 uses it correctly for CLAIM-31.2, because "no pack is
// registered for this label" really is a blocking verdict about work that is
// about to happen. "This object cannot become a binding" is not: it is a
// construction error, and overloading `Decision` with it would put two
// unrelated meanings on one type.
//
// `GhResult` and `EvidenceResult` both have exactly the right shape, and both
// are deliberately not imported. Decision 10 of docs/design/stories/21.md split
// these directories along their dependency boundaries and evidence/ chose to
// duplicate rather than couple. Importing a result type across the boundary
// would make the split cosmetic. The duplication is four lines and it keeps the
// boundary real.
export type BindingResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function bindingOk<T>(value: T): BindingResult<T> {
  return { ok: true, value };
}

export function bindingFail<T>(reason: string): BindingResult<T> {
  return { ok: false, reason };
}
