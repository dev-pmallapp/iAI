import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

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
  | "metadata-nested";

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
// stop. Reconciling the two design documents is routed to #14 under ISC-6 —
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
        message: `${filePath} is missing required frontmatter field "${required}"`,
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

export function lintSkillTree(root: string): SkillViolation[] {
  const violations: SkillViolation[] = [];
  for (const filePath of discoverSkillFiles(root)) {
    const source = readFileSync(filePath, "utf8");
    const directoryName = basename(dirname(filePath));
    violations.push(...lintSkillSource(filePath, source, directoryName));
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
];

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function printReport(violations: SkillViolation[], fileCount: number, dir: string): void {
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
  console.log(
    `skill-lint: ${fileCount} SKILL.md ${pluralize(fileCount, "file", "files")} scanned, ${errorCount} ${pluralize(errorCount, "error", "errors")}, ${warningCount} ${pluralize(warningCount, "warning", "warnings")}`,
  );
}

function main(): void {
  const repoRoot = join(import.meta.dir, "..");
  const args = process.argv.slice(2);
  const targetDir = args[0] ? resolve(args[0]) : join(repoRoot, "skills");

  if (!existsSync(targetDir)) {
    console.error(`skill-lint: target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const files = discoverSkillFiles(targetDir);
  const violations = lintSkillTree(targetDir);
  printReport(violations, files.length, targetDir);

  const hasError = violations.some((v) => v.severity === "error");
  process.exit(hasError ? 1 : 0);
}

if (import.meta.main) {
  main();
}
