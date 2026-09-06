import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  BLOB_SHA_PATTERN,
  COMMIT_PREFIX_RE,
  EXCLUSIVE_LABEL_PREFIXES,
  SENTINEL_NAMESPACE_PREFIX,
  SUB_ISSUE_FEATURE_HEADER,
} from "../packages/core/src/index";

// skill-lint validates SKILL.md frontmatter against the both-hosts
// intersection schema described in docs/design/08-dual-target.md and
// docs/design/01-skill-hierarchy.md. It does not use a generic YAML parser:
// a standard parser cannot distinguish `tier: "2"` (quoted) from `tier: 2`
// (bare), and that distinction is exactly what the metadata string-only rule
// below needs. Instead this file hand-rolls a parser for a small, documented
// subset of YAML:
//
//   - The frontmatter block is delimited by a line containing only `---` at
//     the very start of the file, and the next line containing only `---`.
//   - Top-level entries match `^([A-Za-z0-9_-]+):[ ]*(.*)$` at indent 0.
//   - A scalar value is double-quoted, single-quoted, bare, or empty.
//   - A block scalar (`>`, `>-`, `|`, `|-`) is followed by indented
//     continuation lines, folded or kept literal per the indicator, with
//     `-` stripping the trailing newline and its absence clipping to one.
//   - A nested block (indent 2+ under an empty-valued key) is parsed as its
//     own key/value pairs — this is how `metadata` arrives. A `- ` sequence
//     item, or nesting deeper than one level, is recorded as such (kind
//     "sequence" / "map") rather than resolved further, so the `metadata`
//     rules below can reject it.
//
// Anything outside this subset (flow collections `{}`/`[]`, anchors,
// multi-document streams, tags, etc.) is not recognised and is left to fall
// through as an unstructured scalar or nested node rather than guessed at.

export type SkillRuleId =
  | "frontmatter-missing"
  | "frontmatter-unterminated"
  | "field-required"
  | "field-unknown"
  | "field-duplicate"
  | "name-format"
  | "name-directory-mismatch"
  | "description-length"
  | "metadata-not-a-map"
  | "metadata-value-unquoted"
  | "metadata-nested"
  // --- BODY rules (S2.1 / #280). ---------------------------------------
  // The first body rules in this repository: every rule above inspects
  // frontmatter only. They run over a SECOND population as well as skills
  // (Decision 11 of docs/design/stories/35.md) and no frontmatter rule ever
  // runs over that second population.
  | "duplicate-contract"
  | "reference-citation-count"
  | "model-id-literal";

export type Severity = "error" | "warning";

export interface SkillViolation {
  file: string;
  line: number;
  rule: SkillRuleId;
  severity: Severity;
  message: string;
}

// Adjudicated conflict: docs/design/08-dual-target.md:44-50 documents 5
// allowed frontmatter keys (name, description, license, compatibility,
// metadata), while docs/design/01-skill-hierarchy.md:347-356 documents 8,
// adding `argument-hint`, `allowed-tools` and `disable-model-invocation` as
// Claude-Code-only fields. The human principal adjudicated this in favour of
// the strict 5: the three extra keys are `field-unknown` errors here, full
// stop. Reconciling the two design documents is routed to #14 under CLAIM-9.6 —
// do not soften this list or add an escape hatch pending that reconciliation.
const ALLOWED_KEYS = new Set(["name", "description", "license", "compatibility", "metadata"]);
const REQUIRED_KEYS: readonly string[] = ["name", "description"];

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface ScalarNode {
  kind: "scalar";
  raw: string;
  quoted: boolean;
  line: number;
}

interface MapNode {
  kind: "map";
  entries: FrontmatterField[];
  line: number;
}

interface SequenceNode {
  kind: "sequence";
  line: number;
}

type FrontmatterValue = ScalarNode | MapNode | SequenceNode;

interface FrontmatterField {
  key: string;
  value: FrontmatterValue;
  line: number;
}

interface RawLine {
  text: string;
  lineNo: number;
  indent: number;
  content: string;
}

function toRawLines(chunk: Array<{ text: string; lineNo: number }>): RawLine[] {
  return chunk.map(({ text, lineNo }) => {
    if (text.trim() === "") return { text, lineNo, indent: -1, content: "" };
    const indent = text.length - text.trimStart().length;
    return { text, lineNo, indent, content: text.slice(indent) };
  });
}

function foldLines(contentLines: string[]): string {
  const parts: string[] = [];
  let blankRun = 0;
  let first = true;
  for (const line of contentLines) {
    if (line === "") {
      blankRun += 1;
      continue;
    }
    if (first) {
      parts.push(line);
      first = false;
    } else if (blankRun > 0) {
      parts.push("\n".repeat(blankRun), line);
    } else {
      parts.push(" ", line);
    }
    blankRun = 0;
  }
  return parts.join("");
}

function parseBlockScalar(indicator: string, body: RawLine[], keyLineNo: number): ScalarNode {
  const nonBlank = body.filter((l) => l.indent !== -1);
  if (nonBlank.length === 0) {
    return { kind: "scalar", raw: "", quoted: false, line: keyLineNo };
  }
  const baseIndent = nonBlank[0]!.indent;
  const contentLines = body.map((l) => {
    if (l.indent === -1) return "";
    return l.text.length >= baseIndent ? l.text.slice(baseIndent) : l.text.trimStart();
  });
  while (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") contentLines.pop();

  const fold = indicator.startsWith(">");
  const chomp: "clip" | "strip" = indicator.endsWith("-") ? "strip" : "clip";
  let raw = fold ? foldLines(contentLines) : contentLines.join("\n");
  if (chomp === "clip" && contentLines.length > 0) raw += "\n";
  return { kind: "scalar", raw, quoted: false, line: keyLineNo };
}

function parseScalarText(remainder: string, line: number): ScalarNode {
  const trimmed = remainder.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    return { kind: "scalar", raw: inner, quoted: true, line };
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const inner = trimmed.slice(1, -1).replace(/''/g, "'");
    return { kind: "scalar", raw: inner, quoted: true, line };
  }
  return { kind: "scalar", raw: trimmed, quoted: false, line };
}

const NESTED_KEY_RE = /^([A-Za-z0-9_-]+):[ ]*(.*)$/;

function parseValue(remainderRaw: string, body: RawLine[], keyLineNo: number): FrontmatterValue {
  const remainder = remainderRaw.trim();
  if (remainder === ">" || remainder === ">-" || remainder === "|" || remainder === "|-") {
    return parseBlockScalar(remainder, body, keyLineNo);
  }
  if (remainder !== "") {
    return parseScalarText(remainder, keyLineNo);
  }

  const firstContentIdx = body.findIndex((l) => l.indent !== -1);
  if (firstContentIdx === -1) {
    return { kind: "scalar", raw: "", quoted: false, line: keyLineNo };
  }
  const first = body[firstContentIdx]!;
  if (first.content.startsWith("- ") || first.content === "-") {
    return { kind: "sequence", line: first.lineNo };
  }
  if (NESTED_KEY_RE.test(first.content)) {
    const nestedEntries = parseBlockEntries(body, first.indent);
    return { kind: "map", entries: nestedEntries, line: first.lineNo };
  }
  // Unrecognised nested content (outside the documented subset): treat as an
  // opaque map so downstream rules reject it rather than silently accepting it.
  return { kind: "map", entries: [], line: first.lineNo };
}

function parseBlockEntries(rawLines: RawLine[], indent: number): FrontmatterField[] {
  const fields: FrontmatterField[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const rl = rawLines[i]!;
    if (rl.indent === -1 || rl.indent !== indent) {
      i += 1;
      continue;
    }
    const m = NESTED_KEY_RE.exec(rl.content);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1]!;
    const remainderRaw = m[2] ?? "";

    const body: RawLine[] = [];
    let j = i + 1;
    while (j < rawLines.length) {
      const nl = rawLines[j]!;
      if (nl.indent === -1 || nl.indent > indent) {
        body.push(nl);
        j += 1;
        continue;
      }
      break;
    }

    const value = parseValue(remainderRaw, body, rl.lineNo);
    fields.push({ key, value, line: rl.lineNo });
    i = j;
  }
  return fields;
}

export function lintSkillSource(filePath: string, source: string, directoryName: string): SkillViolation[] {
  const violations: SkillViolation[] = [];
  const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));

  if ((lines[0] ?? "") !== "---") {
    violations.push({
      file: filePath,
      line: 1,
      rule: "frontmatter-missing",
      severity: "error",
      message: `${filePath} has no frontmatter block: the file must start with a line containing only '---'`,
    });
    return violations;
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? "") === "---") {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    violations.push({
      file: filePath,
      line: 1,
      rule: "frontmatter-unterminated",
      severity: "error",
      message: `${filePath} frontmatter block opened at line 1 is never closed with a second '---' line`,
    });
    return violations;
  }

  const chunk: Array<{ text: string; lineNo: number }> = [];
  for (let i = 1; i < closingIndex; i++) chunk.push({ text: lines[i] ?? "", lineNo: i + 1 });
  const rawLines = toRawLines(chunk);
  const fields = parseBlockEntries(rawLines, 0);

  const firstSeen = new Map<string, FrontmatterField>();
  for (const field of fields) {
    const previous = firstSeen.get(field.key);
    if (previous !== undefined) {
      violations.push({
        file: filePath,
        line: field.line,
        rule: "field-duplicate",
        severity: "error",
        message: `duplicate frontmatter key "${field.key}" (first seen at line ${previous.line})`,
      });
      continue;
    }
    firstSeen.set(field.key, field);
    if (!ALLOWED_KEYS.has(field.key)) {
      violations.push({
        file: filePath,
        line: field.line,
        rule: "field-unknown",
        severity: "error",
        message: `unknown frontmatter key "${field.key}"; allowed keys are ${[...ALLOWED_KEYS].join(", ")}`,
      });
    }
  }

  for (const required of REQUIRED_KEYS) {
    if (!firstSeen.has(required)) {
      violations.push({
        file: filePath,
        line: 1,
        rule: "field-required",
        severity: "error",
        message: `missing required frontmatter field "${required}"`,
      });
    }
  }

  const nameField = firstSeen.get("name");
  if (nameField) {
    const isScalar = nameField.value.kind === "scalar";
    const nameRaw = isScalar ? (nameField.value as ScalarNode).raw : "";
    const nameLine = isScalar ? (nameField.value as ScalarNode).line : nameField.line;
    if (nameRaw.length < 1 || nameRaw.length > 64 || !NAME_RE.test(nameRaw)) {
      violations.push({
        file: filePath,
        line: nameLine,
        rule: "name-format",
        severity: "error",
        message: `name "${nameRaw}" must match ${NAME_RE.source} and be 1-64 characters`,
      });
    } else if (nameRaw !== directoryName) {
      violations.push({
        file: filePath,
        line: nameLine,
        rule: "name-directory-mismatch",
        severity: "error",
        message: `name "${nameRaw}" does not match its containing directory "${directoryName}"`,
      });
    }
  }

  const descriptionField = firstSeen.get("description");
  if (descriptionField) {
    const isScalar = descriptionField.value.kind === "scalar";
    const raw = isScalar ? (descriptionField.value as ScalarNode).raw : "";
    const line = isScalar ? (descriptionField.value as ScalarNode).line : descriptionField.line;
    const length = raw.length;
    if (length < 1 || length > 1024) {
      violations.push({
        file: filePath,
        line,
        rule: "description-length",
        severity: "error",
        message: `description is ${length} characters; must be 1-1024`,
      });
    } else if (length > 300) {
      violations.push({
        file: filePath,
        line,
        rule: "description-length",
        severity: "warning",
        message: `description is ${length} characters, over the recommended 300`,
      });
    }
  }

  const metadataField = firstSeen.get("metadata");
  if (metadataField) {
    if (metadataField.value.kind !== "map") {
      violations.push({
        file: filePath,
        line: metadataField.value.line,
        rule: "metadata-not-a-map",
        severity: "error",
        message: `metadata must be a map of string to string, got a ${metadataField.value.kind}`,
      });
    } else {
      for (const entry of metadataField.value.entries) {
        if (entry.value.kind === "scalar") {
          if (!entry.value.quoted) {
            violations.push({
              file: filePath,
              line: entry.value.line,
              rule: "metadata-value-unquoted",
              severity: "error",
              message: `metadata.${entry.key} value "${entry.value.raw}" must be quoted`,
            });
          }
        } else {
          violations.push({
            file: filePath,
            line: entry.value.line,
            rule: "metadata-nested",
            severity: "error",
            message: `metadata.${entry.key} must be a quoted scalar, not a nested ${entry.value.kind}`,
          });
        }
      }
    }
  }

  return violations;
}

// ===========================================================================
// BODY RULES (S2.1, issue #280)
// ===========================================================================
//
// CLAIM-35.2, CLAIM-35.3, CLAIM-35.5 and NEVER-35.7 of
// docs/design/stories/35.md. These are the first rules here that read the
// BODY of a document rather than its frontmatter.
//
// Every contract below is IMPORTED from packages/core, never restated. That
// is not stylistic: `duplicate-contract` exists precisely to stop a second
// copy of a contract, and a rule that restated the thing it polices would be
// its own first violation.

// THE BASELINE. Three references CONTRIBUTING.md mandates for every skill:
// context discovery at :272, the label scheme at :277, error handling at :281.
//
// Part C of issue #287. These are the ROUTER's responsibility, read once when
// the verb resolves, not a per-skill dependency. A skill may still name one —
// an Error Handling section pointing at gh-error-handling.md is good practice —
// but naming it costs nothing, because it is loaded either way.
//
// EXPORTED so the rule, the test and any future reader share one copy. A
// second copy of this list is exactly what `duplicate-contract` exists to stop.
export const BASELINE_REFERENCES: readonly string[] = [
  "references/context-discovery.md",
  "references/gh-operations.md",
  "references/gh-error-handling.md",
];

// The maximum number of DISCRETIONARY references a single skill may cite —
// that is, references outside BASELINE_REFERENCES.
//
// docs/design/01-skill-hierarchy.md:472 bounds a skill's own dependencies.
// Parts A and B of issue #287, decided by @dev-pmallapp on 2026-09-06.
//
// WHY 5, DERIVED RATHER THAN CHOSEN. The `Reads` column at
// docs/design/01-skill-hierarchy.md:92-105 gives every one of the fourteen
// Tier-1 verbs its own references; the measured maximum is TWO
// (`task-verify` and `story-verify`, which read verification.md and
// evidence-artifacts.md). Tier-2 pack leaves are unwritten and unmeasured
// until M4. 5 = the measured maximum of 2, plus 3 of headroom for the
// unmeasured population.
//
// THE 2 IS NOT RESTATED HERE. test/skill-lint.test.ts parses the `Reads`
// column out of the design at run time and asserts this cap clears the real
// maximum with headroom, so the derivation re-checks itself when the design
// changes rather than rotting into a comment.
//
// EXPORTED so the test reads the bound rather than restating it, and so no
// file implementing the rule carries a bare literal as the threshold.
export const MAX_DISCRETIONARY_REFERENCES = 5;

// Vendor namespaces that qualify a literal model ID, per the routing table at
// docs/design/02-roles.md:547-553. Deliberately a closed list of vendor
// prefixes rather than a generic `word/word` pattern: the generic form
// matches repo-relative paths such as `packages/core` and would flag every
// document in the tree.
export const MODEL_ID_VENDORS: readonly string[] = ["amd-anthropic", "amd-unified"];

// The single file permitted to carry a literal model ID.
//
// CLAIM-35.3 as restated by Decision 1 of docs/design/stories/35.md. Matched
// as an EXACT repo-relative path, never a prefix and never a line range:
// a prefix would also exempt a hypothetical `model-routing-notes.md`, and
// docs/evidence/34-20260905T031229Z.md records a mutation surviving inside a
// range-based exemption.
export const MODEL_ID_EXEMPT_PATH = "references/model-routing.md";

interface ContractDef {
  readonly id: string;
  readonly needle: string;
  readonly owner: string;
}

// Each entry is built from the IMPORTED constant. Adding a contract here is
// how the rule grows; restating a value is not.
function contractDefs(): ContractDef[] {
  return [
    {
      id: "the sentinel namespace prefix",
      needle: SENTINEL_NAMESPACE_PREFIX,
      owner: "packages/core/src/evidence/sentinel.ts",
    },
    {
      id: "the commit-subject regex",
      needle: COMMIT_PREFIX_RE.source,
      owner: "packages/core/src/guards/commit-prefix.ts",
    },
    {
      id: "the at-most-one-status invariant (the exclusive label prefixes)",
      // The LITERAL ARRAY form only. Prose naming the namespaces is the job of
      // references/workflow-states.md and must not trip this rule — banning
      // the words would make the owning document unwritable, which is the bind
      // recorded against NEVER-35.7 in docs/design/stories/35.md.
      needle: JSON.stringify(EXCLUSIVE_LABEL_PREFIXES),
      owner: "packages/core/src/gh/labels.ts",
    },
    {
      id: "the blob-SHA permalink pattern",
      needle: BLOB_SHA_PATTERN,
      owner: "packages/core/src/evidence/permalink.ts",
    },
    {
      id: "the sub-issue feature header",
      needle: SUB_ISSUE_FEATURE_HEADER,
      owner: "packages/core/src/gh/sub-issues.ts",
    },
  ];
}

function lineOf(body: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < body.length; i += 1) if (body[i] === "\n") line += 1;
  return line;
}

// `- [ ] references/foo.md` and `references/foo.md` alike; DISTINCT paths only,
// because citing the same reference three times is one dependency, not three.
function citedReferences(body: string): string[] {
  const found = new Set<string>();
  const re = /references\/[a-z0-9-]+\.md/g;
  let m: RegExpExecArray | null = re.exec(body);
  while (m !== null) {
    found.add(m[0]);
    m = re.exec(body);
  }
  return [...found].sort();
}

// Part B of issue #287: the cap governs a skill's OWN dependencies, so the
// router-resident baseline does not count against it.
//
// Before this split the cap was unsatisfiable by construction — three mandated
// plus one of a skill's own is four, against a cap of three, so the rule
// admitted only skills with no dependencies at all. Two of the fourteen Tier-1
// verbs passed, and both did so by accident: `goal-create`'s own reference IS
// context-discovery, and `story-test-plan` reads `binding.verify`, which is not
// a reference.
export function discretionaryReferences(body: string): string[] {
  return citedReferences(body).filter((c) => !BASELINE_REFERENCES.includes(c));
}

// The three body rules. PURE over (path, body) — no fs, no discovery.
//
// POPULATION IS PER RULE, not per rule-set. This was wrong on the first
// implementation and real content caught it:
//
//   - `duplicate-contract` and `model-id-literal` apply to BOTH populations.
//     CLAIM-35.3 names skills/, agents/ AND references/; NEVER-35.7 polices
//     references/ specifically.
//   - `reference-citation-count` applies to SKILLS ONLY. The bound at
//     docs/design/01-skill-hierarchy.md:472 reads "A SKILL reads at most 3
//     references", and Problem 4 of docs/design/stories/35.md says CLAIM-35.5
//     "counts citations per skill body". A reference document citing its
//     siblings is the cite-don't-restate doctrine working; capping it would
//     push the twelve toward restating each other, which is precisely
//     backwards.
export function lintBodyRules(
  filePath: string,
  body: string,
  options: { readonly isSkill: boolean } = { isSkill: true },
): SkillViolation[] {
  const violations: SkillViolation[] = [];
  if (typeof body !== "string") return violations;

  // --- duplicate-contract (CLAIM-35.2, and NEVER-35.7 over references/) ---
  for (const def of contractDefs()) {
    if (def.needle.length < 3) continue;
    const at = body.indexOf(def.needle);
    if (at === -1) continue;
    violations.push({
      file: filePath,
      line: lineOf(body, at),
      rule: "duplicate-contract",
      severity: "error",
      message:
        `duplicate-contract: this body restates ${def.id}, which is owned by ` +
        `${def.owner}. Cite the owning module by path instead of copying the value ` +
        `— two copies of a contract drift`,
    });
  }

  // --- reference-citation-count (CLAIM-35.5) — SKILLS ONLY ---
  // Counts DISCRETIONARY citations only. Part B of issue #287.
  const discretionary = discretionaryReferences(body);
  if (options.isSkill && discretionary.length > MAX_DISCRETIONARY_REFERENCES) {
    violations.push({
      file: filePath,
      line: 1,
      rule: "reference-citation-count",
      severity: "error",
      message:
        `reference-citation-count: this body cites ${String(discretionary.length)} discretionary ` +
        `references (${discretionary.join(", ")}) but the maximum is ` +
        `${String(MAX_DISCRETIONARY_REFERENCES)}. Beyond that the skill is doing too many ` +
        `jobs and should be split (docs/design/01-skill-hierarchy.md:472). The ` +
        `router-resident baseline is exempt and was not counted`,
    });
  }

  // --- model-id-literal (CLAIM-35.3) ---
  if (filePath !== MODEL_ID_EXEMPT_PATH) {
    for (const vendor of MODEL_ID_VENDORS) {
      const re = new RegExp(`\\b${vendor}\\/[A-Za-z0-9][A-Za-z0-9._-]*`, "g");
      const m = re.exec(body);
      if (m === null) continue;
      violations.push({
        file: filePath,
        line: lineOf(body, m.index),
        rule: "model-id-literal",
        severity: "error",
        message:
          `model-id-literal: this body contains the literal model ID "${m[0]}". ` +
          `Only ${MODEL_ID_EXEMPT_PATH} may name a model; everywhere else names a ` +
          `routing CATEGORY (CLAIM-35.3, docs/design/stories/35.md Decision 1)`,
      });
    }
  }

  return violations;
}

// The SECOND population: contract documents, which have no frontmatter and
// must never be asked for one. Decision 11 of docs/design/stories/35.md.
//
// This is a NEW function beside discoverSkillFiles, not a loosening of it.
// Widening the existing discovery is the single most likely way to reintroduce
// a frontmatter-missing error on all twelve references — verified against the
// real function before this rule was written.
export function discoverContractFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...discoverContractFiles(join(dir, entry.name)));
      continue;
    }
    if (entry.name.endsWith(".md")) files.push(join(dir, entry.name));
  }
  return files.sort();
}

// Body rules ONLY. No frontmatter rule may reach this population.
export function lintContractTree(root: string, repoRoot: string): SkillViolation[] {
  const violations: SkillViolation[] = [];
  for (const filePath of discoverContractFiles(root)) {
    const rel = relative(repoRoot, filePath);
    violations.push(...lintBodyRules(rel, readFileSync(filePath, "utf8"), { isSkill: false }));
  }
  return violations;
}

function discoverSkillFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...discoverSkillFiles(join(dir, entry.name)));
      continue;
    }
    if (entry.name === "SKILL.md") files.push(join(dir, entry.name));
  }
  return files;
}

export function lintSkillTree(root: string, repoRoot?: string): SkillViolation[] {
  const violations: SkillViolation[] = [];
  for (const filePath of discoverSkillFiles(root)) {
    const source = readFileSync(filePath, "utf8");
    const directoryName = basename(dirname(filePath));
    violations.push(...lintSkillSource(filePath, source, directoryName));
    // Skills get BOTH rule sets. Contract documents get body rules only.
    const rel = repoRoot === undefined ? filePath : relative(repoRoot, filePath);
    violations.push(...lintBodyRules(rel, source, { isSkill: true }));
  }
  return violations;
}

const RULE_IDS: SkillRuleId[] = [
  "frontmatter-missing",
  "frontmatter-unterminated",
  "field-required",
  "field-unknown",
  "field-duplicate",
  "name-format",
  "name-directory-mismatch",
  "description-length",
  "metadata-not-a-map",
  "metadata-value-unquoted",
  "metadata-nested",
  "duplicate-contract",
  "reference-citation-count",
  "model-id-literal",
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function printReport(
  violations: SkillViolation[],
  skillFileCount: number,
  contractFileCount: number,
  dir: string,
): void {
  const sorted = [...violations].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });

  for (const violation of sorted) {
    const relativePath = relative(dir, violation.file);
    const ruleLabel = violation.severity === "warning" ? `warning:${violation.rule}` : violation.rule;
    console.error(`${relativePath}:${violation.line}  ${ruleLabel}  ${violation.message}`);
  }

  const byRule: Record<SkillRuleId, number> = {
    "frontmatter-missing": 0,
    "frontmatter-unterminated": 0,
    "field-required": 0,
    "field-unknown": 0,
    "field-duplicate": 0,
    "name-format": 0,
    "name-directory-mismatch": 0,
    "description-length": 0,
    "metadata-not-a-map": 0,
    "metadata-value-unquoted": 0,
    "metadata-nested": 0,
    "duplicate-contract": 0,
    "reference-citation-count": 0,
    "model-id-literal": 0,
  };
  for (const violation of violations) byRule[violation.rule] += 1;

  const padded = Math.max(...RULE_IDS.map((id) => id.length));
  for (const ruleId of RULE_IDS) {
    const count = byRule[ruleId];
    console.log(
      `skill-lint: ${ruleId.padEnd(padded)}  ${count} ${pluralize(count, "violation", "violations")}`,
    );
  }

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.length - errorCount;

  // TWO COUNTS, NEVER ONE. Decision 11 of docs/design/stories/35.md: a single
  // conflated total would let either population silently go to zero, which is
  // the exact shape this linter itself demonstrated for four milestones while
  // reporting success over an empty skills/ directory.
  console.log(
    `skill-lint: ${skillFileCount} SKILL.md ${pluralize(skillFileCount, "file", "files")} scanned (frontmatter + body rules)`,
  );
  console.log(
    `skill-lint: ${contractFileCount} contract ${pluralize(contractFileCount, "file", "files")} scanned (body rules only)`,
  );
  console.log(
    `skill-lint: ${errorCount} ${pluralize(errorCount, "error", "errors")}, ${warningCount} ${pluralize(warningCount, "warning", "warnings")}`,
  );
}

// The contract-document populations. Decision 11 of docs/design/stories/35.md
// widened this linter past skills/ for the first time.
//
// docs/design/verification-pass.md:142 (conflict row 19) shipped skill-lint
// skills/-only, on the ground that "one schema cannot span all three". That
// adjudication concerned the FRONTMATTER SCHEMA and is untouched: no
// frontmatter rule runs over the directories below. Row 19 never considered a
// body rule, because none existed until this Story. The row is annotated in
// place, never edited — its verdict rows are immutable by Decision 9.
const CONTRACT_DIRS: readonly string[] = ["references", "agents"];

function main(): void {
  const repoRoot = join(import.meta.dir, "..");
  const args = process.argv.slice(2);
  const targetDir = args[0] ? resolve(args[0]) : join(repoRoot, "skills");

  if (!existsSync(targetDir)) {
    console.error(`skill-lint: target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const skillFiles = discoverSkillFiles(targetDir);
  const violations = lintSkillTree(targetDir, repoRoot);

  let contractFileCount = 0;
  for (const dir of CONTRACT_DIRS) {
    const abs = join(repoRoot, dir);
    contractFileCount += discoverContractFiles(abs).length;
    violations.push(...lintContractTree(abs, repoRoot));
  }

  printReport(violations, skillFiles.length, contractFileCount, targetDir);

  const hasError = violations.some((v) => v.severity === "error");
  process.exit(hasError ? 1 : 0);
}

if (import.meta.main) {
  main();
}
