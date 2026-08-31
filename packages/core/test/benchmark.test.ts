// The latency benchmark for CLAIM-15.5 (test case 21). Per Decision 6 of
// docs/design/stories/15.md, "always" under 50ms is a structural property
// that CLAIM-15.6's purity harness delivers — no I/O, no directory walk, no
// network call, so no unbounded term exists in any of these four functions'
// cost. A benchmark cannot establish "always"; a sampled maximum is only a
// statement about the sample. What a benchmark CAN do is check that nothing
// pathological is hiding in the bounded cost that purity does allow (a
// quadratic loop over a large corpus, an accidental O(n^2) walk), which is
// why CLAIM-15.5's p99 over 10,000 iterations is adopted as the gate here,
// while the observed maximum is reported alongside it rather than gated on:
// a regression that only shows up in the tail should be visible without
// making an occasional GC pause during iteration 8,412 fail the build.
import { describe, expect, test } from "bun:test";
import {
  CONSENT_WITHHELD,
  checkCommitPrefix,
  checkEgress,
  checkRiskMandate,
  checkSpend,
  type Destination,
  type EgressConsent,
} from "../src/guards/index";

const ITERATIONS = 10_000;
const WARMUP_ITERATIONS = 500;
const P99_BUDGET_MS = 50;

interface LatencyStats {
  p50: number;
  p99: number;
  max: number;
}

function percentileOf(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const index = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil(p * sortedAscending.length) - 1));
  return sortedAscending[index] ?? 0;
}

function computeStats(durationsMs: readonly number[]): LatencyStats {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  return {
    p50: percentileOf(sorted, 0.5),
    p99: percentileOf(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

// Warms up before timing so the JIT's own compile-and-optimise cost — a
// one-time cost paid by the process, not by the predicate — does not land
// inside the sampled distribution and inflate an early percentile.
function benchmark(fn: (iteration: number) => void): LatencyStats {
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) fn(i);

  const durationsMs = new Array<number>(ITERATIONS);
  for (let i = 0; i < ITERATIONS; i += 1) {
    const start = performance.now();
    fn(i);
    durationsMs[i] = performance.now() - start;
  }
  return computeStats(durationsMs);
}

// --- checkEgress corpus --------------------------------------------------
// One fixture per matrix cell (Decision 3), plus the hostile shapes the
// design and NEVER-15.8/NEVER-15.9 require this predicate to survive: a
// 400-field payload, ten levels of nesting, a prototype-polluted
// destination, a throwing getter, an unrecognised locality and a null
// destination. A benchmark run only over trivial single-field payloads
// would measure nothing about the classifier walk inside checkEgress.
const ON_DEVICE: Destination = { vendor: "local", locality: "on-device" };
const CLOUD: Destination = { vendor: "anthropic", locality: "cloud" };
const CONSENT_GRANTED: EgressConsent = { granted: true };

function largePublicPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (let i = 0; i < 400; i += 1) payload[`ticker${i}`] = `SYM${i}`;
  return payload;
}

function deepPrivatePayload(): unknown {
  let node: unknown = { ldl: 130, reference_range: "40-100" };
  for (let i = 0; i < 10; i += 1) node = { nested: node };
  return node;
}

const PROTOTYPE_POLLUTED_DESTINATION = Object.create({
  vendor: "anthropic",
  locality: "cloud",
}) as Destination;

function throwingGetterDestination(): Destination {
  const destination = { vendor: "anthropic" } as Destination;
  Object.defineProperty(destination, "locality", {
    enumerable: true,
    get(): string {
      throw new Error("benchmark hostile fixture: locality getter throws");
    },
  });
  return destination;
}

const EGRESS_FIXTURES: Array<{ payload: unknown; destination: Destination; consent: EgressConsent | undefined }> = [
  { payload: { ticker: "AAPL", broker: "Schwab", doi: "10.1000/xyz" }, destination: ON_DEVICE, consent: undefined },
  { payload: { design_doc: "docs/design/09-security.md" }, destination: CLOUD, consent: CONSENT_WITHHELD },
  { payload: { ldl: 130, account_balance: 1200 }, destination: ON_DEVICE, consent: undefined },
  { payload: { ldl: 130, account_balance: 1200 }, destination: CLOUD, consent: CONSENT_WITHHELD },
  {
    payload: { account_number: "4147209388713009", balance: 184209.44, ldl: 130, reference_range: "40-100" },
    destination: CLOUD,
    consent: CONSENT_GRANTED,
  },
  { payload: { api_key: "sk-abcdefgh12345678" }, destination: ON_DEVICE, consent: undefined },
  { payload: { api_key: "sk-abcdefgh12345678" }, destination: CLOUD, consent: CONSENT_GRANTED },
  { payload: largePublicPayload(), destination: ON_DEVICE, consent: undefined },
  { payload: deepPrivatePayload(), destination: CLOUD, consent: CONSENT_GRANTED },
  { payload: { ticker: "AAPL" }, destination: { vendor: "x", locality: "remote" } as unknown as Destination, consent: undefined },
  { payload: { ticker: "AAPL" }, destination: null as unknown as Destination, consent: undefined },
  { payload: { ticker: "AAPL" }, destination: undefined as unknown as Destination, consent: undefined },
  { payload: { ticker: "AAPL" }, destination: PROTOTYPE_POLLUTED_DESTINATION, consent: CONSENT_GRANTED },
  { payload: { ticker: "AAPL" }, destination: throwingGetterDestination(), consent: undefined },
];

// --- checkSpend corpus ----------------------------------------------------
const SPEND_FIXTURES: Array<[bigint, bigint]> = [
  [0n, 100n],
  [100n, 100n],
  [101n, 100n],
  [1_000_000n, 1_000_000_000_000n],
  [1_000_000_000_001n, 1_000_000_000_000n],
  [0n, 0n],
  [-1n, 100n],
  [0n, -1n],
  [-5n, -1n],
  [9_999_999_999_999_999n, 1n],
];

// --- checkRiskMandate corpus -----------------------------------------------
const RISK_MANDATE_FIXTURES: Array<[string | number, string]> = [
  [902, "research"],
  [902, "paper"],
  [902, "live"],
  [902, "rung:research"],
  [902, "rung:paper"],
  [902, "rung:live"],
  [902, "rung:rung:live"],
  [902, ""],
  [902, "unrecognised"],
  ["902", "research"],
];

// --- checkCommitPrefix corpus -----------------------------------------------
const COMMIT_PREFIX_FIXTURES: string[] = [
  "#9: add workspace scaffold",
  "#999999999: x",
  "add workspace scaffold",
  "#9 add workspace scaffold",
  'Merge branch "main" into feature',
  "fixup! #9: add workspace scaffold",
  "squash! #9: add workspace scaffold",
  'Revert "#9: add workspace scaffold"',
  "",
  "#9:" + " x".repeat(200),
];

function printTable(rows: Array<{ name: string; stats: LatencyStats }>): void {
  const header = `${"predicate".padEnd(20)}  ${"p50 (ms)".padStart(10)}  ${"p99 (ms)".padStart(10)}  ${"max (ms)".padStart(10)}`;
  console.log(`\nlatency — case 21 (P1, CLAIM-15.5): ${ITERATIONS} iterations per predicate`);
  console.log(header);
  console.log("-".repeat(header.length));
  for (const { name, stats } of rows) {
    console.log(
      `${name.padEnd(20)}  ${stats.p50.toFixed(4).padStart(10)}  ${stats.p99.toFixed(4).padStart(10)}  ${stats.max.toFixed(4).padStart(10)}`,
    );
  }
  console.log("");
}

describe("latency — case 21 (P1, CLAIM-15.5): p99 under 50ms over 10,000 iterations, 4/4 predicates", () => {
  test(
    "checkEgress, checkSpend, checkCommitPrefix and checkRiskMandate each stay under the p99 budget; the observed max is reported, not gated",
    () => {
      const egressStats = benchmark((i) => {
        const fixture = EGRESS_FIXTURES[i % EGRESS_FIXTURES.length];
        if (fixture === undefined) return;
        checkEgress(fixture.payload, fixture.destination, fixture.consent);
      });

      const spendStats = benchmark((i) => {
        const fixture = SPEND_FIXTURES[i % SPEND_FIXTURES.length];
        if (fixture === undefined) return;
        checkSpend(fixture[0], fixture[1]);
      });

      const riskMandateStats = benchmark((i) => {
        const fixture = RISK_MANDATE_FIXTURES[i % RISK_MANDATE_FIXTURES.length];
        if (fixture === undefined) return;
        checkRiskMandate(fixture[0], fixture[1]);
      });

      const commitPrefixStats = benchmark((i) => {
        const fixture = COMMIT_PREFIX_FIXTURES[i % COMMIT_PREFIX_FIXTURES.length];
        if (fixture === undefined) return;
        checkCommitPrefix(fixture);
      });

      printTable([
        { name: "checkEgress", stats: egressStats },
        { name: "checkSpend", stats: spendStats },
        { name: "checkRiskMandate", stats: riskMandateStats },
        { name: "checkCommitPrefix", stats: commitPrefixStats },
      ]);

      // The gate, per Decision 6: p99 < 50ms is how "always" is measured.
      // The observed maximum is asserted only to be a finite, sane number —
      // it is reported above for the evidence artifact, never gated on,
      // because a sampled maximum is a statement about the sample, not a
      // structural guarantee (that guarantee is CLAIM-15.6's).
      expect(egressStats.p99).toBeLessThan(P99_BUDGET_MS);
      expect(spendStats.p99).toBeLessThan(P99_BUDGET_MS);
      expect(riskMandateStats.p99).toBeLessThan(P99_BUDGET_MS);
      expect(commitPrefixStats.p99).toBeLessThan(P99_BUDGET_MS);

      for (const stats of [egressStats, spendStats, riskMandateStats, commitPrefixStats]) {
        expect(Number.isFinite(stats.max)).toBe(true);
        expect(stats.max).toBeGreaterThanOrEqual(stats.p99);
        expect(stats.p99).toBeGreaterThanOrEqual(stats.p50);
      }
    },
    // Generous relative to the sub-millisecond-per-call reality of a pure
    // function over 10,000 iterations x 4 predicates: this bounds runaway
    // CI flakiness from an unrelated stall, not the 50ms-per-call gate
    // above, which is the real assertion.
    30_000,
  );
});
