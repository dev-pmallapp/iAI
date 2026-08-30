import { describe, expect, test } from "bun:test";
import { allowEgress, blockEgress, decide, type Decision, type EgressDecision } from "../src/index";

describe("decide", () => {
  test("keeps its two-argument form and returns no redacted continuation", () => {
    const result = decide("allow", "fine");
    expect(result).toEqual({ action: "allow", message: "fine" });
    expect(result.redacted).toBeUndefined();
  });
});

describe("allowEgress", () => {
  test("returns action allow carrying the message", () => {
    const result = allowEgress("ok");
    expect(result.action).toBe("allow");
    expect(result.message).toBe("ok");
  });

  test("carries a redacted continuation when supplied", () => {
    const redacted = { field: "de-identified" };
    const result = allowEgress("ok, de-identified", redacted);
    expect(result.action).toBe("allow");
    if (result.action === "allow") {
      expect(result.redacted).toBe(redacted);
    }
  });
});

describe("blockEgress", () => {
  test("returns action block carrying the message and no redacted field", () => {
    const result = blockEgress("blocked");
    expect(result).toEqual({ action: "block", message: "blocked" });
  });
});

describe("EgressDecision is assignable to Decision (case 24, NEVER-15.7)", () => {
  test("the allow arm, with and without redacted, is assignable to Decision with no cast", () => {
    const withoutRedacted: Decision = allowEgress("ok");
    const withRedacted: Decision = allowEgress("ok", { safe: true });
    expect(withoutRedacted.action).toBe("allow");
    expect(withRedacted.action).toBe("allow");
  });

  test("the block arm is assignable to Decision with no cast", () => {
    const asDecision: Decision = blockEgress("nope");
    expect(asDecision.action).toBe("block");
  });

  test("an EgressDecision value can be stored in a Decision-typed variable directly", () => {
    const decisions: EgressDecision[] = [allowEgress("ok"), blockEgress("nope")];
    const asWider: Decision[] = decisions;
    expect(asWider).toHaveLength(2);
  });
});
