import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// THE IMPORT UNDER TEST. This line is case 6.
//
// It is a PACKAGE-NAME import, not a relative path, and the distinction is the
// whole case rather than a style preference. `docs/test-plans/31-plan.md` case
// 6: "A relative import fails the case even if resolution succeeds, because it
// would prove nothing about package boundaries." A relative path reaches
// through the filesystem and would resolve just as well if `packages/domain-null`
// were a directory of loose files with no package identity at all.
//
// It is also mechanically enforced, which was discovered rather than assumed:
// the repository's own `no-host-import` lint rule (scope: core) rejects
// `../../domain-null/src/index` with "packages/core must not import outside its
// own package". The forbidden form is not merely discouraged, it fails
// `bun run lint` and two cases in `test/lint.test.ts`.
import { nullBinding } from "iai-domain-null";
import {
  KNOWN_DOMAIN_IDS,
  createRegistry,
  registeredDomainIds,
  resolveBinding,
  validateBinding,
} from "../src/binding/index";

// CLAIM-31.3 — a domain registers without editing any file under
// packages/core/src.
//
// WHY THE FIXTURE LIVES IN ITS OWN WORKSPACE PACKAGE. Decision 12 of
// docs/design/stories/31.md. A fixture defined in this file would satisfy every
// assertion below while proving nothing, because it would already be inside the
// package whose ignorance is the property under test.
//
// HOW THIS SUITE RESOLVES THE PACKAGE, AND THE COST OF IT. Bun resolves a
// workspace package by name only from a package that DECLARES it as a
// dependency — it creates scoped symlinks (`packages/<p>/node_modules/<dep>`)
// and no root-level ones. `packages/core` therefore now carries
// `"devDependencies": { "iai-domain-null": "workspace:*" }`, which is a SIXTH
// coordinated edit beyond the five the issue body enumerates, and it is a
// core-to-pack dependency edge.
//
// That edge is deliberate and bounded, but it is not free, and #272 must be
// scoped so that `no-domain-pack-import` forbids the edge in
// `packages/core/src` WITHOUT forbidding this dev-only edge in
// `packages/core/test`. Design Problem 8 of docs/design/stories/31.md records
// that "nothing forbids packages/core from importing a domain pack"; this file
// is the one place where that is intended, and case 7 is what holds the rest of
// core to the ban.
describe("binding — case 6 (P0, CLAIM-31.3): a binding from outside core registers and resolves", () => {
  test("the fixture is imported by package name, not by relative path", () => {
    // Asserted against this file's own source, in the same spirit as case 9's
    // cast assertion: if someone "helpfully" rewrites the import to a relative
    // path, the case must FAIL rather than quietly stop proving anything.
    //
    // THIS ASSERTION IS MADE AGAINST PARSED IMPORT SPECIFIERS, NOT AGAINST THE
    // RAW TEXT, and it took two red runs to get right. Both failures are worth
    // recording because they are the two defect classes this Story keeps
    // meeting.
    //
    // First: a substring check over the raw source failed on this file's OWN
    // COMMENTARY, which discusses the relative form in prose. Prose about a
    // literal is not a use of it — #32 hit this, and scripts/lint.ts:36 masks
    // comments for the same reason.
    //
    // Second, and worse: masking comments was not enough, because
    // `toContain("...")` puts the very string it searches for into the code
    // being searched. That assertion passes even if the import is deleted — a
    // condition that cannot fail is an assertion that does not exist, which is
    // precisely the vacuous-pass class #33's mutation run found three times.
    //
    // Matching `from "<specifier>"` occurrences fixes both: an assertion's own
    // argument is never preceded by `from`, so only real imports are examined.
    const self = maskComments(
      readFileSync(join(import.meta.dir, "binding-conformance.test.ts"), "utf8"),
    );
    const specifiers = [...self.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

    expect(specifiers).toContain("iai-domain-null");
    // No specifier reaches the pack through the filesystem.
    expect(specifiers.filter((s) => s !== undefined && /domain-null/.test(s) && s.startsWith("."))).toEqual([]);
  });

  test("core has never heard of this domain, which is what makes the case worth running", () => {
    // If `null` were a known id the registration would prove only that core
    // accepts its own literals back.
    expect(KNOWN_DOMAIN_IDS).not.toContain(nullBinding.id);
    expect(nullBinding.id).toBe("null");
  });

  test("the fixture is valid on its own terms, not merely accepted", () => {
    // A fixture that registered because validation is lenient would prove the
    // opposite of CLAIM-31.3: that the registry takes anything.
    const validated = validateBinding(nullBinding);
    expect(validated.ok).toBe(true);
  });

  test("createRegistry accepts it and resolveBinding returns it", () => {
    const built = createRegistry([nullBinding]);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error(built.reason);

    const resolved = resolveBinding(built.value, "domain:null");
    expect(resolved.decision.action).toBe("allow");
    // Identity, not deep equality: resolution is a lookup that hands back the
    // registered object, not a copy reconstructed inside core.
    expect(resolved.binding).toBe(nullBinding);
  });

  test("the registered domain enumerates for CLAIM-177.4's per-domain surfaces", () => {
    const built = createRegistry([nullBinding]);
    if (!built.ok) throw new Error(built.reason);
    expect(registeredDomainIds(built.value)).toEqual(["null"]);
  });
});

// Copied from binding-types.test.ts:243, which mirrors scripts/lint.ts:36.
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}
