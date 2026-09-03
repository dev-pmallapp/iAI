import { describe, expect, test } from "bun:test";
import * as evidence from "../src/evidence/index";

// NEVER-26.8 — no function in this layer throws on hostile or malformed input;
// every such input yields a typed failure value.
//
// Each earlier task asserted this for its own module. This is the sweep across
// the WHOLE surface, and it is deliberately last: it can only be written once
// every module exists, which is why #261 is blocked by #27, #28, #29 and #30.
//
// The corpus is applied to every exported function REFLECTIVELY rather than to
// a hand-written list. A hand-written list silently stops covering a function
// the moment one is added, and this suite's whole job is to have no gaps.

// Values that have historically broken guards in this repository, plus the
// standard hostile shapes. `throwingGetter` is the one that found a real defect
// in #22 — the first implementation of `issueCreate` read `input.title`
// directly and propagated the exception straight out.
function hostileCorpus(): unknown[] {
  const throwingGetter = {
    get id(): number {
      throw new Error("hostile getter");
    },
    get body(): string {
      throw new Error("hostile getter");
    },
    get sentinel(): string {
      throw new Error("hostile getter");
    },
    get artifact(): string {
      throw new Error("hostile getter");
    },
  };
  const throwingToString = {
    toString(): string {
      throw new Error("hostile toString");
    },
  };
  const inherited = Object.create({ id: 1, createdAt: "2026-09-01T00:00:00Z", body: "x" });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  return [
    null,
    undefined,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "",
    "   ",
    "## iai-",
    "\u0000",
    true,
    false,
    [],
    [null],
    [undefined],
    [{}],
    {},
    { length: 3 },
    throwingGetter,
    throwingToString,
    inherited,
    cyclic,
    new Date("invalid"),
    Symbol("s"),
    () => "x",
    new Map(),
    new Set(),
    "x".repeat(200_000),
  ];
}

// Every function the barrel exports, discovered reflectively.
function exportedFunctions(): readonly [string, (...args: unknown[]) => unknown][] {
  const entries: [string, (...args: unknown[]) => unknown][] = [];
  for (const [name, value] of Object.entries(evidence)) {
    if (typeof value === "function") {
      entries.push([name, value as (...args: unknown[]) => unknown]);
    }
  }
  return entries;
}

describe("evidence — case 22 (P0, NEVER-26.8): no exported function throws on hostile input", () => {
  test("the barrel exports a non-trivial number of functions", () => {
    // ASSERT THE DENOMINATOR. A reflective sweep over an empty list passes
    // while checking nothing — the same vacuous pass skill-lint performs on
    // every CI run.
    const fns = exportedFunctions();
    expect(fns.length).toBeGreaterThanOrEqual(15);
  });

  test("every exported function survives the hostile corpus in first position", () => {
    const corpus = hostileCorpus();
    const failures: string[] = [];
    for (const [name, fn] of exportedFunctions()) {
      for (const input of corpus) {
        try {
          fn(input);
        } catch (error) {
          failures.push(`${name}(${describeInput(input)}) threw: ${String(error)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("every exported function survives the hostile corpus in second position", () => {
    // Two-argument functions -- renderPathTemplate(template, values),
    // selectSentinelComment(comments, name), lintSentinelComment(body, expected)
    // -- must be total in BOTH arguments. Sweeping only the first would leave
    // half the surface unchecked.
    const corpus = hostileCorpus();
    const failures: string[] = [];
    for (const [name, fn] of exportedFunctions()) {
      if (fn.length < 2) continue;
      for (const input of corpus) {
        try {
          fn("## iai-evidence", input);
        } catch (error) {
          failures.push(`${name}(_, ${describeInput(input)}) threw: ${String(error)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("no exported function returns a promise, which would defer a throw past the catch", () => {
    // A function returning a rejected promise would pass the sweeps above and
    // still blow up in the caller. Nothing in this layer is async, and this
    // asserts that rather than assuming it.
    const corpus = hostileCorpus();
    for (const [name, fn] of exportedFunctions()) {
      for (const input of corpus.slice(0, 6)) {
        let out: unknown;
        try {
          out = fn(input);
        } catch {
          continue;
        }
        expect(`${name}: ${String(out instanceof Promise)}`).toBe(`${name}: false`);
      }
    }
  });

  test("applyUpsert survives a non-array comment list paired with a VALID action", () => {
    // The reflective sweep cannot reach this: it never supplies a well-formed
    // edit action alongside a malformed comment list, so the action guard
    // always fires first and the array guard is never exercised. Mutation
    // testing showed the array guard could be deleted with no test failing.
    // This reaches it directly — the combination is reachable in real use, and
    // `list.map` on a string throws.
    const edit = {
      action: "edit" as const,
      sentinel: "evidence" as const,
      body: "## iai-evidence\n\nx",
      commentId: 1,
      matchCount: 1,
    };
    const create = {
      action: "create" as const,
      sentinel: "evidence" as const,
      body: "## iai-evidence\n\nx",
    };
    for (const bad of [null, undefined, "a string", 42, {}, new Set()]) {
      expect(() =>
        evidence.applyUpsert(bad as never, edit, 2, "2026-09-03T00:00:00Z"),
      ).not.toThrow();
      expect(() =>
        evidence.applyUpsert(bad as never, create, 2, "2026-09-03T00:00:00Z"),
      ).not.toThrow();
    }
  });

  test("the exported constants are frozen-shaped values, not mutable module state", () => {
    // A caller mutating SENTINEL_NAMES would change what every later call
    // matches. These are read-only by type; this asserts the runtime values are
    // the arrays and numbers they claim to be.
    expect(Array.isArray(evidence.SENTINEL_NAMES)).toBe(true);
    expect(evidence.SENTINEL_NAMES).toHaveLength(9);
    expect(Array.isArray(evidence.ARTIFACT_BEARING_SENTINELS)).toBe(true);
    expect(Array.isArray(evidence.SENTINEL_RULE_IDS)).toBe(true);
    expect(evidence.SENTINEL_RULE_IDS).toHaveLength(5);
    expect(Array.isArray(evidence.TEMPLATE_PLACEHOLDERS)).toBe(true);
    expect(typeof evidence.BUDGET_CHARS).toBe("number");
    expect(typeof evidence.HARD_LIMIT_CHARS).toBe("number");
    expect(typeof evidence.ENVELOPE_BUDGET_CHARS).toBe("number");
    expect(evidence.SENTINEL_NAMESPACE_PREFIX).toBe("## iai-");
  });

  test("no module under the directory imports a runtime or I/O module", () => {
    // The static half of NEVER-26.7, asserted here as well as by the lint rule
    // so the claim does not rest on a single mechanism. Case 21 proves the lint
    // rule fires; this proves the current source is clean independently of it.
    const banned = [
      "node:fs",
      "node:net",
      "node:child_process",
      "node:process",
      '"fs"',
      '"net"',
      '"child_process"',
      "Bun.$",
      "process.cwd",
      "process.env",
    ];
    for (const source of moduleSources()) {
      for (const token of banned) {
        expect(`${source.name}: ${String(source.text.includes(token))}`).toBe(
          `${source.name}: false`,
        );
      }
    }
  });
});

function describeInput(input: unknown): string {
  if (typeof input === "symbol") return "Symbol()";
  if (typeof input === "function") return "fn";
  if (typeof input === "string") return input.length > 20 ? `"<${String(input.length)} chars>"` : `"${input}"`;
  try {
    return String(input);
  } catch {
    return "<unprintable>";
  }
}

// Read via import.meta.dir, matching the convention at
// packages/core/test/egress.test.ts:482. A bare relative path would depend on
// the invoking shell's cwd.
function moduleSources(): readonly { name: string; text: string }[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const dir = path.join(import.meta.dir, "../src/evidence");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), "utf8") }));
}
