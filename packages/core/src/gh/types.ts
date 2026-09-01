// The shapes every `gh` constructor and parser in this directory shares
// (issue #22, CLAIM-21.1, NEVER-21.8).
//
// "The core decides what to run; only an adapter runs it, which is what keeps
// the kernel testable without a network." — docs/milestones/M1.md:123-124
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Same standing decision as classify/classify.ts, guards/egress.ts and
// guards/claim-lint.ts. Note that as of this Story the
// `no-io-in-pure-modules` lint rule does NOT yet cover this directory — its
// scope predicate matches only `classify` and `guards`. Widening it is
// Decision 9 of docs/design/stories/21.md and lands in #253. Until then the
// purity of this file is a convention rather than an enforced property, which
// is precisely why NEVER-21.9 exists.
//
// WHY A RESULT TYPE RATHER THAN A THROWN ERROR:
//
// NEVER-21.8 requires that no constructor throws on hostile or malformed
// input. A constructor is called deep inside a batch — a throw there aborts
// the batch and loses the resume position, which is the failure CLAIM-21.5
// exists to prevent. Returning a value lets the caller record the failure
// against one item and carry on.
//
// This deliberately does NOT reuse `Decision` from ../decision. A `gh`
// construction failure is not an allow/warn/block verdict about a payload; it
// is "this input cannot become a command". Overloading `Decision` would put
// two unrelated meanings on one type and make the guard surface ambiguous.

// One `gh` invocation as an argv array. `readonly` because a constructor's
// output is a value the caller may hold across a retry, and a mutated argv
// between two invocations is the resume bug in CLAIM-21.5's blast radius.
export type Argv = readonly string[];

// Zero or more invocations. Zero is a legitimate, successful outcome —
// CLAIM-21.4's already-applied label transition emits no command and reports
// success, which a bare `Argv` could not express without a sentinel value.
export type GhPlan = readonly Argv[];

export type GhResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function ghOk<T>(value: T): GhResult<T> {
  return { ok: true, value };
}

export function ghFail<T>(reason: string): GhResult<T> {
  return { ok: false, reason };
}

// The response envelope, per Decision 1 of docs/design/stories/21.md.
//
// CLAIM-21.5 requires this layer to classify "a 403 with
// x-ratelimit-remaining: 0". ARCHITECTURE.md:90 forbids it from shelling out,
// so the response cannot be retrieved here — it has to arrive. This is the same
// shape Decision 1 of docs/design/stories/15.md used for consent: a VALUE
// handed in by the caller, never a lookup, because a lookup is I/O.
//
// `headers` is OPTIONAL on purpose and its absence must not be read as
// "not rate limited". `gh api --include` appears nowhere in this repository,
// so the common case is that the adapter never captured headers at all.
// #25 classifies a header-less 403 as *possibly* rate-limited and still
// returns a plan, because the alternative — treating a real rate limit as
// fatal — abandons a batch that would have succeeded on retry.
export interface GhResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly headers?: Readonly<Record<string, string>>;
}

// Reads one own string property without trusting the object. A hostile input
// can carry a throwing getter, and `Object.prototype` can carry an inherited
// property that is not the caller's — both are in NEVER-21.8's corpus. Same
// rationale and same shape as `safeOwnString` in guards/egress.ts.
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

// A GitHub issue, milestone or comment number. Rejects 0, negatives,
// fractions, NaN, Infinity and anything non-numeric. GitHub numbers begin at
// 1, so 0 is never valid and is the value an unset field most often carries.
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
