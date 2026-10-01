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

// Matches a rendered checklist entry so an existing tick can be read back.
// Capital X is accepted because GitHub renders it, so a human who typed one
// has ticked the box whatever this module would have written.
const CHECKLIST_ENTRY_RE = /^- \[([ xX])\] #(\d+)\b/;

// A `## Tasks` section ends at the next H1/H2, never at an H3 — an H3 is a
// subsection of the checklist, not a sibling of it.
const SECTION_BOUNDARY_RE = /^#{1,2} /;

function findTasksHeadings(lines: readonly string[]): readonly number[] {
  const found: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] === TASKS_HEADING) found.push(i);
  }
  return found;
}

// Build target 1 of docs/design/stories/47.md, anchored to CLAIM-47.7.
//
// Idempotent, and body-preserving. Modelled on `withParentLine` above: it
// inserts into an existing body rather than replacing it, and it REFUSES the
// ambiguous case rather than guessing at it.
//
// THE DEFECT THIS EXISTS TO FIX: `planSubIssueAttach` passed `tasksChecklist`'s
// output as the whole `--body` of a `gh issue edit` on the parent, which
// replaces the Story's entire body with the checklist. The shipped test
// asserted the first four argv elements and that the last contained the
// heading — both true of a body that had destroyed everything else.
export function withTasksChecklist(
  body: unknown,
  items: readonly ChecklistItem[],
): GhResult<string> {
  if (typeof body !== "string") return ghFail("story body must be a string");
  if (!Array.isArray(items)) return ghFail("tasks checklist requires an array of items");

  const lines = body.split("\n");
  const headings = findTasksHeadings(lines);
  // Two checklists means two answers to "what are this Story's tasks". Picking
  // one silently would make the merge lossy in the exact way this function
  // exists to prevent, so it is refused and the count is named.
  if (headings.length > 1) {
    return ghFail(
      `story body carries ${headings.length} ${TASKS_HEADING} sections, refusing to guess ` +
        "which one is the checklist",
    );
  }

  const at = headings[0];
  if (at === undefined) {
    const rendered = tasksChecklist(items);
    if (!rendered.ok) return rendered;
    // Trailing blank lines are dropped and one separator is written back, so
    // appending to "prose\n" and to "prose" converge on the same shape and the
    // second run is a no-op.
    const head = [...lines];
    while (head.length > 0 && head[head.length - 1] === "") head.pop();
    if (head.length === 0) return ghOk([...rendered.value.split("\n"), ""].join("\n"));
    return ghOk([...head, "", ...rendered.value.split("\n"), ""].join("\n"));
  }

  let end = lines.length;
  for (let i = at + 1; i < lines.length; i += 1) {
    if (SECTION_BOUNDARY_RE.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }

  // ONLY THE ENTRIES ARE REWRITTEN, NEVER THE WHOLE SECTION.
  //
  // Every real Story body puts load-bearing prose INSIDE `## Tasks`, after the
  // entries: #47 carries the dependency ordering and the "must not be built
  // twice" ruling there, #293 carries its sequencing rulings there and the
  // section runs to the end of the body. Replacing the section wholesale would
  // delete all of it — the defect this function exists to remove, one level
  // down. So the rewrite covers the leading run of entry lines and nothing else.
  let cursor = at + 1;
  while (cursor < end && lines[cursor] === "") cursor += 1;
  const entriesAt = cursor;
  while (cursor < end && CHECKLIST_ENTRY_RE.test(lines[cursor] ?? "")) cursor += 1;
  const entriesEnd = cursor;

  // AND THE STRUCTURE IS ASSERTED, NOT ASSUMED. Taking "the first contiguous
  // run" and trusting it is how a parser reads the right rows by accident and
  // then cannot report a violation of the shape it depends on — measured on
  // #323's audit parser. Entries split by prose have no single answer to
  // "which of these is the checklist", so they are refused and named.
  for (let i = entriesEnd; i < end; i += 1) {
    if (CHECKLIST_ENTRY_RE.test(lines[i] ?? "")) {
      return ghFail(
        `story body splits its ${TASKS_HEADING} entries with prose at line ${i + 1}, ` +
          "refusing to guess which run is the checklist",
      );
    }
  }

  // A tick is body content, and the caller does not always know about it: the
  // parent checklist is ticked by hand as tasks merge, and re-running
  // task-create would otherwise silently untick every box. An item that states
  // `checked` wins; an item that is silent inherits what the body says.
  const ticked = new Set<number>();
  for (let i = entriesAt; i < entriesEnd; i += 1) {
    const match = CHECKLIST_ENTRY_RE.exec(lines[i] ?? "");
    if (match && match[1] !== " ") ticked.add(Number(match[2]));
  }
  // Rebuilt field by field through `safeOwnValue`, never spread: a spread over
  // a caller-supplied object runs its getters, and this module's hostile-corpus
  // test requires 0 throws. `tasksChecklist` re-validates every field below, so
  // an invalid one is still refused by name rather than smuggled through here.
  const merged: ChecklistItem[] = [];
  for (const item of items) {
    const issue = safeOwnValue(item, "issue");
    const title = safeOwnValue(item, "title");
    const checked = safeOwnValue(item, "checked");
    const inherit = checked === undefined && isPositiveInteger(issue) && ticked.has(issue);
    merged.push({
      issue: issue as number,
      ...(title === undefined ? {} : { title: title as string }),
      ...(checked === undefined ? {} : { checked: checked as boolean }),
      ...(inherit ? { checked: true } : {}),
    });
  }

  const rendered = tasksChecklist(merged);
  if (!rendered.ok) return rendered;

  // Everything from the end of the entry run onward is carried verbatim: the
  // section's own trailing blank lines, whatever prose follows the entries, and
  // the rest of the body. `rendered` supplies the heading and the blank beneath
  // it, so the lines between the heading and the entries are not re-emitted.
  return ghOk(
    [
      ...lines.slice(0, at),
      ...rendered.value.split("\n"),
      ...lines.slice(entriesEnd),
    ].join("\n"),
  );
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
  // The parent Story's CURRENT body, read before this plan is built. Required
  // on both paths, and deliberately not optional: a default of "" would make
  // the destructive behaviour the fallback for a caller who simply forgot, and
  // that is the defect build target 1 exists to remove. A genuinely empty
  // Story body is stated as "".
  readonly parentBody?: string;
}

export interface SubIssueAttachPlan {
  readonly commands: GhPlan;
  // The task body to create the child with, on the fallback path only. It is
  // NOT a command: the child may not exist yet, so this is handed to
  // issueCreate rather than executed.
  readonly childBody?: string;
}

// The one place the parent checklist edit is built, so the two capability
// paths cannot drift into disagreeing about what "adds a checklist" means.
// The fallback keeps its own sibling pre-check above, because its reason names
// the half of CLAIM-21.2 that is missing rather than the checklist alone.
function planChecklistEdit(
  repo: GhRepo,
  parent: number,
  input: SubIssueAttachInput,
): GhResult<Argv> {
  const siblings = safeOwnValue(input, "siblings");
  if (!Array.isArray(siblings) || siblings.length === 0) {
    return ghFail(
      "the parent checklist requires the sibling list, in checklist order; " +
        "it is written on both capability paths, not only the fallback",
    );
  }
  const parentBody = safeOwnValue(input, "parentBody");
  if (typeof parentBody !== "string") {
    return ghFail(
      "the parent Story's current body must be supplied so the checklist is merged into it " +
        'rather than replacing it; pass "" only for a Story whose body really is empty',
    );
  }
  const merged = withTasksChecklist(parentBody, siblings);
  if (!merged.ok) return ghFail(merged.reason);
  return ghOk([
    "gh",
    "issue",
    "edit",
    String(parent),
    ...repoFlag(repo),
    "--body",
    merged.value,
  ]);
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

  // Build target 2. The checklist is emitted on BOTH paths. Before this it was
  // emitted only on the fallback, so CLAIM-47.1's clause "adds a `## Tasks`
  // checklist to the Story" was unreachable on the primary path — the sub-issue
  // API links the graph, but nothing renders the checklist a human reads, and
  // `status` reads the checklist in fallback mode either way.
  if (capability === "present") {
    const link = subIssueLink(
      safeOwnValue(input, "parentNodeId"),
      safeOwnValue(input, "childNodeId"),
    );
    if (!link.ok) return ghFail(link.reason);
    const checklistEdit = planChecklistEdit(repo, parent, input);
    if (!checklistEdit.ok) return ghFail(checklistEdit.reason);
    return ghOk({ commands: [link.value, checklistEdit.value] });
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
  const edit = planChecklistEdit(repo, parent, input);
  if (!edit.ok) return ghFail(edit.reason);

  return ghOk({ commands: [edit.value], childBody: body.value });
}
