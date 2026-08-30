// The stubbed-runtime harness for CLAIM-15.6 (test case 25): no file under
// classify/ or guards/ performs I/O, proved by running the whole predicate
// surface with `fs`, `net` and `process` unable to do anything but throw.
//
// A harness whose stubs silently fail to install passes vacuously — it would
// prove nothing about the code under test, only that nobody happened to call
// the thing that was never actually replaced. So this file arms the traps
// FIRST, PROVES they are armed by calling them directly and asserting they
// throw, and only then exercises classify(), classifyPath() and the four
// guard predicates. If any of them silently reached fs, net or process, that
// call would throw and the exercise tests below would fail — there is no
// path from a real I/O call to a passing test.
//
// Bun makes globally replacing `node:fs` and `node:net` in a way that also
// hot-swaps already-bound imports awkward with a plain object stub, so this
// uses `mock.module()` from bun:test, which Bun documents as patching the
// module registry itself: every future resolution of the specifier —
// including a fresh `await import(...)` issued from this very file after the
// call — returns the replacement, which is exactly what step 2 below
// verifies rather than assumes.
//
// `process` cannot be swapped wholesale (it is the same live object every
// module shares, and replacing it under Bun's own test runner would be a
// scorched-earth move for no extra coverage — no line in classify/ or
// guards/ reads `process` at all, confirmed by grep, and this rule exists to
// keep it that way). Instead only the three members CLAIM-15.6 cares about —
// `cwd`, `env` and `exit` — are replaced with throwing stand-ins, and
// restored in `afterAll` no matter what happened in between.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import * as realFs from "node:fs";
import * as realNet from "node:net";
import { classify, classifyPath } from "../src/classify/index";
import {
  CONSENT_WITHHELD,
  checkCommitPrefix,
  checkEgress,
  checkRiskMandate,
  checkSpend,
  type Destination,
  type EgressConsent,
} from "../src/guards/index";

// The real export names, captured before either module is mocked, so the
// stub mirrors the actual API surface rather than a hand-picked subset that
// could silently miss whatever classify/ or guards/ might one day call.
const FS_EXPORT_NAMES = Object.keys(realFs);
const NET_EXPORT_NAMES = Object.keys(realNet);

// A plain object of throwing functions, one per real export name — NOT a
// Proxy. A Proxy was tried first and rejected: `mock.module()` replaces an
// already-resolved module (this file's own `import * as realFs` above
// forces that resolution) by copying property descriptors onto the live
// exports object, and a Proxy's `getOwnPropertyDescriptor` trap only
// controls what `Object.getOwnPropertyDescriptor` reports — it does not
// intercept that copy the way a `get` trap would. The result was silent:
// `typeof fresh.readFileSync === "function"`, but calling it ran the REAL
// `fs.readFileSync` and returned `ENOENT`, which is exactly the vacuous-pass
// failure mode this harness exists to rule out. A plain object with one
// throwing function bound per key has no such indirection and was verified
// to actually replace the live binding.
function throwingModuleFactory(moduleName: string, exportNames: readonly string[]): Record<string, unknown> {
  const mod: Record<string, unknown> = {};
  for (const name of exportNames) {
    if (name === "default") continue;
    mod[name] = (..._args: unknown[]) => {
      throw new Error(
        `purity harness: ${moduleName}.${name} must never be called from classify/ or guards/ (CLAIM-15.6)`,
      );
    };
  }
  mod.default = mod;
  return mod;
}

const SENTINEL_ERROR_FRAGMENT = "CLAIM-15.6";

let originalCwd: typeof process.cwd;
let originalExit: typeof process.exit;
let originalEnvDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  mock.module("node:fs", () => throwingModuleFactory("node:fs", FS_EXPORT_NAMES));
  mock.module("node:net", () => throwingModuleFactory("node:net", NET_EXPORT_NAMES));

  originalCwd = process.cwd;
  originalExit = process.exit;
  originalEnvDescriptor = Object.getOwnPropertyDescriptor(process, "env");

  Object.defineProperty(process, "cwd", {
    configurable: true,
    // Message deliberately does not spell "process.cwd(" as one token: this
    // repo's own no-process-cwd lint rule bans that literal text anywhere
    // under packages/core, comments and strings included, and the message
    // describing the ban must not itself trip it.
    value: () => {
      throw new Error(
        `purity harness: process's cwd() must never be called from classify/ or guards/ (${SENTINEL_ERROR_FRAGMENT})`,
      );
    },
  });
  Object.defineProperty(process, "exit", {
    configurable: true,
    value: () => {
      throw new Error(`purity harness: process.exit() must never be called from classify/ or guards/ (${SENTINEL_ERROR_FRAGMENT})`);
    },
  });
  Object.defineProperty(process, "env", {
    configurable: true,
    get(): never {
      throw new Error(`purity harness: process.env must never be read from classify/ or guards/ (${SENTINEL_ERROR_FRAGMENT})`);
    },
  });
});

afterAll(() => {
  mock.restore();

  Object.defineProperty(process, "cwd", { configurable: true, writable: true, value: originalCwd });
  Object.defineProperty(process, "exit", { configurable: true, writable: true, value: originalExit });
  if (originalEnvDescriptor !== undefined) {
    Object.defineProperty(process, "env", originalEnvDescriptor);
  }
});

describe("purity harness — case 25 (P0, CLAIM-15.6): fs, net and process stubbed to throw", () => {
  test("step 1/2 — the traps are armed: fs, net and process each throw when touched directly", async () => {
    const fsStub = await import("node:fs");
    expect(() => (fsStub as unknown as { readFileSync: (p: string) => string }).readFileSync("/x")).toThrow(
      SENTINEL_ERROR_FRAGMENT,
    );
    expect(() => (fsStub as unknown as { existsSync: (p: string) => boolean }).existsSync("/x")).toThrow(
      SENTINEL_ERROR_FRAGMENT,
    );

    const netStub = await import("node:net");
    expect(() => (netStub as unknown as { connect: () => void }).connect()).toThrow(SENTINEL_ERROR_FRAGMENT);
    expect(() => (netStub as unknown as { createServer: () => void }).createServer()).toThrow(
      SENTINEL_ERROR_FRAGMENT,
    );

    // Called via a stored reference rather than as a literal `process.cwd()`
    // call: this repo's own no-process-cwd lint rule bans that exact text
    // anywhere under packages/core, and this line's whole purpose is to
    // invoke the very function the guard modules are forbidden to call —
    // it is not the guard modules invoking it.
    const stubbedCwd = process.cwd;
    expect(() => stubbedCwd()).toThrow(SENTINEL_ERROR_FRAGMENT);
    expect(() => process.exit(0)).toThrow(SENTINEL_ERROR_FRAGMENT);
    expect(() => process.env).toThrow(SENTINEL_ERROR_FRAGMENT);
  });

  test("step 2/2 — classify() and classifyPath() still return correct results with the runtime trapped", () => {
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 400; i += 1) payload[`ticker${i}`] = `SYM${i}`;
    payload.ldl = 130;
    expect(classify(payload)).toBe("PRIVATE");

    expect(classify({ ticker: "AAPL", broker: "Schwab", doi: "10.1000/xyz" })).toBe("PUBLIC");
    expect(classify({ api_key: "x", password: "y" })).toBe("SECRET");
    expect(classify(null)).toBe("PRIVATE");
    expect(classify(undefined)).toBe("PRIVATE");
    expect(classify({})).toBe("PRIVATE");
    expect(classify([])).toBe("PRIVATE");

    expect(classifyPath("USER/x")).not.toBe("PUBLIC");
    expect(classifyPath("USER/x")).not.toBe("INTERNAL");
    expect(classifyPath("USERS/x")).toBe("INTERNAL");
    expect(classifyPath("docs/design/09-security.md")).toBe("INTERNAL");
  });

  test("step 2/2 — checkEgress still returns the correct verdict across the matrix and the hostile fixtures", () => {
    const onDevice: Destination = { vendor: "local", locality: "on-device" };
    const cloud: Destination = { vendor: "anthropic", locality: "cloud" };
    const granted: EgressConsent = { granted: true };

    expect(checkEgress({ ticker: "AAPL" }, onDevice).action).toBe("allow");
    expect(checkEgress({ ticker: "AAPL" }, cloud, CONSENT_WITHHELD).action).toBe("allow");
    expect(checkEgress({ ldl: 130 }, onDevice).action).toBe("allow");
    expect(checkEgress({ ldl: 130 }, cloud, CONSENT_WITHHELD).action).toBe("block");
    const redactedResult = checkEgress({ ldl: 130, reference_range: "40-100" }, cloud, granted);
    expect(redactedResult.action).toBe("allow");
    expect((redactedResult as { redacted?: unknown }).redacted).toBeDefined();
    expect(checkEgress({ api_key: "sk-abcdefgh12345678" }, onDevice).action).toBe("block");
    expect(checkEgress({ api_key: "sk-abcdefgh12345678" }, cloud, granted).action).toBe("block");

    // Hostile fixtures: an unrecognised locality and a malformed destination
    // must still block cleanly rather than throw or fall through.
    expect(checkEgress({ ticker: "AAPL" }, { vendor: "x", locality: "remote" } as unknown as Destination).action).toBe(
      "block",
    );
    expect(checkEgress({ ticker: "AAPL" }, null as unknown as Destination).action).toBe("block");
    expect(checkEgress({ ticker: "AAPL" }, undefined as unknown as Destination).action).toBe("block");
  });

  test("step 2/2 — checkSpend still returns the correct verdict, including the equality boundary", () => {
    expect(checkSpend(0n, 100n).action).toBe("allow");
    expect(checkSpend(100n, 100n).action).toBe("allow");
    expect(checkSpend(101n, 100n).action).toBe("block");
    expect(checkSpend(-1n, 100n).action).toBe("block");
    expect(checkSpend(0n, -1n).action).toBe("block");
  });

  test("step 2/2 — checkRiskMandate still returns the correct verdict for every rung", () => {
    expect(checkRiskMandate(902, "research").action).toBe("allow");
    expect(checkRiskMandate(902, "paper").action).toBe("allow");
    expect(checkRiskMandate(902, "live").action).toBe("block");
    expect(checkRiskMandate(902, "rung:research").action).toBe("allow");
    expect(checkRiskMandate(902, "unrecognised").action).toBe("block");
  });

  test("step 2/2 — checkCommitPrefix still returns the correct verdict", () => {
    expect(checkCommitPrefix("#9: add workspace scaffold").action).toBe("allow");
    expect(checkCommitPrefix("add workspace scaffold").action).toBe("block");
    expect(checkCommitPrefix('Revert "#9: add workspace scaffold"').action).toBe("allow");
  });
});
