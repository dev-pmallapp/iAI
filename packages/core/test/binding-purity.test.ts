import { describe, expect, test } from "bun:test";
import * as binding from "../src/binding/index";

// NEVER-31.8 — no function in this layer throws on hostile or malformed input.
// Case 18, and the first corpus in this repository to carry a TIME CAP.
//
// WHY A CAP, AND WHY IT CANNOT BE AN ASSERTION IN THIS PROCESS.
// #261's mutation 7 removed one `Array.isArray` guard from
// `sentinelNamesArePrefixFree` and produced a run that NEVER TERMINATED —
// 200,000 characters iterated as an array, roughly 4x10^10 comparisons, killed
// at 60 seconds (docs/evidence/261-20260904T040110Z.md). A hang is strictly
// worse than a throw: `expect(fn).not.toThrow()` cannot catch a function that
// never returns, and neither can a `try`/`catch`, a `Promise.race`, or Bun's
// own per-test timeout — a synchronous loop never yields the thread, so nothing
// scheduled on it ever runs.
//
// The only mechanism that actually interrupts a synchronous hang is a separate
// PROCESS with a wall-clock kill. So the sweep runs in a child, exactly as the
// purity harness does for a different reason, and the parent asserts the child
// terminated on its own rather than being killed. Verified against Bun 1.4.0:
// `Bun.spawnSync({ timeout })` kills `while(true){}` with SIGTERM, leaving
// `exitCode === null` and `signalCode === "SIGTERM"`.
//
// The in-child per-call cap below is the SECOND line of defence and catches the
// case a wall clock cannot attribute: one pathologically slow call hidden among
// hundreds of fast ones, which is what a partially-removed guard produces
// before it becomes an outright hang.

const IS_CHILD = Bun.env.IAI_BINDING_SWEEP_CHILD === "1";

// Generous by two orders of magnitude. The slowest real call measured on this
// barrel is `createRegistry` at ~0.65 ms; a guard removal that turns a length
// check into a full scan of a 200,000-character string does not land at 3 ms,
// it lands in seconds or never. A tight cap here would buy flakiness on a busy
// machine and no extra detection.
const PER_CALL_CAP_MS = 250;

// The whole child run: process start, module load, and ~230 calls.
const WALL_CLOCK_CAP_MS = 30_000;

if (!IS_CHILD) {
  describe("binding — case 18 (P0, NEVER-31.8): the hostile sweep terminates", () => {
    test("the sweep completes in a child process without being killed by the wall clock", () => {
      const child = Bun.spawnSync({
        cmd: ["bun", "test", "packages/core/test/binding-purity.test.ts"],
        env: { ...Bun.env, IAI_BINDING_SWEEP_CHILD: "1" },
        timeout: WALL_CLOCK_CAP_MS,
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = `${child.stdout.toString()}${child.stderr.toString()}`;

      // THE HANG CHECK. A child killed by the wall clock reports
      // `signalCode === "SIGTERM"` and `exitCode === null`; one that finished on
      // its own reports `signalCode === undefined`. Normalised with `?? null`
      // because those are two different absent-values and only one of them is
      // `null` — asserting `toBeNull()` alone fails on a HEALTHY run, which is
      // how this was caught.
      //
      // This is the assertion #261's mutation 7 would have tripped, and the one
      // no in-process check can make.
      expect(child.signalCode ?? null, "the sweep was killed by the wall clock").toBeNull();

      // Not merely exit 0: a child that collected no tests also exits 0. The
      // marker proves the sweep actually ran, the same anti-vacuous device as
      // IAI-PURITY-ARMED.
      expect(output).toContain("IAI-SWEEP-COMPLETE");
      expect(output).toContain("0 fail");
      expect(output).not.toContain("(fail)");
      expect(child.exitCode).toBe(0);
    }, 60_000);
  });
}

// The corpus docs/test-plans/31-plan.md case 18 names, item for item, plus the
// two shapes that have historically found real defects in this repository: a
// throwing getter (#22's `issueCreate` read `input.title` directly and
// propagated the exception out) and a throwing `toString` (#261's `sentinelFor`
// threw while BUILDING a failure message — a throw inside the value that was
// supposed to replace a throw).
//
// A FACTORY, NOT A CONST, so the cyclic and mutable fixtures are fresh per test
// and one sweep cannot contaminate the next.
function hostileCorpus(): unknown[] {
  const throwingGetter = {
    get id(): string {
      throw new Error("hostile getter");
    },
    get labels(): unknown {
      throw new Error("hostile getter");
    },
    get verify(): unknown {
      throw new Error("hostile getter");
    },
    get bindings(): unknown {
      throw new Error("hostile getter");
    },
  };
  const throwingToString = {
    toString(): string {
      throw new Error("hostile toString");
    },
  };
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  // "a binding with every field of the wrong type" — the plan's last item. It
  // is shaped like a binding so it reaches past the first guard, which is what
  // makes it different from `{}`.
  const wrongTypes = {
    id: 42,
    unitOfWork: "not an object",
    verify: [],
    gate: null,
    evidence: 0,
    labels: true,
  };

  return [
    null,
    undefined,
    {},
    throwingGetter,
    throwingToString,
    Symbol("s"),
    cyclic,
    [],
    [1, "two", null],
    "x".repeat(200_000),
    Number.NaN,
    -1,
    wrongTypes,
  ];
}

// Every function the barrel exports, discovered reflectively rather than
// listed. A hand-written list is a list that stops matching the barrel the day
// someone adds a function, and NEVER-31.8 is a claim about the whole surface.
function exportedFunctions(): readonly [string, (...args: unknown[]) => unknown][] {
  const entries: [string, (...args: unknown[]) => unknown][] = [];
  for (const [name, value] of Object.entries(binding)) {
    if (typeof value === "function") {
      entries.push([name, value as (...args: unknown[]) => unknown]);
    }
  }
  return entries;
}

// Never invokes `toString` on the input: the corpus contains a value whose
// `toString` throws, and a failure-message builder that threw would be the very
// defect this file exists to exclude.
function describeInput(input: unknown): string {
  if (typeof input === "symbol") return "Symbol()";
  if (typeof input === "function") return "fn";
  if (typeof input === "string") {
    return input.length > 20 ? `"<${String(input.length)} chars>"` : `"${input}"`;
  }
  if (input === null) return "null";
  if (input === undefined) return "undefined";
  if (typeof input === "object") return Array.isArray(input) ? "[array]" : "{object}";
  try {
    return String(input);
  } catch {
    return "<unprintable>";
  }
}

interface CallOutcome {
  readonly threw: string | null;
  readonly ms: number;
}

function call(fn: (...args: unknown[]) => unknown, args: unknown[]): CallOutcome {
  const started = performance.now();
  try {
    fn(...args);
    return { threw: null, ms: performance.now() - started };
  } catch (error) {
    // `String(error)` is safe: these are Errors this layer or the corpus threw,
    // not corpus values.
    return { threw: String(error), ms: performance.now() - started };
  }
}

describe.if(IS_CHILD)("binding — case 18 (P0, NEVER-31.8): no exported function throws or hangs on hostile input", () => {
  test("the barrel exports a non-trivial number of functions", () => {
    // ASSERT THE DENOMINATOR FIRST. A reflective sweep over an empty list
    // passes while checking nothing — the same vacuous pass skill-lint performs
    // on every CI run, and the one #253's first attempt shipped.
    expect(exportedFunctions().length).toBeGreaterThanOrEqual(6);
  });

  test("every exported function survives the hostile corpus in first position, under the per-call cap", () => {
    const corpus = hostileCorpus();
    const threw: string[] = [];
    const slow: string[] = [];

    for (const [name, fn] of exportedFunctions()) {
      for (const input of corpus) {
        const outcome = call(fn, [input]);
        if (outcome.threw !== null) threw.push(`${name}(${describeInput(input)}) threw: ${outcome.threw}`);
        if (outcome.ms > PER_CALL_CAP_MS) {
          slow.push(`${name}(${describeInput(input)}) took ${outcome.ms.toFixed(1)}ms`);
        }
      }
    }

    // Accumulated, not fail-fast, so one run reports EVERY violation rather
    // than the first. `domainLabelFor` failed exactly here before #272 added
    // its type guard: `domain:${Symbol()}` is a TypeError, and the throwing
    // toString propagated straight out. Two of seven functions, on one line.
    expect(threw).toEqual([]);
    expect(slow).toEqual([]);
  });

  test("every two-argument function survives the corpus in second position", () => {
    const corpus = hostileCorpus();
    const threw: string[] = [];
    const slow: string[] = [];
    const arityTwo = exportedFunctions().filter(([, fn]) => fn.length >= 2);

    // A SECOND DENOMINATOR. Only `resolveBinding` takes two arguments today, so
    // this filter is one bad refactor away from being empty — at which point
    // the loop below would pass having swept nothing.
    expect(arityTwo.length).toBeGreaterThanOrEqual(1);

    for (const [name, fn] of arityTwo) {
      for (const input of corpus) {
        const outcome = call(fn, ["domain:null", input]);
        if (outcome.threw !== null) threw.push(`${name}(_, ${describeInput(input)}) threw: ${outcome.threw}`);
        if (outcome.ms > PER_CALL_CAP_MS) {
          slow.push(`${name}(_, ${describeInput(input)}) took ${outcome.ms.toFixed(1)}ms`);
        }
      }
    }

    expect(threw).toEqual([]);
    expect(slow).toEqual([]);
  });

  test("no exported function returns a promise, which would defer a throw past the catch", () => {
    // A function returning a rejected promise passes both sweeps above and
    // still blows up in the caller. Nothing in this layer is async; this
    // asserts it rather than assuming it.
    const corpus = hostileCorpus();
    const deferred: string[] = [];
    for (const [name, fn] of exportedFunctions()) {
      for (const input of corpus.slice(0, 6)) {
        let out: unknown;
        try {
          out = fn(input);
        } catch {
          continue;
        }
        if (out instanceof Promise) deferred.push(`${name}(${describeInput(input)}) returned a Promise`);
      }
    }
    expect(deferred).toEqual([]);
  });

  test("the sweep announces completion, so a skipped run cannot pass for a clean one", () => {
    // Bun prints per-test names only on failure, so a passing child says
    // nothing about WHICH tests ran. Same device as IAI-PURITY-ARMED.
    console.log("IAI-SWEEP-COMPLETE");
    expect(true).toBe(true);
  });
});
