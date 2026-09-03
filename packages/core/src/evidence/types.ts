// Shared result shape for the evidence engine (issue #29).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// The directory is still outside the `no-io-in-pure-modules` scope until #261
// (NEVER-26.7).
//
// WHY NOT `Decision`, AND WHY NOT `GhResult`:
//
// `Decision` from ../decision is an allow/warn/block verdict about whether an
// action may proceed. #28 uses it correctly for CLAIM-26.3, because "the
// required sentinel is absent" really is a blocking verdict. A rendering
// failure is not: "this input cannot become a comment body" is a construction
// error, and overloading `Decision` with it would put two unrelated meanings
// on one type.
//
// `GhResult` from ../gh/types has exactly the right shape, and is deliberately
// not imported. Decision 10 of docs/design/stories/21.md split gh/ and
// evidence/ along the pure/impure line and the two directories share no
// dependency in either direction; importing a type across that boundary would
// make the split cosmetic. The duplication is four lines and it keeps the
// boundary real.
export type EvidenceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function evOk<T>(value: T): EvidenceResult<T> {
  return { ok: true, value };
}

export function evFail<T>(reason: string): EvidenceResult<T> {
  return { ok: false, reason };
}

// Reads one own property without trusting the object: a hostile input can
// carry a throwing getter. Same shape and rationale as gh/types.ts's
// `safeOwnValue` and consumer.ts's `safeOwn` (NEVER-26.8).
export function safeOwnValue(source: unknown, key: string): unknown {
  try {
    if (source === null || typeof source !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(source, key)) return undefined;
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

export function safeOwnString(source: unknown, key: string): string | undefined {
  const value = safeOwnValue(source, key);
  return typeof value === "string" ? value : undefined;
}
