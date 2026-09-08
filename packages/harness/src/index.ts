// Named re-exports only, never `export *`.
export { createTempDirs } from "./tempdir";
export type { TempDirs } from "./tempdir";

export { createFixtureRepo, FixtureRepoError } from "./fixture-repo";
export type { FixtureFile, FixtureRepo, FixtureRepoSpec } from "./fixture-repo";

export { GOALS_FIXTURE_CORPUS_DECLARATION, renderGoalsFixture } from "./goals-fixture";
export type { GoalsFixtureOptions } from "./goals-fixture";

export {
  createFakeForge,
  FAILURE_MODES,
  FAKE_UNMODELLED_EXIT_CODE,
  isMutatingGhArgv,
  RATE_LIMIT_HEADERS_LOWER_CASE,
  RATE_LIMIT_HEADERS_MIXED_CASE,
} from "./fake-forge";
export type {
  FailureMode,
  FakeComment,
  FakeForge,
  FakeForgeOptions,
  FakeGhResponse,
  FakeIssue,
  FakeMilestone,
} from "./fake-forge";
