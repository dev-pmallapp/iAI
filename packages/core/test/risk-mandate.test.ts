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
  // "rung:paper" was previously listed here as unrecognised. It is not: it is
  // the label form of a permitted rung, and treating it as unrecognised was
  // the defect the regression block at the foot of this file now pins.
  // Casing and whitespace variants stay unrecognised — normalisation strips
  // one `rung:` prefix and nothing else.
  const unrecognised = ["", "RESEARCH", "Paper", "sandbox", " paper", "paper ", "live "];

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

// Regression: labels are the source of truth for a Story's rung
// (docs/design/03-workflow.md:96-98, :135) and carry the `rung:` prefix
// literally, so a caller reading one off an issue holds "rung:research".
// The first implementation accepted only the bare form, which turned a
// legitimate auto run at rung:research into a block and showed itself only
// as a doubled prefix in the failure message.
describe("checkRiskMandate — case 8/16 regression: accepts the label form", () => {
  test.each([
    ["rung:research"],
    ["rung:paper"],
  ])("%s is permitted, exactly as its bare form is", (rung) => {
    expect(checkRiskMandate(902, rung).action).toBe("allow");
  });

  test.each([
    ["rung:live"],
    ["rung:backtest"],
    ["rung:rung:live"],
  ])("%s is refused", (rung) => {
    expect(checkRiskMandate(902, rung).action).toBe("block");
  });

  test("both spellings of a permitted rung agree", () => {
    expect(checkRiskMandate(902, "rung:research")).toEqual(checkRiskMandate(902, "research"));
    expect(checkRiskMandate(902, "rung:paper")).toEqual(checkRiskMandate(902, "paper"));
  });

  test("both spellings of the live rung agree", () => {
    expect(checkRiskMandate(902, "rung:live")).toEqual(checkRiskMandate(902, "live"));
  });

  test("the failure message never doubles the rung prefix", () => {
    const message = checkRiskMandate(902, "rung:live").message;
    expect(message).toContain("- Found: rung:live");
    expect(message).not.toContain("rung:rung:");
  });

  test("only one prefix is stripped, so rung:rung:live stays unrecognised", () => {
    expect(checkRiskMandate(902, "rung:rung:live").message).toContain("- Found: rung:rung:live");
  });

  test("a non-string rung blocks and does not throw", () => {
    for (const rung of [null, undefined, 42, {}, []]) {
      expect(() => checkRiskMandate(902, rung as never)).not.toThrow();
      expect(checkRiskMandate(902, rung as never).action).toBe("block");
    }
  });
});
