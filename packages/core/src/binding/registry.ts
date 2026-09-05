// The registry (issue #33, CLAIM-31.2, CLAIM-31.3, NEVER-31.9).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
// Not yet covered by `no-io-in-pure-modules`; that is NEVER-31.7, in #272.
//
// DECISION 2 — REGISTRATION IS A PURE CONSTRUCTION OVER A SUPPLIED LIST.
//
// There is no `register()`, no module-level `Map`, no side effect and no
// accumulation. That is not a style preference; it is the only shape that
// satisfies four constraints at once, and the design-approval gate ruled on it:
//
//   1. CLAIM-31.3 (docs/milestones/M1.md:209-211) — a domain registers without
//      editing any file under packages/core/src. A static list inside this
//      directory would make every new pack a core edit.
//   2. CLAIM-111.1 (docs/milestones/M5.md:82-85) — asserted by a test that
//      FAILS if `git diff --stat` for the story branch touches
//      packages/core/src/binding. This is in flat contradiction with
//      CONTRIBUTING.md:303, which #34 corrects.
//   3. docs/milestones/M1.md:6-8 — every module in this milestone is "a pure
//      function from input to a Decision". A mutable module singleton is not,
//      and packages/core/test/purity.test.ts runs this directory with the
//      runtime trapped.
//   4. CLAIM-177.4 (docs/milestones/M8.md:85-87) — Pulse renders one surface
//      per domain, so the registry must be ENUMERABLE, not merely a lookup.
//      `registeredDomainIds` is that surface.
//
// docs/design/01-skill-hierarchy.md:419-421 says "there is no separate registry
// to keep in sync", while :59, ARCHITECTURE.md:92 and 08-dual-target.md:460 all
// name one. Both are true of this shape: the `domain:` label remains the
// routing key and there is no second source of truth, because the list is data
// supplied at the edge rather than state held here.
import { type Decision, decide } from "../decision";
import type { DomainBinding } from "./domain";
import { bindingFail, bindingOk, type BindingResult } from "./types";
import { domainLabelFor, validateBinding } from "./validate";

const DOMAIN_LABEL_PREFIX = "domain:";

// Opaque by intent: callers resolve and enumerate, they do not reach inside.
// `readonly` throughout, so a resolved binding cannot be mutated into an
// invalid one after validation — NEVER-31.9 depends on that as much as on the
// rejection rules.
export interface Registry {
  readonly bindings: ReadonlyMap<string, DomainBinding>;
}

export interface ResolveResult {
  readonly decision: Decision;
  readonly binding?: DomainBinding;
}

// NEVER-31.9 — a rejected binding is never resolvable.
//
// The guarantee is STRUCTURAL rather than checked afterwards: if any candidate
// fails validation, no `Registry` is produced at all, so there is no object on
// which a rejected binding could be looked up. There is deliberately no
// partial-success arm and no "registered with warnings".
export function createRegistry(bindings: unknown): BindingResult<Registry> {
  if (!Array.isArray(bindings)) return bindingFail("createRegistry expects an array of bindings");

  const map = new Map<string, DomainBinding>();
  for (let i = 0; i < bindings.length; i += 1) {
    const validated = validateBinding(bindings[i]);
    if (!validated.ok) return bindingFail(`binding at index ${String(i)}: ${validated.reason}`);

    const id = validated.value.id;
    if (map.has(id)) {
      // Two packs claiming one domain is not a merge and not a last-one-wins.
      // docs/design/03-workflow.md:151 requires exactly one `domain:*` per
      // Story; a registry with two answers for one label would make that
      // invariant unenforceable at the point it matters.
      return bindingFail(`duplicate binding for "${domainLabelFor(id)}" at index ${String(i)}`);
    }
    map.set(id, validated.value);
  }

  return bindingOk({ bindings: map });
}

// CLAIM-177.4's enumeration surface. Sorted, so a rendered dashboard does not
// reorder itself because the composition root changed its list order.
export function registeredDomainIds(registry: unknown): readonly string[] {
  const map = readBindings(registry);
  if (map === undefined) return [];
  return [...map.keys()].sort();
}

// CLAIM-31.2 — resolution returns the binding or a hard failure naming the
// missing pack, never a default.
//
// The return shape is `requireSentinelComment`'s
// (packages/core/src/evidence/consumer.ts:189-217): a `Decision` always, and
// the payload only on the success arm. `Decision` is right here because "no
// pack is registered for this label" IS a blocking verdict about work that is
// about to happen — which is exactly the distinction
// evidence/types.ts:8-14 draws when it declines to use `Decision` for a
// construction error.
//
// FOUR FAILURES, FOUR DISTINCT MESSAGES. Case 5 requires distinctness because
// case 4 is satisfied by an implementation that returns "cannot resolve domain"
// four times, and a message that names no rule tells whoever tripped it
// nothing. This is the same defect class as case 3 of
// docs/test-plans/26-plan.md.
export function resolveBinding(registry: unknown, label: unknown): ResolveResult {
  const map = readBindings(registry);
  if (map === undefined) {
    return {
      decision: decide(
        "block",
        "registry is not a value produced by createRegistry; resolution is refused rather than defaulted",
      ),
    };
  }

  if (typeof label !== "string" || label.trim().length === 0) {
    return {
      decision: decide(
        "block",
        `no domain label supplied (received ${describe(label)}); absence is a hard failure, not a default`,
      ),
    };
  }

  if (!label.startsWith(DOMAIN_LABEL_PREFIX)) {
    return {
      decision: decide(
        "block",
        `label "${label}" carries no "${DOMAIN_LABEL_PREFIX}" prefix; a domain is resolved from its label, not its bare id`,
      ),
    };
  }

  const id = label.slice(DOMAIN_LABEL_PREFIX.length);
  if (id.trim().length === 0) {
    return {
      decision: decide("block", `label "${label}" is malformed: the "${DOMAIN_LABEL_PREFIX}" prefix names no domain`),
    };
  }

  const binding = map.get(id);
  if (binding === undefined) {
    const known = [...map.keys()].sort();
    return {
      decision: decide(
        "block",
        `no pack is registered for "${label}"; ` +
          (known.length === 0
            ? "the registry is empty"
            : `registered domains are ${known.map((k) => `"${k}"`).join(", ")}`),
      ),
    };
  }

  return {
    decision: decide("allow", `resolved "${label}" to the registered binding`),
    binding,
  };
}

function readBindings(registry: unknown): ReadonlyMap<string, DomainBinding> | undefined {
  if (registry === null || typeof registry !== "object") return undefined;
  let value: unknown;
  try {
    value = (registry as Record<string, unknown>).bindings;
  } catch {
    return undefined;
  }
  return value instanceof Map ? (value as ReadonlyMap<string, DomainBinding>) : undefined;
}

// Never invokes `toString` on the input. #261 found `sentinelFor` throwing
// while building a failure message, which is a throw inside the very value that
// was supposed to replace a throw.
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `""`;
  return typeof value;
}
