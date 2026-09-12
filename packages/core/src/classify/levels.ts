// The four-level data classifier's rank order (issue #16). PUBLIC is the
// least sensitive, SECRET the most; `classify` always resolves a structure to
// the highest level any part of it reaches, never a partial or per-field
// result (docs/design/stories/15.md, CLAIM-15.1).
export type DataClass = "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET";

// THE single source of truth for which classes exist, in rank order,
// least-sensitive first (Task #324, case 15 of docs/test-plans/293-plan.md,
// anchoring NEVER-293.10). `RANK` below is DERIVED from this array rather
// than restating the four members, so a fifth class added to `DataClass`
// cannot silently go missing from one of the two without also going missing
// from the other — the two would simply fail to compile or fail
// packages/core/test/classify.test.ts's agreement assertions instead.
//
// Frozen so a caller holding a reference cannot mutate the shared array out
// from under every other reader of this module.
export const DATA_CLASSES: readonly DataClass[] = Object.freeze([
  "PUBLIC",
  "INTERNAL",
  "PRIVATE",
  "SECRET",
]);

const RANK: Record<DataClass, number> = Object.freeze(
  Object.fromEntries(DATA_CLASSES.map((dataClass, index) => [dataClass, index])) as Record<DataClass, number>,
);

export function rankOf(dataClass: DataClass): number {
  return RANK[dataClass];
}

export function maxClass(a: DataClass, b: DataClass): DataClass {
  return RANK[a] >= RANK[b] ? a : b;
}
