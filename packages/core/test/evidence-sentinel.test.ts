import { describe, expect, test } from "bun:test";
import {
  ARTIFACT_BEARING_SENTINELS,
  isKnownSentinelName,
  isSentinelNamespace,
  isWellFormedSentinelComment,
  lintSentinelComment,
  matchSentinelLine,
  SENTINEL_NAMES,
  SENTINEL_NAMESPACE_PREFIX,
  SENTINEL_RULE_IDS,
  sentinelFor,
  sentinelLinePayload,
  sentinelNamesArePrefixFree,
  type SentinelRuleId,
} from "../src/evidence/index";

// The nine names of docs/design/03-workflow.md:372-382, written out here
// rather than imported, so the test fails if the constant is edited. A test
// that reads its expectation from the code under test asserts nothing.
const NINE = [
  "design",
  "test-plan",
  "evidence",
  "verdict",
  "checkpoint",
  "gate",
  "risk",
  "effort",
  "learnings",
];

function rulesOf(violations: readonly { rule: SentinelRuleId }[]): SentinelRuleId[] {
  return violations.map((v) => v.rule);
}

describe("evidence — case 1 (P0, CLAIM-26.1): a well-formed sentinel comment is accepted", () => {
  test("all nine names are accepted at column zero as the first line", () => {
    expect(SENTINEL_NAMES).toEqual(NINE as typeof SENTINEL_NAMES);
    for (const name of SENTINEL_NAMES) {
      const body = `${sentinelFor(name)}\n\nsome content\n`;
      expect(lintSentinelComment(body)).toEqual([]);
      expect(isWellFormedSentinelComment(body)).toBe(true);
    }
  });

  test("the namespace constant is the documented prefix", () => {
    expect(SENTINEL_NAMESPACE_PREFIX).toBe("## iai-");
    expect(sentinelFor("design")).toBe("## iai-design");
    expect(sentinelFor("test-plan")).toBe("## iai-test-plan");
  });

  test("the namespace is prefix-free, so name-plus-boundary matching is sound", () => {
    // Decision 4. Asserted rather than assumed: the nine are prefix-free
    // today and nothing guarantees a tenth would be.
    expect(sentinelNamesArePrefixFree()).toBe(true);
    // The guard actually detects a bad member rather than always returning true.
    expect(sentinelNamesArePrefixFree(["design", "design-doc"])).toBe(false);
  });

  test("a trailing payload on the sentinel line is legal", () => {
    // `## iai-verdict PASS` is used at docs/design/04-domain-dev.md:474 and
    // docs/design/05-domain-trading.md:581. Rejecting it would invalidate two
    // worked examples.
    expect(lintSentinelComment("## iai-verdict PASS\n\nbody")).toEqual([]);
    expect(matchSentinelLine("## iai-verdict PASS")).toBe("verdict");
    expect(sentinelLinePayload("## iai-verdict PASS")).toBe("PASS");
    expect(sentinelLinePayload("## iai-verdict")).toBeUndefined();
  });

  test("a longer name that merely starts with a known one does not match", () => {
    // The prefix collision `startswith` would admit. This is the whole reason
    // matching is name-plus-boundary and not docs/design/03-workflow.md:400's
    // `startswith("## iai-verdict")`.
    expect(matchSentinelLine("## iai-designation")).toBeUndefined();
    expect(matchSentinelLine("## iai-design")).toBe("design");
    expect(matchSentinelLine("## iai-gatekeeper")).toBeUndefined();
    expect(matchSentinelLine("## iai-gate")).toBe("gate");
  });

  test("the three artifact-bearing sentinels are a subset of the nine", () => {
    // Decision 10: budget, permalink and path-template behaviour is
    // conditional on an artifact path, not on the name. #29 and #30 rely on
    // this set rather than rediscovering it.
    expect(ARTIFACT_BEARING_SENTINELS).toEqual(["design", "test-plan", "evidence"]);
    for (const name of ARTIFACT_BEARING_SENTINELS) {
      expect(SENTINEL_NAMES).toContain(name);
    }
  });

  test("namespace and known-name predicates are distinct checks", () => {
    // isSentinelNamespace is a PREFIX test, for CLAIM-31.5's "falls outside
    // the `## iai-` namespace". isKnownSentinelName is the closed set.
    expect(isSentinelNamespace("## iai-design")).toBe(true);
    expect(isSentinelNamespace("## iai-something-new")).toBe(true);
    expect(isSentinelNamespace("## forge-design-doc")).toBe(false);
    expect(isSentinelNamespace("## iai-")).toBe(false);
    expect(isKnownSentinelName("design")).toBe(true);
    expect(isKnownSentinelName("something-new")).toBe(false);
    // The retired tenth must not reappear. docs/design/stories/194.md:227-229.
    expect(isKnownSentinelName("isa")).toBe(false);
  });
});

describe("evidence — case 2 (P0, CLAIM-26.1): each of the five producer-rule violations is rejected", () => {
  // One fixture per rule of docs/design/03-workflow.md:388-392. Each asserts
  // its own rule is reported; a fixture may legitimately report more than one
  // violation, and the fenced case does.
  const fixtures: readonly { rule: SentinelRuleId; body: string; note: string }[] = [
    {
      rule: "first-line",
      body: "Here are the results.\n\n## iai-evidence\n\nbody",
      note: "a preamble precedes the sentinel",
    },
    {
      rule: "column-zero",
      body: "  ## iai-evidence\n\nbody",
      note: "the sentinel is indented",
    },
    {
      rule: "not-fenced",
      body: "```markdown\n## iai-design\n```\n",
      note: "the sentinel sits inside a code fence",
    },
    {
      rule: "exact",
      body: "### iai-design\n\nbody",
      note: "the heading level is wrong",
    },
    {
      rule: "one-per-comment",
      body: "## iai-design\n\n## iai-evidence\n\nbody",
      note: "two sentinels in one body",
    },
  ];

  for (const fixture of fixtures) {
    test(`rejects: ${fixture.note}`, () => {
      const violations = lintSentinelComment(fixture.body);
      expect(violations.length).toBeGreaterThan(0);
      expect(rulesOf(violations)).toContain(fixture.rule);
      expect(isWellFormedSentinelComment(fixture.body)).toBe(false);
    });
  }

  test("all five rules are exercised by the fixture set", () => {
    // Guards against a fixture set that silently stops covering a rule. The
    // denominator is asserted, not assumed.
    const covered = new Set(fixtures.map((f) => f.rule));
    expect(covered.size).toBe(5);
    for (const id of SENTINEL_RULE_IDS) expect(covered.has(id)).toBe(true);
    expect(SENTINEL_RULE_IDS.length).toBe(5);
  });

  test("the `exact` rule catches case, separator and heading level, not only level", () => {
    // The rule CLAIM-26.1 as seeded dropped. docs/design/03-workflow.md:391
    // is the only one carrying these three properties.
    for (const bad of ["### iai-design", "# iai-design", "## IAI-Design", "## iai_design", "##iai-design"]) {
      expect(rulesOf(lintSentinelComment(`${bad}\n\nbody`))).toContain("exact");
    }
  });

  test("an unknown name inside the namespace is an `exact` violation", () => {
    expect(rulesOf(lintSentinelComment("## iai-isa\n\nbody"))).toContain("exact");
    expect(rulesOf(lintSentinelComment("## iai-invented\n\nbody"))).toContain("exact");
  });

  test("a body with no sentinel at all reports first-line", () => {
    expect(rulesOf(lintSentinelComment("just prose\n"))).toEqual(["first-line"]);
    expect(rulesOf(lintSentinelComment(""))).toEqual(["first-line"]);
  });

  test("a mismatched expected name is reported", () => {
    expect(lintSentinelComment("## iai-design\n\nbody", "design")).toEqual([]);
    expect(rulesOf(lintSentinelComment("## iai-design\n\nbody", "evidence"))).toContain("exact");
  });

  test("never throws on hostile input", () => {
    // NEVER-26.8's sweep lands in #261; this is the local slice of it, because
    // a linter that throws on a null body is worse than one that misjudges it.
    const hostile: unknown[] = [
      null,
      undefined,
      {},
      [],
      42,
      Symbol("s"),
      { toString() { throw new Error("hostile"); } },
    ];
    for (const input of hostile) {
      expect(() => lintSentinelComment(input)).not.toThrow();
      expect(isWellFormedSentinelComment(input)).toBe(false);
    }
  });
});

describe("evidence — case 3 (P0, CLAIM-26.1): the five rejection messages are pairwise distinct", () => {
  // The case that excludes a linter returning "malformed sentinel" five
  // times. Case 2 is satisfied by that implementation; this one is not.
  const oneBodyPerRule: Readonly<Record<SentinelRuleId, string>> = {
    "first-line": "Here are the results.\n\n## iai-evidence\n\nbody",
    "column-zero": "  ## iai-evidence\n\nbody",
    "not-fenced": "```markdown\n## iai-design\n```\n",
    exact: "### iai-design\n\nbody",
    "one-per-comment": "## iai-design\n\n## iai-evidence\n\nbody",
  };

  test("each rule yields a message, and the five messages are unique", () => {
    const messages = new Map<SentinelRuleId, string>();
    for (const id of SENTINEL_RULE_IDS) {
      const body = oneBodyPerRule[id];
      const found = lintSentinelComment(body).find((v) => v.rule === id);
      expect(found).toBeDefined();
      messages.set(id, found?.message ?? "");
    }
    expect(messages.size).toBe(5);
    const unique = new Set(messages.values());
    expect(unique.size).toBe(5);
  });

  test("every message names the rule it violated", () => {
    for (const id of SENTINEL_RULE_IDS) {
      const found = lintSentinelComment(oneBodyPerRule[id]).find((v) => v.rule === id);
      expect(found?.message.startsWith(`${id}:`)).toBe(true);
    }
  });

  test("no message is empty or a bare restatement of the rule id", () => {
    for (const id of SENTINEL_RULE_IDS) {
      const found = lintSentinelComment(oneBodyPerRule[id]).find((v) => v.rule === id);
      const message = found?.message ?? "";
      expect(message.length).toBeGreaterThan(id.length + 20);
    }
  });

  test("every violation carries a line number", () => {
    for (const id of SENTINEL_RULE_IDS) {
      for (const violation of lintSentinelComment(oneBodyPerRule[id])) {
        expect(Number.isInteger(violation.line)).toBe(true);
        expect(violation.line).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
