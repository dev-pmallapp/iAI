// Binding validation (issue #33, CLAIM-31.4 and CLAIM-31.5).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Not yet covered by `no-io-in-pure-modules`; that is NEVER-31.7, in #272.
//
// DECISION 11 — VALIDATION HAPPENS HERE, AT REGISTRATION, NOT AT RESOLUTION.
// Every Tier-1 verb resolves a binding on its way to doing anything
// (docs/design/01-skill-hierarchy.md:94-101), so resolution is the hot path and
// must be a lookup. A binding that reached the registry is valid by
// construction, which is what lets `resolveBinding` fail for exactly one
// reason: it is not there.
//
// TOTAL OVER HOSTILE INPUT. A binding arrives from ANOTHER PACKAGE — for this
// layer it is untrusted input in the same sense a comment list was for S1.4.
// Every read goes through `own()`, which survives a throwing getter, and every
// failure is a typed value naming the field. NEVER-31.8's reflective sweep in
// #272 is the check; being total is this module's job.
import {
  ARTIFACT_BEARING_SENTINELS,
  BUDGET_CHARS,
  SENTINEL_NAMESPACE_PREFIX,
  isKnownSentinelName,
  isSentinelNamespace,
  matchSentinelLine,
} from "../evidence/index";
import type { DomainBinding } from "./domain";
import { bindingFail, bindingOk, type BindingResult } from "./types";

// A property read that cannot throw.
//
// gh/types.ts exports `safeOwnValue` with the same job, and it is deliberately
// not imported: evidence/index.ts:31-34 records that gh/ and evidence/ both own
// names of that spelling and the root barrel re-exports both with `export *`.
// Adding a third importer across a directory boundary would make the boundary
// cosmetic — the same argument Decision 10 makes for `BindingResult`.
//
// The `try` is not defensive decoration. A hostile getter is the input that
// found a real defect in #22 (`issueCreate` read `input.title` directly and
// propagated the exception straight out) and again in #261 (`sentinelFor` threw
// while building a failure message).
function own(container: unknown, key: string): unknown {
  if (container === null || typeof container !== "object") return undefined;
  try {
    return (container as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

// docs/design/01-skill-hierarchy.md:187's five are the KNOWN ids, not the legal
// ones — Decision 1 keeps membership open so a sixth domain and `nullBinding`
// are expressible without editing core. What remains checkable is SHAPE: an id
// becomes a `domain:<id>` label, so it must be a lowercase label-safe token.
const DOMAIN_ID_RE = /^[a-z][a-z0-9-]*$/;

const RUNG_VERIFIERS: readonly string[] = ["tool-checked", "model-judged", "human-attested"];

function validateUnitOfWork(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "unitOfWork must be an object";
  for (const field of ["noun", "description", "minSize", "maxSize", "leafSkill"]) {
    if (!isNonEmptyString(own(value, field))) return `unitOfWork.${field} must be a non-empty string`;
  }
  return undefined;
}

function validateRung(value: unknown, index: number): string | undefined {
  const at = `verify.rungs[${String(index)}]`;
  if (!isPlainObject(value)) return `${at} must be an object`;
  if (!isNonEmptyString(own(value, "id"))) return `${at}.id must be a non-empty string`;
  if (!isNonEmptyString(own(value, "name"))) return `${at}.name must be a non-empty string`;
  if (!isStringArray(own(value, "entryCriteria"))) return `${at}.entryCriteria must be an array of strings`;
  const verifier = own(value, "verifier");
  if (typeof verifier !== "string" || !RUNG_VERIFIERS.includes(verifier)) {
    return `${at}.verifier must be one of ${RUNG_VERIFIERS.join(", ")}`;
  }
  if (typeof own(value, "reversible") !== "boolean") return `${at}.reversible must be a boolean`;
  return undefined;
}

// CLAIM-31.4. Both rules guard conditions the type system already forbids, and
// Decision 4 keeps them for the three paths it cannot see: a pack authored in
// JavaScript, a binding that crossed a `JSON.parse` or a markdown parser, and
// an `as` cast. Do not delete these because "the type makes it impossible" —
// the type makes it impossible only for callers the compiler saw.
function validateVerify(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "verify must be an object";

  const rungs = own(value, "rungs");
  if (!Array.isArray(rungs) || rungs.length === 0) return "verify.rungs must be a non-empty array";
  for (let i = 0; i < rungs.length; i += 1) {
    const bad = validateRung(rungs[i], i);
    if (bad !== undefined) return bad;
  }

  // docs/design/01-skill-hierarchy.md:204 — "index 0 is always the safe
  // default". A ladder whose first rung is irreversible has no safe entry
  // point, so every Story in that domain would start behind a gate.
  if (own(rungs[0], "reversible") !== true) {
    return "verify.rungs[0].reversible must be true: index 0 is the safe default and cannot be irreversible";
  }

  if (own(value, "evidenceRequired") !== true) {
    return "verify.evidenceRequired must be exactly true: no domain may close an issue without disk evidence";
  }

  if (!isNonEmptyString(own(value, "defaultRung"))) return "verify.defaultRung must be a non-empty string";
  if (!isNonEmptyString(own(value, "passing"))) return "verify.passing must be a non-empty string";

  const defaultRung = own(value, "defaultRung");
  const ids = rungs.map((r) => own(r, "id"));
  if (!ids.includes(defaultRung)) {
    return `verify.defaultRung "${String(defaultRung)}" names no rung in the ladder`;
  }
  return undefined;
}

function validateGate(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "gate must be an object";
  if (!isNonEmptyString(own(value, "irreversibleAction"))) {
    return "gate.irreversibleAction must be a non-empty string";
  }
  if (!isNonEmptyString(own(value, "authoriser"))) return "gate.authoriser must be a non-empty string";
  if (!isStringArray(own(value, "autoDeny"))) return "gate.autoDeny must be an array of strings";

  // Decision 7: absence means the domain asserts capability absence, which is
  // how `dev` already uses `vetoAgent`'s absence deliberately
  // (docs/design/04-domain-dev.md:149-152). Present-but-empty is not the same
  // statement and is rejected, so "we have not decided yet" cannot masquerade
  // as "there is nothing to kill".
  for (const field of ["killSwitch", "vetoAgent"]) {
    const optional = own(value, field);
    if (optional !== undefined && !isNonEmptyString(optional)) {
      return `gate.${field} must be a non-empty string when present; omit it to assert capability absence`;
    }
  }
  return undefined;
}

// CLAIM-31.5, as four rules. Two are the claim's literal words and two are
// Decision 5's strengthening, recorded in docs/design/stories/31.md.
//
// EVERY BOUND IS IMPORTED, NEVER RESTATED. Decision 11 of
// docs/design/stories/26.md had S1.4 export `BUDGET_CHARS` and
// `SENTINEL_NAMESPACE_PREFIX` for this module specifically — both carry an
// `EXPORTED FOR S1.5` comment at their declaration — because two copies of a
// namespace rule drift. Case 13 greps this directory for the literals.
function validateEvidence(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "evidence must be an object";
  if (!isNonEmptyString(own(value, "kind"))) return "evidence.kind must be a non-empty string";

  const sentinel = own(value, "sentinel");
  if (!isSentinelNamespace(sentinel)) {
    return `evidence.sentinel must fall inside the ${SENTINEL_NAMESPACE_PREFIX} namespace`;
  }

  // Decision 5, and it is stricter than CLAIM-31.5's seeded wording. The nine
  // names are closed (docs/design/03-workflow.md:372-382) and S1.4's matcher
  // and linter recognise exactly those nine, so a pack inventing
  // `## iai-audit` would produce a comment the producer writes and the consumer
  // can never find. `sentinel.ts:88-98` shipped `isSentinelNamespace` as a
  // prefix test and stated that only S1.5 could decide whether that is an
  // error. It is.
  const name = matchSentinelLine(sentinel);
  if (!isKnownSentinelName(name)) {
    return `evidence.sentinel "${String(sentinel)}" is inside the namespace but is not one of the nine known sentinels`;
  }

  const pathTemplate = own(value, "pathTemplate");
  if (typeof pathTemplate !== "string") return "evidence.pathTemplate must be a string";

  // Inherited from Decision 10 of docs/design/stories/26.md:388-396. Only three
  // of the nine sentinels carry an artifact under docs/; the rest are
  // inline-only. A path template on an inline-only sentinel describes a file
  // nothing will ever write. An EMPTY template is how a binding says it
  // declares none, because the field is required by the contract.
  if (pathTemplate.trim().length > 0 && !ARTIFACT_BEARING_SENTINELS.includes(name)) {
    return `evidence.pathTemplate is declared for "${String(sentinel)}", which is inline-only and bears no artifact`;
  }

  const budget = own(value, "budgetChars");
  if (typeof budget !== "number" || !Number.isInteger(budget) || budget <= 0) {
    return "evidence.budgetChars must be a positive integer";
  }
  if (budget > BUDGET_CHARS) {
    // A binding may declare LESS than the budget; reserving less is safe and
    // the rejection rule is one-sided by construction.
    return `evidence.budgetChars ${String(budget)} exceeds the working budget of ${String(BUDGET_CHARS)}`;
  }

  if (typeof own(value, "pinned") !== "boolean") return "evidence.pinned must be a boolean";
  return undefined;
}

function validateLabels(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "labels must be an object";
  const namespace = own(value, "namespace");
  if (!isNonEmptyString(namespace)) return "labels.namespace must be a non-empty string";

  const extra = own(value, "extra");
  if (!Array.isArray(extra)) return "labels.extra must be an array";
  for (let i = 0; i < extra.length; i += 1) {
    const at = `labels.extra[${String(i)}]`;
    if (!isPlainObject(extra[i])) return `${at} must be an object`;
    if (!isNonEmptyString(own(extra[i], "name"))) return `${at}.name must be a non-empty string`;
    const color = own(extra[i], "color");
    if (typeof color !== "string" || !/^[0-9a-f]{6}$/.test(color)) {
      return `${at}.color must be six lowercase hex digits with no leading #`;
    }
    const description = own(extra[i], "description");
    if (description !== undefined && !isNonEmptyString(description)) {
      return `${at}.description must be a non-empty string when present`;
    }
  }
  return undefined;
}

// The `domain:<id>` label this binding answers to. Derived rather than read, so
// a binding cannot claim an id and answer to a different label.
//
// THE TYPE GUARD IS NOT DECORATION, AND IT CLOSED A REAL DEFECT. `id` is
// declared `string`, so the check below is unreachable from well-typed code —
// the same situation as `evidenceRequired`, and kept for the same three paths
// Decision 4 names: a pack authored in JavaScript, a value that crossed a
// `JSON.parse` or a markdown parser, and an `as` cast.
//
// It is not hypothetical here. NEVER-31.8's reflective sweep calls every
// exported function with the hostile corpus, and template interpolation is one
// of the few operations that throws on a value rather than merely misbehaving:
// `` `domain:${Symbol()}` `` is a TypeError, and an object with a throwing
// `toString` propagates its own error straight out. Two of this barrel's seven
// exported functions failed the sweep on this single line before the guard
// existed. Every other function in the layer routes reads through `own()` and
// was already total.
export function domainLabelFor(id: string): string {
  if (typeof id !== "string") return "domain:";
  return `domain:${id}`;
}

export function validateBinding(candidate: unknown): BindingResult<DomainBinding> {
  if (!isPlainObject(candidate)) return bindingFail("binding must be an object");

  const id = own(candidate, "id");
  if (typeof id !== "string" || !DOMAIN_ID_RE.test(id)) {
    // Deliberately a SHAPE check and not a membership test. Decision 1 keeps
    // membership open; CLAIM-31.3 requires a domain core has never heard of to
    // register, and CLAIM-31.6 permits the five literals in core only as the id
    // union.
    return bindingFail(
      `binding.id must be a lowercase label-safe token matching ${DOMAIN_ID_RE.source}`,
    );
  }

  for (const check of [
    validateUnitOfWork(own(candidate, "unitOfWork")),
    validateVerify(own(candidate, "verify")),
    validateGate(own(candidate, "gate")),
    validateEvidence(own(candidate, "evidence")),
    validateLabels(own(candidate, "labels")),
  ]) {
    if (check !== undefined) return bindingFail(`binding "${id}": ${check}`);
  }

  // The namespace must agree with the id, or the registry would resolve
  // `domain:trade` to a binding whose own labels say `domain:health`.
  const namespace = own(own(candidate, "labels"), "namespace");
  if (namespace !== domainLabelFor(id)) {
    return bindingFail(
      `binding "${id}": labels.namespace must be "${domainLabelFor(id)}", not "${String(namespace)}"`,
    );
  }

  return bindingOk(candidate as DomainBinding);
}
