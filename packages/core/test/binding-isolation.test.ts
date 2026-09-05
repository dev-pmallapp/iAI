import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Cases 7 and 14 — the converse of case 6.
//
// Case 6 proves the fixture resolves. These prove core does not know it exists.
// Both are searches over `packages/core/src`, and both are written against two
// traps this repository has hit repeatedly.
//
// TRAP 1 — PROSE IS NOT CODE. A comment quoting a literal is not a use of it.
// #32's first run of the directory-local CLAIM-31.6 search failed on two lines
// that were both comments quoting the anti-pattern, and
// docs/evidence/21-20260902T100227Z.md recorded `grep "merge"` over core/src/gh
// returning 10+ legitimate hits where the anchored form returns 0. Every search
// below masks comments first, exactly as scripts/lint.ts:36 does.
//
// TRAP 2 — SUBSTRINGS. `dev` is a substring of `device`, `developer` and
// `/dev/null`. Every search below is word-anchored, and `the anchoring is
// load-bearing` below FAILS if someone relaxes it, so the anchoring cannot be
// removed without a red test.
//
// ASSERT THE DENOMINATOR. A walk that silently matched no files would make
// every `toEqual([])` below trivially true — the vacuous pass #253 shipped,
// #261's case 19 was written to exclude, and `skill-lint` still demonstrates
// daily by scanning zero files and reporting success.

const coreSrc = join(import.meta.dir, "../src");

function walk(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// Blanks the body of every line and block comment, preserving line count and
// offsets so a reported line number still points at the real line. Copied from
// binding-types.test.ts:243, which mirrors scripts/lint.ts:36.
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function scan(pattern: RegExp): { readonly hits: readonly Hit[]; readonly files: number } {
  const files = walk(coreSrc);
  const hits: Hit[] = [];
  for (const file of files) {
    const rel = file.slice(coreSrc.length + 1);
    maskComments(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((text, i) => {
        if (pattern.test(text)) hits.push({ file: rel, line: i + 1, text: text.trim() });
      });
  }
  return { hits, files: files.length };
}

// THE ONE DOCUMENTED EXCEPTION, AND WHY IT IS NAMED RATHER THAN EXCLUDED.
//
// `guards/path-allowlist.ts` is a reviewed table of DOCUMENTATION CITATIONS —
// repo-relative paths that appear in docs but did not exist when the guard was
// written (path-refs.ts, issue #210). It names `packages/domain-null` because
// docs/design/stories/31.md cited the path before this task created it.
//
// It is data, not logic: no import, no branch, no behaviour keyed on a domain.
// A blanket file-level exclusion would be the cheap fix and would also hide a
// real import if one were ever added, so instead each surviving hit is required
// to be a `path:` or `note:` field of that table. That is the difference
// between an exception and a hole.
//
// FINDING, RECORDED NOT FIXED: six entries in that allow-list name paths that
// NOW EXIST (`packages/domain-null`, `packages/core/src/binding`,
// `.../binding/registry.ts`, `.../classify`, `.../evidence`, `.../gh`), five of
// them created by S1.1, S1.3, S1.4 and S1.5.1-2 without the entry being
// retired. The file's own header warns that a knowingly-false entry is "the
// exact failure #209 warned about", and its stated count of 38 entries is now
// 43. Retiring them is a core/src edit that belongs to whoever owns that guard,
// not to this task.
const ALLOW_LIST_FILE = "guards/path-allowlist.ts";
const DATA_LINE = /^(path|note):/;

function isCitationData(hit: Hit): boolean {
  return hit.file === ALLOW_LIST_FILE && DATA_LINE.test(hit.text);
}

describe("binding — case 7 (P0, CLAIM-31.3): core carries no reference to the registered domain", () => {
  const NULL_DOMAIN = /domain-null|nullBinding|iai-domain-/;

  test("more than 30 source files are scanned", () => {
    const { files } = scan(NULL_DOMAIN);
    expect(files).toBeGreaterThan(30);
  });

  test("no file under packages/core/src imports the pack", () => {
    // The coupling that would actually matter. `packages/core/package.json`
    // carries a dev-only dependency so this suite can resolve the fixture by
    // name; that dependency must never reach the shipped source.
    const { hits } = scan(/\bfrom\s+["']iai-domain-|\brequire\(\s*["']iai-domain-/);
    expect(hits).toEqual([]);
  });

  test("the only surviving mentions are citation data in the reviewed path allow-list", () => {
    const { hits } = scan(NULL_DOMAIN);
    const offenders = hits.filter((h) => !isCitationData(h));
    expect(offenders.map((h) => `${h.file}:${String(h.line)}: ${h.text}`)).toEqual([]);
  });

  test("that exception is exactly two lines, so it cannot grow unnoticed", () => {
    // Pinned. If a third mention appears in the allow-list, or a real reference
    // is added and miscategorised as citation data, this fails and someone
    // re-reads the case rather than the count drifting silently.
    const { hits } = scan(NULL_DOMAIN);
    expect(hits.length).toBe(2);
    expect(hits.every(isCitationData)).toBe(true);
  });
});

describe("binding — case 14 (P0, CLAIM-31.6): the domain literals appear only in the id union", () => {
  // Word-anchored. Unanchored, `dev` matches `device`, `developer` and
  // `dev/null`; `know` matches `known`, which occurs throughout this package in
  // `isKnownSentinelName`, `KNOWN_DOMAIN_IDS` and `known.length`.
  const LITERALS = /\b(dev|trade|health|wealth|know)\b/;

  test("more than 30 source files are scanned", () => {
    const { files } = scan(LITERALS);
    expect(files).toBeGreaterThan(30);
  });

  test("the anchoring is load-bearing", () => {
    // Proves the trap is real in THIS tree rather than asserting it in prose.
    // If the anchored and unanchored searches ever returned the same set, the
    // anchoring would be decoration and this case would be weaker than it
    // looks.
    const anchored = scan(LITERALS).hits.length;
    const loose = scan(/dev|trade|health|wealth|know/).hits.length;
    expect(loose).toBeGreaterThan(anchored);
  });

  test("every match is the id union, its data list, or allow-list citation data", () => {
    const { hits } = scan(LITERALS);
    const offenders = hits.filter((h) => !isKnownIdDeclaration(h) && !isCitationData(h));
    expect(offenders.map((h) => `${h.file}:${String(h.line)}: ${h.text}`)).toEqual([]);
  });

  test("the id-union exemption covers exactly the union and its five elements", () => {
    // PINNED, AND THIS PIN IS THE FIX FOR A REAL SURVIVING MUTANT.
    //
    // The first version of this case exempted a LINE RANGE — everything
    // between `export type KnownDomainId` and the closing `];` — mirroring
    // `inKnownIdRegion` at binding-types.test.ts:260. Mutation testing showed
    // that inserting `export const DEFAULT_DOMAIN: KnownDomainId = "dev";`
    // between the union and the array survived all 755 tests and `bun run
    // lint`, while the identical line at end-of-file was killed. A range
    // exemption is a hole shaped like whatever fits inside it, and
    // domain-keyed behaviour fits.
    //
    // The exemption is now SHAPE-based (see `isKnownIdDeclaration`), and the
    // count is pinned so a sixth exempted line cannot appear unexamined —
    // the same technique case 7 uses above.
    const exempt = scan(LITERALS).hits.filter(isKnownIdDeclaration);
    expect(exempt.length).toBe(6);
  });

  test("the id union itself still declares all five, in order", () => {
    // The converse guard. Without this, deleting `KnownDomainId` outright would
    // make the case above pass perfectly — a condition that cannot hold is an
    // assertion that does not exist.
    const domain = readFileSync(join(coreSrc, "binding/domain.ts"), "utf8");
    const m = /export type KnownDomainId = ([^;]+);/.exec(domain);
    expect(m).not.toBeNull();
    expect(m?.[1]?.trim()).toBe('"dev" | "trade" | "health" | "wealth" | "know"');
  });
});

// The declared union and the `KNOWN_DOMAIN_IDS` array beneath it, which
// CLAIM-31.6 permits as "the id union type ... and test fixtures".
//
// SHAPE, NOT RANGE, and the difference is a mutation this suite caught. The
// obvious implementation — and the one at binding-types.test.ts:260 — exempts
// every line between the union declaration and the array's closing bracket.
// That admits any statement someone puts in the gap, including one that
// branches on a domain, which is the exact thing CLAIM-31.6 exists to forbid.
// Matching the union line and bare array elements admits nothing else.
//
// NOTE FOR WHOEVER TOUCHES binding-types.test.ts NEXT: `inKnownIdRegion` there
// has the same range-based hole. It is not fixed here because that file belongs
// to #32 and this task must not rewrite another task's cases; recorded in the
// evidence artifact instead.
const KNOWN_ID_ELEMENT = /^"(dev|trade|health|wealth|know)",?$/;

function isKnownIdDeclaration(hit: Hit): boolean {
  if (hit.file !== "binding/domain.ts") return false;
  return hit.text.startsWith("export type KnownDomainId") || KNOWN_ID_ELEMENT.test(hit.text);
}
