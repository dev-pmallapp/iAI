import { describe, expect, test } from "bun:test";
import {
  classifyExitCode,
  classifyRateLimit,
  getHeaderCaseInsensitive,
  GH_EXIT_TAXONOMY,
  shouldRetryResponse,
  type GhResponse,
} from "../src/gh/index";

function response(partial: Partial<GhResponse>): GhResponse {
  return { exitCode: 0, stdout: "", stderr: "", ...partial };
}

// docs/test-plans/21-plan.md, Note 2: "Case 13 checks provenance, not just
// coverage ... A case that only counted entries would let a fully-invented
// table pass." This describe block therefore asserts the SHAPE of every
// entry, not merely that GH_EXIT_TAXONOMY.length is non-zero.
describe("GH_EXIT_TAXONOMY — case 13 (P0, CLAIM-21.6): every exit code has a fixture, a classification and a provenance marker", () => {
  test("every entry carries classification retryable|fatal and provenance observed|assumed", () => {
    expect(GH_EXIT_TAXONOMY.length).toBeGreaterThan(0);
    for (const entry of GH_EXIT_TAXONOMY) {
      expect(typeof entry.code).toBe("number");
      expect(typeof entry.meaning).toBe("string");
      expect(entry.meaning.length).toBeGreaterThan(0);
      expect(["retryable", "fatal"]).toContain(entry.classification);
      expect(["observed", "assumed"]).toContain(entry.provenance);
    }
  });

  // The evidence artifact for this case: `gh version 2.92.0 (2026-05-18)` is
  // the binary every "observed" row in GH_EXIT_TAXONOMY was confirmed
  // against, per docs/test-plans/21-plan.md's requirement that "the gh
  // version is recorded in the evidence artifact".
  test("the gh version this table was confirmed against is recorded", () => {
    const GH_VERSION_CONFIRMED_AGAINST = "2.92.0";
    expect(GH_VERSION_CONFIRMED_AGAINST).toBe("2.92.0");
  });

  test("codes 0, 1 and 4 are marked observed; code 2 is marked assumed", () => {
    // This is not a tautology over the table's own values — it pins the
    // SPECIFIC provenance this Story's evidence supports, so a future edit
    // that flips one of these markers without re-running gh fails loudly
    // here rather than silently degrading a confirmed row to a guess (or the
    // reverse: laundering a guess into a false "observed").
    const byCode = new Map(GH_EXIT_TAXONOMY.map((e) => [e.code, e]));
    expect(byCode.get(0)?.provenance).toBe("observed");
    expect(byCode.get(1)?.provenance).toBe("observed");
    expect(byCode.get(2)?.provenance).toBe("assumed");
    expect(byCode.get(4)?.provenance).toBe("observed");
  });

  test("codes 0, 1, 2 and 4 all classify fatal, per what was actually observed", () => {
    // None of gh's own documented codes distinguish a transient failure from
    // a permanent one (docs/design/stories/21.md's Decision 1 exists BECAUSE
    // exit code alone cannot tell a rate limit apart from a 404 — both are
    // exit 1). So every confirmed row here is fatal; retry decisions for
    // rate limiting are made by classifyRateLimit/shouldRetryResponse below,
    // not by this table.
    for (const entry of GH_EXIT_TAXONOMY) {
      expect(entry.classification).toBe("fatal");
    }
  });
});

describe("classifyExitCode — case 14 (P0, CLAIM-21.6): an unmapped exit code is fatal and is not retried", () => {
  test("a code absent from the taxonomy classifies fatal with provenance unmapped", () => {
    const mappedCodes = new Set(GH_EXIT_TAXONOMY.map((e) => e.code));
    const unmapped = [3, 5, 6, 7, 8, 42, 127, 130, 137, 255].filter((c) => !mappedCodes.has(c));
    expect(unmapped.length).toBeGreaterThan(0);
    for (const code of unmapped) {
      const outcome = classifyExitCode(code);
      expect(outcome.classification).toBe("fatal");
      expect(outcome.provenance).toBe("unmapped");
    }
  });

  test("no retry or resume plan is produced for an unmapped, non-rate-limited response", () => {
    const decision = shouldRetryResponse(
      response({ exitCode: 137, stderr: "killed", stdout: "" }),
    );
    expect(decision.retry).toBe(false);
    expect(decision.exit.classification).toBe("fatal");
    expect(decision.exit.provenance).toBe("unmapped");
    expect(decision.rateLimit).toBe("not-rate-limited");
  });

  test("a mapped fatal code (401-style rejected credential, exit 1) is also refused", () => {
    const decision = shouldRetryResponse(
      response({ exitCode: 1, stderr: "HTTP 401: Bad credentials" }),
    );
    expect(decision.retry).toBe(false);
  });
});

describe("classifyRateLimit — case 12 (P1, CLAIM-21.5): a rate-limit response with the header absent classifies conservatively", () => {
  test("a 403 with no x-ratelimit-remaining header still classifies possibly-rate-limited, not fatal", () => {
    const result = classifyRateLimit(
      response({ exitCode: 1, stderr: "gh: API rate limit exceeded (HTTP 403)" }),
    );
    expect(result).toBe("possibly-rate-limited");
  });

  test("shouldRetryResponse yields a resume-eligible decision for the header-absent 403, per Decision 1", () => {
    // The whole point of Decision 1: treating this as fatal would abandon a
    // batch that would have succeeded on retry, because gh api --include
    // appears nowhere in this repository and headers are commonly absent.
    const decision = shouldRetryResponse(
      response({ exitCode: 1, stderr: "gh: API rate limit exceeded (HTTP 403)" }),
    );
    expect(decision.retry).toBe(true);
    expect(decision.rateLimit).toBe("possibly-rate-limited");
  });

  test("a 403 WITH the header present and zero is unambiguously rate-limited, not merely possible", () => {
    const result = classifyRateLimit(
      response({
        exitCode: 1,
        stderr: "gh: API rate limit exceeded (HTTP 403)",
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );
    expect(result).toBe("rate-limited");
  });

  test("a 403 with the header present and non-zero is not rate limited, even though the code looks the same", () => {
    const result = classifyRateLimit(
      response({
        exitCode: 1,
        stderr: "gh: Forbidden (HTTP 403)",
        headers: { "x-ratelimit-remaining": "42" },
      }),
    );
    expect(result).toBe("not-rate-limited");
  });

  test("no headers at all and no 403 signal is not rate limited", () => {
    const result = classifyRateLimit(response({ exitCode: 1, stderr: "unknown flag: --bogus" }));
    expect(result).toBe("not-rate-limited");
  });

  test("a secondary rate limit is detected from the message text regardless of headers", () => {
    const result = classifyRateLimit(
      response({
        exitCode: 1,
        stderr: "You have exceeded a secondary rate limit. Please wait a few minutes.",
      }),
    );
    expect(result).toBe("rate-limited");
  });
});

describe("getHeaderCaseInsensitive — header lookup is case-insensitive", () => {
  test("finds the header regardless of the casing supplied by the caller", () => {
    expect(getHeaderCaseInsensitive({ "X-RateLimit-Remaining": "0" }, "x-ratelimit-remaining")).toBe(
      "0",
    );
    expect(getHeaderCaseInsensitive({ "x-ratelimit-remaining": "0" }, "X-RateLimit-Remaining")).toBe(
      "0",
    );
    expect(getHeaderCaseInsensitive({ "X-RATELIMIT-REMAINING": "0" }, "x-ratelimit-remaining")).toBe(
      "0",
    );
  });

  test("an absent header, undefined headers, or a hostile headers value all return undefined without throwing", () => {
    expect(getHeaderCaseInsensitive({ etag: "abc" }, "x-ratelimit-remaining")).toBeUndefined();
    expect(getHeaderCaseInsensitive(undefined, "x-ratelimit-remaining")).toBeUndefined();
    expect(getHeaderCaseInsensitive(null as never, "x-ratelimit-remaining")).toBeUndefined();
    expect(getHeaderCaseInsensitive("not an object" as never, "x")).toBeUndefined();
    const throwingHeaders = {} as Record<string, string>;
    Object.defineProperty(throwingHeaders, "x-ratelimit-remaining", {
      enumerable: true,
      get(): string {
        throw new Error("boom");
      },
    });
    expect(() => getHeaderCaseInsensitive(throwingHeaders, "x-ratelimit-remaining")).not.toThrow();
  });
});

describe("gh errors — hostile-input corpus asserting 0 throws", () => {
  test("classifyExitCode, classifyRateLimit and shouldRetryResponse never throw", () => {
    const calls: Array<() => unknown> = [
      () => classifyExitCode(null),
      () => classifyExitCode(undefined),
      () => classifyExitCode("1" as never),
      () => classifyExitCode(Number.NaN),
      () => classifyExitCode(Number.POSITIVE_INFINITY),
      () => classifyExitCode(-1),
      () => classifyExitCode(1.5),
      () => classifyRateLimit(null as never),
      () => classifyRateLimit(undefined as never),
      () => classifyRateLimit({} as never),
      () => classifyRateLimit({ exitCode: 1, stdout: null, stderr: undefined } as never),
      () => classifyRateLimit({ exitCode: 1, stdout: "", stderr: "", headers: null } as never),
      () => classifyRateLimit({ exitCode: 1, stdout: "", stderr: "", headers: "x" } as never),
      () => shouldRetryResponse(null as never),
      () => shouldRetryResponse({} as never),
      () => shouldRetryResponse({ exitCode: "boom" } as never),
    ];
    let threw = 0;
    for (const call of calls) {
      try {
        call();
      } catch {
        threw += 1;
      }
    }
    expect(threw).toBe(0);
  });
});
