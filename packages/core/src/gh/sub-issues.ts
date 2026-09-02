// Sub-issue parenting: the GraphQL path and its body-link fallback
// (issue #23, CLAIM-21.2, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// THE MUTATION IS NAMED IN NO DESIGN DOCUMENT.
//
// docs/milestones/M1.md:130 says only "the GraphQL mutation", as though one
// had been specified. The single statement of it anywhere in this repository
// is scripts/bootstrap-stories.py:338-342, which is the bootstrap stand-in
// that built the issue tree this repo currently runs on. It is adopted here
// because it is the only form known to work against this repository, not
// because a document blessed it.
//
// THE FEATURE HEADER IS LOAD-BEARING, AND ITS ABSENCE IS A SILENT LIE.
//
// `subIssues` and `addSubIssue` require `-H "GraphQL-Features: sub_issues"`.
// Without it the API returns NO NODES AND NO ERROR — which is byte-for-byte
// indistinguishable from an instance that has no sub-issue API at all.
//
// Observed directly on 2026-09-01 against dev-pmallapp/iAI: a `subIssues`
// query on #243 returned empty and read as though the fallback path was in
// use, when all three of its tasks were real sub-issues. That is a FALSE
// NEGATIVE ON THE CAPABILITY PROBE, and it is the most dangerous failure this
// module can have: it does not error, it silently and permanently selects the
// degraded path on a fully-capable instance, and every issue tree built while
// it is wrong is missing its real parenting.
//
// So the header is attached by these constructors and is not a caller option.
import { repoApiPath, repoFlag, type GhRepo } from "./repo";
import {
  ghFail,
  ghOk,
  isPositiveInteger,
  safeOwnValue,
  type Argv,
  type GhPlan,
  type GhResult,
} from "./types";

export const SUB_ISSUE_FEATURE_HEADER = "GraphQL-Features: sub_issues";

const ADD_SUB_ISSUE_MUTATION =
  "mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c}){issue{number}}}";

const SUB_ISSUE_PROBE_QUERY =
  "query($owner:String!,$name:String!,$number:Int!)" +
  "{repository(owner:$owner,name:$name){issue(number:$number){subIssues(first:1){totalCount}}}}";

// Reported by the caller, never discovered here. docs/design/04-domain-dev.md:504
// says the capability is "probed once per session and cached" — a probe is I/O
// and a cache is session state, and this directory can hold neither. Decision 1
// of docs/design/stories/21.md resolves it the same way S1.2 resolved consent:
// a value handed in.
export type SubIssueCapability = "present" | "absent";

// The argv an adapter runs ONCE per session to establish that capability.
//
// It carries the feature header for the reason in the file header: a probe
// without it answers "absent" on an instance where the API is present. If this
// command is ever copied without the header, the fallback becomes permanent
// and nothing reports an error.
export function subIssueCapabilityProbe(repo: GhRepo, issue: number): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  return ghOk([
    "gh",
    "api",
    "graphql",
    "-H",
    SUB_ISSUE_FEATURE_HEADER,
    "-f",
    `query=${SUB_ISSUE_PROBE_QUERY}`,
    "-F",
    `owner=${repo.owner}`,
    "-F",
    `name=${repo.name}`,
    "-F",
    `number=${issue}`,
  ]);
}

// Node ids are what addSubIssue takes; issue numbers will not do. The adapter
// resolves both with this and hands them back, per Decision 1.
export function issueNodeId(repo: GhRepo, issue: number): GhResult<Argv> {
  if (!isPositiveInteger(issue)) return ghFail(`invalid issue number: ${String(issue)}`);
  return ghOk(["gh", "api", `${repoApiPath(repo)}/issues/${issue}`, "--jq", ".node_id"]);
}

// GitHub node ids are opaque base64-ish strings. Validated only for shape, not
// decoded: guessing at their internal structure is how a layer breaks when
// GitHub changes an encoding it never promised to keep.
const NODE_ID_RE = /^[A-Za-z0-9_=-]+$/;

export function subIssueLink(parentNodeId: unknown, childNodeId: unknown): GhResult<Argv> {
  if (typeof parentNodeId !== "string" || !NODE_ID_RE.test(parentNodeId)) {
    return ghFail("sub-issue link requires a parent node id, not an issue number");
  }
  if (typeof childNodeId !== "string" || !NODE_ID_RE.test(childNodeId)) {
    return ghFail("sub-issue link requires a child node id, not an issue number");
  }
  if (parentNodeId === childNodeId) {
    return ghFail("an issue cannot be its own sub-issue");
  }
  return ghOk([
    "gh",
    "api",
    "graphql",
    "-H",
    SUB_ISSUE_FEATURE_HEADER,
    "-f",
    `query=${ADD_SUB_ISSUE_MUTATION}`,
    "-F",
    `p=${parentNodeId}`,
    "-F",
    `c=${childNodeId}`,
  ]);
}

// ---------------------------------------------------------------------------
// The fallback shapes.
//
// No document in the tree shows one line of either of these. Decision 5 of
// docs/design/stories/21.md pins them here, adopting
// scripts/bootstrap-stories.py:198-201 as the only working precedent, with one
// deliberate exception recorded at `parentBodyLine` below.
// ---------------------------------------------------------------------------

// Column zero, its own line, exactly once. The sentinel producer rules at
// docs/design/03-workflow.md:388-394 pin exactly these properties for `##
// iai-*` comments; the `Parent:` line had no equivalent, which is why it is
// stated here rather than left to each caller.
const PARENT_LINE_RE = /^Parent: #(\d+)\s*$/;

export function parentBodyLine(parent: number): GhResult<string> {
  // scripts/bootstrap-stories.py:198 degrades to `Parent: the S1.1 Story` when
  // the number is unknown. That form is NOT adopted (Decision 5). A body link
  // whose entire purpose is machine-readable parenting must not have a prose
  // variant — that is a link which silently stops being a link, and nothing
  // downstream can tell the difference between "no parent" and "parent written
  // in English". An unknown parent is a construction failure.
  if (!isPositiveInteger(parent)) {
    return ghFail(
      `invalid parent issue number: ${String(parent)}; a Parent: line must carry #N, ` +
        "and there is deliberately no prose fallback form",
    );
  }
  return ghOk(`Parent: #${parent}`);
}

export function findParentInBody(body: unknown): number | undefined {
  if (typeof body !== "string") return undefined;
  for (const line of body.split("\n")) {
    const match = PARENT_LINE_RE.exec(line);
    if (match) return Number(match[1]);
  }
  return undefined;
}

// Idempotent: re-running a task-create skill must not append a second link.
// docs/design/03-workflow.md:170-172 requires every transition to be
// re-runnable, and a body carrying two `Parent:` lines is exactly the
// corruption that would survive silently.
export function withParentLine(body: unknown, parent: number): GhResult<string> {
  const line = parentBodyLine(parent);
  if (!line.ok) return line;
  if (typeof body !== "string") return ghFail("task body must be a string");

  const existing = findParentInBody(body);
  if (existing === parent) return ghOk(body);
  if (existing !== undefined) {
    return ghFail(
      `task body already declares Parent: #${existing}, refusing to re-parent it to #${parent}`,
    );
  }

  // Placed after a leading H1/H2 when the body opens with one, so the link sits
  // where bootstrap-stories.py put it (under `## Task`) rather than above the
  // heading, which renders oddly and reads as a title.
  const lines = body.split("\n");
  if (lines.length > 0 && /^#{1,2} /.test(lines[0] ?? "")) {
    const rest = lines.slice(1);
    while (rest.length > 0 && rest[0] === "") rest.shift();
    return ghOk([lines[0], "", line.value, "", ...rest].join("\n"));
  }
  return ghOk([line.value, "", ...lines].join("\n"));
}

export interface ChecklistItem {
  readonly issue: number;
  readonly title?: string;
  readonly checked?: boolean;
}

// The heading is exactly `## Tasks`. docs/milestones/M1.md:132,
// docs/design/04-domain-dev.md:392 and :504 and docs/milestones/M2.md:122 all
// name it, none shows it, and an H3 would not be found by a consumer looking
// for an H2.
export const TASKS_HEADING = "## Tasks";

// ORDER IS SIGNIFICANT and is preserved exactly as supplied.
// docs/milestones/M2.md:123-125 requires `Blocked by:` lines to match "the
// parent checklist order", so sorting here would silently break a claim two
// milestones away.
export function tasksChecklist(items: readonly ChecklistItem[]): GhResult<string> {
  if (!Array.isArray(items)) return ghFail("tasks checklist requires an array of items");
  const lines: string[] = [TASKS_HEADING, ""];
  const seen = new Set<number>();
  for (const item of items) {
    const issue = safeOwnValue(item, "issue");
    const title = safeOwnValue(item, "title");
    const checked = safeOwnValue(item, "checked");
    if (!isPositiveInteger(issue)) {
      return ghFail(`invalid issue number in tasks checklist: ${String(issue)}`);
    }
    // A duplicate would render as two entries for one task and make the
    // checklist disagree with the issue graph it is standing in for.
    if (seen.has(issue)) return ghFail(`duplicate issue #${issue} in tasks checklist`);
    seen.add(issue);
    if (title !== undefined && typeof title !== "string") {
      return ghFail(`invalid title for #${issue} in tasks checklist`);
    }
    const box = checked === true ? "[x]" : "[ ]";
    lines.push(title === undefined || title.length === 0 ? `- ${box} #${issue}` : `- ${box} #${issue} ${title}`);
  }
  return ghOk(lines.join("\n"));
}

export interface SubIssueAttachInput {
  readonly capability: SubIssueCapability;
  readonly parent: number;
  // Present only on the GraphQL path.
  readonly parentNodeId?: string;
  readonly childNodeId?: string;
  // Present only on the fallback path.
  readonly childBody?: string;
  readonly child?: number;
  // Every sibling, in checklist order, including the child being attached.
  readonly siblings?: readonly ChecklistItem[];
}

export interface SubIssueAttachPlan {
  readonly commands: GhPlan;
  // The task body to create the child with, on the fallback path only. It is
  // NOT a command: the child may not exist yet, so this is handed to
  // issueCreate rather than executed.
  readonly childBody?: string;
}

// CLAIM-21.2. One entry point, two paths, chosen by a reported capability and
// never by a probe performed here.
export function planSubIssueAttach(
  repo: GhRepo,
  input: SubIssueAttachInput,
): GhResult<SubIssueAttachPlan> {
  const capability = safeOwnValue(input, "capability");
  const parent = safeOwnValue(input, "parent");

  if (capability !== "present" && capability !== "absent") {
    return ghFail(
      `sub-issue capability must be reported as "present" or "absent", got ${String(capability)}; ` +
        "it is never probed from inside this layer",
    );
  }
  if (!isPositiveInteger(parent)) {
    return ghFail(`invalid parent issue number: ${String(parent)}`);
  }

  if (capability === "present") {
    const link = subIssueLink(
      safeOwnValue(input, "parentNodeId"),
      safeOwnValue(input, "childNodeId"),
    );
    if (!link.ok) return ghFail(link.reason);
    return ghOk({ commands: [link.value] });
  }

  // Fallback. Both halves are required: a body link with no parent checklist
  // leaves the parent unable to enumerate its children, and a checklist with no
  // body link leaves each child unable to name its parent. CLAIM-21.2 requires
  // both, and `status` reads both (docs/design/04-domain-dev.md:504).
  const childBody = safeOwnValue(input, "childBody");
  const siblings = safeOwnValue(input, "siblings");

  const body = withParentLine(childBody, parent);
  if (!body.ok) return ghFail(body.reason);

  if (!Array.isArray(siblings) || siblings.length === 0) {
    return ghFail(
      "the fallback path requires the sibling list so the parent checklist can be written; " +
        "a Parent: line alone leaves the parent unable to enumerate its children",
    );
  }
  const checklist = tasksChecklist(siblings);
  if (!checklist.ok) return ghFail(checklist.reason);

  const edit: Argv = [
    "gh",
    "issue",
    "edit",
    String(parent),
    ...repoFlag(repo),
    "--body",
    checklist.value,
  ];

  return ghOk({ commands: [edit], childBody: body.value });
}
