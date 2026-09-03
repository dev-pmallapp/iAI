import { describe, expect, test } from "bun:test";
import {
  findSentinelComments,
  requireSentinelComment,
  selectSentinelComment,
  type SentinelComment,
} from "../src/evidence/index";

// Three `## iai-verdict` comments, exactly as CLAIM-26.2 words it. Written
// oldest-last so a naive implementation returning `comments[0]` or the last
// element cannot pass by accident.
//
// THE IDS DESCEND WHILE THE TIMESTAMPS ASCEND, deliberately. An earlier draft
// numbered them 101/102/103 in timestamp order, and mutation-testing showed
// that a completely neutered `createdAt` comparison still passed case 4 —
// the id tie-break silently supplied the right answer for the wrong reason.
// Anti-correlating them means only a working `createdAt` comparison can win.
const V_OLD: SentinelComment = {
  id: 303,
  createdAt: "2026-09-01T10:00:00Z",
  body: "## iai-verdict FAIL\n\nfirst attempt",
};
const V_MID: SentinelComment = {
  id: 302,
  createdAt: "2026-09-02T10:00:00Z",
  body: "## iai-verdict PARTIAL\n\nsecond attempt",
};
const V_NEW: SentinelComment = {
  id: 301,
  createdAt: "2026-09-03T10:00:00Z",
  body: "## iai-verdict PASS\n\nthird attempt",
};

const THREE = [V_MID, V_NEW, V_OLD];

describe("evidence — case 4 (P0, CLAIM-26.2): three verdict comments, newest by createdAt wins", () => {
  test("returns exactly one comment, the newest", () => {
    const match = selectSentinelComment(THREE, "verdict");
    expect(match?.comment.id).toBe(301);
    expect(match?.name).toBe("verdict");
    expect(match?.matchCount).toBe(3);
  });

  test("the result is independent of input order", () => {
    // Six permutations of three elements. An implementation that relied on
    // sort stability or on first/last position passes one ordering and fails
    // another, so a single-ordering test would not catch it.
    const perms: SentinelComment[][] = [
      [V_OLD, V_MID, V_NEW],
      [V_OLD, V_NEW, V_MID],
      [V_MID, V_OLD, V_NEW],
      [V_MID, V_NEW, V_OLD],
      [V_NEW, V_OLD, V_MID],
      [V_NEW, V_MID, V_OLD],
    ];
    for (const perm of perms) {
      expect(selectSentinelComment(perm, "verdict")?.comment.id).toBe(301);
    }
  });

  test("only comments carrying the requested sentinel are considered", () => {
    const mixed = [
      ...THREE,
      { id: 200, createdAt: "2026-09-09T10:00:00Z", body: "## iai-evidence\n\nnewer, different" },
      { id: 201, createdAt: "2026-09-10T10:00:00Z", body: "plain prose, no sentinel" },
    ];
    // The newest comment in the list is #201, and the newest sentinel comment
    // is #200 — neither is a verdict, so neither may win.
    expect(selectSentinelComment(mixed, "verdict")?.comment.id).toBe(301);
    expect(selectSentinelComment(mixed, "evidence")?.comment.id).toBe(200);
    expect(selectSentinelComment(mixed, "evidence")?.matchCount).toBe(1);
  });

  test("a sentinel not on the first line does not count as carrying it", () => {
    const buried = [
      { id: 900, createdAt: "2026-09-20T10:00:00Z", body: "preamble\n## iai-verdict PASS\n" },
      { id: 901, createdAt: "2026-09-21T10:00:00Z", body: "  ## iai-verdict PASS\n" },
      { id: 902, createdAt: "2026-09-22T10:00:00Z", body: "```\n## iai-verdict PASS\n```\n" },
    ];
    expect(selectSentinelComment([...THREE, ...buried], "verdict")?.comment.id).toBe(301);
  });

  test("a prefix collision does not match", () => {
    const collide = [
      { id: 400, createdAt: "2026-09-30T10:00:00Z", body: "## iai-verdictish\n\nnot a verdict" },
    ];
    expect(selectSentinelComment(collide, "verdict")).toBeUndefined();
  });

  test("findSentinelComments returns every match, newest first, head matching the winner", () => {
    const all = findSentinelComments(THREE, "verdict");
    expect(all.map((c) => c.id)).toEqual([301, 302, 303]);
    expect(all[0]?.id).toBe(selectSentinelComment(THREE, "verdict")?.comment.id);
  });
});

describe("evidence — case 5 (P0, CLAIM-26.2): older comments are neither merged nor averaged", () => {
  test("the returned comment is field-for-field identical to the newest input element", () => {
    const match = selectSentinelComment(THREE, "verdict");
    expect(match?.comment).toEqual(V_NEW);
    // It is a normalised SNAPSHOT, not the input reference. That is
    // deliberate: `toComment` reads every field through a guarded reader, so a
    // hostile getter fires once during validation and can never fire again in
    // the caller's hands. Returning the live object would hand that hazard on.
    expect(match?.comment).not.toBe(V_NEW);
    // The snapshot carries exactly the three declared fields — no extra field
    // from the input survives to be depended on by accident.
    expect(Object.keys(match?.comment ?? {}).sort()).toEqual(["body", "createdAt", "id"]);
  });

  test("the snapshot reads a hostile getter once, not again in the caller", () => {
    let reads = 0;
    const trap = [
      {
        id: 700,
        createdAt: "2026-09-05T10:00:00Z",
        get body(): string {
          reads += 1;
          return "## iai-verdict PASS\n\ntrapped";
        },
      },
    ];
    const match = selectSentinelComment(trap, "verdict");
    const after = reads;
    // Touching the result must not re-enter the getter.
    expect(match?.comment.body).toContain("trapped");
    expect(reads).toBe(after);
  });

  test("extra input fields are dropped rather than passed through", () => {
    const fat = [
      {
        id: 800,
        createdAt: "2026-09-06T10:00:00Z",
        body: "## iai-verdict PASS",
        author: "someone",
        url: "https://example.invalid",
      },
    ];
    const match = selectSentinelComment(fat, "verdict");
    expect(Object.keys(match?.comment ?? {}).sort()).toEqual(["body", "createdAt", "id"]);
  });

  test("no field is drawn from the two older comments", () => {
    const match = selectSentinelComment(THREE, "verdict");
    expect(match?.comment.body).toBe(V_NEW.body);
    expect(match?.comment.body).not.toContain("FAIL");
    expect(match?.comment.body).not.toContain("PARTIAL");
    expect(match?.comment.createdAt).toBe(V_NEW.createdAt);
    expect(match?.comment.id).toBe(V_NEW.id);
  });

  test("the discarded history is reported as a count, not folded into the value", () => {
    // docs/design/03-workflow.md:405 — earlier ones are history, not state.
    // Surfacing the count lets a caller record the discard; it must not change
    // the returned comment.
    const one = selectSentinelComment([V_NEW], "verdict");
    expect(one?.matchCount).toBe(1);
    expect(one?.comment).toEqual(V_NEW);
    const three = selectSentinelComment(THREE, "verdict");
    expect(three?.matchCount).toBe(3);
    expect(three?.comment).toEqual(V_NEW);
  });
});

describe("evidence — case 6 (P0, CLAIM-26.2): equal createdAt resolves by highest comment id", () => {
  // Batched writes are real: five artifacts in docs/evidence/ share the
  // timestamp 20260902T071821Z. Without a total order CLAIM-26.2 is
  // satisfiable by a coin flip.
  const T = "2026-09-02T07:18:21Z";
  const LOW: SentinelComment = { id: 501, createdAt: T, body: "## iai-evidence\n\nlow id" };
  const HIGH: SentinelComment = { id: 502, createdAt: T, body: "## iai-evidence\n\nhigh id" };

  test("the higher id wins, in both input orderings", () => {
    expect(selectSentinelComment([LOW, HIGH], "evidence")?.comment.id).toBe(502);
    expect(selectSentinelComment([HIGH, LOW], "evidence")?.comment.id).toBe(502);
  });

  test("the tie-break never outranks a genuinely newer timestamp", () => {
    // A low id with a later timestamp must still win: the tie-break applies
    // only when the instants are equal.
    const LATER_LOW: SentinelComment = {
      id: 1,
      createdAt: "2026-09-02T07:18:22Z",
      body: "## iai-evidence\n\nlater but low id",
    };
    expect(selectSentinelComment([HIGH, LATER_LOW], "evidence")?.comment.id).toBe(1);
    expect(selectSentinelComment([LATER_LOW, HIGH], "evidence")?.comment.id).toBe(1);
  });

  test("equal instants written in different zone forms still tie-break", () => {
    // `2026-09-02T07:18:21+00:00` and `...Z` name the same instant but sort
    // differently as strings. Comparing parsed instants is what makes this
    // work; a lexical compare would pick the wrong winner.
    const OFFSET: SentinelComment = {
      id: 600,
      createdAt: "2026-09-02T07:18:21+00:00",
      body: "## iai-evidence\n\noffset form",
    };
    expect(selectSentinelComment([HIGH, OFFSET], "evidence")?.comment.id).toBe(600);
    expect(selectSentinelComment([OFFSET, HIGH], "evidence")?.comment.id).toBe(600);
  });

  test("an unparseable createdAt sorts oldest and never wins by accident", () => {
    const BAD: SentinelComment = {
      id: 999,
      createdAt: "not-a-date",
      body: "## iai-evidence\n\nunparseable",
    };
    expect(selectSentinelComment([BAD, LOW], "evidence")?.comment.id).toBe(501);
    expect(selectSentinelComment([LOW, BAD], "evidence")?.comment.id).toBe(501);
    // It is still reachable when it is the only candidate, rather than being
    // silently dropped.
    expect(selectSentinelComment([BAD], "evidence")?.comment.id).toBe(999);
  });

  test("findSentinelComments is a total order over ties", () => {
    expect(findSentinelComments([LOW, HIGH], "evidence").map((c) => c.id)).toEqual([502, 501]);
    expect(findSentinelComments([HIGH, LOW], "evidence").map((c) => c.id)).toEqual([502, 501]);
  });
});

describe("evidence — case 7 (P0, CLAIM-26.3): absence of a required sentinel is a hard failure", () => {
  test("an empty comment list blocks", () => {
    const result = requireSentinelComment([], "evidence");
    expect(result.decision.action).toBe("block");
    expect(result.match).toBeUndefined();
    expect(result.decision.message).toContain("## iai-evidence");
    expect(result.decision.message).toContain("hard failure");
  });

  test("a list with only non-matching sentinels blocks", () => {
    const result = requireSentinelComment(THREE, "evidence");
    expect(result.decision.action).toBe("block");
    expect(result.match).toBeUndefined();
  });

  test("no default value is returned on any absence input", () => {
    // The failure mode CLAIM-26.3 exists to exclude: a default that reads as
    // success. Nothing here may yield `allow`, a match, or an empty-string body.
    const absent: unknown[] = [
      [],
      THREE,
      [{ id: 1, createdAt: "2026-09-01T00:00:00Z", body: "no sentinel here" }],
      null,
      undefined,
      "not a list",
      42,
      {},
    ];
    for (const input of absent) {
      const result = requireSentinelComment(input, "evidence");
      expect(result.decision.action).toBe("block");
      expect(result.match).toBeUndefined();
    }
  });

  test("presence allows, and carries the match", () => {
    const result = requireSentinelComment(THREE, "verdict");
    expect(result.decision.action).toBe("allow");
    expect(result.match?.comment.id).toBe(301);
    expect(result.decision.message).toContain("301");
  });

  test("the allow message records discarded history without merging it", () => {
    const many = requireSentinelComment(THREE, "verdict");
    expect(many.decision.message).toContain("2 earlier match(es)");
    const one = requireSentinelComment([V_NEW], "verdict");
    expect(one.decision.message).not.toContain("earlier match");
  });

  test("there is no path returning a match alongside block", () => {
    const inputs: unknown[] = [[], THREE, null, [V_NEW], "x", [{}], [null]];
    for (const input of inputs) {
      const result = requireSentinelComment(input, "verdict");
      if (result.decision.action === "block") expect(result.match).toBeUndefined();
      else expect(result.match).toBeDefined();
    }
  });

  test("never throws on hostile input", () => {
    // The local slice of NEVER-26.8; the full sweep lands in #261.
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      "string",
      {},
      [null],
      [undefined],
      [42],
      [{ id: "not a number", createdAt: "2026-09-01T00:00:00Z", body: "## iai-verdict" }],
      [{ id: 1, createdAt: 12345, body: "## iai-verdict" }],
      [{ id: 1, createdAt: "2026-09-01T00:00:00Z", body: null }],
      [{ id: -1, createdAt: "2026-09-01T00:00:00Z", body: "## iai-verdict" }],
      [{ get id(): number { throw new Error("hostile"); }, createdAt: "x", body: "y" }],
      [{ id: 1, createdAt: "2026-09-01T00:00:00Z", get body(): string { throw new Error("hostile"); } }],
      Object.create({ id: 1, createdAt: "2026-09-01T00:00:00Z", body: "## iai-verdict" }),
    ];
    for (const input of hostile) {
      expect(() => selectSentinelComment(input, "verdict")).not.toThrow();
      expect(() => findSentinelComments(input, "verdict")).not.toThrow();
      expect(() => requireSentinelComment(input, "verdict")).not.toThrow();
    }
  });

  test("a malformed element does not hide a valid one later in the list", () => {
    // A `continue` that was a `return` would pass every test above and lose
    // the real comment here.
    const mixed = [null, 42, { id: 1 }, V_NEW];
    expect(selectSentinelComment(mixed, "verdict")?.comment.id).toBe(301);
    expect(requireSentinelComment(mixed, "verdict").decision.action).toBe("allow");
  });

  test("an inherited property is not read as an own field", () => {
    // Object.create puts the fields on the prototype. `hasOwnProperty` is what
    // stops a prototype-polluted object being read as a real comment.
    const inherited = Object.create({
      id: 1,
      createdAt: "2026-09-01T00:00:00Z",
      body: "## iai-verdict PASS",
    }) as unknown;
    expect(selectSentinelComment([inherited], "verdict")).toBeUndefined();
  });
});
