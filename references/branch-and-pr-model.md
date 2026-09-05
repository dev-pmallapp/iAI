# Branch and PR Model

**Contract.** Branch naming, merge targets, commit subjects, and who closes what.

This document is a contract, not a skill. It has no frontmatter and is never
listed in the skill roster. Ownership row: `docs/design/01-skill-hierarchy.md:61`.

---

## Branches

| Kind | Name | Cut from | Targets |
|---|---|---|---|
| Story | `story/{n}-{slug}` | the default branch | the default branch, via one integration PR |
| Task | `task/{n}-{slug}` | the story branch, **or the previous task branch** | the story branch |

Specified at `docs/design/03-workflow.md:295-296`.

### Task branches stack

When task N+1 depends on task N's tree — a shared file, a count, a fixture — it
is cut from **task N's branch**, not from the story branch. Its PR still targets
the story branch.

This is what S1.5 did: `task/32` → `task/33` → `task/34` → `task/272`, each an
ancestor of the next, all four PRs based on the story branch.

**The consequence is merge order.** Merged in order, each PR's diff collapses to
its own change. Merged out of order, the second PR carries the first's commits
into a tree that has already diverged. GitHub retargets a PR when its base branch
is deleted on merge — but only if the order holds.

**Cutting the second task from the story branch instead is the common mistake.**
It looks tidier and conflicts immediately on anything the first task touched.

---

## `Closes #N` fires only on the default branch

This is the hazard that costs the most, and it is silent.

GitHub's closing keywords fire when a PR merges into the repository's **default**
branch. A task PR targets the story branch. Therefore:

> **A `Closes #N` in a task PR body does nothing. The issue stays open, and
> nothing reports an error.**

`packages/core/src/gh/pr.ts` refuses to emit it rather than let it look like it
worked — see `:261-263` and `:309-311`.

| PR | Target | Closing |
|---|---|---|
| Task PR | the story branch | **close explicitly after merge**, cite the merge commit, then **re-read the issue state** |
| Integration PR | the default branch | `Closes #N` fires |

### One directive per line

`Closes` and `Refs` are emitted one per line. **A comma-separated list is
silently ignored** — it does not error, it simply closes nothing.

`Blocked by:` is the exception and *is* comma-separated. The two forms sit in the
same body, which is exactly why they get conflated. See
`packages/core/src/gh/pr.ts:250`.

---

## One integration PR per Story

The Story branch gets a single PR to the default branch, carrying one `Closes`
line for the Story and one for each task. Open it **early and as a draft**, not
at the end.

**A pushed story branch with no PR gets zero CI runs.** `.github/workflows/ci.yml`
triggers on `pull_request`, `push` to the default branch, and `merge_group` — a
story branch matches none of them. Branch protection reporting "N required status
checks are expected" on push describes what *will* be required; it is not a run.
A locally green story branch with no PR is unverified.

---

## Commit subjects

Every commit is prefixed with its issue number. The **validation regex is
exported** at `packages/core/src/guards/commit-prefix.ts:12` and enforced by
`checkCommitPrefix` in the same file; a commit-msg hook runs it.

**Do not restate the regex.** Read it from the module, or run the checker.

The exempt forms — generated subjects that carry no issue context — are
enumerated in the exemption table at `docs/design/03-workflow.md:465-470` and
mirrored in the module's own header comment.

### The regex has more than one home, and one is a variant

`CONTRIBUTING.md:214-220` states a **different** regex, accepting an optional
`owner/repo` prefix so a public-repo commit can reference a private-repo issue.
`docs/design/03-workflow.md:462` is the form that shipped.

This is a known, recorded divergence — Problem 3 of `docs/design/stories/35.md`
counts the regex's homes — and it is **not resolved here**. Owner: #14 under
`CLAIM-9.6`.

---

## Staging and merging

- **Never `git add -A` at the repository root.** Stage explicit paths.
- **iAI never merges** (`CONTRIBUTING.md:346`) — *"the system opens PRs, marks
  them ready, and stops. A human merges."* The first of the three never-rules;
  no exception, no flag, no override.
- `gh pr ready` **has silently no-op'd**. Re-read `--json isDraft` afterwards.
- `gh pr view --json merged` is **not a field**. Use `state`, `mergedAt`,
  `mergeCommit`.

---

## What this document does not own

- **The argv for any of the above** — `references/gh-operations.md`.
- **A failed or racing call** — `references/gh-error-handling.md`.
- **The labels that accompany a transition** — `references/workflow-states.md`.

---

## Reconciliation

| Statement | Source | Verdict |
|---|---|---|
| Branch naming and merge targets | `docs/design/03-workflow.md:295-296` | confirmed |
| Task branches stack; PRs target the story branch | observed across S1.5's four task PRs | confirmed |
| `Closes` fires only on the default branch | `packages/core/src/gh/pr.ts:261-263`, `:309-311` | confirmed |
| One directive per line; `Blocked by:` comma-separated | `packages/core/src/gh/pr.ts:250` | confirmed |
| A story branch with no PR gets no CI | `.github/workflows/ci.yml` trigger list; observed `total_count: 0` | confirmed |
| Commit-subject regex | `packages/core/src/guards/commit-prefix.ts:12` | confirmed — **module named, regex not restated** |
| `CONTRIBUTING.md` states a variant regex | `CONTRIBUTING.md:214-220` vs `docs/design/03-workflow.md:462` | **carried** — owner: #14 / `CLAIM-9.6`, per Problem 3 of `docs/design/stories/35.md` |
| `commit-prefix.ts:3-5` cites `CONTRIBUTING.md:206` for that variant | `:206` is blank; the variant is at `:214-220` | **carried, not fixed** — a stale `:NN` in shipped code, out of this task's target (`iai-references`). Owner: #14 / `CLAIM-9.6`, which already owns this area |
| The "iAI never merges" rule was cited at `CONTRIBUTING.md:338` | `:338` is blank; the rule is at `:346` | **corrected here.** The stale citation was carried in session notes, not in a tracked file, so nothing in the repository was wrong — but it would have been, had it been copied into this document unchecked |
