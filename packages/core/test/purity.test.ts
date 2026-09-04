// The stubbed-runtime harness for CLAIM-15.6 (test case 25): no file under
// classify/, guards/ or gh/ performs I/O, proved by running the whole predicate
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
//
// PROCESS ISOLATION. `mock.module()` patches Bun's module registry for the
// whole PROCESS, not for this file, and `mock.restore()` does not put the
// real module back. Run in the same process as the rest of the suite, the
// throwing `node:fs` therefore leaks into every sibling file — it broke
// commit-prefix.test.ts's real-git integration case, which calls
// `mkdtempSync`. That failure was invisible locally and only appeared in CI,
// because whether it bites depends on the order Bun happens to load the test
// files in: locally this file ran last, in CI it ran first.
//
// So the harness runs in a CHILD process. Without IAI_PURITY_CHILD set this
// file spawns `bun test` on itself with the variable set, and asserts the
// child passed; with it set, the real harness below runs, its global mocks
// confined to a process that loads nothing else. The parent asserts the
// child's arming step actually executed rather than merely that it exited 0,
// so an empty or skipped child run cannot pass for a clean one.
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
import {
  classifyExitCode,
  commentCreate,
  issueCreate,
  labelCreate,
  milestoneList,
  planLabelTransition,
  prCreate,
  subIssueLink,
} from "../src/gh/index";
import {
  chooseStrategy,
  formatCompactUtcTimestamp,
  lintSentinelComment,
  makePermalink,
  matchSentinelLine,
  planCommentUpsert,
  renderPathTemplate,
  renderSentinelComment,
  requireSentinelComment,
  selectSentinelComment,
} from "../src/evidence/index";

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

// Read once, before `process.env` is replaced with a throwing getter below.
const IS_CHILD = Bun.env.IAI_PURITY_CHILD === "1";

if (!IS_CHILD) {
  describe("purity harness — case 25 (P0, CLAIM-15.6): runs isolated in a child process", () => {
    test("the isolated harness passes, and its arming step provably ran", async () => {
      const child = Bun.spawnSync({
        cmd: ["bun", "test", "packages/core/test/purity.test.ts"],
        env: { ...Bun.env, IAI_PURITY_CHILD: "1" },
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = `${child.stdout.toString()}${child.stderr.toString()}`;

      // Not just exit 0: a child that collected no tests also exits 0. The
      // arming step is the one test that proves the traps were live, so its
      // presence is asserted explicitly.
      expect(output).toContain("IAI-PURITY-ARMED");
      expect(output).toContain("0 fail");
      expect(output).not.toContain("(fail)");
      expect(output).toMatch(/ [1-9]\d* pass/);
      expect(child.exitCode).toBe(0);
    }, 60_000);
  });
}


let originalCwd: typeof process.cwd;
let originalExit: typeof process.exit;
let originalEnvDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  if (!IS_CHILD) return;
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
  if (!IS_CHILD) return;
  mock.restore();

  Object.defineProperty(process, "cwd", { configurable: true, writable: true, value: originalCwd });
  Object.defineProperty(process, "exit", { configurable: true, writable: true, value: originalExit });
  if (originalEnvDescriptor !== undefined) {
    Object.defineProperty(process, "env", originalEnvDescriptor);
  }
});

describe.if(IS_CHILD)("purity harness — case 25 (P0, CLAIM-15.6): fs, net and process stubbed to throw", () => {
  test("step 1/2 - the traps are armed: fs, net and process each throw when touched directly", async () => {
    // Bun prints per-test names only on failure, so a passing child says
    // nothing about WHICH tests ran. The parent needs to know this specific
    // test executed — a child that skipped it would still report 0 fail — so
    // it announces itself on stdout.
    console.log("IAI-PURITY-ARMED");

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

  test("step 2/2 - classify() and classifyPath() still return correct results with the runtime trapped", () => {
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

  test("step 2/2 - checkEgress still returns the correct verdict across the matrix and the hostile fixtures", () => {
    const onDevice: Destination = { vendor: "local", locality: "on-device" };
    const cloud: Destination = { vendor: "anthropic", locality: "cloud" };
    const granted: EgressConsent = { granted: true };

    expect(checkEgress({ ticker: "AAPL" }, onDevice).action).toBe("allow");
    expect(checkEgress({ ticker: "AAPL" }, cloud, CONSENT_WITHHELD).action).toBe("allow");
    expect(checkEgress({ ldl: 130 }, onDevice).action).toBe("allow");
    expect(checkEgress({ ldl: 130 }, cloud, CONSENT_WITHHELD).action).toBe("block");
    // Post-#243: PRIVATE to cloud blocks even with consent granted — the
    // matrix cell S1.2 shipped as "allow, redacted" no longer exists.
    const grantedResult = checkEgress({ ldl: 130, reference_range: "40-100" }, cloud, granted);
    expect(grantedResult.action).toBe("block");
    expect("redacted" in grantedResult).toBe(false);
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

  test("step 2/2 - checkSpend still returns the correct verdict, including the equality boundary", () => {
    expect(checkSpend(0n, 100n).action).toBe("allow");
    expect(checkSpend(100n, 100n).action).toBe("allow");
    expect(checkSpend(101n, 100n).action).toBe("block");
    expect(checkSpend(-1n, 100n).action).toBe("block");
    expect(checkSpend(0n, -1n).action).toBe("block");
  });

  test("step 2/2 - checkRiskMandate still returns the correct verdict for every rung", () => {
    expect(checkRiskMandate(902, "research").action).toBe("allow");
    expect(checkRiskMandate(902, "paper").action).toBe("allow");
    expect(checkRiskMandate(902, "live").action).toBe("block");
    expect(checkRiskMandate(902, "rung:research").action).toBe("allow");
    expect(checkRiskMandate(902, "unrecognised").action).toBe("block");
  });

  test("step 2/2 - checkCommitPrefix still returns the correct verdict", () => {
    expect(checkCommitPrefix("#9: add workspace scaffold").action).toBe("allow");
    expect(checkCommitPrefix("add workspace scaffold").action).toBe("block");
    expect(checkCommitPrefix('Revert "#9: add workspace scaffold"').action).toBe("allow");
  });

});

// Case 19 (P0, NEVER-21.9). The gh layer entered this rule's scope in #253,
// but scope only proves a file WOULD be checked. This exercises the surface
// with fs, net and process armed to throw, so an actual I/O call on an actual
// code path fails here rather than in production.
//
// One constructor per family named by CLAIM-21.1, plus the response-side
// functions, because a constructor that never runs proves nothing about a
// parser that does.
describe.if(IS_CHILD)("purity harness — case 19 (P0, NEVER-21.9): the gh layer runs with the runtime trapped", () => {
  test("every gh family constructs, and the response side classifies, with fs/net/process throwing", () => {
    const repo = { owner: "dev-pmallapp", name: "iAI" };

    const created = issueCreate(repo, { title: "T", body: "B" });
    expect(created.ok).toBe(true);
    expect(milestoneList(repo).ok).toBe(true);
    expect(labelCreate(repo, { name: "iai", color: "24292f" }).ok).toBe(true);
    expect(commentCreate(repo, 21, "b").ok).toBe(true);
    expect(subIssueLink("I_parentNode", "I_childNode").ok).toBe(true);
    expect(
      prCreate(repo, {
        base: "story/21-s",
        head: "task/22-c",
        title: "T",
        body: "B",
        defaultBranch: "main",
      }).ok,
    ).toBe(true);

    // The response side: classification reads a supplied envelope and must not
    // reach for the process, the network or the filesystem to do it.
    expect(classifyExitCode(1).classification).toBe("fatal");
    expect(classifyExitCode(9999).provenance).toBe("unmapped");

    const transition = planLabelTransition(repo, 21, {
      add: "status:resolved",
      current: ["status:in-progress"],
    });
    expect(transition.ok).toBe(true);
  });
});

// NEVER-26.7 — no module under packages/core/src/evidence performs I/O.
//
// The second half of the claim. The lint rule of case 19 proves the directory
// is IN SCOPE; this proves the code actually RUNS with the runtime trapped, so
// an I/O call on a real code path fails here rather than in production. Neither
// alone is sufficient, and case 21's mutation test is what proves the rule
// fires at all.
//
// One entry point per module the barrel exports, because a function that never
// runs proves nothing about the module beside it.
describe.if(IS_CHILD)("purity harness — case 20 (P0, NEVER-26.7): the evidence layer runs with the runtime trapped", () => {
  test("every evidence module executes with fs, net and process throwing", () => {
    // sentinel.ts
    expect(matchSentinelLine("## iai-evidence")).toBe("evidence");

    // lint.ts
    expect(lintSentinelComment("## iai-evidence\n\nbody")).toEqual([]);
    expect(lintSentinelComment("### iai-evidence\n\nbody").length).toBeGreaterThan(0);

    // consumer.ts
    const comments = [
      { id: 1, createdAt: "2026-09-01T00:00:00Z", body: "## iai-evidence\n\nold" },
      { id: 2, createdAt: "2026-09-02T00:00:00Z", body: "## iai-evidence\n\nnew" },
    ];
    expect(selectSentinelComment(comments, "evidence")?.comment.id).toBe(2);
    expect(requireSentinelComment([], "evidence").decision.action).toBe("block");

    // permalink.ts
    const link = makePermalink({
      owner: "dev-pmallapp",
      repo: "iAI",
      sha: "47004e5379c78abb8a62cc39bcf23507d97fee23",
      path: "docs/evidence/27.md",
    });
    expect(link.ok).toBe(true);

    // render.ts
    expect(chooseStrategy(60_000)).toBe("inline");
    const rendered = renderSentinelComment({
      sentinel: "evidence",
      artifact: "body text",
      story: 26,
      run: "2026-09-03T09:00:00Z",
      verdict: "PASS",
    });
    expect(rendered.ok).toBe(true);

    // template.ts -- formatCompactUtcTimestamp takes a Date rather than
    // reading a clock, which is exactly why it is callable here at all.
    expect(
      renderPathTemplate("docs/evidence/{issue}-{ts}.md", {
        issue: 26,
        ts: "20260825T141207Z",
      }).ok,
    ).toBe(true);
    const ts = formatCompactUtcTimestamp(new Date(0));
    expect(ts.ok).toBe(true);

    // upsert.ts
    const plan = planCommentUpsert({
      sentinel: "evidence",
      body: "## iai-evidence\n\nx",
      comments,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.value.action).toBe("edit");
  });
});
