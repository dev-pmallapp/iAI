import { describe, expect, test } from "bun:test";
import { decide, type Action } from "../src/index";

describe("decide", () => {
  test("returns the given action and message", () => {
    const result = decide("warn", "check the egress rule");
    expect(result).toEqual({ action: "warn", message: "check the egress rule" });
  });

  const actions: Action[] = ["allow", "warn", "block"];

  for (const action of actions) {
    test(`round-trips the "${action}" action`, () => {
      const result = decide(action, `${action} message`);
      expect(result.action).toBe(action);
      expect(result.message).toBe(`${action} message`);
    });
  }
});
