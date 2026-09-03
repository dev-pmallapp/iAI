// Named re-exports only, never `export *`, matching guards/index.ts,
// classify/index.ts and gh/index.ts. Values and types are listed separately so
// a consumer can see at a glance which names carry runtime weight.
//
// Grouped one module at a time in the order the modules land. #27 ships the
// namespace and the linter; #28 adds the consumer, #29 the budget and
// rendering, #30 the templating and upsert.
export {
  ARTIFACT_BEARING_SENTINELS,
  isKnownSentinelName,
  isSentinelNamespace,
  matchSentinelLine,
  SENTINEL_NAMES,
  SENTINEL_NAMESPACE_PREFIX,
  sentinelFor,
  sentinelLinePayload,
  sentinelNamesArePrefixFree,
} from "./sentinel";
export type { SentinelName } from "./sentinel";

export { isWellFormedSentinelComment, lintSentinelComment, SENTINEL_RULE_IDS } from "./lint";
export type { SentinelRuleId, SentinelViolation } from "./lint";

// The consumer half (#28): query a comment list, disambiguate by `createdAt`,
// and turn absence of a required sentinel into a hard-failure `Decision`.
export { findSentinelComments, requireSentinelComment, selectSentinelComment } from "./consumer";
export type { RequiredSentinelResult, SentinelComment, SentinelMatch } from "./consumer";

// Budget, rendering and permalinks (#29).
// `safeOwnValue`/`safeOwnString` are deliberately NOT re-exported: gh/index
// already exports names of its own with the same spelling, and the root barrel
// re-exports both directories with `export *`. They are internal readers, not
// part of this directory's surface.
export { evFail, evOk } from "./types";
export type { EvidenceResult } from "./types";

export {
  BLOB_SHA_PATTERN,
  isShaPinnedPermalink,
  makePermalink,
  requireShaPinnedPermalink,
} from "./permalink";
export type { PermalinkInput } from "./permalink";

export {
  bodyPermalinksArePinned,
  BUDGET_CHARS,
  chooseStrategy,
  ENVELOPE_BUDGET_CHARS,
  HARD_LIMIT_CHARS,
  renderSentinelComment,
} from "./render";
export type { EvidenceCommentInput, RenderedComment, RenderStrategy } from "./render";
