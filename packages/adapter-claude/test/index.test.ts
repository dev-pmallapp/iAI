import { describe, expect, test } from "bun:test";
import { allowEgress, blockEgress, decide } from "iai-core";
import { renderDecision, toExitCode } from "../src/index";

describe("toExitCode", () => {
  test("returns 2 for a block Decision", () => {
    expect(toExitCode(decide("block", "no"))).toBe(2);
  });

  test("returns 0 for allow and warn Decisions", () => {
    expect(toExitCode(decide("allow", "ok"))).toBe(0);
    expect(toExitCode(decide("warn", "careful"))).toBe(0);
  });

  test("case 22 (P0, CLAIM-15.3): a block EgressDecision produces exit code 2 with no cast", () => {
    expect(toExitCode(blockEgress("secret payload blocked"))).toBe(2);
  });

  test("case 24 (P0, NEVER-15.7): both EgressDecision arms pass to toExitCode without a cast", () => {
    expect(toExitCode(allowEgress("fine"))).toBe(0);
    expect(toExitCode(blockEgress("nope"))).toBe(2);
  });
});

describe("renderDecision", () => {
  test("on block, the message is stderr-only and stdout is empty", () => {
    const result = renderDecision(decide("block", "secret leaked"));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("secret leaked");
    expect(result.stdout).toBe("");
  });

  test("on allow, the decision is rendered as stdout JSON and stderr is empty", () => {
    const result = renderDecision(decide("allow", "fine"));
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ action: "allow", message: "fine" });
  });

  test("never calls process.exit itself, so it stays testable", () => {
    const originalExit = process.exit;
    let called = false;
    process.exit = (() => {
      called = true;
      return undefined as never;
    }) as typeof process.exit;
    try {
      renderDecision(decide("block", "no"));
    } finally {
      process.exit = originalExit;
    }
    expect(called).toBe(false);
  });
});
