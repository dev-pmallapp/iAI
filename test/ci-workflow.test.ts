// Tests for Task #323 (build target 7 of docs/design/stories/293.md): the
// seam rung's CI job, added but deliberately not yet required. Case 13 of
// docs/test-plans/293-plan.md: "the required-context count is asserted both
// before and after, and each verifier hardcodes the list twice, so all four
// sites must agree. A live job silently promoted to required fails here."
//
// House style copied from test/transcription-gap.test.ts exactly: every
// denominator is asserted non-zero FIRST, cardinality (a Set's size) rather
// than array length wherever duplicates would otherwise hide, and every
// parse asserts its own pattern actually matched before anything is built
// on top of it — a regex that silently matches nothing would make every
// later assertion in this file vacuously true.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const ciYmlPath = join(repoRoot, ".github", "workflows", "ci.yml");
const requiredChecksPath = join(repoRoot, "scripts", "verify-required-checks.sh");
const workflowHygienePath = join(repoRoot, "scripts", "verify-workflow-hygiene.sh");
const packageJsonPath = join(repoRoot, "package.json");

const ciYmlText = readFileSync(ciYmlPath, "utf8");
const requiredChecksText = readFileSync(requiredChecksPath, "utf8");
const workflowHygieneText = readFileSync(workflowHygienePath, "utf8");
const packageJsonText = readFileSync(packageJsonPath, "utf8");

// ===========================================================================
// Job-name parse: the top-level keys under `jobs:` in ci.yml.
// ===========================================================================

interface JobBlock {
  readonly name: string;
  readonly headerLineIndex: number;
  readonly bodyLines: readonly string[];
}

function parseCiYmlJobs(text: string): readonly JobBlock[] {
  const lines = text.split("\n");
  const jobsIdx = lines.findIndex((l) => l === "jobs:");
  if (jobsIdx === -1) throw new Error("`jobs:` top-level key not found in ci.yml");

  const headerIndices: number[] = [];
  const headerNames: string[] = [];
  for (let i = jobsIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) {
      headerIndices.push(i);
      headerNames.push(m[1] as string);
    }
  }

  const blocks: JobBlock[] = [];
  for (let i = 0; i < headerIndices.length; i += 1) {
    const start = (headerIndices[i] as number) + 1;
    const end = i + 1 < headerIndices.length ? (headerIndices[i + 1] as number) : lines.length;
    blocks.push({
      name: headerNames[i] as string,
      headerLineIndex: headerIndices[i] as number,
      bodyLines: lines.slice(start, end),
    });
  }
  return blocks;
}

const ciJobs = parseCiYmlJobs(ciYmlText);

describe("job names parsed from ci.yml's `jobs:` block", () => {
  test("0. denominator non-zero first: at least one job was parsed", () => {
    expect(ciJobs.length).toBeGreaterThan(0);
  });

  test("job names are unique (cardinality equals count)", () => {
    const names = ciJobs.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

const ciJobNames = ciJobs.map((j) => j.name);
const ciJobNameSet = new Set(ciJobNames);

// ===========================================================================
// The FOUR hardcoded lists. Each parse MUST assert it matched before its
// result is used for anything — a silently-empty match would make every
// later "all four agree" assertion vacuous.
// ===========================================================================

// (1) scripts/verify-required-checks.sh's REQUIRED_CONTEXTS bash array.
const requiredContextsArrayMatch = /REQUIRED_CONTEXTS=\(([^)]*)\)/.exec(requiredChecksText);

// (2) the same file's inline `required_status_checks.contexts[]=` list, in
// the branch-protection help text shown on a 404.
const inlineContextsMatches = [
  ...requiredChecksText.matchAll(/required_status_checks\.contexts\[\]=([A-Za-z0-9_-]+)/g),
];

// (3) scripts/verify-workflow-hygiene.sh's REQUIRED_JOBS bash array.
const requiredJobsArrayMatch = /REQUIRED_JOBS=\(([^)]*)\)/.exec(workflowHygieneText);

// (4) the Python `required = [...]` list inside that file's `<<'PYEOF'`
// heredoc (run_yaml_parse). This is the site that gets missed in a plain
// grep for REQUIRED_JOBS/REQUIRED_CONTEXTS, because it lives inside a
// heredoc under a different name.
const pythonRequiredListMatch = /required\s*=\s*\[([^\]]*)\]/.exec(workflowHygieneText);

describe("the four hardcoded required-job/context lists each parse successfully", () => {
  test("(i) REQUIRED_CONTEXTS bash array in verify-required-checks.sh matched", () => {
    expect(requiredContextsArrayMatch).not.toBeNull();
    expect((requiredContextsArrayMatch as RegExpExecArray)[1]?.trim().length).toBeGreaterThan(0);
  });

  test("(ii) inline `contexts[]=` occurrences in verify-required-checks.sh matched, and there is more than one", () => {
    expect(inlineContextsMatches.length).toBeGreaterThan(0);
  });

  test("(iii) REQUIRED_JOBS bash array in verify-workflow-hygiene.sh matched", () => {
    expect(requiredJobsArrayMatch).not.toBeNull();
    expect((requiredJobsArrayMatch as RegExpExecArray)[1]?.trim().length).toBeGreaterThan(0);
  });

  test("(iv) Python `required = [...]` list inside the <<'PYEOF' heredoc matched — the site that gets missed", () => {
    expect(pythonRequiredListMatch).not.toBeNull();
    expect((pythonRequiredListMatch as RegExpExecArray)[1]?.trim().length).toBeGreaterThan(0);
    // Confirm this match actually landed inside the heredoc, not some other
    // `required = [...]` that might be added elsewhere in the future: the
    // matched text must appear between the `<<'PYEOF'` open and the `PYEOF`
    // close markers.
    const heredocStart = workflowHygieneText.indexOf("<<'PYEOF'");
    const heredocEnd = workflowHygieneText.indexOf("\nPYEOF", heredocStart);
    expect(heredocStart).toBeGreaterThan(-1);
    expect(heredocEnd).toBeGreaterThan(heredocStart);
    const matchOffset = (pythonRequiredListMatch as RegExpExecArray).index;
    expect(matchOffset).toBeGreaterThan(heredocStart);
    expect(matchOffset).toBeLessThan(heredocEnd);
  });
});

const requiredContextsArray = ((requiredContextsArrayMatch as RegExpExecArray)[1] as string)
  .trim()
  .split(/\s+/);
const inlineContextsList = inlineContextsMatches.map((m) => m[1] as string);
const requiredJobsArray = ((requiredJobsArrayMatch as RegExpExecArray)[1] as string)
  .trim()
  .split(/\s+/);
const pythonRequiredList = ((pythonRequiredListMatch as RegExpExecArray)[1] as string)
  .split(",")
  .map((s) => s.trim().replace(/^["']|["']$/g, ""))
  .filter((s) => s.length > 0);

describe("all four hardcoded lists agree, as ORDERED arrays (case 13 of docs/test-plans/293-plan.md)", () => {
  test("0. denominator non-zero first: all four parsed lists are non-empty", () => {
    expect(requiredContextsArray.length).toBeGreaterThan(0);
    expect(inlineContextsList.length).toBeGreaterThan(0);
    expect(requiredJobsArray.length).toBeGreaterThan(0);
    expect(pythonRequiredList.length).toBeGreaterThan(0);
  });

  test("REQUIRED_CONTEXTS (bash array) == inline contexts[]= list", () => {
    expect(requiredContextsArray).toEqual(inlineContextsList);
  });

  test("REQUIRED_CONTEXTS (bash array) == REQUIRED_JOBS (bash array)", () => {
    expect(requiredContextsArray).toEqual(requiredJobsArray);
  });

  test("REQUIRED_CONTEXTS (bash array) == Python required = [...] list", () => {
    expect(requiredContextsArray).toEqual(pythonRequiredList);
  });

  test("REQUIRED_JOBS (bash array) == Python required = [...] list", () => {
    expect(requiredJobsArray).toEqual(pythonRequiredList);
  });

  test("inline contexts[]= list == Python required = [...] list", () => {
    expect(inlineContextsList).toEqual(pythonRequiredList);
  });

  test("the required-context COUNT is still exactly six", () => {
    expect(requiredContextsArray.length).toBe(6);
  });
});

// ===========================================================================
// THE PARTITION. required-list ∪ NOT_REQUIRED.keys() must equal the ci.yml
// job set EXACTLY, and the two must be DISJOINT.
//
// This is a partition, not a carve-out, and that distinction is the whole
// point of this block. A carve-out ("here are the jobs known not to be
// required") can only ever confirm what it already lists; it has no way to
// notice a brand-new job that was added to ci.yml and classified as
// neither. A partition instead computes the union against the LIVE job set
// parsed from ci.yml at run time and asserts equality — so a new job that
// nobody sorted into either bucket makes this test fail loudly, rather than
// silently passing because nothing here mentions it.
// ===========================================================================

const NOT_REQUIRED: Readonly<Record<string, string>> = {
  seam: "awaiting promotion; see ci.yml's comment above the `seam` job — not yet required because a never-reported context sits pending forever, and story/47-s2-3-execution-skills' task branches carry no seam job yet",
  "smoke-install":
    "cannot meaningfully fail until packages/installer/src/cli.ts exists (M8); see ci.yml's comment above the `smoke-install` job",
};

describe("THE PARTITION: required ∪ NOT_REQUIRED == ci.yml's job set, and the two are disjoint", () => {
  test("0. denominator non-zero first: both the required list and NOT_REQUIRED are non-empty", () => {
    expect(requiredContextsArray.length).toBeGreaterThan(0);
    expect(Object.keys(NOT_REQUIRED).length).toBeGreaterThan(0);
  });

  test("required list and NOT_REQUIRED's keys are disjoint", () => {
    const requiredSet = new Set(requiredContextsArray);
    const overlap = Object.keys(NOT_REQUIRED).filter((k) => requiredSet.has(k));
    expect(overlap).toEqual([]);
  });

  test("required ∪ NOT_REQUIRED equals ci.yml's job set EXACTLY — a new, unclassified job fails here", () => {
    const unionSet = new Set([...requiredContextsArray, ...Object.keys(NOT_REQUIRED)]);
    expect(unionSet.size).toBe(ciJobNameSet.size);
    expect([...unionSet].sort()).toEqual([...ciJobNameSet].sort());

    const missingFromCi = [...unionSet].filter((j) => !ciJobNameSet.has(j));
    const missingFromPartition = ciJobNames.filter((j) => !unionSet.has(j));
    expect(missingFromCi).toEqual([]);
    expect(missingFromPartition).toEqual([]);
  });
});

// ===========================================================================
// Per-job structural assertions: no job-level `if:` key on any required
// job, and the `seam` job specifically runs skill-harness.
// ===========================================================================

function jobBlockByName(name: string): JobBlock {
  const block = ciJobs.find((j) => j.name === name);
  if (!block) throw new Error(`job "${name}" not found in ci.yml`);
  return block;
}

function hasJobLevelIf(block: JobBlock): boolean {
  return block.bodyLines.some((l) => /^ {4}if:/.test(l));
}

describe("the `seam` job", () => {
  test("exists as a top-level job in ci.yml", () => {
    expect(ciJobNameSet.has("seam")).toBe(true);
  });

  const seamBlock = jobBlockByName("seam");

  test("its steps include `bun run skill-harness`", () => {
    const runLines = seamBlock.bodyLines
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- run:"));
    expect(runLines.length).toBeGreaterThan(0);
    expect(runLines).toContain("- run: bun run skill-harness");
  });

  test("its YAML block contains no `if:` key (NEVER-9.8)", () => {
    expect(hasJobLevelIf(seamBlock)).toBe(false);
  });

  test("its YAML block contains no `strategy:`/`matrix:` key", () => {
    expect(seamBlock.bodyLines.some((l) => /^ {4}(strategy|matrix):/.test(l))).toBe(false);
  });
});

describe("no required job carries a job-level `if:` (NEVER-9.8, all six)", () => {
  test("0. denominator non-zero first: the required-context list is non-empty", () => {
    expect(requiredContextsArray.length).toBeGreaterThan(0);
  });

  for (const jobName of requiredContextsArray) {
    test(`"${jobName}" carries no \`if:\` key`, () => {
      const block = jobBlockByName(jobName);
      expect(hasJobLevelIf(block)).toBe(false);
    });
  }
});

// ===========================================================================
// The seam job's command must resolve to a real script — a typo here would
// silently no-op (or error) only when the job actually runs in CI.
// ===========================================================================

describe("`skill-harness` is a real script in the root package.json", () => {
  const pkg = JSON.parse(packageJsonText) as { scripts?: Record<string, string> };

  test("package.json parses and has a scripts block", () => {
    expect(pkg.scripts).toBeDefined();
    expect(Object.keys(pkg.scripts ?? {}).length).toBeGreaterThan(0);
  });

  test("`skill-harness` is one of its scripts", () => {
    expect(Object.prototype.hasOwnProperty.call(pkg.scripts ?? {}, "skill-harness")).toBe(true);
  });
});
