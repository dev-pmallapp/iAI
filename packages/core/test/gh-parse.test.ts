import { describe, expect, test } from "bun:test";
import { parseGhJson, parseIssueCreateUrl } from "../src/gh/index";

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

// Decision 7 of docs/design/stories/21.md: the one sanctioned exception to
// "never scrape human-formatted output" (docs/design/09-security.md:192),
// because `gh issue create` has no --json flag.
describe("parseIssueCreateUrl — the Decision 7 URL parser: valid URL", () => {
  test("extracts the trailing issue number from a real gh issue create URL", () => {
    expect(value(parseIssueCreateUrl("https://github.com/dev-pmallapp/iAI/issues/901"))).toBe(
      901,
    );
  });

  test("tolerates a trailing newline and surrounding whitespace, and a single trailing slash", () => {
    expect(value(parseIssueCreateUrl("https://github.com/dev-pmallapp/iAI/issues/901\n"))).toBe(
      901,
    );
    expect(value(parseIssueCreateUrl("  https://github.com/dev-pmallapp/iAI/issues/901  "))).toBe(
      901,
    );
    expect(value(parseIssueCreateUrl("https://github.com/dev-pmallapp/iAI/issues/901/"))).toBe(
      901,
    );
  });

  test("owner and repo segments carrying dots, hyphens and underscores are accepted", () => {
    expect(value(parseIssueCreateUrl("https://github.com/dev.pmallapp/i_AI-2/issues/1"))).toBe(1);
  });
});

describe("parseIssueCreateUrl — the Decision 7 URL parser: non-URL line", () => {
  test("a line that is not a GitHub issue URL is a typed failure, not a guessed integer", () => {
    const result = parseIssueCreateUrl("created issue #901");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not a GitHub issue URL");
  });

  test("a pull-request URL is refused, even though it shares the trailing-number shape", () => {
    expect(parseIssueCreateUrl("https://github.com/dev-pmallapp/iAI/pull/901").ok).toBe(false);
  });

  test("a bare number, an empty string, and a non-GitHub host are all refused", () => {
    expect(parseIssueCreateUrl("901").ok).toBe(false);
    expect(parseIssueCreateUrl("").ok).toBe(false);
    expect(parseIssueCreateUrl("https://example.com/dev-pmallapp/iAI/issues/901").ok).toBe(false);
  });

  test("scripts/bootstrap-stories.py's own precedent form would have accepted this; Decision 7 requires refusing it", () => {
    // r.stdout.strip().rstrip("/").split("/")[-1] on this string yields "901"
    // — a plausible-looking but wrong number, since this line is a warning,
    // not the created issue's URL. This is exactly the failure mode Decision
    // 7's stricter validation exists to close off.
    expect(parseIssueCreateUrl("warning: rate limited, retry after 901").ok).toBe(false);
  });
});

describe("parseIssueCreateUrl — the Decision 7 URL parser: hostile input", () => {
  test("non-string, null, undefined and object stdout are typed failures, never a throw", () => {
    const calls: Array<() => unknown> = [
      () => parseIssueCreateUrl(null),
      () => parseIssueCreateUrl(undefined),
      () => parseIssueCreateUrl({}),
      () => parseIssueCreateUrl([]),
      () => parseIssueCreateUrl(901),
      () => parseIssueCreateUrl("https://github.com/" + "a".repeat(10_000) + "/b/issues/1"),
      () => parseIssueCreateUrl("https://github.com/a/b/issues/" + "9".repeat(400)),
      () => parseIssueCreateUrl("https://github.com/a/b/issues/1\nrm -rf /"),
      () => parseIssueCreateUrl("https://github.com/a/b/issues/-1"),
      () => parseIssueCreateUrl("https://github.com/a/b/issues/1.5"),
    ];
    let threw = 0;
    let failures = 0;
    for (const call of calls) {
      try {
        const result = call() as { ok: boolean };
        if (!result.ok) failures += 1;
      } catch {
        threw += 1;
      }
    }
    expect(threw).toBe(0);
    // Only the first real, well-formed URL among these is absent — all are
    // hostile or malformed, so all must be typed failures.
    expect(failures).toBe(calls.length);
  });
});

describe("parseGhJson — a safe JSON parser for --json output", () => {
  test("parses a well-formed object and array", () => {
    expect(value(parseGhJson<{ number: number }>('{"number":901}'))).toEqual({ number: 901 });
    expect(value(parseGhJson<number[]>("[1,2,3]"))).toEqual([1, 2, 3]);
  });

  test("tolerates surrounding whitespace", () => {
    expect(value(parseGhJson("  {\"a\":1}  \n"))).toEqual({ a: 1 });
  });

  test("malformed JSON is a typed failure, not a throw", () => {
    expect(parseGhJson("{not json").ok).toBe(false);
    expect(parseGhJson("").ok).toBe(false);
    expect(parseGhJson("   ").ok).toBe(false);
  });

  test("non-string input is a typed failure, never a throw", () => {
    const calls: Array<() => unknown> = [
      () => parseGhJson(null),
      () => parseGhJson(undefined),
      () => parseGhJson(42),
      () => parseGhJson({}),
      () => parseGhJson("{\"__proto__\":{\"polluted\":true}}"),
      () => parseGhJson("[".repeat(10_000)),
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
