import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bodyPermalinksArePinned,
  BUDGET_CHARS,
  chooseStrategy,
  ENVELOPE_BUDGET_CHARS,
  HARD_LIMIT_CHARS,
  isShaPinnedPermalink,
  lintSentinelComment,
  makePermalink,
  renderSentinelComment,
  requireShaPinnedPermalink,
  type EvidenceResult,
  type RenderedComment,
} from "../src/evidence/index";

function value(result: EvidenceResult<RenderedComment>): RenderedComment {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

const SHA40 = "47004e5379c78abb8a62cc39bcf23507d97fee23";
const PERMALINK = `https://github.com/dev-pmallapp/iAI/blob/${SHA40}/docs/evidence/27.md`;

function artifactOf(chars: number): string {
  return "x".repeat(chars);
}

function render(chars: number, extra: Record<string, unknown> = {}) {
  return renderSentinelComment({
    sentinel: "evidence",
    artifact: artifactOf(chars),
    story: 26,
    run: "2026-09-03T08:00:00Z",
    verdict: "PASS",
    permalink: PERMALINK,
    ...extra,
  });
}

describe("evidence — case 8 (P0, CLAIM-26.4): a 59,999-character artifact is inlined", () => {
  test("strategy is inline and the full content appears below the sentinel", () => {
    const out = value(render(59_999));
    expect(out.strategy).toBe("inline");
    expect(out.artifactChars).toBe(59_999);
    expect(out.body).toContain(artifactOf(59_999));
    expect(out.body.indexOf("## iai-evidence")).toBe(0);
  });

  test("no permalink is emitted when the artifact is inlined", () => {
    const out = value(render(59_999));
    expect(out.body).not.toContain("/blob/");
    expect(out.body).not.toContain("exceeds the inline budget");
  });
});

describe("evidence — case 9 (P0, CLAIM-26.4): a 60,000-character artifact is inlined", () => {
  // The boundary CLAIM-26.4 never defined. docs/milestones/M1.md:189 demands a
  // fixture at exactly 60,000; the claim names only 59,999 and 60,001.
  // docs/design/03-workflow.md:415 says `<= 60000` inlines, and Decision 5
  // adopts it.
  test("exactly at budget inlines, not summarises", () => {
    const out = value(render(60_000));
    expect(out.strategy).toBe("inline");
    expect(out.artifactChars).toBe(BUDGET_CHARS);
    expect(out.body).not.toContain("exceeds the inline budget");
  });

  test("chooseStrategy agrees at the boundary and either side of it", () => {
    expect(chooseStrategy(59_999)).toBe("inline");
    expect(chooseStrategy(60_000)).toBe("inline");
    expect(chooseStrategy(60_001)).toBe("summary");
    expect(chooseStrategy(0)).toBe("inline");
  });
});

describe("evidence — case 10 (P0, CLAIM-26.4): a 60,001-character artifact yields summary plus permalink", () => {
  test("strategy is summary and the artifact text does not appear", () => {
    const out = value(render(60_001));
    expect(out.strategy).toBe("summary");
    expect(out.body).not.toContain(artifactOf(60_001));
    expect(out.body).toContain("exceeds the inline budget");
  });

  test("the body carries a size statement and exactly one permalink", () => {
    const out = value(render(60_001));
    expect(out.body).toContain("60 kB");
    const urls = out.body.match(/https?:\/\/\S+/g) ?? [];
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(PERMALINK);
  });

  test("the permalink is a bare URL on its own line, as the worked example writes it", () => {
    // docs/design/03-workflow.md:425 uses a bare URL, not a markdown link. A
    // bare URL survives being pasted into a terminal.
    const out = value(render(60_001));
    const lines = out.body.split("\n");
    expect(lines).toContain(PERMALINK);
    expect(out.body).not.toContain(`](${PERMALINK})`);
  });

  test("an over-budget artifact with no permalink is a construction failure", () => {
    const result = render(60_001, { permalink: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("permalink");
  });
});

describe("evidence — case 11 (P0, CLAIM-26.4): no emitted body exceeds 65,536 characters", () => {
  test("all three boundary fixtures render under the hard limit", () => {
    for (const chars of [59_999, 60_000, 60_001]) {
      const out = value(render(chars));
      expect(out.body.length).toBeLessThanOrEqual(HARD_LIMIT_CHARS);
    }
  });

  test("the limit is measured on the rendered body, not the artifact", () => {
    // The two are different quantities — Decision 5. A 60,000-char artifact
    // renders to strictly more than 60,000 characters.
    const out = value(render(60_000));
    expect(out.body.length).toBeGreaterThan(out.artifactChars);
    expect(out.body.length).toBeLessThanOrEqual(HARD_LIMIT_CHARS);
  });

  test("the constants compose exactly", () => {
    expect(BUDGET_CHARS).toBe(60_000);
    expect(HARD_LIMIT_CHARS).toBe(65_536);
    expect(ENVELOPE_BUDGET_CHARS).toBe(5_536);
    expect(BUDGET_CHARS + ENVELOPE_BUDGET_CHARS).toBe(HARD_LIMIT_CHARS);
  });

  test("a full-budget artifact with a maximal envelope still fits", () => {
    // The worst inline case: artifact exactly at budget, envelope as large as
    // the bound allows. If these two did not compose, case 11 would hold only
    // for small metadata.
    const out = value(render(60_000, { cases: "x".repeat(1000) }));
    expect(out.strategy).toBe("inline");
    expect(out.envelopeChars).toBeLessThanOrEqual(ENVELOPE_BUDGET_CHARS);
    expect(out.body.length).toBeLessThanOrEqual(HARD_LIMIT_CHARS);
  });
});

describe("evidence — case 12 (P1, CLAIM-26.4): the envelope stays within its 5,536-character budget", () => {
  test("envelope is body length minus inlined artifact length", () => {
    const out = value(render(1000));
    expect(out.envelopeChars).toBe(out.body.length - out.artifactChars);
    expect(out.envelopeChars).toBeLessThanOrEqual(ENVELOPE_BUDGET_CHARS);
  });

  test("a summary's envelope is its whole body", () => {
    const out = value(render(60_001));
    expect(out.envelopeChars).toBe(out.body.length);
    expect(out.envelopeChars).toBeLessThanOrEqual(ENVELOPE_BUDGET_CHARS);
  });

  test("an oversized envelope is a construction failure, not a silent overrun", () => {
    // This is the bound that makes case 11 true by construction rather than by
    // luck. Without it, a large `cases` string could push a full-budget
    // artifact past the hard limit.
    const result = render(100, { cases: "y".repeat(ENVELOPE_BUDGET_CHARS + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("envelope");
      expect(result.reason).toContain("5536");
    }
  });

  test("the envelope stays small for the realistic shape", () => {
    // The worked example at docs/design/03-workflow.md:418-426 is roughly 180
    // characters. The reserve is ~30x that.
    const out = value(render(60_001, { cases: "4/4 P0, 6/6 P1" }));
    expect(out.envelopeChars).toBeLessThan(500);
  });
});

describe("evidence — case 13 (P0, CLAIM-26.5): 7-hex and 40-hex SHAs are both accepted", () => {
  const base = { owner: "dev-pmallapp", repo: "iAI", path: "docs/evidence/27.md" };

  test("7, 8 and 40 character lowercase hex SHAs are accepted", () => {
    for (const sha of ["47004e5", "47004e53", SHA40]) {
      const result = makePermalink({ ...base, sha });
      expect(result.ok).toBe(true);
      if (result.ok) expect(isShaPinnedPermalink(result.value)).toBe(true);
    }
  });

  test("6 and 41 character SHAs are rejected, and the message names the SHA rule", () => {
    // Asserting the MESSAGE, not just the rejection. Mutation-testing showed
    // that loosening the anchored SHA check to {1,40} still rejects a 6-char
    // sha -- the assembled URL fails the blob-segment check as a backstop --
    // but degrades the reason from "must be lowercase hex, 7 to 40
    // characters" to an opaque "assembled permalink failed its own
    // validation". Same class of defect as #27 case 3.
    for (const sha of ["47004e", `${SHA40}a`]) {
      const result = makePermalink({ ...base, sha });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("is not a commit SHA");
        expect(result.reason).toContain("7 to 40 characters");
        expect(result.reason).not.toContain("failed its own validation");
      }
    }
  });

  test("uppercase hex is rejected", () => {
    expect(makePermalink({ ...base, sha: "47004E5" }).ok).toBe(false);
    expect(makePermalink({ ...base, sha: SHA40.toUpperCase() }).ok).toBe(false);
  });

  test("the pattern agrees with the one already shipped in guards/path-refs.ts", () => {
    // If these drifted, every permalink this Story emits would start failing
    // claim-lint as a dangling path, because path-refs uses its copy to
    // EXCLUDE permalink targets from the check.
    const source = readFileSync(join(import.meta.dir, "../src/guards/path-refs.ts"), "utf8");
    expect(source).toContain("/\\/blob\\/[0-9a-f]{7,40}\\/");
  });

  test("every permalink example in the design documents is accepted", () => {
    // Real strings from the tree, not invented ones.
    const real = [
      "https://github.com/acme/telemetry/blob/4f2a1c9e/docs/evidence/901-20260114T092211.md",
      "https://github.com/dev-pmallapp/iAI/blob/ce02b291a9216d297a17d22fb8bb2fe398d14f7c/docs/design/9-isa.md",
    ];
    for (const url of real) expect(isShaPinnedPermalink(url)).toBe(true);
  });
});

describe("evidence — case 14 (P0, CLAIM-26.5): a branch-named permalink is rejected", () => {
  test("blob/main, blob/HEAD and blob/story-26 are all rejected", () => {
    for (const ref of ["main", "HEAD", "story-26"]) {
      const url = `https://github.com/dev-pmallapp/iAI/blob/${ref}/docs/evidence/27.md`;
      expect(isShaPinnedPermalink(url)).toBe(false);
      const result = requireShaPinnedPermalink(url);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain(ref);
    }
  });

  test("the failure names the branch form rather than reporting a generic parse error", () => {
    const result = requireShaPinnedPermalink(
      "https://github.com/dev-pmallapp/iAI/blob/main/docs/evidence/27.md",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not a commit SHA");
      expect(result.reason).toContain("/blob/[0-9a-f]{7,40}/");
    }
  });

  test("makePermalink refuses a branch name as a sha", () => {
    const result = makePermalink({
      owner: "dev-pmallapp",
      repo: "iAI",
      sha: "main",
      path: "docs/evidence/27.md",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("branch name is never acceptable");
  });

  test("a summary can never be rendered with a branch-named permalink", () => {
    const result = render(60_001, {
      permalink: "https://github.com/dev-pmallapp/iAI/blob/main/docs/evidence/27.md",
    });
    expect(result.ok).toBe(false);
  });

  test("bodyPermalinksArePinned catches an unpinned link in a posted body", () => {
    expect(bodyPermalinksArePinned(`## iai-evidence\n\n${PERMALINK}\n`)).toBe(true);
    expect(
      bodyPermalinksArePinned("## iai-evidence\n\nhttps://github.com/a/b/blob/main/c.md\n"),
    ).toBe(false);
    // A non-blob URL is not a permalink claim and is left alone.
    expect(bodyPermalinksArePinned("## iai-evidence\n\nhttps://example.invalid/x\n")).toBe(true);
  });
});

describe("evidence — case 25 (P0, NEVER-26.10): no rendered summary omits the permalink", () => {
  test("every over-budget rendering carries a SHA-pinned URL", () => {
    for (const chars of [60_001, 100_000, 250_000]) {
      const out = value(render(chars));
      expect(out.strategy).toBe("summary");
      expect(bodyPermalinksArePinned(out.body)).toBe(true);
      expect(out.body).toMatch(/\/blob\/[0-9a-f]{7,40}\//);
    }
  });

  test("a missing or unusable permalink is a construction failure, not a warning", () => {
    for (const bad of [undefined, "", "not a url", "https://github.com/a/b/blob/main/c.md"]) {
      const result = render(60_001, { permalink: bad });
      expect(result.ok).toBe(false);
    }
  });
});

describe("evidence — case 26 (P0, NEVER-26.10): nothing is rendered above the sentinel line", () => {
  test("line 1 is the sentinel at column zero, across every rendering shape", () => {
    const shapes: Record<string, unknown>[] = [
      {},
      { story: undefined, run: undefined, verdict: undefined, cases: undefined },
      { cases: "4/4 P0" },
      { verdictOnSentinelLine: true },
      { story: undefined, cases: "1/1 P0" },
    ];
    for (const shape of shapes) {
      for (const chars of [0, 100, 60_001]) {
        const out = value(render(chars, shape));
        expect(out.body.split("\n")[0]?.startsWith("## iai-evidence")).toBe(true);
        expect(out.body.startsWith("## iai-evidence")).toBe(true);
      }
    }
  });

  test("every rendered body passes the sentinel linter from #27", () => {
    // The renderer validates its own output. This makes NEVER-26.10 a
    // structural property of every rendering rather than something each test
    // has to remember to check.
    for (const chars of [0, 1, 59_999, 60_000, 60_001]) {
      const out = value(render(chars));
      expect(lintSentinelComment(out.body, "evidence")).toEqual([]);
    }
  });

  test("a verdict may ride on the sentinel line", () => {
    const out = value(render(100, { sentinel: "verdict", verdictOnSentinelLine: true }));
    expect(out.body.split("\n")[0]).toBe("## iai-verdict PASS");
    expect(lintSentinelComment(out.body, "verdict")).toEqual([]);
  });

  test("an artifact carrying its own column-zero sentinel cannot be inlined", () => {
    // It would produce a body with two sentinels, breaking #27's
    // one-per-comment rule. Fail closed and say what to do instead.
    const result = renderSentinelComment({
      sentinel: "evidence",
      artifact: "## iai-design\n\nquoted format documentation\n",
      story: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("sentinel linter");
      expect(result.reason).toContain("summary plus a permalink");
    }
  });

  test("never throws on hostile input", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      {},
      42,
      "string",
      [],
      { sentinel: "evidence" },
      { sentinel: "nope", artifact: "x" },
      { sentinel: "evidence", artifact: null },
      { sentinel: "evidence", artifact: "x", story: -1 },
      { sentinel: "evidence", artifact: "x", get permalink(): string { throw new Error("h"); } },
      { get sentinel(): string { throw new Error("h"); }, artifact: "x" },
    ];
    for (const input of hostile) {
      expect(() => renderSentinelComment(input)).not.toThrow();
    }
    for (const input of hostile) {
      expect(() => makePermalink(input)).not.toThrow();
      expect(() => isShaPinnedPermalink(input)).not.toThrow();
      expect(() => bodyPermalinksArePinned(input)).not.toThrow();
    }
  });
});
