import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyUpsert,
  findSentinelComments,
  formatCompactUtcTimestamp,
  isCompactUtcTimestamp,
  planCommentUpsert,
  renderPathTemplate,
  selectSentinelComment,
  TEMPLATE_PLACEHOLDERS,
  type EvidenceResult,
  type SentinelComment,
  type UpsertAction,
} from "../src/evidence/index";

function value<T>(result: EvidenceResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got failure: ${result.reason}`);
  return result.value;
}

const EVIDENCE_TEMPLATE = "docs/evidence/{issue}-{ts}.md";
const TS = "20260825T141207Z";

describe("evidence — case 15 (P0, CLAIM-26.6): {issue} and {ts} interpolate to the on-disk shape", () => {
  test("the evidence template renders to the documented form", () => {
    expect(value(renderPathTemplate(EVIDENCE_TEMPLATE, { issue: 26, ts: TS }))).toBe(
      "docs/evidence/26-20260825T141207Z.md",
    );
  });

  test("the emitted pattern matches every artifact actually on disk", () => {
    // Decision 8 pins the format against the artifacts, not against the prose
    // examples — four of the eight examples in the design documents disagree
    // with each other. This reads the real filenames so the implementation
    // cannot drift from them.
    const dir = join(import.meta.dir, "../../../docs/evidence");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(25);
    for (const file of files) {
      const match = /^(\d+)-(\d{8}T\d{6}Z)\.md$/.exec(file);
      expect(match).not.toBeNull();
      const issue = Number(match?.[1]);
      const ts = match?.[2] ?? "";
      // Every real filename is reproducible by the renderer from its own parts.
      expect(value(renderPathTemplate(EVIDENCE_TEMPLATE, { issue, ts }))).toBe(
        `docs/evidence/${file}`,
      );
    }
  });

  test("other templates in the tree render too", () => {
    expect(value(renderPathTemplate("docs/design/stories/{issue}.md", { issue: 26, ts: TS }))).toBe(
      "docs/design/stories/26.md",
    );
    expect(value(renderPathTemplate("docs/test-plans/{issue}-plan.md", { issue: 26, ts: TS }))).toBe(
      "docs/test-plans/26-plan.md",
    );
  });

  test("a template with no placeholder is returned unchanged", () => {
    expect(value(renderPathTemplate("docs/evidence/fixed.md", { issue: 1, ts: TS }))).toBe(
      "docs/evidence/fixed.md",
    );
  });

  test("repeated placeholders all interpolate", () => {
    expect(value(renderPathTemplate("{issue}/{issue}-{ts}.md", { issue: 7, ts: TS }))).toBe(
      `7/7-${TS}.md`,
    );
  });

  test("the placeholder set is closed and is exactly {issue} and {ts}", () => {
    expect([...TEMPLATE_PLACEHOLDERS].sort()).toEqual(["issue", "ts"]);
  });
});

describe("evidence — case 16 (P0, CLAIM-26.6): an unknown placeholder is a construction failure", () => {
  test("{n} fails and the failure names it", () => {
    // Decision 7. docs/design/03-workflow.md:376 and docs/milestones/M2.md:132
    // both write `docs/evidence/{n}-{ts}.md`, and `{n}` is the claim ordinal
    // in CLAIM-{story}.{n} — never an issue number.
    const result = renderPathTemplate("docs/evidence/{n}-{ts}.md", { issue: 26, ts: TS });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("{n}");
      expect(result.reason).toContain("unknown placeholder");
      expect(result.reason).toContain("claim ordinal");
    }
  });

  test("it never renders with the placeholder left in place", () => {
    const result = renderPathTemplate("docs/evidence/{n}-{ts}.md", { issue: 26, ts: TS });
    expect(result.ok).toBe(false);
    // The failure mode this exists to prevent: a filename nobody can find again.
    if (result.ok) expect(result.value).not.toContain("{");
  });

  test("every unknown placeholder is named, not just the first", () => {
    const result = renderPathTemplate("{foo}/{bar}-{ts}.md", { issue: 1, ts: TS });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("{foo}");
      expect(result.reason).toContain("{bar}");
    }
  });

  test("a rejected template list, all failing", () => {
    for (const bad of ["{n}.md", "{story}-{ts}.md", "{}.md", "{ISSUE}-{ts}.md", "{issue }-{ts}.md"]) {
      expect(renderPathTemplate(bad, { issue: 1, ts: TS }).ok).toBe(false);
    }
  });

  test("an unbalanced brace is caught even though it is not a placeholder", () => {
    // Found by mutation-testing: deleting the residual-brace check broke no
    // test, and it was a real gap rather than an equivalent mutant. An
    // unmatched brace never matches /\{([^{}]*)\}/, so the unknown-placeholder
    // scan sees nothing and only the residual check catches it. Without it,
    // `docs/evidence/{issue}-{ts.md` would render to a filename containing a
    // literal brace — a file nobody would find again.
    for (const bad of [
      "docs/evidence/{issue}-{ts.md",
      "docs/evidence/issue}-{ts}.md",
      "docs/{issue}}/{ts}.md",
      "docs/{{issue}-{ts}.md",
    ]) {
      const result = renderPathTemplate(bad, { issue: 26, ts: TS });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("uninterpolated brace");
    }
  });

  test("never throws on hostile input", () => {
    const hostile: unknown[] = [null, undefined, 42, {}, [], "", { issue: 1 }];
    for (const t of hostile) {
      expect(() => renderPathTemplate(t, { issue: 1, ts: TS })).not.toThrow();
      expect(() => renderPathTemplate(EVIDENCE_TEMPLATE, t)).not.toThrow();
    }
    expect(renderPathTemplate(EVIDENCE_TEMPLATE, { issue: 0, ts: TS }).ok).toBe(false);
    expect(renderPathTemplate(EVIDENCE_TEMPLATE, { issue: -1, ts: TS }).ok).toBe(false);
    expect(renderPathTemplate(EVIDENCE_TEMPLATE, { issue: 1.5, ts: TS }).ok).toBe(false);
  });
});

describe("evidence — case 17 (P0, CLAIM-26.6): a second producer run edits rather than creates", () => {
  const BODY_1 = "## iai-evidence\n\nrun 1";
  const BODY_2 = "## iai-evidence\n\nrun 2";

  test("run 1 against an empty list creates; run 2 edits that comment", () => {
    const run1 = value(planCommentUpsert({ sentinel: "evidence", body: BODY_1, comments: [] }));
    expect(run1.action).toBe("create");

    const after1 = applyUpsert([], run1, 900, "2026-09-03T09:00:00Z");
    expect(after1).toHaveLength(1);

    const run2 = value(
      planCommentUpsert({ sentinel: "evidence", body: BODY_2, comments: after1 }),
    );
    expect(run2.action).toBe("edit");
    if (run2.action === "edit") expect(run2.commentId).toBe(900);
  });

  test("the pair leaves exactly one comment per sentinel", () => {
    // docs/milestones/M1.md:191 — "a double producer run leaves exactly one
    // comment per sentinel". Not checkable from a single invocation.
    let comments: readonly SentinelComment[] = [];
    for (let run = 1; run <= 5; run += 1) {
      const plan = value(
        planCommentUpsert({ sentinel: "evidence", body: `## iai-evidence\n\nrun ${String(run)}`, comments }),
      );
      comments = applyUpsert(comments, plan, 900 + run, `2026-09-03T09:0${String(run)}:00Z`);
    }
    expect(comments).toHaveLength(1);
    expect(findSentinelComments(comments, "evidence")).toHaveLength(1);
    expect(comments[0]?.body).toContain("run 5");
  });

  test("different sentinels do not collide — the key is (issue, sentinel)", () => {
    let comments: readonly SentinelComment[] = [];
    for (const name of ["design", "test-plan", "evidence"] as const) {
      const plan = value(
        planCommentUpsert({ sentinel: name, body: `## iai-${name}\n\nbody`, comments }),
      );
      expect(plan.action).toBe("create");
      comments = applyUpsert(comments, plan, comments.length + 1, "2026-09-03T09:00:00Z");
    }
    expect(comments).toHaveLength(3);
    // Re-running each one edits its own, not another's.
    for (const name of ["design", "test-plan", "evidence"] as const) {
      const plan = value(
        planCommentUpsert({ sentinel: name, body: `## iai-${name}\n\nagain`, comments }),
      );
      expect(plan.action).toBe("edit");
      if (plan.action === "edit") {
        const target = comments.find((c) => c.id === plan.commentId);
        expect(target?.body.startsWith(`## iai-${name}`)).toBe(true);
      }
    }
  });

  test("the edit targets the newest when history exists", () => {
    // Decision 2: the list may hold comments the producer did not create.
    const history: SentinelComment[] = [
      { id: 1, createdAt: "2026-09-01T00:00:00Z", body: "## iai-gate\n\nold" },
      { id: 2, createdAt: "2026-09-02T00:00:00Z", body: "## iai-gate\n\nnewer" },
    ];
    const plan = value(planCommentUpsert({ sentinel: "gate", body: "## iai-gate\n\nnow", comments: history }));
    expect(plan.action).toBe("edit");
    if (plan.action === "edit") {
      expect(plan.commentId).toBe(2);
      expect(plan.matchCount).toBe(2);
      // The same comment #28's selector would pick — one definition, not two.
      expect(plan.commentId).toBe(selectSentinelComment(history, "gate")?.comment.id);
    }
  });
});

describe("evidence — case 18 (P1, CLAIM-26.6): the {ts} format rejects the non-conforming forms", () => {
  test("the pinned form is accepted", () => {
    expect(isCompactUtcTimestamp("20260825T141207Z")).toBe(true);
    expect(isCompactUtcTimestamp(TS)).toBe(true);
  });

  test("the three non-conforming documentation forms are rejected", () => {
    // docs/design/01-skill-hierarchy.md:440 and docs/design/06-domain-health.md:563
    // drop the seconds; docs/design/03-workflow.md:425 drops the trailing Z.
    expect(isCompactUtcTimestamp("20260825T1412Z")).toBe(false);
    expect(isCompactUtcTimestamp("20261101T0914Z")).toBe(false);
    expect(isCompactUtcTimestamp("20260114T092211")).toBe(false);
  });

  test("other near-misses are rejected", () => {
    for (const bad of [
      "2026-08-25T14:12:07Z",
      "20260825T141207",
      "20260825t141207z",
      "20260825T141207Z ",
      "0260825T141207Z",
      "",
      null,
      undefined,
      20260825,
    ]) {
      expect(isCompactUtcTimestamp(bad)).toBe(false);
    }
  });

  test("a rejected {ts} fails the whole render rather than passing through", () => {
    const result = renderPathTemplate(EVIDENCE_TEMPLATE, { issue: 26, ts: "20260825T1412Z" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("20260825T141207Z");
  });

  test("formatCompactUtcTimestamp round-trips through the validator", () => {
    const out = value(formatCompactUtcTimestamp(new Date("2026-08-25T14:12:07.000Z")));
    expect(out).toBe("20260825T141207Z");
    expect(isCompactUtcTimestamp(out)).toBe(true);
    // Sub-second precision is dropped, not rounded into the next second.
    expect(value(formatCompactUtcTimestamp(new Date("2026-08-25T14:12:07.999Z")))).toBe(
      "20260825T141207Z",
    );
    expect(formatCompactUtcTimestamp(new Date("nope")).ok).toBe(false);
    expect(formatCompactUtcTimestamp(42 as unknown as Date).ok).toBe(false);
  });
});

describe("evidence — case 23 (P0, NEVER-26.9): an edit never targets a comment lacking the sentinel", () => {
  const mixed: SentinelComment[] = [
    { id: 10, createdAt: "2026-09-05T00:00:00Z", body: "plain prose, newest of all" },
    { id: 11, createdAt: "2026-09-04T00:00:00Z", body: "## iai-design\n\nwrong sentinel" },
    { id: 12, createdAt: "2026-09-03T00:00:00Z", body: "## iai-evidence\n\nright one" },
    { id: 13, createdAt: "2026-09-02T00:00:00Z", body: "  ## iai-evidence\n\nindented, not a sentinel" },
    { id: 14, createdAt: "2026-09-01T00:00:00Z", body: "preamble\n## iai-evidence\n\nburied" },
  ];

  test("the target carries the requested sentinel on its first line", () => {
    const plan = value(planCommentUpsert({ sentinel: "evidence", body: "## iai-evidence\n\nx", comments: mixed }));
    expect(plan.action).toBe("edit");
    if (plan.action === "edit") {
      expect(plan.commentId).toBe(12);
      const target = mixed.find((c) => c.id === plan.commentId);
      expect(target?.body.split("\n")[0]).toBe("## iai-evidence");
    }
  });

  test("across a corpus, every edit target carries the sentinel", () => {
    const names = ["design", "test-plan", "evidence", "verdict", "gate"] as const;
    for (const name of names) {
      const plan = value(planCommentUpsert({ sentinel: name, body: `## iai-${name}\n\nx`, comments: mixed }));
      if (plan.action === "edit") {
        const target = mixed.find((c) => c.id === plan.commentId);
        expect(target?.body.split("\n")[0]?.startsWith(`## iai-${name}`)).toBe(true);
      }
    }
  });

  test("an empty or all-non-matching list creates rather than editing something else", () => {
    // Every case asserts unconditionally. An earlier draft guarded one branch
    // with `list === mixed.slice(0, 0)`, which compares two distinct array
    // references and is never true — so that assertion never ran. A condition
    // that cannot hold is an assertion that does not exist.
    const cases: readonly { readonly note: string; readonly list: readonly SentinelComment[] }[] = [
      { note: "empty list", list: [] },
      { note: "only a comment with no sentinel", list: [mixed[0] as SentinelComment] },
      {
        note: "only comments whose sentinel is indented or buried",
        list: [mixed[3] as SentinelComment, mixed[4] as SentinelComment],
      },
      { note: "only a different sentinel", list: [mixed[1] as SentinelComment] },
    ];
    for (const { note, list } of cases) {
      const plan = value(
        planCommentUpsert({ sentinel: "evidence", body: "## iai-evidence\n\nx", comments: list }),
      );
      expect(`${note}: ${plan.action}`).toBe(`${note}: create`);
    }
  });
});

describe("evidence — case 24 (P0, NEVER-26.9): no single run emits both a create and an edit", () => {
  test("every result is exactly one instruction", () => {
    const corpus: unknown[][] = [
      [],
      [{ id: 1, createdAt: "2026-09-01T00:00:00Z", body: "## iai-evidence\n\na" }],
      [
        { id: 1, createdAt: "2026-09-01T00:00:00Z", body: "## iai-evidence\n\na" },
        { id: 2, createdAt: "2026-09-02T00:00:00Z", body: "## iai-evidence\n\nb" },
      ],
      [{ id: 1, createdAt: "2026-09-01T00:00:00Z", body: "no sentinel" }],
      [null, 42, { id: 3, createdAt: "2026-09-03T00:00:00Z", body: "## iai-evidence\n\nc" }],
    ];
    const actions: UpsertAction["action"][] = [];
    for (const comments of corpus) {
      const plan = value(planCommentUpsert({ sentinel: "evidence", body: "## iai-evidence\n\nx", comments }));
      // The return type is a single action — a pair is not representable.
      expect(["create", "edit"]).toContain(plan.action);
      actions.push(plan.action);
    }
    expect(actions).toEqual(["create", "edit", "edit", "create", "edit"]);
  });

  test("hostile input yields a typed failure, never a partial instruction", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      "x",
      {},
      { sentinel: "evidence" },
      { sentinel: "nope", body: "x", comments: [] },
      { sentinel: "evidence", body: 42, comments: [] },
      { sentinel: "evidence", body: "", comments: [] },
      { get sentinel(): string { throw new Error("h"); }, body: "x", comments: [] },
    ];
    for (const input of hostile) {
      expect(() => planCommentUpsert(input)).not.toThrow();
      expect(planCommentUpsert(input).ok).toBe(false);
    }
  });

  test("an invented sentinel name is refused", () => {
    // The namespace is closed. `isKnownSentinelName` is the single definition;
    // this module does not carry its own list.
    for (const name of ["isa", "invented", "Design", "iai-design", ""]) {
      expect(planCommentUpsert({ sentinel: name, body: "x", comments: [] }).ok).toBe(false);
    }
  });
});
