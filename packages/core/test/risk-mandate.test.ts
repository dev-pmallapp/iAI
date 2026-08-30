import { describe, expect, test } from "bun:test";
import { checkRiskMandate } from "../src/guards/risk-mandate";

describe("checkRiskMandate — case 8 (P1, CLAIM-15.5): permits an auto run at rung:research and rung:paper", () => {
  test("allows at rung:research", () => {
    const result = checkRiskMandate(902, "research");
    expect(result.action).toBe("allow");
  });

  test("allows at rung:paper", () => {
    const result = checkRiskMandate(902, "paper");
    expect(result.action).toBe("allow");
  });

  test("never throws for either permitted rung", () => {
    expect(() => checkRiskMandate(902, "research")).not.toThrow();
    expect(() => checkRiskMandate(902, "paper")).not.toThrow();
  });
});

describe("checkRiskMandate — case 16 (P0, CLAIM-15.5): refuses an auto run at rung:live", () => {
  test("blocks at rung:live", () => {
    const result = checkRiskMandate(902, "live");
    expect(result.action).toBe("block");
  });

  test("the block message reproduces the hard-failure block at docs/design/03-workflow.md:498-504, with the Story number interpolated", () => {
    const result = checkRiskMandate(902, "live");

    expect(result.message).toContain("HARD FAILURE in Phase 6 (task-do):");
    expect(result.message).toContain("- Story: #902");
    expect(result.message).toContain("- Expected: rung:research or rung:paper for an /iai:auto run");
    expect(result.message).toContain("- Found: rung:live");
    expect(result.message).toContain("- Action: Pipeline cannot continue. Fix and re-run.");
  });

  test("the message reproduces the block verbatim, line for line", () => {
    const result = checkRiskMandate(902, "live");
    expect(result.message).toBe(
      "HARD FAILURE in Phase 6 (task-do):\n" +
        "- Story: #902\n" +
        "- Expected: rung:research or rung:paper for an /iai:auto run\n" +
        "- Found: rung:live\n" +
        "- Action: Pipeline cannot continue. Fix and re-run.",
    );
  });

  test("the Story identifier is interpolated for a different Story", () => {
    const result = checkRiskMandate(1234, "live");
    expect(result.message).toContain("- Story: #1234");
    expect(result.message).not.toContain("#902");
  });

  test("accepts a string Story identifier and interpolates it unchanged", () => {
    const result = checkRiskMandate("902", "live");
    expect(result.message).toContain("- Story: #902");
  });

  test("never throws at rung:live", () => {
    expect(() => checkRiskMandate(902, "live")).not.toThrow();
  });
});

describe("checkRiskMandate — unrecognised rung fails closed", () => {
  const unrecognised = ["", "RESEARCH", "Paper", "sandbox", "rung:paper", " paper", "paper ", "live "];

  for (const rung of unrecognised) {
    test(`blocks the unrecognised rung ${JSON.stringify(rung)}`, () => {
      const result = checkRiskMandate(902, rung);
      expect(result.action).toBe("block");
    });
  }

  test("an unrecognised rung's block message still names the Story and the found value", () => {
    const result = checkRiskMandate(902, "sandbox");
    expect(result.message).toContain("- Story: #902");
    expect(result.message).toContain("- Found: rung:sandbox");
  });

  test("never throws for any unrecognised rung", () => {
    for (const rung of unrecognised) {
      expect(() => checkRiskMandate(902, rung)).not.toThrow();
    }
  });
});

describe("checkRiskMandate purity and determinism", () => {
  test("is deterministic for the same input", () => {
    const first = checkRiskMandate(902, "live");
    const second = checkRiskMandate(902, "live");
    expect(first).toEqual(second);
  });

  test("returns a Decision-shaped object with action and message only, no VETO verdict (M6 scope, not this task)", () => {
    const result = checkRiskMandate(902, "live");
    expect(result.action === "allow" || result.action === "block").toBe(true);
    expect(typeof result.message).toBe("string");
  });
});
