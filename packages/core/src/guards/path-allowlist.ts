// The committed allow-list for the PURE dangling-repo-relative-path rule
// (path-refs.ts, CLAIM path-dangling / issue #210).
//
// This file lives in packages/, which is OUTSIDE claim-lint's scan scope
// (claim-lint only reads *.md under docs/). That is deliberate: every entry
// below names a currently-nonexistent path on purpose, and doing that in a
// .md file would make the "ISC-" token ban's sibling rule — a raw dangling
// string check — trip over its own allow-list. Putting the list in a .ts
// file under packages/ sidesteps that entirely; nothing here is prose that
// any guard reads as a claim.
//
// Every entry is derived by measurement (`git grep -n <path>` against the
// citing docs, then again against docs/milestones/ for the owning
// milestone), not copied from the issue text. Six families, 38 entries.

// "external" is a path on a filesystem that is not this repository: a host
// install destination under the user's config, or a path in an ancestor
// project. It is correct as written and will never resolve here, so it carries
// no milestone. Attaching one would assert that some milestone creates the path
// *in this tree*, which is false, and a knowingly-false milestone on a reviewed
// allow-list is the exact failure #209 warned about.
export type AllowReason = "planned" | "fiction" | "historical" | "defective" | "external";

export interface AllowedPath {
  path: string;
  reason: AllowReason;
  /** Milestone that will create it. Required when reason is "planned". */
  milestone?: string;
  /** Set when the milestone is INFERRED, not documented. */
  inferred?: boolean;
  note?: string;
}

export const PATH_ALLOW_LIST: readonly AllowedPath[] = [
  // --- references/*.md — 12 paths, planned, M2. -----------------------
  // docs/milestones/M2.md:19 names "the twelve" explicitly and M2.md:36
  // claims "All twelve files exist at references/<name>.md". This is the
  // authority for the exact twelve names; do not add or drop one without
  // re-reading S2.1's acceptance criteria.
  {
    path: "references/context-discovery.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36 — first of the twelve kernel reference documents (S2.1)",
  },
  {
    path: "references/gh-operations.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/gh-error-handling.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/verification.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/data-classification.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/model-routing.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36,45 — CLAIM-35.3 names this one specifically as the only file outside packages/core/src/routing permitted a literal model ID",
  },
  {
    path: "references/domain-binding.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/evidence-artifacts.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/branch-and-pr-model.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/workflow-states.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/isa-format.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36",
  },
  {
    path: "references/sizing-criteria.md",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:19,36 — twelfth and last of the twelve",
  },

  // --- 900-block — 9 paths, fiction, no milestone. --------------------
  // Issue numbers 900-999 are reserved and will never be allocated
  // (Decision 8, docs/design/stories/194.md:179,193). These paths are cited
  // in walkthroughs across docs/design/0*-*.md as illustrative examples;
  // they will never exist and must never be treated as a milestone
  // deliverable.
  {
    path: "docs/design/stories/901.md",
    reason: "fiction",
    note: "cited at docs/design/02-roles.md:157,162,289 and docs/design/03-workflow.md:17,55,552; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193 — will never be allocated",
  },
  {
    path: "docs/design/stories/902.md",
    reason: "fiction",
    note: "cited at docs/design/02-roles.md:158 and docs/design/03-workflow.md:65; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/design/stories/903.md",
    reason: "fiction",
    note: "cited at docs/design/02-roles.md:159 and docs/design/03-workflow.md:75; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/design/stories/930.md",
    reason: "fiction",
    note: "cited at docs/design/04-domain-dev.md:423; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/design/stories/940.md",
    reason: "fiction",
    note: "cited at docs/design/05-domain-trading.md:503; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/design/stories/950.md",
    reason: "fiction",
    note: "cited at docs/design/06-domain-health.md:532,558; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/design/stories/960.md",
    reason: "fiction",
    note: "cited at docs/design/07-domain-wealth-know.md:323; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/test-plans/901-plan.md",
    reason: "fiction",
    note: "cited at docs/design/02-roles.md:224 and docs/design/03-workflow.md:18,56; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },
  {
    path: "docs/test-plans/950-plan.md",
    reason: "fiction",
    note: "cited at docs/design/06-domain-health.md:533,559; reserved 900-block, Decision 8 at docs/design/stories/194.md:179,193",
  },

  // --- packages/** — 9 paths, planned. ---------------------------------
  {
    path: "packages/domain-null",
    reason: "planned",
    milestone: "M1",
    note: "docs/design/stories/31.md Build Targets and Decision 12 (S1.5). CLAIM-31.3 (docs/milestones/M1.md:209-211) requires the conformance suite to register a binding from a package OUTSIDE packages/core, so the fixture cannot live under packages/core/test; the milestone names the fixture (`nullBinding`) but not the package that holds it",
  },
  {
    path: "packages/core/src/binding",
    reason: "planned",
    milestone: "M1",
    note: "docs/milestones/M1.md:219 (S1.5 registry build target); cited also at CONTRIBUTING.md:293",
  },
  {
    path: "packages/core/src/binding/registry.ts",
    reason: "planned",
    milestone: "M1",
    note: "cited at CONTRIBUTING.md:303; the registry itself is docs/milestones/M1.md:219-220 (S1.5) but the filename is not spelled out there — attribution to M1 is from the surrounding registry feature, not a literal filename hit",
  },
  {
    path: "packages/core/src/classify",
    reason: "planned",
    milestone: "M1",
    note: "docs/milestones/M1.md:95,102 (CLAIM-15.6, S1.3 build target)",
  },
  {
    path: "packages/core/src/evidence",
    reason: "planned",
    milestone: "M1",
    note: "docs/milestones/M1.md:179 (S1.4 build target)",
  },
  {
    path: "packages/core/src/gh",
    reason: "planned",
    milestone: "M1",
    note: "docs/milestones/M1.md:124,141 (CLAIM-15.6 purity clause, S1.4 build target)",
  },
  {
    path: "packages/core/src/routing",
    reason: "planned",
    milestone: "M2",
    note: "docs/milestones/M2.md:45 (CLAIM-35.3) and docs/milestones/M3.md:130,136 (S3.x build target)",
  },
  {
    path: "packages/core/src/telemetry",
    reason: "planned",
    milestone: "M1",
    inferred: true,
    note: "cited only at docs/design/03-workflow.md:78 (\"OTLP exporter in packages/core/src/telemetry\"), itself inside the fictional #911 task of the reserved 900-block walkthrough (see the docs/design/stories/901.md entry above). No hit anywhere in docs/milestones/ — verified by git grep. Milestone is INFERRED from packages/core ownership, not documented; M8.md:11,134,163 commits the shipped artifact to ZERO telemetry, so this path may never actually land — do not treat the milestone as confirmed",
  },
  {
    path: "packages/installer/src/cli.ts",
    reason: "planned",
    milestone: "M8",
    inferred: true,
    note: "cited at CONTRIBUTING.md:141,152,238; no literal-filename hit anywhere in docs/milestones/ — verified by git grep. docs/design/stories/9.md:52-53 puts the installer's package SKELETON in M1 scope but its CLI/apply BEHAVIOUR explicitly out of scope (docs/design/verification-pass.md:148, row 25: \"Installer CLI is out of scope per stories/9.md:52-53\"). The behaviour lands in M8 S8.1, the Dual-host installer (docs/milestones/M8.md:20,58-61). Milestone INFERRED from that Story, not from a literal filename hit",
  },

  // --- skills/** — 6 paths. --------------------------------------------
  {
    path: "skills/dev/domain.md",
    reason: "planned",
    milestone: "M4",
    note: "docs/milestones/M4.md:32,56 (S4.1 build target); cited also at docs/design/04-domain-dev.md:36",
  },
  {
    path: "skills/dev",
    reason: "planned",
    milestone: "M4",
    note: "docs/milestones/M4.md:154 (\"All seven skills exist under `skills/dev/`\", CLAIM-95.1) — trailing-slash directory citation, normalised to the bare directory form",
  },
  {
    path: "skills/health",
    reason: "planned",
    milestone: "M5",
    inferred: true,
    note: "cited at docs/design/06-domain-health.md:306 (\"All eight live under `skills/health/`\"); no hit in docs/milestones/M5.md — verified by git grep. Milestone INFERRED by pack (M5 is the Health pack, docs/milestones/M5.md:1)",
  },
  {
    path: "skills/health/domain.md",
    reason: "planned",
    milestone: "M5",
    inferred: true,
    note: "cited at docs/design/01-skill-hierarchy.md:443; no hit in docs/milestones/M5.md — verified by git grep. Milestone INFERRED by pack",
  },
  {
    path: "skills/trade/domain.md",
    reason: "planned",
    milestone: "M6",
    inferred: true,
    note: "cited at docs/design/01-skill-hierarchy.md:413,436 and docs/design/05-domain-trading.md:51; no hit in docs/milestones/M6.md — verified by git grep. Milestone INFERRED by pack (M6 is the Trading pack, docs/milestones/M6.md:1)",
  },
  {
    path: "skills/trade/backtest/SKILL.md",
    reason: "defective",
    note: "docs/design/verification-pass.md:222 (row 145 / conflict row 18) records that the design's own nested example fails its own flat-naming rule at 01-skill-hierarchy.md:349; only the flat form (`skills/trade-backtest/SKILL.md`) is lintable and shipped that way. Cited also at docs/design/01-skill-hierarchy.md:372 and docs/evidence/13-20260826T110836Z.md:153. This is a documented defect to FIX in the design, not a path to tolerate as planned",
  },

  // --- historical — 2 paths. --------------------------------------------
  // docs/design/stories/194.md IS the mapping note from the ISC/ISA
  // acronym migration (S1.6); naming the superseded pre-migration path is
  // its function, not a stale reference.
  {
    path: "docs/design/9-isa.md",
    reason: "historical",
    note: "cited at docs/design/stories/194.md:5,33,217 as the pre-migration name for docs/design/stories/9.md",
  },
  {
    path: "docs/design/194-design.md",
    reason: "historical",
    note: "cited at docs/design/stories/194.md:214 as this very document's own pre-relocation filename",
  },

  // --- docs/parity/forge-diff.md — 1 path, planned, M4. -----------------
  {
    path: "docs/parity/forge-diff.md",
    reason: "planned",
    milestone: "M4",
    note: "docs/milestones/M4.md:203,217,235 (CLAIM-101.4, S4.5 build target)",
  },

  // --- host install targets — 4 paths, planned, M8. ---------------------
  // Not one of the issue's six named families: found by running the real
  // corpus through lintPathRefs and inspecting what remained. These are
  // opencode-dialect install destinations written by the S8.1 dual-host
  // installer (docs/milestones/M8.md:20,59 -- "Agent and command emission
  // per dialect"); they are host configuration paths the installer writes
  // at `--apply` time, not files this repo ever commits, which is why
  // ARCHITECTURE.md's own layer diagram (:19) and docs/design/08-dual-target.md
  // describe them without any of them existing in git.
  {
    path: ".opencode/skills",
    reason: "external",
    note: "host install destination, not a repo artifact. docs/design/08-dual-target.md:24; CLAIM-172.6 at docs/milestones/M8.md:51 says it is left EMPTY by design -- skills install to .claude/skills/ only and both hosts resolve the same file. No milestone creates it here",
  },
  {
    path: ".opencode/commands",
    reason: "external",
    note: "host install destination. Cited at ARCHITECTURE.md:34 and docs/design/08-dual-target.md:305,433, both of which are tables contrasting where the two HOSTS read from. The installer writes it under the user's config, never into this repo",
  },
  {
    path: ".opencode/plugins",
    reason: "external",
    note: "host install destination. docs/design/08-dual-target.md:193 states the installer writes the plugin[] config entry rather than this directory, so nothing creates it anywhere -- least resolvable of the four",
  },
  {
    path: ".opencode/agents/iai-validator.md",
    reason: "external",
    note: "host install destination. docs/design/02-roles.md:623 is a worked example of one AgentSpec's opencode-dialect OUTPUT, i.e. a file the installer emits onto the user's machine. Note the asymmetry: the .claude/ equivalents cited alongside it are never flagged, only because no top-level .claude/ exists to satisfy the first-segment guard-rail. Same kind of path, different treatment, for an incidental reason",
  },
];

const ALLOW_SET: ReadonlySet<string> = new Set(PATH_ALLOW_LIST.map((entry) => entry.path));

export function isPathAllowed(path: string): boolean {
  return ALLOW_SET.has(path);
}
