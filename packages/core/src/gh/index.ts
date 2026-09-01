// Named re-exports only, never `export *`, matching guards/index.ts and
// classify/index.ts. Values and types are listed separately so a consumer can
// see at a glance which names carry runtime weight.
//
// Grouped one module at a time in the order the modules landed, which for this
// directory is: shared shapes first, then the repository parameter every
// constructor takes, then one group per `gh` operation family.
//
// One family is absent on purpose and lands later in this Story: pull
// requests (#24). CLAIM-21.1 counts six families, so this barrel is
// incomplete until it merges.
export { ghFail, ghOk, isPositiveInteger, safeOwnString, safeOwnValue } from "./types";
export type { Argv, GhPlan, GhResponse, GhResult } from "./types";

export { coerceRepo, formatRepo, makeRepo, parseRepo, repoApiPath, repoFlag } from "./repo";
export type { GhRepo } from "./repo";

export { issueClose, issueCreate, issueEditBody, issueList, issueView } from "./issues";
export type { IssueCreateInput, IssueListInput } from "./issues";

export { EXCLUSIVE_LABEL_PREFIXES, labelCreate, labelList, planLabelTransition } from "./labels";
export type { LabelCreateInput, LabelTransitionInput } from "./labels";

export { milestoneCreate, milestoneList, milestoneUpdate } from "./milestones";
export type { MilestoneCreateInput } from "./milestones";

export { commentCreate, commentEdit, commentList } from "./comments";

export {
  SUB_ISSUE_FEATURE_HEADER,
  TASKS_HEADING,
  findParentInBody,
  issueNodeId,
  parentBodyLine,
  planSubIssueAttach,
  subIssueCapabilityProbe,
  subIssueLink,
  tasksChecklist,
  withParentLine,
} from "./sub-issues";
export type {
  ChecklistItem,
  SubIssueAttachInput,
  SubIssueAttachPlan,
  SubIssueCapability,
} from "./sub-issues";
