import { describe, expect, test } from "bun:test";
import {
  attemptsExceeded,
  backoffDelayMs,
  BACKOFF_CAP_MS,
  MAX_RETRY_ATTEMPTS,
  planResume,
  type BatchItem,
} from "../src/gh/index";

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

interface Item extends BatchItem {
  readonly id: number;
  readonly title: string;
}

// Ten items, ids 1..10, mirroring a ten-issue batch. This exact fixture is
// shared by cases 10 and 11 because case 11 IS case 10 continued — the same
// batch, resumed.
const TEN_ITEMS: readonly Item[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  title: `issue ${i + 1}`,
}));

describe("planResume — case 10 (P0, CLAIM-21.5): a rate-limited response yields a resume plan naming the unprocessed items", () => {
  test("10 items failing at item 4 names items 4-10 and omits 1-3", () => {
    const plan = value(planResume<Item>(TEN_ITEMS, 4, 1));
    expect(plan.remaining.map((i) => i.id)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(plan.resumeIndex).toBe(3);
    expect(plan.totalItems).toBe(10);
    // Omission is the other half of naming the remainder: items 1-3 must not
    // appear anywhere in the plan.
    for (const omitted of [1, 2, 3]) {
      expect(plan.remaining.some((i) => i.id === omitted)).toBe(false);
    }
  });

  test("failing at item 1 names the whole batch; failing at item 10 names only the last", () => {
    expect(value(planResume<Item>(TEN_ITEMS, 1, 1)).remaining.map((i) => i.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(value(planResume<Item>(TEN_ITEMS, 10, 1)).remaining.map((i) => i.id)).toEqual([10]);
  });

  test("the plan carries a computed backoff delay for the given attempt", () => {
    const plan = value(planResume<Item>(TEN_ITEMS, 4, 2));
    expect(plan.attempt).toBe(2);
    expect(plan.delayMs).toBe(value(backoffDelayMs(2)));
  });

  test("an id absent from the batch, a duplicate id, or an empty batch are typed failures", () => {
    expect(planResume<Item>(TEN_ITEMS, 999, 1).ok).toBe(false);
    expect(planResume<Item>([], 1, 1).ok).toBe(false);
    const withDuplicate = [...TEN_ITEMS, { id: 4, title: "dup" }];
    expect(planResume<Item>(withDuplicate, 4, 1).ok).toBe(false);
  });
});

// docs/test-plans/21-plan.md Note 3: "Case 11, not case 10, is the real
// resume test ... Exactly-once across the union is the property; naming the
// remainder is only half of it."
describe("planResume — case 11 (P0, CLAIM-21.5): re-invoking with the plan emits commands for exactly those items and no others", () => {
  test("across both invocations the union is all 10 items and each appears exactly once", () => {
    // Invocation 1: process items in order, "emitting a command" for each by
    // recording its id, until item 4 fails.
    const firstInvocationEmitted: number[] = [];
    let failedAt: number | undefined;
    for (const item of TEN_ITEMS) {
      if (item.id === 4) {
        failedAt = item.id;
        break;
      }
      firstInvocationEmitted.push(item.id);
    }
    expect(failedAt).toBe(4);
    expect(firstInvocationEmitted).toEqual([1, 2, 3]);

    // The plan is the value carried between invocations (Decision 4) — no
    // state lives in this module, so re-deriving it from TEN_ITEMS and
    // failedAt is the only way invocation 2 gets it.
    const plan = value(planResume<Item>(TEN_ITEMS, failedAt as number, 1));

    // Invocation 2: a fresh call, emitting a command for exactly plan.remaining.
    const secondInvocationEmitted = plan.remaining.map((item) => item.id);

    const union = [...firstInvocationEmitted, ...secondInvocationEmitted];
    expect(union.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Exactly once: no id appears in both invocations' emitted sets, and no
    // id appears twice within either.
    const seen = new Set<number>();
    let duplicates = 0;
    for (const id of union) {
      if (seen.has(id)) duplicates += 1;
      seen.add(id);
    }
    expect(duplicates).toBe(0);
    expect(seen.size).toBe(10);
  });

  test("resuming twice in a row (a second failure inside the resumed remainder) still yields exactly-once overall", () => {
    // First failure at item 4: emits 1-3, plan names 4-10.
    const plan1 = value(planResume<Item>(TEN_ITEMS, 4, 1));
    // Within the resumed remainder, a second failure at item 7: emits 4-6
    // from plan1.remaining, then a second plan is derived from the ORIGINAL
    // batch and the new failed id — never from plan1.remaining, which would
    // shift indices and corrupt resumeIndex.
    const secondInvocationEmitted = plan1.remaining.filter((i) => i.id < 7).map((i) => i.id);
    const plan2 = value(planResume<Item>(TEN_ITEMS, 7, 2));
    const thirdInvocationEmitted = plan2.remaining.map((i) => i.id);

    const union = [1, 2, 3, ...secondInvocationEmitted, ...thirdInvocationEmitted];
    expect(union.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(union).size).toBe(10);
  });
});

describe("backoffDelayMs — monotonicity and cap", () => {
  test("delay is non-decreasing as attempt increases", () => {
    let previous = 0;
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const delay = value(backoffDelayMs(attempt));
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  test("delay is capped at BACKOFF_CAP_MS and stays there for arbitrarily large attempts", () => {
    const near = value(backoffDelayMs(20));
    const far = value(backoffDelayMs(1000));
    expect(near).toBe(BACKOFF_CAP_MS);
    expect(far).toBe(BACKOFF_CAP_MS);
  });

  test("attempt 1 is exactly BACKOFF_BASE_MS, doubling until the cap", () => {
    expect(value(backoffDelayMs(1))).toBe(1000);
    expect(value(backoffDelayMs(2))).toBe(2000);
    expect(value(backoffDelayMs(3))).toBe(4000);
  });

  test("a non-positive-integer attempt is a typed failure, not a throw or a guessed default", () => {
    expect(backoffDelayMs(0).ok).toBe(false);
    expect(backoffDelayMs(-1).ok).toBe(false);
    expect(backoffDelayMs(1.5).ok).toBe(false);
    expect(backoffDelayMs(Number.NaN).ok).toBe(false);
    expect(backoffDelayMs(null as never).ok).toBe(false);
  });
});

describe("attemptsExceeded and MAX_RETRY_ATTEMPTS", () => {
  test("an attempt beyond MAX_RETRY_ATTEMPTS is refused, and planResume itself refuses to plan one", () => {
    expect(attemptsExceeded(MAX_RETRY_ATTEMPTS)).toBe(false);
    expect(attemptsExceeded(MAX_RETRY_ATTEMPTS + 1)).toBe(true);
    const result = planResume<Item>(TEN_ITEMS, 4, MAX_RETRY_ATTEMPTS + 1);
    expect(result.ok).toBe(false);
  });
});

describe("gh resume — hostile-input corpus asserting 0 throws", () => {
  test("planResume, backoffDelayMs and attemptsExceeded never throw", () => {
    const throwingItem = {} as Record<string, unknown>;
    Object.defineProperty(throwingItem, "id", {
      enumerable: true,
      get(): string {
        throw new Error("boom");
      },
    });
    const calls: Array<() => unknown> = [
      () => planResume(null, 1, 1),
      () => planResume(undefined, 1, 1),
      () => planResume([], 1, 1),
      () => planResume([{}], 1, 1),
      () => planResume([throwingItem], 1, 1),
      () => planResume(TEN_ITEMS, null, 1),
      () => planResume(TEN_ITEMS, {}, 1),
      () => planResume(TEN_ITEMS, 4, "many" as never),
      () => planResume(TEN_ITEMS, 4, -1),
      () => planResume(TEN_ITEMS, 4, Number.NaN),
      () => backoffDelayMs(null),
      () => backoffDelayMs(undefined),
      () => backoffDelayMs("2" as never),
      () => attemptsExceeded(null),
      () => attemptsExceeded("x" as never),
    ];
    let threw = 0;
    for (const call of calls) {
      try {
        call();
      } catch {
        threw += 1;
      }
    }
    expect(threw).toBe(0);
  });
});
