// Tests for Task #324, case 15 (P0, NEVER-293.10) step 1: the class count
// must be readable FROM THE CLASSIFIER, not hardcoded by a caller.
// `DATA_CLASSES` (packages/core/src/classify/levels.ts) is the single
// exported source of truth for which classes exist; `RANK` is derived from
// it rather than restating the four members, so the two structures cannot
// drift apart -- these tests prove that agreement rather than assuming it.
import { describe, expect, test } from "bun:test";
import { DATA_CLASSES, type DataClass } from "../src/classify/index";
import { maxClass, rankOf } from "../src/classify/levels";

describe("DATA_CLASSES (P0, NEVER-293.10): the class count is readable from the classifier", () => {
  test("0. denominator non-zero first", () => {
    expect(DATA_CLASSES.length).toBeGreaterThan(0);
  });

  // Asserted as a literal 4 in the TEST, per the task's own instruction --
  // production code must never hardcode this number, but a test proving the
  // corpus is exactly the four documented classes is the whole point.
  test("1. there are exactly 4 classes today", () => {
    expect(DATA_CLASSES.length).toBe(4);
  });

  test("2. every member of DATA_CLASSES has a rank (rankOf never throws, never returns undefined)", () => {
    for (const dataClass of DATA_CLASSES) {
      expect(() => rankOf(dataClass)).not.toThrow();
      expect(rankOf(dataClass)).toBeDefined();
      expect(typeof rankOf(dataClass)).toBe("number");
    }
  });

  test("3. ranks are assigned in DATA_CLASSES's own order, least-sensitive first", () => {
    for (let i = 0; i < DATA_CLASSES.length; i += 1) {
      expect(rankOf(DATA_CLASSES[i] as DataClass)).toBe(i);
    }
  });

  test("4. every rank is unique -- no two classes share a rank", () => {
    const ranks = DATA_CLASSES.map((dataClass) => rankOf(dataClass));
    expect(new Set(ranks).size).toBe(DATA_CLASSES.length);
  });

  test("5. the reverse direction: every DataClass the type union admits is present in DATA_CLASSES", () => {
    // Runtime check: a class removed from DATA_CLASSES (but still a member
    // of the DataClass union) must fail here directly -- this is the
    // assertion the mutation table's case (b) is aimed at.
    const required: readonly DataClass[] = ["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"];
    for (const dataClass of required) {
      expect(DATA_CLASSES.includes(dataClass)).toBe(true);
    }
  });

  test("5b. compile-time backstop: exhaustive switch over DataClass, mirrored against DATA_CLASSES", () => {
    // If `DataClass` ever grows a member absent from this switch, the
    // `never` assignment in the default arm fails to compile -- a second,
    // independent guarantee that DATA_CLASSES cannot silently fall behind
    // the type it is supposed to enumerate.
    function assertKnown(dataClass: DataClass): true {
      switch (dataClass) {
        case "PUBLIC":
        case "INTERNAL":
        case "PRIVATE":
        case "SECRET":
          return true;
        default: {
          const exhaustive: never = dataClass;
          throw new Error(`unreachable: ${String(exhaustive)}`);
        }
      }
    }
    for (const dataClass of DATA_CLASSES) {
      expect(assertKnown(dataClass)).toBe(true);
    }
  });

  test("6. the array is frozen -- a caller cannot mutate the shared export", () => {
    expect(Object.isFrozen(DATA_CLASSES)).toBe(true);
    expect(() => {
      (DATA_CLASSES as unknown as DataClass[]).push("PUBLIC");
    }).toThrow();
  });

  test("7. maxClass agrees with rank order over every ordered pair", () => {
    for (const a of DATA_CLASSES) {
      for (const b of DATA_CLASSES) {
        const expected = rankOf(a) >= rankOf(b) ? a : b;
        expect(maxClass(a, b)).toBe(expected);
      }
    }
  });
});
