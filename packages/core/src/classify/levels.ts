// The four-level data classifier's rank order (issue #16). PUBLIC is the
// least sensitive, SECRET the most; `classify` always resolves a structure to
// the highest level any part of it reaches, never a partial or per-field
// result (docs/design/stories/15.md, CLAIM-15.1).
export type DataClass = "PUBLIC" | "INTERNAL" | "PRIVATE" | "SECRET";

const RANK: Record<DataClass, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PRIVATE: 2,
  SECRET: 3,
};

export function rankOf(dataClass: DataClass): number {
  return RANK[dataClass];
}

export function maxClass(a: DataClass, b: DataClass): DataClass {
  return RANK[a] >= RANK[b] ? a : b;
}
