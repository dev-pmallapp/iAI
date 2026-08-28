// The claim-identifier guard. Implements CLAIM-194.1 through CLAIM-194.4 of
// docs/design/stories/194.md, the Story that retired the ISC/ISA acronym
// family.
//
// This module is PURE: no fs, no path, no process, no Bun globals. Issue #204
// records the standing decision that guards take strings and return data, and
// that the file-walking shim lives in scripts/. `bun run lint` enforces that
// mechanically over packages/ via its no-host-import and no-process-cwd rules.
//
// The corpus this reads is prose, not a grammar, and it is considerably
// messier than the claim text suggests. Rather than one clever regex over the
// whole document, the parser walks line by line and only ever extracts
// identifiers from two STRUCTURED positions:
//
//   1. a claim bullet   `- [ ] CLAIM-9.1: ...`  in a `## Claims` section
//   2. a table cell     the `anchors_to` column of a test-plan case table,
//                       or column 1 of a Coverage table
//
// Everything else — prose, possessives (`CLAIM-940.4's`), adjectival forms
// (`CLAIM-950.4-style`), the eight different range syntaxes in use, and the
// six placeholder spellings — is deliberately NOT parsed. That is a real
// limitation and it is the right one: the alternative is a tokeniser that
// false-positives on `CLAIM-9.99` (a planted test fixture at
// docs/test-plans/194-plan.md:69), on `NEVER-9.1` (a phantom that appears only
// as a negative example at docs/design/stories/194.md:174), and on the whole
// reserved 900-block of documentation examples. Structure is the filter.
//
// Fenced code blocks are skipped for structural parsing, because
// docs/design/stories/194.md:47-50 carries illustrative `CLAIM-9.4` and
// `NEVER-9.9` lines inside a fence. The raw `ISC-` token ban does NOT skip
// fences — that rule is about the token existing at all.

export type ClaimRuleId =
  | "isc-token"
  | "identifier-malformed"
  | "identifier-duplicate"
  | "anticlaim-not-never"
  | "anchor-dangling";

export type ClaimSeverity = "error" | "warning";

export interface ClaimViolation {
  file: string;
  line: number;
  rule: ClaimRuleId;
  severity: ClaimSeverity;
  message: string;
}

/** A document to lint. `path` is repo-relative with POSIX separators, so that
 *  the allow-list and the Story-design predicate can both key off it. The shim
 *  must supply repo-relative paths even when invoked against a subdirectory. */
export interface ClaimDoc {
  path: string;
  source: string;
}

export interface ClaimId {
  kind: "CLAIM" | "NEVER";
  story: number;
  n: number;
}

// The form the test plan itself commits to, at docs/test-plans/194-plan.md:52.
// Kept verbatim so the shipped regex and the documented one cannot drift.
// parseClaimId applies one further restriction the plan leaves implicit —
// no leading zeros — so that `CLAIM-09.1` and `CLAIM-9.1` cannot both denote
// Story 9 claim 1.
export const CLAIM_ID_RE = /^(CLAIM|NEVER)-(\d+)\.(\d+)$/;

// CLAIM-194.1's allow-list, from docs/design/stories/194.md:119-126. Exactly
// four entries: one recursive prefix and three exact paths.
//
// The list is CLOSED — the claim says in terms that "a fifth path is a
// violation" — so everything except docs/evidence/ is an equality test, not a
// prefix test. docs/design/verification-pass-2.md is NOT allow-listed.
//
// Do not reduce this to three. It named three until b75f571, which made
// CLAIM-194.1 permanently unsatisfiable: docs/design/verification-pass.md
// carries 29 `ISC-` tokens in verdict rows that are immutable under the
// supersession rule, so the guard would have failed forever on a file it is
// forbidden to fix. Recorded as decision 9 at docs/design/stories/194.md:180.
export const ISC_ALLOWED_PATHS: readonly string[] = [
  "docs/evidence/",
  "docs/design/stories/194.md",
  "docs/test-plans/194-plan.md",
  "docs/design/verification-pass.md",
];

const EVIDENCE_PREFIX = "docs/evidence/";

export function isIscAllowed(path: string): boolean {
  if (path.startsWith(EVIDENCE_PREFIX)) return true;
  return ISC_ALLOWED_PATHS.some((allowed) => allowed !== EVIDENCE_PREFIX && allowed === path);
}

export function parseClaimId(token: string): ClaimId | null {
  const match = CLAIM_ID_RE.exec(token);
  if (match === null) return null;

  const kind = match[1] as "CLAIM" | "NEVER";
  const storyRaw = match[2] ?? "";
  const nRaw = match[3] ?? "";

  // No leading zeros: `CLAIM-09.1` would otherwise be a second spelling of
  // CLAIM-9.1 and defeat the uniqueness rule.
  if (storyRaw.length > 1 && storyRaw.startsWith("0")) return null;
  if (nRaw.length > 1 && nRaw.startsWith("0")) return null;

  return { kind, story: Number(storyRaw), n: Number(nRaw) };
}

export function formatClaimId(id: ClaimId): string {
  return `${id.kind}-${id.story}.${id.n}`;
}

// A Story design document, and the Story number its filename asserts. The
// back-reference from filename to identifier is what makes `CLAIM-9.4` inside
// docs/design/stories/194.md a REFERENCE rather than a mis-filed definition —
// Story 194 is the renaming Story and legitimately quotes nine of Story 9's
// identifiers.
const STORY_DESIGN_RE = /^docs\/design\/stories\/(\d+)\.md$/;
const TEST_PLAN_RE = /^docs\/test-plans\/[^/]+\.md$/;

// Loose on purpose: capture whatever sits between `- [ ] ` and the colon so a
// malformed identifier is still seen and reported, rather than silently
// failing to match and passing.
const CLAIM_BULLET_RE = /^- \[ \] ((?:CLAIM|NEVER)-[^\s:]*)\s*:\s*(.*)$/;

const FENCE_RE = /^\s*(```|~~~)/;

function storyOfDesignPath(path: string): number | null {
  const match = STORY_DESIGN_RE.exec(path);
  if (match === null) return null;
  const raw = match[1] ?? "";
  if (raw.length > 1 && raw.startsWith("0")) return null;
  return Number(raw);
}

function isPlaceholder(token: string): boolean {
  // `CLAIM-{story}.{n}`, `NEVER-{s}.{n}` and friends: six spellings in the
  // tree, all sharing a brace. Also a bare `CLAIM-` discussed as a token.
  return token.includes("{") || token === "CLAIM-" || token === "NEVER-";
}

interface ParsedBullet {
  line: number;
  token: string;
  id: ClaimId | null;
  body: string;
}

interface ParsedDoc {
  path: string;
  /** Claim bullets appearing under a `## Claims` H2, outside code fences. */
  claimBullets: ParsedBullet[];
  /** Identifiers cited in an anchors_to or Coverage-claim cell. */
  anchors: { line: number; token: string }[];
}

/** Split a markdown table row into trimmed cells, honouring `\|` escapes.
 *
 *  This matters: docs/test-plans/194-plan.md:57 carries an escaped pipe pair
 *  in the Case column, which sits BEFORE anchors_to. A naive split('|') shifts
 *  every later column and reads the wrong cell. */
function splitRow(line: string): string[] {
  const guarded = line.replace(/\\\|/g, "\u0000");
  const trimmed = guarded.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.replace(/\u0000/g, "\\|").trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/** Pull identifier tokens out of an anchors_to / Coverage cell. Values are
 *  comma-space separated and sometimes backticked. */
function cellTokens(cell: string): string[] {
  return cell
    .split(",")
    .map((part) => part.trim().replace(/^`+/, "").replace(/`+$/, "").trim())
    .filter((part) => part.startsWith("CLAIM-") || part.startsWith("NEVER-"));
}

function parseDoc(doc: ClaimDoc): ParsedDoc {
  const lines = doc.source.split("\n");
  const claimBullets: ParsedBullet[] = [];
  const anchors: { line: number; token: string }[] = [];

  const isTestPlan = TEST_PLAN_RE.test(doc.path);

  let inFence = false;
  let inClaims = false;
  // Column index of anchors_to for the table currently being read, or -1.
  let anchorColumn = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (line.startsWith("## ")) {
      inClaims = line.trim() === "## Claims";
    }

    if (inClaims) {
      const bullet = CLAIM_BULLET_RE.exec(line);
      if (bullet !== null) {
        const token = bullet[1] ?? "";
        if (!isPlaceholder(token)) {
          claimBullets.push({
            line: lineNumber,
            token,
            id: parseClaimId(token),
            body: bullet[2] ?? "",
          });
        }
      }
    }

    if (!isTestPlan) continue;

    if (!line.trim().startsWith("|")) {
      anchorColumn = -1;
      continue;
    }

    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;

    const lowered = cells.map((cell) => cell.toLowerCase());
    const headerAnchor = lowered.indexOf("anchors_to");
    if (headerAnchor !== -1) {
      anchorColumn = headerAnchor;
      continue;
    }
    // The Coverage table: `| Claim | Cases | Priority |`, identifier in col 1.
    if (lowered[0] === "claim" && lowered.includes("cases")) {
      anchorColumn = 0;
      continue;
    }

    if (anchorColumn === -1) continue;
    const cell = cells[anchorColumn];
    if (cell === undefined) continue;
    for (const token of cellTokens(cell)) {
      if (isPlaceholder(token)) continue;
      anchors.push({ line: lineNumber, token });
    }
  }

  return { path: doc.path, claimBullets, anchors };
}

function violation(
  file: string,
  line: number,
  rule: ClaimRuleId,
  message: string,
): ClaimViolation {
  return { file, line, rule, severity: "error", message };
}

export function lintClaimDocs(docs: readonly ClaimDoc[]): ClaimViolation[] {
  const violations: ClaimViolation[] = [];
  const parsed = docs.map(parseDoc);

  // CLAIM-194.1 — the raw token ban. Deliberately a plain substring test over
  // every line, including inside code fences.
  for (const doc of docs) {
    if (isIscAllowed(doc.path)) continue;
    const lines = doc.source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if ((lines[index] ?? "").includes("ISC-")) {
        violations.push(
          violation(
            doc.path,
            index + 1,
            "isc-token",
            "retired token `ISC-` outside the allow-list; the allow-list is closed at " +
              `four paths (${ISC_ALLOWED_PATHS.join(", ")}) and is not a prefix match`,
          ),
        );
      }
    }
  }

  // Definitions, keyed by identifier. Only a claim bullet in a `## Claims`
  // section of docs/design/stories/{N}.md, whose Story number matches the
  // filename, is a definition. Milestone seeds and Test Strategy rows are
  // references — which is what makes CLAIM-9.1..9.6 appearing in both
  // docs/milestones/M1.md and docs/design/stories/9.md legitimate rather than
  // six duplicates (test case 21). Never diff seed text against design text
  // expecting equality: 9.2, 9.3 and 9.4 already differ in prose and 9.5
  // differs by an `(after:)` annotation. The design wins.
  const definitions = new Map<string, { path: string; line: number }[]>();

  for (const doc of parsed) {
    const designStory = storyOfDesignPath(doc.path);

    for (const bullet of doc.claimBullets) {
      // CLAIM-194.2 — Story-qualified form, checked in the two structured
      // positions only. Runs over docs/design/ and docs/milestones/ alike,
      // per the claim text.
      if (bullet.id === null) {
        violations.push(
          violation(
            doc.path,
            bullet.line,
            "identifier-malformed",
            `claim identifier "${bullet.token}" is not Story-qualified; ` +
              `expected the form CLAIM-{story}.{n} or NEVER-{story}.{n} ` +
              `matching ${CLAIM_ID_RE.source}`,
          ),
        );
        continue;
      }

      if (designStory === null) continue;

      // Every bullet in a Story design's `## Claims` section is a DEFINITION,
      // including one that names the wrong Story. Requiring the number to
      // match the filename before counting it would make a mis-filed claim
      // invisible: planting `CLAIM-9.1` into stories/12.md would be read as a
      // harmless cross-reference rather than a second Story laying claim to
      // the identifier, and test case 13 would never fire.
      const key = formatClaimId(bullet.id);
      const seen = definitions.get(key) ?? [];
      seen.push({ path: doc.path, line: bullet.line });
      definitions.set(key, seen);

      // An identifier is owned by the Story whose design defines it. A bullet
      // under stories/{N}.md naming any Story but N is a collision even when
      // the other Story has no design document to collide with.
      if (bullet.id.story !== designStory) {
        violations.push(
          violation(
            doc.path,
            bullet.line,
            "identifier-duplicate",
            `claim identifier ${key} is defined in the Claims section of ` +
              `${doc.path}, which owns Story ${designStory}; ${key} belongs to ` +
              `docs/design/stories/${bullet.id.story}.md`,
          ),
        );
      }

      // CLAIM-194.3 — an anti-claim must carry NEVER-. Scoped to Story design
      // documents; docs/milestones/** is out of scope per
      // docs/design/stories/194.md:133-137, because milestone criteria are
      // declared seeds and are restated into a design before they are
      // verified. That is what lets M1.md's CLAIM-15.6 ("No file ... performs
      // I/O") pass despite being a prohibition (test case 20).
      //
      // The marker is the literal `Anti: ` opening the prose, as at
      // docs/design/stories/9.md:118. It is sufficient, not necessary:
      // docs/design/stories/194.md:143-147 uses NEVER- without it. So flag
      // only CLAIM- carrying `Anti:`, and never flag NEVER- for lacking it.
      if (bullet.id.kind === "CLAIM" && /^Anti:\s/.test(bullet.body)) {
        violations.push(
          violation(
            doc.path,
            bullet.line,
            "anticlaim-not-never",
            `anti-claim ${key} carries the CLAIM- prefix; an anti-claim must be ` +
              `written NEVER-${bullet.id.story}.${bullet.id.n}`,
          ),
        );
      }
    }
  }

  // CLAIM-194.2 — uniqueness, per meaning. Two definitions of one identifier.
  for (const [key, sites] of definitions) {
    if (sites.length < 2) continue;
    const first = sites[0];
    if (first === undefined) continue;
    for (const site of sites.slice(1)) {
      violations.push(
        violation(
          site.path,
          site.line,
          "identifier-duplicate",
          `claim identifier ${key} is defined more than once: ` +
            `${first.path}:${first.line} and ${site.path}:${site.line}`,
        ),
      );
    }
  }

  // CLAIM-194.4 — no dangling anchors_to or Coverage reference. Scoped to
  // docs/test-plans/*.md, which is also what keeps the reserved 900-block
  // documentation examples (901, 930, 940, 950, 960 — see
  // docs/design/stories/194.md:193) out of scope: they are cited only in the
  // thematic docs/design/0*-*.md series and will never have a stories/{N}.md.
  for (const doc of parsed) {
    for (const anchor of doc.anchors) {
      const id = parseClaimId(anchor.token);
      if (id === null) {
        violations.push(
          violation(
            doc.path,
            anchor.line,
            "identifier-malformed",
            `anchors_to reference "${anchor.token}" is not a well-formed claim ` +
              `identifier; expected ${CLAIM_ID_RE.source}`,
          ),
        );
        continue;
      }
      const key = formatClaimId(id);
      if (definitions.has(key)) continue;
      violations.push(
        violation(
          doc.path,
          anchor.line,
          "anchor-dangling",
          `anchors_to reference ${key} resolves to no claim defined in ` +
            `docs/design/stories/${id.story}.md`,
        ),
      );
    }
  }

  return violations;
}

/** The definitions belonging to one Story, ascending by claim number.
 *
 *  The migration preserved `n`, so the legacy `ISC-{n}` number is simply `n`:
 *  Story 9's ISC-1..6 became CLAIM-9.1..6 and ISC-7..9 became NEVER-9.7..9. */
export function mapStory(story: number, docs: readonly ClaimDoc[]): ClaimId[] {
  const ids: ClaimId[] = [];
  for (const doc of docs) {
    if (storyOfDesignPath(doc.path) !== story) continue;
    for (const bullet of parseDoc(doc).claimBullets) {
      if (bullet.id === null) continue;
      if (bullet.id.story !== story) continue;
      ids.push(bullet.id);
    }
  }
  return ids.sort((a, b) => a.n - b.n);
}
