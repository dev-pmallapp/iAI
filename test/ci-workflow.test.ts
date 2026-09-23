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
const liveYmlPath = join(repoRoot, ".github", "workflows", "live.yml");
const requiredChecksPath = join(repoRoot, "scripts", "verify-required-checks.sh");
const workflowHygienePath = join(repoRoot, "scripts", "verify-workflow-hygiene.sh");
const packageJsonPath = join(repoRoot, "package.json");

const ciYmlText = readFileSync(ciYmlPath, "utf8");
const liveYmlText = readFileSync(liveYmlPath, "utf8");
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
// live.yml — Task #324's NEVER-293.10 seam check. Parsed with the SAME job
// parser as ci.yml (parseCiYmlJobs takes a `text` argument; it is not
// actually specific to ci.yml's filename, only to the `jobs:`-block shape
// every workflow file shares), plus a small trigger-block parser for `on:`.
// ===========================================================================

function parseWorkflowTriggers(text: string): ReadonlySet<string> {
  const lines = text.split("\n");
  const onIdx = lines.findIndex((l) => l === "on:");
  if (onIdx === -1) throw new Error("`on:` top-level key not found in workflow file");

  const triggers = new Set<string>();
  for (let i = onIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim().length === 0) continue;
    const nested = /^ {2}([A-Za-z0-9_-]+):/.exec(line);
    if (nested) {
      triggers.add(nested[1] as string);
      continue;
    }
    // A non-blank line that is NOT a 2-space-indented key means the `on:`
    // block has dedented back to a top-level key (e.g. `env:`) — stop here
    // rather than scanning the rest of the file.
    break;
  }
  return triggers;
}

const liveJobs = parseCiYmlJobs(liveYmlText);
const liveJobNames = liveJobs.map((j) => j.name);
const liveJobNameSet = new Set(liveJobNames);
const liveTriggers = parseWorkflowTriggers(liveYmlText);

describe("live.yml job names parsed from its `jobs:` block", () => {
  test("0. denominator non-zero first: at least one job was parsed", () => {
    expect(liveJobs.length).toBeGreaterThan(0);
  });

  test("job names are unique (cardinality equals count)", () => {
    expect(liveJobNameSet.size).toBe(liveJobNames.length);
  });
});

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

// ===========================================================================
// NEVER-293.10 (Task #324, cases 13 and 14 of docs/test-plans/293-plan.md):
// the live rung is never a required CI check. `live.yml` is a SEPARATE
// workflow file, on purpose (see its own header comment for the full
// argument); these tests assert the pin mechanically, from both files, read
// from disk at run time.
// ===========================================================================

describe("NEVER-293.10 case 13: the live job is absent from all four hardcoded required lists, and the required count agrees before and after", () => {
  test("0. denominator non-zero first: all four hardcoded lists are non-empty", () => {
    expect(requiredContextsArray.length).toBeGreaterThan(0);
    expect(inlineContextsList.length).toBeGreaterThan(0);
    expect(requiredJobsArray.length).toBeGreaterThan(0);
    expect(pythonRequiredList.length).toBeGreaterThan(0);
  });

  test("the four lists still agree with each other here too (re-asserted, not assumed from the earlier block)", () => {
    expect(requiredContextsArray).toEqual(inlineContextsList);
    expect(requiredContextsArray).toEqual(requiredJobsArray);
    expect(requiredContextsArray).toEqual(pythonRequiredList);
  });

  // The count is read, never hardcoded to `6`: issue #334 will promote
  // `seam` and make this seven. A test that hardcoded 6 here would have to
  // be edited the moment that promotion lands, which is exactly the
  // coupling case 13 exists to prevent for a DIFFERENT job (`live`) — this
  // test must not reintroduce that same coupling for its own assertion.
  test("the required-context count agrees BEFORE and AFTER an independent, later re-read of the same file from disk", () => {
    const before = requiredContextsArray.length;
    expect(before).toBeGreaterThan(0);

    const freshText = readFileSync(requiredChecksPath, "utf8");
    const freshMatch = /REQUIRED_CONTEXTS=\(([^)]*)\)/.exec(freshText);
    expect(freshMatch).not.toBeNull();
    const freshArray = ((freshMatch as RegExpExecArray)[1] as string).trim().split(/\s+/);
    const after = freshArray.length;

    expect(after).toBeGreaterThan(0);
    expect(after).toBe(before);
  });

  test("the live job actually exists in live.yml (sanity: there is something to check the absence of)", () => {
    expect(liveJobNameSet.has("live")).toBe(true);
  });

  test("the live job's name is absent from all four hardcoded required lists", () => {
    expect(requiredContextsArray).not.toContain("live");
    expect(inlineContextsList).not.toContain("live");
    expect(requiredJobsArray).not.toContain("live");
    expect(pythonRequiredList).not.toContain("live");
  });
});

describe("NEVER-293.10 case 14: every required job in ci.yml carries no `if:` key", () => {
  test("0. denominator non-zero first: the required-job count is non-zero", () => {
    expect(requiredContextsArray.length).toBeGreaterThan(0);
  });

  test("none of the required jobs carry a job-level `if:` key", () => {
    const withIf = requiredContextsArray.filter((name) => hasJobLevelIf(jobBlockByName(name)));
    expect(withIf).toEqual([]);
  });
});

describe("live.yml's triggers are exactly {workflow_dispatch}", () => {
  test("0. denominator non-zero first: at least one trigger key was parsed from live.yml's `on:` block", () => {
    expect(liveTriggers.size).toBeGreaterThan(0);
  });

  test("the trigger set equals EXACTLY {workflow_dispatch} — a `pull_request` trigger added later must fail this test", () => {
    expect([...liveTriggers].sort()).toEqual(["workflow_dispatch"]);
  });
});

describe("live.yml's job set is disjoint from every required list, and from ci.yml's job set", () => {
  test("0. denominator non-zero first: live.yml has at least one job, and ci.yml's job set is non-empty", () => {
    expect(liveJobNameSet.size).toBeGreaterThan(0);
    expect(ciJobNameSet.size).toBeGreaterThan(0);
  });

  test("no job in live.yml appears in any of the four hardcoded required lists", () => {
    for (const name of liveJobNames) {
      expect(requiredContextsArray).not.toContain(name);
      expect(inlineContextsList).not.toContain(name);
      expect(requiredJobsArray).not.toContain(name);
      expect(pythonRequiredList).not.toContain(name);
    }
  });

  test("live.yml's job set and ci.yml's job set are disjoint, in both directions", () => {
    const overlapLiveInCi = liveJobNames.filter((n) => ciJobNameSet.has(n));
    const overlapCiInLive = ciJobNames.filter((n) => liveJobNameSet.has(n));
    expect(overlapLiveInCi).toEqual([]);
    expect(overlapCiInLive).toEqual([]);
  });
});

// live.yml's own not-required classification. Kept as its own record (not
// merged into ci.yml's NOT_REQUIRED) because job names are only unique
// WITHIN a workflow file — a flat merged dictionary would silently collide
// if some future job in either file reused a name.
const LIVE_NOT_REQUIRED: Readonly<Record<string, string>> = {
  live: "workflow_dispatch-only seam check for scripts/live-rung.ts; see live.yml's own header comment for the full argument — this job structurally cannot fire on a pull_request, so it can never report on one and can never be validly promoted to required (NEVER-293.10)",
};

describe("THE PARTITION, EXTENDED ACROSS WORKFLOW FILES: required ∪ NOT_REQUIRED(ci.yml) ∪ NOT_REQUIRED(live.yml) == ci.yml's jobs ∪ live.yml's jobs", () => {
  test("0. denominator non-zero first: required, NOT_REQUIRED and LIVE_NOT_REQUIRED are all non-empty", () => {
    expect(requiredContextsArray.length).toBeGreaterThan(0);
    expect(Object.keys(NOT_REQUIRED).length).toBeGreaterThan(0);
    expect(Object.keys(LIVE_NOT_REQUIRED).length).toBeGreaterThan(0);
  });

  test("the three classification sets are pairwise disjoint", () => {
    const requiredSet = new Set(requiredContextsArray);
    const notRequiredKeys = Object.keys(NOT_REQUIRED);
    const liveNotRequiredKeys = Object.keys(LIVE_NOT_REQUIRED);

    expect(notRequiredKeys.filter((k) => requiredSet.has(k))).toEqual([]);
    expect(liveNotRequiredKeys.filter((k) => requiredSet.has(k))).toEqual([]);
    expect(liveNotRequiredKeys.filter((k) => notRequiredKeys.includes(k))).toEqual([]);
  });

  test("the union equals ci.yml's job set UNION live.yml's job set EXACTLY — a new, unclassified job in either file fails here", () => {
    const unionSet = new Set([
      ...requiredContextsArray,
      ...Object.keys(NOT_REQUIRED),
      ...Object.keys(LIVE_NOT_REQUIRED),
    ]);
    const allJobsSet = new Set([...ciJobNames, ...liveJobNames]);

    expect(unionSet.size).toBe(allJobsSet.size);
    expect([...unionSet].sort()).toEqual([...allJobsSet].sort());

    const missingFromWorkflows = [...unionSet].filter((j) => !allJobsSet.has(j));
    const missingFromPartition = [...allJobsSet].filter((j) => !unionSet.has(j));
    expect(missingFromWorkflows).toEqual([]);
    expect(missingFromPartition).toEqual([]);
  });
});

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
