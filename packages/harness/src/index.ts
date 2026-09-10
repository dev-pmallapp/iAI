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

export { checkWritePath, createMutationRecorder, mutationEvidence, MutationRecorderError } from "./mutation-recorder";
export type {
  MutationRecorder,
  MutationReport,
  RecordedWrite,
  WorktreeSample,
  WriteCheck,
  WritePathRefusalKind,
} from "./mutation-recorder";

export {
  classifyArgv,
  countReads,
  GIT_READ_VERBS,
  GIT_WRITE_VERBS,
} from "./argv-kind";
export type { ArgvKind } from "./argv-kind";

export {
  countReEntryRows,
  readSkillBodies,
  readSkillNames,
  reEntryRows,
} from "./re-entry";
export type { ReEntryRow, SkillBody } from "./re-entry";
