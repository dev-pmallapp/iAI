import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createRegistry,
  registeredDomainIds,
  resolveBinding,
  validateBinding,
} from "../src/binding/index";
import type { DomainBinding } from "../src/binding/index";

// A minimal binding that passes every rule, used as the base every negative
// fixture mutates one field of. Built by a factory rather than shared by
// reference so a case cannot mutate the fixture out from under its siblings —
// which is a real hazard here, because the whole point of `readonly` is that
// callers cannot, and a test that reaches around it would be testing a shape
// nobody can actually construct.
function validBinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "null",
    unitOfWork: {
      noun: "nothing",
      description: "The empty unit of work, for the conformance suite",
      minSize: "nothing at all",
      maxSize: "still nothing",
      leafSkill: "null/noop",
    },
    verify: {
      rungs: [
        {
          id: "declared",
          name: "Declared",
          entryCriteria: ["the binding exists"],
          verifier: "tool-checked",
          reversible: true,
        },
        {
          id: "settled",
          name: "Settled",
          entryCriteria: ["a human said so"],
          verifier: "human-attested",
          reversible: false,
        },
      ],
      defaultRung: "declared",
      passing: "nothing happened, which is the point",
      evidenceRequired: true,
    },
    gate: {
      irreversibleAction: "nothing; this domain has no execution path",
      authoriser: "nobody",
      autoDeny: ["always"],
    },
    evidence: {
      kind: "nothing",
      sentinel: "## iai-evidence",
      pathTemplate: "docs/evidence/{issue}-{ts}.md",
      budgetChars: 60000,
      pinned: true,
    },
    labels: {
      namespace: "domain:null",
      extra: [{ name: "rung:declared", color: "c5def5" }],
    },
    ...overrides,
  };
}

function registryOf(...bindings: unknown[]): ReturnType<typeof createRegistry> {
  return createRegistry(bindings);
}

function mustRegister(...bindings: unknown[]): { bindings: ReadonlyMap<string, DomainBinding> } {
  const result = registryOf(...bindings);
  if (!result.ok) throw new Error(`fixture did not register: ${result.reason}`);
  return result.value;
}

describe("binding — case 3 (P0, CLAIM-31.2): a registered label resolves to that binding", () => {
  test("the resolved value is the binding that was registered, not a copy or a default", () => {
    const supplied = validBinding();
    const registry = mustRegister(supplied);
    const result = resolveBinding(registry, "domain:null");

    expect(result.decision.action).toBe("allow");
    expect(result.binding).toBeDefined();
    // Identity, not deep equality: a registry that reconstructed the binding
    // could silently drop or default a field, and deep equality against the
    // same literal would not notice.
    expect(result.binding).toBe(supplied as unknown as DomainBinding);
  });

  test("resolution is a lookup, so two calls return the same object", () => {
    const registry = mustRegister(validBinding());
    expect(resolveBinding(registry, "domain:null").binding).toBe(
      resolveBinding(registry, "domain:null").binding,
    );
  });

  test("the registry enumerates, sorted, for CLAIM-177.4's per-domain surfaces", () => {
    const registry = mustRegister(
      validBinding({ id: "zeta", labels: { namespace: "domain:zeta", extra: [] } }),
      validBinding({ id: "alpha", labels: { namespace: "domain:alpha", extra: [] } }),
    );
    expect(registeredDomainIds(registry)).toEqual(["alpha", "zeta"]);
    // Total over hostile input, like everything else in this layer.
    expect(registeredDomainIds(null)).toEqual([]);
    expect(registeredDomainIds({})).toEqual([]);
  });

  test("an id core has never heard of registers, which is the whole of CLAIM-31.3's shape", () => {
    // Decision 1's payoff. `null` is not one of the five at
    // docs/design/01-skill-hierarchy.md:187, and it registers and resolves.
    const registry = mustRegister(validBinding({ id: "legal", labels: { namespace: "domain:legal", extra: [] } }));
    expect(resolveBinding(registry, "domain:legal").decision.action).toBe("allow");
  });
});

describe("binding — case 4 (P0, CLAIM-31.2): four resolution failures, each a hard failure with no binding", () => {
  const registry = mustRegister(validBinding());

  const cases: Array<[string, unknown]> = [
    ["unregistered", "domain:trade"],
    ["absent", undefined],
    ["malformed", "domain:"],
    ["prefix-less", "null"],
  ];

  test("each of the four blocks and carries no binding", () => {
    for (const [label, input] of cases) {
      const result = resolveBinding(registry, input);
      expect(`${label}: ${result.decision.action}`).toBe(`${label}: block`);
      expect(`${label}: ${String("binding" in result)}`).toBe(`${label}: false`);
      expect(result.binding).toBeUndefined();
    }
  });

  test("the unregistered failure names the missing pack and what is registered", () => {
    const result = resolveBinding(registry, "domain:trade");
    expect(result.decision.message).toContain("domain:trade");
    expect(result.decision.message).toContain("null");
  });

  test("absence is a hard failure, not a default, over the whole absent corpus", () => {
    for (const absent of [undefined, null, "", "   ", 0, false, {}, []]) {
      const result = resolveBinding(registry, absent);
      expect(result.decision.action).toBe("block");
      expect(result.binding).toBeUndefined();
    }
  });

  test("a registry that did not come from createRegistry is refused, not defaulted", () => {
    for (const fake of [null, undefined, {}, { bindings: {} }, { bindings: [] }, "registry"]) {
      const result = resolveBinding(fake, "domain:null");
      expect(result.decision.action).toBe("block");
      expect(result.binding).toBeUndefined();
    }
  });
});

describe("binding — case 5 (P1, CLAIM-31.2): the four failure messages are pairwise distinct", () => {
  test("four inputs yield four unique messages, each naming its own rule", () => {
    // Case 4 is satisfied by an implementation returning "cannot resolve
    // domain" four times. CLAIM-31.2 requires the failure to name the missing
    // pack, and distinctness is what makes the message useful to whoever
    // tripped it. Same defect class as case 3 of docs/test-plans/26-plan.md.
    const registry = mustRegister(validBinding());
    const messages = [undefined, "null", "domain:", "domain:trade"].map(
      (label) => resolveBinding(registry, label).decision.message,
    );
    expect(new Set(messages).size).toBe(4);

    const [absent, prefixless, malformed, unregistered] = messages as [string, string, string, string];
    expect(absent).toContain("no domain label supplied");
    expect(prefixless).toContain("carries no");
    expect(malformed).toContain("malformed");
    expect(unregistered).toContain("no pack is registered");
  });
});

// CLAIM-31.4. Both fixtures are built through an UNSOUND CAST, and that is not
// a shortcut — it is the only way to reach the check.
// docs/design/01-skill-hierarchy.md:215 types `evidenceRequired` as the literal
// `true`, so `false` is a compile error, and `rungs[0].reversible` is likewise
// unreachable from well-typed code once a ladder is written correctly.
// Decision 4 keeps both checks for the three paths the compiler cannot see: a
// pack authored in JavaScript, a binding that crossed a `JSON.parse` or a
// markdown parser, and a cast exactly like this one.
describe("binding — case 8 (P0, CLAIM-31.4): rungs[0].reversible false is rejected", () => {
  test("the first rung being irreversible is rejected, naming the field", () => {
    const candidate = validBinding();
    const verify = candidate.verify as Record<string, unknown>;
    const rungs = verify.rungs as Record<string, unknown>[];
    (rungs[0] as Record<string, unknown>).reversible = false as unknown as never;

    const result = validateBinding(candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("verify.rungs[0].reversible");
      expect(result.reason).toContain("safe default");
    }
  });

  test("a malformed id is rejected by the id rule, not by a rule downstream of it", () => {
    // MUTATION TESTING ADDED THIS. Deleting the id SHAPE check broke no test,
    // because the only malformed-id fixture in this file also had a
    // `labels.namespace` that disagreed with it — so the agreement rule caught
    // it and the shape rule was never the reason for the rejection.
    //
    // This is the survivor class #261 named: A GUARD SHADOWED BY ANOTHER GUARD.
    // The namespace here is built to AGREE with the bad id, so the only rule
    // left that can reject it is the one under test.
    for (const badId of ["Not A Domain", "Dev", "9lives", "-leading", "has_underscore", ""]) {
      const candidate = validBinding({
        id: badId,
        labels: { namespace: `domain:${badId}`, extra: [] },
      });
      const result = validateBinding(candidate);
      expect(`${badId}: ${String(result.ok)}`).toBe(`${badId}: false`);
      if (!result.ok) expect(result.reason).toContain("binding.id");
    }
  });

  test("a later rung being irreversible is fine, because every real ladder ends that way", () => {
    // All five documented ladders have `reversible: false` on rung 4 —
    // 04-domain-dev.md:100, 05-domain-trading.md:110, 06-domain-health.md:124,
    // 07-domain-wealth-know.md:121 and :432. A rule that rejected any
    // irreversible rung would reject every real binding.
    expect(validateBinding(validBinding()).ok).toBe(true);
  });
});

describe("binding — case 9 (P0, CLAIM-31.4): evidenceRequired not true is rejected", () => {
  test("false, undefined, a string and a number are each rejected, naming the field", () => {
    for (const bad of [false, undefined, "true", 1, null, {}]) {
      const candidate = validBinding();
      (candidate.verify as Record<string, unknown>).evidenceRequired = bad as unknown as never;
      const result = validateBinding(candidate);
      expect(`${String(bad)}: ${String(result.ok)}`).toBe(`${String(bad)}: false`);
      if (!result.ok) expect(result.reason).toContain("verify.evidenceRequired");
    }
  });

  test("the unsound cast is present in this file, because a fixture that cannot be built is a case that does not run", () => {
    // docs/test-plans/31-plan.md note 2. The declared type makes every fixture
    // above a compile error without a cast, so if someone "cleans up" the casts
    // the cases do not fail — they stop existing, silently. This asserts the
    // mechanism that lets them exist at all.
    //
    // Same defect class as the dead assertion #30's verification found:
    // `list === mixed.slice(0, 0)` compares two distinct array references and
    // is never true, so the assertion inside it never ran.
    const source = readFileSync(join(import.meta.dir, "binding-registry.test.ts"), "utf8");
    expect(source).toContain("as unknown as never");
    expect(source).toContain("Decision 4");
  });
});

describe("binding — case 10 (P0, CLAIM-31.5): a sentinel outside the namespace is rejected", () => {
  test("six forms outside the namespace are each rejected", () => {
    for (const bad of ["## evidence", "iai-evidence", "## iai-", "", "# iai-evidence", 42]) {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).sentinel = bad;
      const result = validateBinding(candidate);
      expect(`${String(bad)}: ${String(result.ok)}`).toBe(`${String(bad)}: false`);
      if (!result.ok) expect(result.reason).toContain("evidence.sentinel");
    }
  });

  test("the namespace rule and the known-name rule are distinguishable, not one rule twice", () => {
    // MUTATION TESTING ADDED THIS. Deleting the `isSentinelNamespace` check
    // broke NO test: every fixture above is also caught by the known-name rule
    // that follows it, because a value outside the namespace can never match a
    // known name either. The rule was redundant AGAINST THE CORPUS while still
    // being the only one that says the right thing to whoever tripped it.
    //
    // CLAIM-31.5 is four rules and each must name itself — the same argument
    // case 3 of docs/test-plans/26-plan.md makes for the five producer rules,
    // and the same reason case 5 exists for the four resolution failures.
    const outside = validBinding();
    (outside.evidence as Record<string, unknown>).sentinel = "## evidence";
    const invented = validBinding();
    (invented.evidence as Record<string, unknown>).sentinel = "## iai-audit";

    const a = validateBinding(outside);
    const b = validateBinding(invented);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      // DISTINCTNESS MUST BE ABOUT THE RULE, NOT THE INPUT — and the first
      // version of this assertion was not. It compared whole messages and
      // required each to contain "namespace"; with the namespace check deleted
      // both fixtures fell through to the known-name rule, whose message also
      // contains the word "namespace" and quotes the offending sentinel, so the
      // two messages still differed and the assertion still passed. Two
      // messages that differ only in the value they quote are ONE message.
      //
      // Each assertion below names a phrase that belongs to exactly one rule,
      // and the negative assertions are what make the pair exclusive.
      expect(a.reason).not.toBe(b.reason);
      expect(a.reason).toContain("must fall inside");
      expect(a.reason).not.toContain("not one of the nine");
      expect(b.reason).toContain("not one of the nine");
      expect(b.reason).not.toContain("must fall inside");
    }
  });
});

describe("binding — case 11 (P0, CLAIM-31.5): a sentinel inside the namespace but outside the nine is rejected", () => {
  test("an invented sentinel is rejected, and the message says why", () => {
    // DECISION 5, AND IT IS STRICTER THAN CLAIM-31.5's SEEDED WORDING, which
    // says only "falls outside the `## iai-` namespace".
    // packages/core/src/evidence/sentinel.ts:88-98 shipped `isSentinelNamespace`
    // as a prefix test and stated that only S1.5 could decide whether an
    // in-namespace unknown name is an error. It is: S1.4's matcher and linter
    // recognise exactly nine names, so `## iai-audit` would be a comment the
    // producer writes and the consumer can never find.
    for (const invented of ["## iai-audit", "## iai-something-new", "## iai-isa"]) {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).sentinel = invented;
      const result = validateBinding(candidate);
      expect(`${invented}: ${String(result.ok)}`).toBe(`${invented}: false`);
      if (!result.ok) expect(result.reason).toContain("not one of the nine");
    }
  });

  test("each of the nine known sentinels is accepted", () => {
    // The denominator. A rule that rejected everything would pass the case
    // above while making the layer useless.
    const inlineOnly = ["verdict", "checkpoint", "gate", "risk", "effort", "learnings"];
    let accepted = 0;
    for (const name of ["design", "test-plan", "evidence", ...inlineOnly]) {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).sentinel = `## iai-${name}`;
      // The six inline-only sentinels bear no artifact, so they must also drop
      // the path template — which is case 12's rule seen from the other side.
      if (inlineOnly.includes(name)) {
        (candidate.evidence as Record<string, unknown>).pathTemplate = "";
      }
      const result = validateBinding(candidate);
      expect(`${name}: ${String(result.ok)}`).toBe(`${name}: true`);
      accepted += 1;
    }
    expect(accepted).toBe(9);
  });
});

describe("binding — case 12 (P0, CLAIM-31.5): a path template on an inline-only sentinel is rejected", () => {
  test("an inline-only sentinel carrying a template is rejected, naming the sentinel", () => {
    // Inherited from Decision 10 of docs/design/stories/26.md:388-396, using
    // ARTIFACT_BEARING_SENTINELS rather than a restated list.
    for (const inlineOnly of ["## iai-risk", "## iai-verdict", "## iai-effort"]) {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).sentinel = inlineOnly;
      const result = validateBinding(candidate);
      expect(`${inlineOnly}: ${String(result.ok)}`).toBe(`${inlineOnly}: false`);
      if (!result.ok) expect(result.reason).toContain("inline-only");
    }
  });

  test("the three artifact-bearing sentinels may carry one", () => {
    for (const bearing of ["## iai-design", "## iai-test-plan", "## iai-evidence"]) {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).sentinel = bearing;
      expect(`${bearing}: ${String(validateBinding(candidate).ok)}`).toBe(`${bearing}: true`);
    }
  });

  test("an empty template is how an inline-only binding declares none", () => {
    // `pathTemplate` is required by the contract
    // (docs/design/01-skill-hierarchy.md:229), so a binding with an inline-only
    // sentinel cannot omit the field. Empty is the declaration of absence.
    const candidate = validBinding();
    (candidate.evidence as Record<string, unknown>).sentinel = "## iai-risk";
    (candidate.evidence as Record<string, unknown>).pathTemplate = "";
    expect(validateBinding(candidate).ok).toBe(true);
  });
});

describe("binding — case 13 (P0, CLAIM-31.5): the budget bound is the imported constant", () => {
  test("60000 is legal and 60001 is not", () => {
    // CLAIM-31.5's word is EXCEEDS, and render.ts:36-38 records that
    // `budgetChars: 60000` — which all six EvidenceSpec literals in the tree
    // use — is therefore legal. An off-by-one here would reject every
    // documented binding.
    const at = (n: unknown): boolean => {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).budgetChars = n;
      return validateBinding(candidate).ok;
    };
    expect(at(59999)).toBe(true);
    expect(at(60000)).toBe(true);
    expect(at(60001)).toBe(false);
  });

  test("a budget below the bound is legal, because reserving less is safe", () => {
    const candidate = validBinding();
    (candidate.evidence as Record<string, unknown>).budgetChars = 1000;
    expect(validateBinding(candidate).ok).toBe(true);
  });

  test("zero, negative, fractional and non-numeric budgets are rejected", () => {
    for (const bad of [0, -1, 1.5, "60000", null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const candidate = validBinding();
      (candidate.evidence as Record<string, unknown>).budgetChars = bad;
      expect(`${String(bad)}: ${String(validateBinding(candidate).ok)}`).toBe(
        `${String(bad)}: false`,
      );
    }
  });

  test("no file under packages/core/src/binding restates the imported constants", () => {
    // DECISION 11 OF docs/design/stories/26.md EXISTS TO PREVENT A SECOND COPY.
    // S1.4 exported BUDGET_CHARS and SENTINEL_NAMESPACE_PREFIX for this module
    // specifically, both marked `EXPORTED FOR S1.5` at their declaration,
    // because two copies of a namespace rule drift. The only way to undo that
    // silently is to type a literal into this directory, so this looks for one.
    const dir = join(import.meta.dir, "../src/binding");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(4);

    const offenders: string[] = [];
    for (const file of files) {
      const masked = maskComments(readFileSync(join(dir, file), "utf8"));
      if (masked.includes("60000")) offenders.push(`${file}: 60000`);
      if (masked.includes('"## iai-')) offenders.push(`${file}: ## iai- literal`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("binding — case 19 (P0, NEVER-31.9): a rejected binding is never resolvable", () => {
  test("one invalid binding rejects the whole construction, so no registry exists to resolve it", () => {
    // The guarantee is STRUCTURAL. There is no partial-success arm and no
    // "registered with warnings": if any candidate fails, no Registry is
    // produced, so there is no object on which a rejected binding could be
    // looked up.
    // EVERY FIXTURE CARRIES A DISTINCT ID, AND MUTATION TESTING IS WHY.
    //
    // The first version of this case built each invalid fixture from
    // `validBinding()` without changing the id, and registered it alongside
    // another `validBinding()`. Both then had `id: "null"`, so the DUPLICATE-ID
    // rule rejected every pair before the defect under test was ever reached —
    // the case passed five times for a reason that had nothing to do with the
    // five defects it names. Deleting the namespace-agreement rule broke
    // nothing, which is how it was found.
    //
    // Second instance in two Stories of the survivor class #261 named: a guard
    // shadowed by another guard. The reason is now asserted, not just the
    // verdict, so a fixture rejected for the wrong reason fails here.
    const invalidFixtures: Array<[string, Record<string, unknown>, string]> = [
      [
        "bad id",
        validBinding({ id: "Not A Domain", labels: { namespace: "domain:Not A Domain", extra: [] } }),
        "binding.id",
      ],
      [
        "bad sentinel",
        withEvidence(validBinding({ id: "a", labels: { namespace: "domain:a", extra: [] } }), "sentinel", "## nope"),
        "namespace",
      ],
      [
        "invented sentinel",
        withEvidence(validBinding({ id: "b", labels: { namespace: "domain:b", extra: [] } }), "sentinel", "## iai-audit"),
        "not one of the nine",
      ],
      [
        "over budget",
        withEvidence(validBinding({ id: "c", labels: { namespace: "domain:c", extra: [] } }), "budgetChars", 60001),
        "exceeds the working budget",
      ],
      [
        "namespace mismatch",
        validBinding({ id: "d", labels: { namespace: "domain:other", extra: [] } }),
        "labels.namespace",
      ],
    ];

    for (const [label, invalid, expectedReason] of invalidFixtures) {
      const result = createRegistry([validBinding(), invalid]);
      expect(`${label}: ${String(result.ok)}`).toBe(`${label}: false`);
      // Not merely "the invalid one is absent" — the VALID one is unreachable
      // too, because no registry was built at all.
      expect(`${label}: ${String("value" in result)}`).toBe(`${label}: false`);
      // And it must be rejected for the reason the fixture is named after.
      if (!result.ok) expect(`${label}: ${result.reason}`).toContain(expectedReason);
    }
  });

  test("a duplicate id is rejected rather than merged or last-one-wins", () => {
    const result = createRegistry([validBinding(), validBinding()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("duplicate");
  });

  test("the empty registry is valid, and resolves nothing", () => {
    const result = createRegistry([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(registeredDomainIds(result.value)).toEqual([]);
      const resolved = resolveBinding(result.value, "domain:null");
      expect(resolved.decision.action).toBe("block");
      expect(resolved.decision.message).toContain("registry is empty");
    }
  });
});

describe("binding — case 20 (P0, NEVER-31.9): no failure carries a payload and no success carries a reason", () => {
  test("across the whole corpus, ok:false has no value and ok:true has no reason", () => {
    const corpus: unknown[] = [
      validBinding(),
      validBinding({ id: "x" }),
      null,
      undefined,
      {},
      [],
      "binding",
      42,
      validBinding({ id: "Not A Domain" }),
      withEvidence(validBinding(), "budgetChars", 60001),
    ];

    let okCount = 0;
    let failCount = 0;
    for (const candidate of corpus) {
      const result = validateBinding(candidate);
      if (result.ok) {
        okCount += 1;
        expect("reason" in result).toBe(false);
      } else {
        failCount += 1;
        expect("value" in result).toBe(false);
        expect(result.reason.length).toBeGreaterThan(0);
      }
    }
    // Assert the denominator: a corpus that produced no failures, or no
    // successes, would make one arm of this case vacuous.
    expect(okCount).toBeGreaterThanOrEqual(1);
    expect(failCount).toBeGreaterThanOrEqual(5);
  });

  test("every resolution failure omits the binding key entirely, not merely sets it undefined", () => {
    const registry = mustRegister(validBinding());
    for (const label of [undefined, null, "", "null", "domain:", "domain:trade", 42, {}]) {
      const result = resolveBinding(registry, label);
      expect(`${String(label)}: ${String("binding" in result)}`).toBe(`${String(label)}: false`);
    }
  });

  test("no hostile input throws, in either argument position", () => {
    // NEVER-31.8's full reflective sweep is #272's. This is the local form: a
    // binding arrives from another package, so it is untrusted input here.
    const throwingGetter = {
      get id(): string {
        throw new Error("hostile getter");
      },
    };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const hostile: unknown[] = [
      null,
      undefined,
      throwingGetter,
      cyclic,
      Symbol("s"),
      new Map(),
      "x".repeat(100_000),
      { id: Symbol("s") },
      validBinding({ verify: throwingGetter }),
    ];

    for (const input of hostile) {
      expect(() => validateBinding(input)).not.toThrow();
      expect(() => createRegistry([input])).not.toThrow();
      expect(() => resolveBinding(input, "domain:null")).not.toThrow();
      expect(() => resolveBinding(mustRegister(validBinding()), input)).not.toThrow();
    }
  });
});

function withEvidence(
  binding: Record<string, unknown>,
  field: string,
  value: unknown,
): Record<string, unknown> {
  const evidence = { ...(binding.evidence as Record<string, unknown>), [field]: value };
  return { ...binding, evidence };
}

// Mirrors scripts/lint.ts:36 and the masking #32's verification had to add:
// prose about a literal is not a use of it, and this file's own comments quote
// `## iai-` repeatedly.
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}
