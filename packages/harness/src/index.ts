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

export {
  decideVerdict,
  PINNED_SKILL_COUNT,
  renderArtifact,
  renderReport,
  runHarness,
  SUCCESS_PHRASES,
} from "./runner";
export type {
  Denominators,
  Failure,
  FailureCode,
  HarnessVerdict,
  ReadAttribution,
  RunHarnessOptions,
  RunObservation,
  Scenario,
  ScenarioContext,
  ScenarioResult,
  ScenarioStatus,
} from "./runner";

export { runGoalCreate } from "./transcription-goal-create";
export type { GoalCreateParams } from "./transcription-goal-create";

export { runStoryCreate } from "./transcription-story-create";
export type { StoryCreateOutcome, StoryCreateParams } from "./transcription-story-create";

export { runStoryDesign } from "./transcription-story-design";
export type { StoryDesignParams } from "./transcription-story-design";

export { runStoryTestPlan } from "./transcription-story-test-plan";
export type { StoryTestPlanOutcome, StoryTestPlanParams } from "./transcription-story-test-plan";

export { SCENARIO_ROSTER } from "./scenario-roster";
export type { ScenarioId } from "./scenario-roster";

export { INJECTION_ROSTER } from "./injection-roster";
export type { InjectionScenarioId } from "./injection-roster";
