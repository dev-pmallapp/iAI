import { describe, expect, test } from "bun:test";
import { checkSpend } from "../src/guards/spend";

describe("checkSpend — case 7 (P1, CLAIM-15.5): below threshold allows", () => {
  const fixtures: [bigint, bigint, string][] = [
    [0n, 100n, "zero amount, positive threshold"],
    [1n, 100n, "one minor unit under a small threshold"],
    [99n, 100n, "one minor unit below threshold"],
    [0n, 0n, "zero amount, zero threshold (covered again at the boundary case)"],
    [1_000_000n, 1_000_000_000_000n, "large amount well under a large threshold"],
  ];

  for (const [amount, threshold, label] of fixtures) {
    test(`allows ${label} (amount=${amount}, threshold=${threshold})`, () => {
      const result = checkSpend(amount, threshold);
      expect(result.action).toBe("allow");
    });
  }

  test("never throws for any below-threshold fixture", () => {
    for (const [amount, threshold] of fixtures) {
      expect(() => checkSpend(amount, threshold)).not.toThrow();
    }
  });
});

describe("checkSpend — case 15 (P1, CLAIM-15.5): above threshold blocks, including the exact-equality boundary", () => {
  const aboveFixtures: [bigint, bigint, string][] = [
    [101n, 100n, "one minor unit over threshold"],
    [1_000_000_000_001n, 1_000_000_000_000n, "large amount just over a large threshold"],
    [1n, 0n, "any positive amount over a zero threshold"],
  ];

  for (const [amount, threshold, label] of aboveFixtures) {
    test(`blocks ${label} (amount=${amount}, threshold=${threshold})`, () => {
      const result = checkSpend(amount, threshold);
      expect(result.action).toBe("block");
    });
  }

  test("an amount exactly equal to the threshold allows, not blocks (docs/design/03-workflow.md:244: the gate triggers on an outflow 'above' the limit, and equal is not above)", () => {
    const result = checkSpend(100n, 100n);
    expect(result.action).toBe("allow");
  });

  test("the equality boundary holds at zero as well: amount 0 against threshold 0 allows", () => {
    const result = checkSpend(0n, 0n);
    expect(result.action).toBe("allow");
  });

  test("never throws for any above-threshold fixture", () => {
    for (const [amount, threshold] of aboveFixtures) {
      expect(() => checkSpend(amount, threshold)).not.toThrow();
    }
  });
});

describe("checkSpend — incoherent input fails closed", () => {
  test("a negative amount blocks even when it is numerically under the threshold", () => {
    const result = checkSpend(-1n, 100n);
    expect(result.action).toBe("block");
  });

  test("a negative threshold blocks even when the amount is zero", () => {
    const result = checkSpend(0n, -1n);
    expect(result.action).toBe("block");
  });

  test("a negative amount against a negative threshold blocks", () => {
    const result = checkSpend(-5n, -1n);
    expect(result.action).toBe("block");
  });

  test("never throws for negative input", () => {
    expect(() => checkSpend(-1n, 100n)).not.toThrow();
    expect(() => checkSpend(0n, -1n)).not.toThrow();
    expect(() => checkSpend(-5n, -1n)).not.toThrow();
  });
});

describe("checkSpend purity and signature", () => {
  test("returns a Decision-shaped object with action and message only", () => {
    const result = checkSpend(1n, 100n);
    expect(typeof result.action).toBe("string");
    expect(typeof result.message).toBe("string");
  });

  test("is deterministic for the same input", () => {
    const first = checkSpend(50n, 100n);
    const second = checkSpend(50n, 100n);
    expect(first).toEqual(second);
  });
});
