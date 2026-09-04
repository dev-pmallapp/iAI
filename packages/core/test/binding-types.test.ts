import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_DOMAIN_IDS, bindingFail, bindingOk } from "../src/binding/index";

// CLAIM-31.1 — the seven types compile with every field name and type from
// docs/design/01-skill-hierarchy.md.
//
// THIS CASE READS ITS EXPECTATIONS OFF DISK, and that is the whole design of
// it. CLAIM-31.1 is a claim ABOUT A DOCUMENT, so a hand-written list of the
// thirty field names here would be a third copy of the contract — one in the
// design, one in the source, one in the test — and the third copy is the one
// nobody updates. docs/test-plans/31-plan.md note 1 states the rule; S1.4's
// case 15 established the pattern by pinning the `{ts}` format against 22 real
// filenames rather than against prose that disagreed with itself four ways.
//
// ASSERT THE DENOMINATOR FIRST. A parse that silently matched nothing would
// leave `expect(missing).toEqual([])` trivially true — the same vacuous pass
// #253 shipped and #261's case 19 was written to exclude.

const repoRoot = join(import.meta.dir, "../../..");
const bindingDir = join(import.meta.dir, "../src/binding");

interface ParsedInterface {
  readonly name: string;
  readonly fields: readonly string[];
}

// Extracts every `export interface X { ... }` block from the fenced ts block
// that starts at "## The binding contract" and its field names. Deliberately
// simple: the source block is a flat list of interfaces with one field per
// line, and a parser cleverer than the input is a parser that can be wrong in
// ways the input cannot express.
function parseDesignContract(): readonly ParsedInterface[] {
  const source = readFileSync(join(repoRoot, "docs/design/01-skill-hierarchy.md"), "utf8");
  const heading = source.indexOf("## The binding contract");
  if (heading < 0) throw new Error("the binding contract section moved");
  const fenceStart = source.indexOf("```ts", heading);
  const fenceEnd = source.indexOf("```", fenceStart + 5);
  if (fenceStart < 0 || fenceEnd < 0) throw new Error("the contract code block moved");
  const block = source.slice(fenceStart + 5, fenceEnd);

  const parsed: ParsedInterface[] = [];
  let current: { name: string; fields: string[] } | undefined;
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    const opening = /^export interface (\w+)\s*\{$/.exec(line);
    if (opening !== null) {
      current = { name: opening[1] as string, fields: [] };
      continue;
    }
    if (line === "}") {
      if (current !== undefined) parsed.push({ name: current.name, fields: current.fields });
      current = undefined;
      continue;
    }
    const field = /^(\w+)\??\s*:/.exec(line);
    if (field !== null && current !== undefined) current.fields.push(field[1] as string);
  }
  return parsed;
}

function bindingSources(): readonly { name: string; text: string }[] {
  return readdirSync(bindingDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ name: f, text: readFileSync(join(bindingDir, f), "utf8") }));
}

// The declared body of one interface in the shipped source, so a field name is
// matched against the type that owns it rather than against the whole
// directory. `LabelDef` appearing anywhere must not satisfy `DomainBinding`.
function declaredBody(typeName: string): string {
  for (const source of bindingSources()) {
    const start = source.text.indexOf(`export interface ${typeName} {`);
    if (start < 0) continue;
    const end = source.text.indexOf("\n}", start);
    if (end < 0) continue;
    return source.text.slice(start, end);
  }
  return "";
}

describe("binding — case 1 (P0, CLAIM-31.1): every field in the Design's contract is declared", () => {
  test("the contract block parses into a non-trivial number of interfaces and fields", () => {
    // ASSERT THE DENOMINATOR. docs/test-plans/31-plan.md requires >= 25 field
    // names before anything else is asserted; the block at
    // docs/design/01-skill-hierarchy.md:185-233 declares 6 interfaces and 30
    // fields. A parse returning [] would make every assertion below vacuous.
    const parsed = parseDesignContract();
    const fieldCount = parsed.reduce((n, i) => n + i.fields.length, 0);
    expect(parsed.length).toBeGreaterThanOrEqual(6);
    expect(fieldCount).toBeGreaterThanOrEqual(25);
  });

  test("every interface named in the Design is declared in packages/core/src/binding", () => {
    const missing = parseDesignContract()
      .map((i) => i.name)
      .filter((name) => declaredBody(name) === "");
    expect(missing).toEqual([]);
  });

  test("every field name in the Design appears in the interface that owns it", () => {
    const missing: string[] = [];
    for (const iface of parseDesignContract()) {
      const body = declaredBody(iface.name);
      for (const field of iface.fields) {
        if (!new RegExp(`\\breadonly ${field}\\??:`).test(body)) {
          missing.push(`${iface.name}.${field}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("the two optional fields stay optional and the rest stay required", () => {
    // GateSpec.killSwitch and GateSpec.vetoAgent are the only `?` fields in the
    // contract (docs/design/01-skill-hierarchy.md:221-222). Decision 7 gives
    // their absence a meaning — the domain asserts capability absence — so
    // making either required would make `dev` and `know` unrepresentable.
    const optionalInDesign: string[] = [];
    const source = readFileSync(join(repoRoot, "docs/design/01-skill-hierarchy.md"), "utf8");
    const heading = source.indexOf("## The binding contract");
    const fenceStart = source.indexOf("```ts", heading);
    const fenceEnd = source.indexOf("```", fenceStart + 5);
    for (const raw of source.slice(fenceStart, fenceEnd).split("\n")) {
      const m = /^\s*(\w+)\?\s*:/.exec(raw.replace(/\/\/.*$/, ""));
      if (m !== null) optionalInDesign.push(m[1] as string);
    }
    expect(optionalInDesign.sort()).toEqual(["killSwitch", "vetoAgent"]);

    const gate = declaredBody("GateSpec");
    expect(gate).toContain("readonly killSwitch?:");
    expect(gate).toContain("readonly vetoAgent?:");
    expect(gate).toContain("readonly irreversibleAction: string");
    expect(gate).not.toContain("readonly irreversibleAction?:");
    expect(gate).not.toContain("readonly autoDeny?:");
  });

  test("the two types the Design references but never declares are declared here", () => {
    // Decision 3. `Rung` is declared in the Design and omitted from every
    // restatement; `LabelDef` is referenced at :192 and ARCHITECTURE.md:103 and
    // declared NOWHERE in this repository. CLAIM-31.1 asks to compile every
    // type from a file that does not contain one of them.
    expect(declaredBody("Rung")).not.toBe("");
    expect(declaredBody("LabelDef")).not.toBe("");

    const label = declaredBody("LabelDef");
    expect(label).toContain("readonly name: string");
    expect(label).toContain("readonly color: string");
    // Optional, and the reason is recorded: CONTRIBUTING.md:294-295 wants a
    // description on every label and no binding literal in the tree carries
    // one, so requiring it would fail all five documented bindings.
    expect(label).toContain("readonly description?: string");

    // The reference the Design makes is `LabelDef[]`, so the name must be
    // reachable from `DomainBinding`'s own declaration.
    expect(declaredBody("DomainBinding")).toContain("LabelDef");
  });

  test("evidenceRequired is the literal type true, not boolean", () => {
    // docs/design/01-skill-hierarchy.md:215. This is what makes CLAIM-31.4's
    // second half unreachable from well-typed code, and #33's runtime check is
    // kept anyway per Decision 4. Widening it here would silently delete the
    // protection while leaving that check looking sufficient.
    const verify = declaredBody("VerifySpec");
    expect(verify).toContain("readonly evidenceRequired: true");
    expect(verify).not.toContain("evidenceRequired: boolean");
  });

  test("the verifier union is the hyphenated vocabulary, not the upstream one", () => {
    // docs/design/01-skill-hierarchy.md:207 and :56, and all twenty rung
    // literals in the tree. docs/design/verification-pass.md rows 111, 148,
    // 413, 615 and 712 give `deterministic | judged | attested` and mark them
    // `confirmed` — that is the upstream LifeOS vocabulary propagated into five
    // rows, and adopting it here would break every binding in the design docs.
    const text = bindingSources()
      .map((s) => s.text)
      .join("\n");
    expect(text).toContain('"tool-checked" | "model-judged" | "human-attested"');
    expect(text).not.toContain('"deterministic"');
  });
});

describe("binding — case 2 (P0, CLAIM-31.1): the two amendments, and only they", () => {
  test("KnownDomainId carries exactly the five literals of the Design, in order", () => {
    // Decision 1 widens `DomainId` for assignment. `KnownDomainId` must still
    // be the closed five, because CLAIM-31.6's allowance for the domain
    // literals in core is "the id union type", and because an editor
    // completing five names is half of why the union is worth keeping.
    expect(KNOWN_DOMAIN_IDS).toEqual(["dev", "trade", "health", "wealth", "know"]);

    const source = readFileSync(join(repoRoot, "docs/design/01-skill-hierarchy.md"), "utf8");
    expect(source).toContain('id: "dev" | "trade" | "health" | "wealth" | "know"');
    expect(declaredKnownUnion()).toBe('"dev" | "trade" | "health" | "wealth" | "know"');
  });

  test("DomainId is the open union, and the deviation is recorded in the source", () => {
    const domain = readFileSync(join(bindingDir, "domain.ts"), "utf8");
    expect(domain).toContain("export type DomainId = KnownDomainId | (string & {})");
    // A deviation from a claim that says "every field name and type" must be
    // findable by whoever hits it, not just present in a design document.
    expect(domain).toContain("Decision 1");
    expect(domain).toContain("CLAIM-31.3");
  });

  test("the domain literals appear in core only inside the union and its data form", () => {
    // A local, early form of case 14 (CLAIM-31.6), scoped to this directory so
    // #32 cannot introduce the violation that #34 later has to find. The full
    // word-anchored search over packages/core/src is case 14's.
    //
    // COMMENTS ARE MASKED FIRST, and the first run of this test is why. Two
    // comment lines here quote `if (domain === "trade")` — the anti-pattern
    // ARCHITECTURE.md:208 names as the thing the abstraction exists to prevent
    // — and a raw search flagged both. Prose about a literal is not a use of
    // it. scripts/lint.ts:36 masks comments before matching for exactly this
    // reason, and case 14 must do the same over the whole directory or it will
    // fail for reasons that have nothing to do with CLAIM-31.6.
    const lines = maskComments(readFileSync(join(bindingDir, "domain.ts"), "utf8")).split("\n");
    const offenders = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /"(dev|trade|health|wealth|know)"/.test(line))
      .filter(({ n }) => !inKnownIdRegion(n));
    expect(offenders.map((o) => `${String(o.n)}: ${o.line.trim()}`)).toEqual([]);
  });

  test("bindingOk and bindingFail are total and carry no cross-contamination", () => {
    const ok = bindingOk(42);
    expect(ok).toEqual({ ok: true, value: 42 });
    expect("reason" in ok).toBe(false);

    const bad = bindingFail<number>("nope");
    expect(bad).toEqual({ ok: false, reason: "nope" });
    expect("value" in bad).toBe(false);
  });
});

// Blanks the body of every line and block comment, preserving line count and
// offsets so a reported line number still points at the real line. Mirrors
// `maskComments` at scripts/lint.ts:36, which exists because the repository has
// hit the prose-versus-code trap repeatedly — most recently at
// docs/evidence/21-20260902T100227Z.md, where `grep "merge"` over core/src/gh
// returned 10+ legitimate hits and the anchored form returned 0.
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

// The declared right-hand side of `KnownDomainId`, so the assertion compares
// against the source rather than against a value that could have been built
// from a different list.
function declaredKnownUnion(): string {
  const domain = readFileSync(join(bindingDir, "domain.ts"), "utf8");
  const m = /export type KnownDomainId = ([^;]+);/.exec(domain);
  return (m?.[1] ?? "").trim();
}

// The line span covering `KnownDomainId` and `KNOWN_DOMAIN_IDS` — the only
// place CLAIM-31.6 permits the five literals to appear.
function inKnownIdRegion(line: number): boolean {
  const lines = readFileSync(join(bindingDir, "domain.ts"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith("export type KnownDomainId"));
  const end = lines.findIndex((l) => l.startsWith("];"));
  return start >= 0 && end > start && line >= start + 1 && line <= end + 1;
}

// The name collision typecheck found, pinned so it cannot regress silently.
//
// `Rung` is declared twice in this package: guards/risk-mandate.ts:13 has had a
// three-member rung IDENTIFIER union since S1.2, and binding/domain.ts:142
// declares the rung DEFINITION object CLAIM-31.1 names. The root barrel uses
// `export *` for both directories, which makes the name ambiguous and is a
// compile error (TS2308) rather than a silent last-one-wins — so this was found
// by `bun run typecheck`, not by review.
describe("binding — case 2 (P0, CLAIM-31.1): the Rung collision is resolved explicitly", () => {
  test("the root barrel resolves Rung to the contract type and keeps the older one aliased", () => {
    const barrel = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf8");
    expect(barrel).toContain('export type { Rung } from "./binding/domain"');
    expect(barrel).toContain('export type { Rung as RiskMandateRung } from "./guards/risk-mandate"');
  });

  test("both declarations still exist, because renaming either edits a claim's vocabulary", () => {
    expect(declaredBody("Rung")).toContain("readonly entryCriteria");
    const guards = readFileSync(
      join(import.meta.dir, "../src/guards/risk-mandate.ts"),
      "utf8",
    );
    expect(guards).toContain('export type Rung = "research" | "paper" | "live"');
  });
});
