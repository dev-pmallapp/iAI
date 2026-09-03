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
