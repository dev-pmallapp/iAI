import { describe, expect, test } from "bun:test";
import { allowEgress, blockEgress, decide } from "iai-core";
import { applyDecision } from "../src/index";

describe("applyDecision", () => {
  test("throws the Decision's message on block", () => {
    expect(() => applyDecision(decide("block", "no way"))).toThrow("no way");
  });

  test("does not throw on allow or warn", () => {
    expect(() => applyDecision(decide("allow", "ok"))).not.toThrow();
    expect(() => applyDecision(decide("warn", "careful"))).not.toThrow();
  });

  test("case 22 (P0, CLAIM-15.3): a block EgressDecision throws, matching the Claude adapter's exit 2", () => {
    expect(() => applyDecision(blockEgress("secret payload blocked"))).toThrow("secret payload blocked");
  });

  test("case 24 (P0, NEVER-15.7): both EgressDecision arms pass to applyDecision without a cast", () => {
    const output = { args: { raw: true } };
    expect(() => applyDecision(allowEgress("fine"), output)).not.toThrow();
    expect(() => applyDecision(blockEgress("nope"), output)).toThrow("nope");
  });

  test("case 23 (P0, CLAIM-15.4): allow-with-continuation mutates output.args to decision.redacted", () => {
    const raw = { name: "raw record" };
    const redacted = { name: "de-identified" };
    const output = { args: raw };
    applyDecision(allowEgress("ok, de-identified", redacted), output);
    expect(output.args).toBe(redacted);
    expect(output.args).not.toBe(raw);
  });

  test("case 23: the raw value is never assigned once a redacted continuation is present", () => {
    const raw = { secret: "do-not-leak" };
    const redacted = { secret: "[redacted]" };
    const output = { args: "placeholder" as unknown };
    applyDecision(allowEgress("ok, de-identified", redacted), output);
    expect(output.args).toEqual(redacted);
    expect(output.args).not.toBe(raw);
    expect(JSON.stringify(output.args)).not.toContain("do-not-leak");
  });

  test("allow without a redacted continuation leaves output.args untouched", () => {
    const raw = { name: "raw record" };
    const output = { args: raw };
    applyDecision(allowEgress("fine, no redaction needed"), output);
    expect(output.args).toBe(raw);
  });

  test("block never mutates output even though it is provided", () => {
    const raw = { name: "raw record" };
    const output = { args: raw };
    expect(() => applyDecision(blockEgress("blocked"), output)).toThrow();
    expect(output.args).toBe(raw);
  });

  test("applyDecision with no output argument does not throw on allow-with-redacted", () => {
    expect(() => applyDecision(allowEgress("ok", { safe: true }))).not.toThrow();
  });
});
