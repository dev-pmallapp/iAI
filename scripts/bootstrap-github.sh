#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# bootstrap-github.sh — create the iAI tracking structure on GitHub.
#
# Creates, in order:
#   1. The full label set from docs/design/03-workflow.md (exact hex colours).
#   2. The 8 milestones from PLAN.md, each carrying its feature table as the
#      milestone DESCRIPTION (read from docs/milestones/M<N>.md, section
#      "## Milestone description"; falls back to the matching section of
#      PLAN.md when that file does not exist yet).
#   3. One "Epic: <milestone title>" tracker issue per milestone, labelled
#      type:epic + iai and assigned to that milestone.
#
# IDEMPOTENT. Re-running detects what already exists and only fills the gaps:
#   - labels use `gh label create --force`, which reconciles a drifted colour
#     or description in place rather than erroring or duplicating;
#   - milestones are matched by exact title against a GET of the existing
#     milestones and skipped if present ("exists, skipping");
#   - epic trackers are matched by exact issue title across open AND closed
#     issues and skipped if present.
# Nothing is ever deleted, renamed or closed by this script.
#
# DRY RUN IS THE DEFAULT. Pass --apply to actually mutate the repository.
#
# Usage:
#   scripts/bootstrap-github.sh                      # dry run, changes nothing
#   scripts/bootstrap-github.sh --apply              # do it
#   scripts/bootstrap-github.sh --apply --labels-only
#   scripts/bootstrap-github.sh --repo acme/iAI --apply
# ---------------------------------------------------------------------------

# --- constants --------------------------------------------------------------

SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
PLAN_FILE="${REPO_ROOT}/PLAN.md"
MILESTONE_DOC_DIR="${REPO_ROOT}/docs/milestones"

# GitHub silently rejects very long milestone descriptions. Budget well under
# the observed limit and warn rather than fail if a feature table exceeds it.
MILESTONE_DESC_BUDGET=10000

# --- options ----------------------------------------------------------------

REPO=""
DRY_RUN=true
DO_LABELS=true
DO_MILESTONES=true
DO_EPICS=true

# --- summary accumulators ---------------------------------------------------

declare -a SUMMARY_ROWS=()
CREATED_COUNT=0
SKIPPED_COUNT=0
FAILED_COUNT=0

# Ordinal (1..8) -> resolved GitHub milestone number, e.g. MS_NUMBER[1]="3".
declare -A MS_NUMBER=()

# --- milestone definitions (titles must match PLAN.md exactly) --------------

declare -a MILESTONE_TITLES=(
  ""                             # index 0 unused; milestones are 1-based
  "M1 — Kernel and foundation"
  "M2 — Universal lifecycle"
  "M3 — Roles and routing"
  "M4 — Development pack"
  "M5 — Health pack"
  "M6 — Trading pack"
  "M7 — Wealth and Knowledge"
  "M8 — Runtime and release"
)
MILESTONE_COUNT=8

# --- label definitions ------------------------------------------------------
#
# name|hex colour|description
#
# Every colour below is taken verbatim from the label tables in
# docs/design/03-workflow.md.
#
# The rung namespace is DOMAIN-DEFINED, not global: each of the five domains
# declares exactly four rungs in its DomainBinding.verify.rungs, forming a
# ladder from cheapest/most reversible to most expensive/least reversible.
# All five ladders share the same colour ramp so progression is readable at a
# glance regardless of domain:
#
#   rung 1 c5def5  ->  rung 2 bfd4f2  ->  rung 3 79b8ff  ->  rung 4 cf222e
#
# Only rung:live and rung:clinician-review are irreversible in the sense that
# matters, and they are the only rungs an auto mode may never reach.
declare -a LABELS=(
  "type:epic|5319e7|Epic-level work; tracked as a milestone reference"
  "type:story|0e8a16|One end-to-end deliverable outcome"
  "type:task|1d76db|One unit of work within a Story"
  "type:bug|d73a4a|Defect against shipped work"
  "status:in-progress|fbca04|Actively being worked"
  "status:resolved|0e8a16|Work complete, awaiting closure"
  "status:reopened|d93f0b|Was resolved, regressed or rejected"
  "status:blocked|b60205|Cannot proceed; blocker named in a comment"
  "domain:dev|1f6feb|Software development pack"
  "domain:trade|8250df|Stock trading pack"
  "domain:health|1a7f37|Health monitoring pack"
  "domain:wealth|bf8700|Wealth and obligations pack"
  "domain:know|0969da|Knowledge and sources pack"
  "rung:compile|c5def5|dev 1/4: builds clean"
  "rung:unit|bfd4f2|dev 2/4: unit verification passes"
  "rung:integration|79b8ff|dev 3/4: integration verification passes"
  "rung:review|cf222e|dev 4/4: reviewed and ready to merge"
  "rung:research|c5def5|trade 1/4: analysis only, no orders, default rung"
  "rung:backtest|bfd4f2|trade 2/4: historical simulation against pre-registered thresholds"
  "rung:paper|79b8ff|trade 3/4: simulated execution, no capital at risk"
  "rung:live|cf222e|trade 4/4: real capital. Requires mandate + per-order gate + kill switch"
  "rung:observe|c5def5|health 1/4: data ingested and fresh"
  "rung:trend|bfd4f2|health 2/4: direction established over a declared window"
  "rung:flag|79b8ff|health 3/4: threshold or reference range crossed"
  "rung:clinician-review|cf222e|health 4/4: a human clinician has seen the brief"
  "rung:recorded|c5def5|wealth 1/4: captured in the ledger"
  "rung:reconciled|bfd4f2|wealth 2/4: matched against statements"
  "rung:projected|79b8ff|wealth 3/4: forward cash flow modelled"
  "rung:optimised|cf222e|wealth 4/4: action drafted for human execution"
  "rung:captured|c5def5|know 1/4: source snapshotted and fenced"
  "rung:distilled|bfd4f2|know 2/4: claim extracted with a locator"
  "rung:cross-linked|79b8ff|know 3/4: related entries resolve"
  "rung:contradiction-checked|cf222e|know 4/4: no unresolved conflict with canon"
  "gate:pending|fbca04|A human decision is required before this can advance"
  "gate:approved|2da44e|Human decision recorded; pipeline may proceed"
  "risk:vetoed|a40e26|risk-officer VETO. Unappealable except by logged human override"
  "class:private|6e7781|Contains PRIVATE data; egress to cloud models is blocked"
  "iai|24292f|Created or managed by iAI"
)

# --- output helpers ---------------------------------------------------------

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
  C_CYAN=$'\033[36m'
else
  C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_CYAN=""
fi

log() { printf '%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$*" >&2; }
ok() { printf '%s  ok%s %s\n' "${C_GREEN}" "${C_RESET}" "$*" >&2; }
skip() { printf '%sskip%s %s\n' "${C_DIM}" "${C_RESET}" "$*" >&2; }
warn() { printf '%swarn%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die() {
  printf '%sfatal%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2
  exit 1
}

# Record one row for the closing summary table.
# record <object> <name> <outcome>
record() {
  local kind="$1" name="$2" outcome="$3"
  SUMMARY_ROWS+=("${kind}|${name}|${outcome}")
  case "${outcome}" in
    created) CREATED_COUNT=$((CREATED_COUNT + 1)) ;;
    skipped) SKIPPED_COUNT=$((SKIPPED_COUNT + 1)) ;;
    failed) FAILED_COUNT=$((FAILED_COUNT + 1)) ;;
  esac
}

# The ONLY place a mutating command is executed. In dry-run mode it prints the
# fully-quoted command to stderr and returns success without running anything,
# so `x="$(run gh api ...)"` is safe: x is simply empty under --dry-run.
run() {
  if [[ "${DRY_RUN}" == true ]]; then
    local rendered
    rendered="$(printf '%q ' "$@")"
    printf '%s  would run:%s %s\n' "${C_CYAN}" "${C_RESET}" "${rendered% }" >&2
    return 0
  fi
  "$@"
}

usage() {
  cat <<EOF
${SCRIPT_NAME} — create the iAI label / milestone / epic structure on GitHub.

Idempotent: re-running detects what exists and fills only the gaps.
Dry run is the DEFAULT; nothing changes until you pass --apply.

Options:
  --repo <owner/repo>   Target repository.
                        Default: gh repo view --json nameWithOwner
  --dry-run             Print what would happen, change nothing. (default)
  --apply               Actually create labels, milestones and epic issues.
  --labels-only         Only reconcile labels.
  --milestones-only     Only create milestones (no epic tracker issues).
  --help, -h            Show this help.

Examples:
  ${SCRIPT_NAME}
  ${SCRIPT_NAME} --apply
  ${SCRIPT_NAME} --repo acme/iAI --apply --labels-only
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ $# -ge 2 ]] || die "--repo requires an argument, e.g. --repo acme/iAI"
        REPO="$2"
        shift 2
        ;;
      --repo=*)
        REPO="${1#*=}"
        shift
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --apply)
        DRY_RUN=false
        shift
        ;;
      --labels-only)
        DO_LABELS=true
        DO_MILESTONES=false
        DO_EPICS=false
        shift
        ;;
      --milestones-only)
        DO_LABELS=false
        DO_MILESTONES=true
        DO_EPICS=false
        shift
        ;;
      --help | -h)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "unknown option: $1"
        ;;
    esac
  done
}

banner() {
  local line
  if [[ "${DRY_RUN}" == true ]]; then
    printf '\n' >&2
    for line in \
      "+---------------------------------------------------------------+" \
      "|                D R Y   R U N   -   the default                |" \
      "|  Nothing will be created, changed or deleted on GitHub.       |" \
      "|  Re-run with  --apply  to actually make these changes.        |" \
      "+---------------------------------------------------------------+"; do
      printf '%s%s%s\n' "${C_YELLOW}${C_BOLD}" "${line}" "${C_RESET}" >&2
    done
    printf '\n' >&2
  else
    printf '\n%s*** APPLY MODE — this WILL modify %s ***%s\n\n' \
      "${C_RED}${C_BOLD}" "${REPO:-the target repo}" "${C_RESET}" >&2
  fi
}

# --- preflight --------------------------------------------------------------

preflight() {
  log "Preflight"

  command -v gh >/dev/null 2>&1 ||
    die "gh (GitHub CLI) is not installed. Install it: https://cli.github.com  (macOS: brew install gh · Debian/Ubuntu: sudo apt install gh)"

  command -v jq >/dev/null 2>&1 ||
    die "jq is not installed. Install it: https://jqlang.github.io/jq  (macOS: brew install jq · Debian/Ubuntu: sudo apt install jq)"

  gh auth status >/dev/null 2>&1 ||
    die "gh is not authenticated. Run: gh auth login"

  if [[ -z "${REPO}" ]]; then
    REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
    [[ -n "${REPO}" ]] ||
      die "could not derive the repository from the current directory. Pass one explicitly: ${SCRIPT_NAME} --repo <owner/repo>"
  fi

  [[ "${REPO}" == */* ]] ||
    die "--repo must be in owner/repo form, got: ${REPO}"

  gh api "repos/${REPO}" --jq .full_name >/dev/null 2>&1 ||
    die "repository '${REPO}' is not reachable. Check the name and your access, or create it: gh repo create ${REPO} --private --source=. --remote=origin --push"

  [[ -f "${PLAN_FILE}" ]] ||
    warn "PLAN.md not found at ${PLAN_FILE}; milestone descriptions will fall back to a placeholder"

  [[ -d "${MILESTONE_DOC_DIR}" ]] ||
    warn "${MILESTONE_DOC_DIR} does not exist; milestone descriptions will be taken from PLAN.md"

  ok "gh, jq, auth and repo '${REPO}' all good"
}

# --- milestone description extraction --------------------------------------

# Preferred source: docs/milestones/M<N>.md, the block between the
# "## Milestone description" heading and the next "## " heading.
extract_from_milestone_doc() {
  local file="$1"
  [[ -f "${file}" ]] || return 1
  awk '
    /^##[[:space:]]+Milestone[[:space:]]+description[[:space:]]*$/ {
      grabbing = 1
      next
    }
    grabbing && /^##[[:space:]]/ { exit }
    grabbing { print }
  ' "${file}"
}

# Fallback source: the "## Milestone N — Title" section of PLAN.md, up to the
# next "## " heading, with the horizontal rule and heading itself dropped.
extract_from_plan() {
  local ordinal="$1"
  [[ -f "${PLAN_FILE}" ]] || return 1
  awk -v want="${ordinal}" '
    /^##[[:space:]]+Milestone[[:space:]]+[0-9]+/ {
      n = $3
      grabbing = (n == want) ? 1 : 0
      if (grabbing) next
    }
    grabbing && /^##[[:space:]]/ { exit }
    grabbing && /^---[[:space:]]*$/ { exit }
    grabbing { print }
  ' "${PLAN_FILE}"
}

# Trim leading and trailing blank lines.
trim_blank_lines() {
  awk '
    { lines[NR] = $0 }
    END {
      first = 1; last = NR
      while (first <= NR && lines[first] ~ /^[[:space:]]*$/) first++
      while (last >= first && lines[last] ~ /^[[:space:]]*$/) last--
      for (i = first; i <= last; i++) print lines[i]
    }
  '
}

milestone_description() {
  local ordinal="$1"
  local doc="${MILESTONE_DOC_DIR}/M${ordinal}.md"
  local body=""

  body="$(extract_from_milestone_doc "${doc}" 2>/dev/null | trim_blank_lines || true)"

  if [[ -z "${body}" ]]; then
    body="$(extract_from_plan "${ordinal}" 2>/dev/null | trim_blank_lines || true)"
    if [[ -n "${body}" ]]; then
      warn "M${ordinal}: no '## Milestone description' in ${doc#"${REPO_ROOT}/"}; using the PLAN.md section instead"
    fi
  fi

  if [[ -z "${body}" ]]; then
    warn "M${ordinal}: no feature table found in either source; using a placeholder description"
    body="Feature table pending. See PLAN.md and docs/milestones/M${ordinal}.md."
  fi

  if ((${#body} > MILESTONE_DESC_BUDGET)); then
    warn "M${ordinal}: description is ${#body} chars, over the ${MILESTONE_DESC_BUDGET} budget; truncating"
    body="${body:0:${MILESTONE_DESC_BUDGET}}"$'\n\n_(truncated — see docs/milestones/M'"${ordinal}"'.md)_'
  fi

  printf '%s\n' "${body}"
}

# --- labels -----------------------------------------------------------------

create_labels() {
  log "Labels (${#LABELS[@]} defined in docs/design/03-workflow.md)"

  local existing="" entry name colour desc outcome
  existing="$(gh label list --repo "${REPO}" --limit 200 --json name --jq '.[].name' 2>/dev/null || true)"

  for entry in "${LABELS[@]}"; do
    IFS='|' read -r name colour desc <<<"${entry}"

    if printf '%s\n' "${existing}" | grep -Fxq -- "${name}"; then
      outcome="skipped"
      skip "label '${name}' exists, reconciling colour/description via --force"
    else
      outcome="created"
    fi

    # --force makes this idempotent: it updates a drifted colour or description
    # in place instead of failing with "label already exists".
    if run gh label create "${name}" \
      --repo "${REPO}" \
      --color "${colour}" \
      --description "${desc}" \
      --force >/dev/null; then
      if [[ "${outcome}" == "created" ]]; then
        ok "label '${name}' #${colour}"
      fi
    else
      warn "label '${name}' failed"
      outcome="failed"
    fi

    record "label" "${name}" "${outcome}"
  done
}

# --- milestones -------------------------------------------------------------

# Cache of "number<TAB>title" for every milestone in the repo, open or closed.
MILESTONE_CACHE=""

refresh_milestone_cache() {
  MILESTONE_CACHE="$(
    gh api --paginate "repos/${REPO}/milestones?state=all&per_page=100" \
      --jq '.[] | "\(.number)\t\(.title)"' 2>/dev/null || true
  )"
}

# Echo the GitHub milestone number for an exact title, or nothing.
milestone_number_for_title() {
  local title="$1"
  [[ -n "${MILESTONE_CACHE}" ]] || return 0
  printf '%s\n' "${MILESTONE_CACHE}" |
    awk -F'\t' -v want="${title}" '$2 == want { print $1; exit }'
}

create_milestones() {
  log "Milestones (${MILESTONE_COUNT} defined in PLAN.md)"
  refresh_milestone_cache

  local i title desc number created_number
  for ((i = 1; i <= MILESTONE_COUNT; i++)); do
    title="${MILESTONE_TITLES[i]}"
    number="$(milestone_number_for_title "${title}")"

    if [[ -n "${number}" ]]; then
      MS_NUMBER[$i]="${number}"
      skip "milestone '${title}' exists, skipping (number ${number})"
      record "milestone" "${title}" "skipped"
      continue
    fi

    desc="$(milestone_description "${i}")"

    # Note: run() writes its dry-run notice to stderr, so command substitution
    # yields an empty string here under --dry-run rather than a bogus number.
    created_number="$(
      run gh api --method POST "repos/${REPO}/milestones" \
        -f "title=${title}" \
        -f "state=open" \
        -f "description=${desc}" \
        --jq '.number' || true
    )"

    if [[ "${DRY_RUN}" == true ]]; then
      MS_NUMBER[$i]="?"
      ok "milestone '${title}' would be created (${#desc} chars of feature table)"
      record "milestone" "${title}" "created"
    elif [[ -n "${created_number}" ]]; then
      MS_NUMBER[$i]="${created_number}"
      ok "milestone '${title}' created as number ${created_number}"
      record "milestone" "${title}" "created"
    else
      warn "milestone '${title}' failed to create"
      record "milestone" "${title}" "failed"
    fi
  done

  [[ "${DRY_RUN}" == true ]] || refresh_milestone_cache
}

# --- epic tracker issues ----------------------------------------------------

# Cache of every issue title in the repo, open or closed.
ISSUE_TITLE_CACHE=""

refresh_issue_cache() {
  ISSUE_TITLE_CACHE="$(
    gh issue list --repo "${REPO}" --state all --limit 500 --json number,title \
      --jq '.[] | "\(.number)\t\(.title)"' 2>/dev/null || true
  )"
}

issue_number_for_title() {
  local title="$1"
  [[ -n "${ISSUE_TITLE_CACHE}" ]] || return 0
  printf '%s\n' "${ISSUE_TITLE_CACHE}" |
    awk -F'\t' -v want="${title}" '$2 == want { print $1; exit }'
}

epic_body() {
  local ordinal="$1" title="$2"
  cat <<EOF
## Epic tracker

Tracks **${title}** end to end. This issue is a pointer, not a work item —
no code lands here.

| Field | Value |
|-------|-------|
| Milestone | ${title} |
| Design | \`docs/milestones/M${ordinal}.md\` |
| Roadmap | \`PLAN.md\` — *Milestone ${ordinal}* |
| Workflow | \`docs/design/03-workflow.md\` |

### Feature table

The authoritative \`| Feature | Description |\` table lives in the **milestone
description**, not in this issue. One Story is created per row:

\`\`\`
/iai:story-create ${ordinal}     # or /forge:story-create ${ordinal} until M2 lands
\`\`\`

### Done when

Every Story in this milestone carries \`status:resolved\`, the exit criteria in
\`PLAN.md\` are met, and \`/iai:learn ${ordinal}\` has closed the milestone.

<sub>Created by \`scripts/bootstrap-github.sh\`.</sub>
EOF
}

create_epic_trackers() {
  log "Epic tracker issues"
  refresh_issue_cache

  local i ms_title title body number
  for ((i = 1; i <= MILESTONE_COUNT; i++)); do
    ms_title="${MILESTONE_TITLES[i]}"
    title="Epic: ${ms_title}"
    number="$(issue_number_for_title "${title}")"

    if [[ -n "${number}" ]]; then
      skip "issue '${title}' exists, skipping (#${number})"
      record "epic" "${title}" "skipped"
      continue
    fi

    if [[ "${DRY_RUN}" == false && -z "${MS_NUMBER[$i]:-}" ]]; then
      warn "issue '${title}' skipped: milestone '${ms_title}' does not exist"
      record "epic" "${title}" "failed"
      continue
    fi

    body="$(epic_body "${i}" "${ms_title}")"

    if run gh issue create \
      --repo "${REPO}" \
      --title "${title}" \
      --body "${body}" \
      --label "type:epic" \
      --label "iai" \
      --milestone "${ms_title}" >/dev/null; then
      ok "issue '${title}' created"
      record "epic" "${title}" "created"
    else
      warn "issue '${title}' failed"
      record "epic" "${title}" "failed"
    fi
  done
}

# --- summary ----------------------------------------------------------------

summary() {
  local row kind name outcome colour i

  printf '\n%s%s%s\n' "${C_BOLD}" "Summary" "${C_RESET}" >&2
  printf '%s\n' "-------------------------------------------------------------------" >&2
  printf '%-10s  %-44s  %s\n' "OBJECT" "NAME" "RESULT" >&2
  printf '%s\n' "-------------------------------------------------------------------" >&2

  for row in "${SUMMARY_ROWS[@]:-}"; do
    [[ -n "${row}" ]] || continue
    IFS='|' read -r kind name outcome <<<"${row}"
    case "${outcome}" in
      created) colour="${C_GREEN}" ;;
      skipped) colour="${C_DIM}" ;;
      *) colour="${C_RED}" ;;
    esac
    printf '%-10s  %-44s  %s%s%s\n' \
      "${kind}" "${name}" "${colour}" "${outcome}" "${C_RESET}" >&2
  done

  printf '%s\n' "-------------------------------------------------------------------" >&2
  printf '%s%d created%s · %s%d skipped (already existed)%s · %s%d failed%s\n' \
    "${C_GREEN}" "${CREATED_COUNT}" "${C_RESET}" \
    "${C_DIM}" "${SKIPPED_COUNT}" "${C_RESET}" \
    "${C_RED}" "${FAILED_COUNT}" "${C_RESET}" >&2

  # Milestone ordinal -> real GitHub number. These almost never line up: if the
  # repo already had milestones, M1 may be milestone number 3. Every gh command
  # that filters by milestone needs the REAL number, not the ordinal.
  if [[ "${DO_MILESTONES}" == true ]]; then
    printf '\n%s%s%s\n' "${C_BOLD}" "Milestone number mapping" "${C_RESET}" >&2
    printf '%s\n' "  (GitHub numbers are repo-global and rarely match M1..M8)" >&2
    for ((i = 1; i <= MILESTONE_COUNT; i++)); do
      printf '  M%d  ->  milestone number %-4s  %s\n' \
        "${i}" "${MS_NUMBER[$i]:-unknown}" "${MILESTONE_TITLES[i]}" >&2
    done
    if [[ "${DRY_RUN}" == true ]]; then
      printf '  %s(numbers show as "?" in dry-run — GitHub assigns them on create)%s\n' \
        "${C_DIM}" "${C_RESET}" >&2
    fi
  fi

  printf '\n%s%s%s\n' "${C_BOLD}" "Next steps" "${C_RESET}" >&2
  if [[ "${DRY_RUN}" == true ]]; then
    printf '  0. %sNothing was changed. Re-run with --apply to create the above.%s\n' \
      "${C_YELLOW}${C_BOLD}" "${C_RESET}" >&2
  fi
  cat >&2 <<EOF
  1. Create the Stories for milestone 1:

       /iai:story-create 1          # or /forge:story-create 1 until M2 lands

     Stories are generated from the milestone DESCRIPTION feature table —
     exactly one Story issue per table row. Edit the milestone description
     first if a row is wrong; the table is the source of truth, not this
     script and not the epic issue.

  2. Repeat per milestone as you reach it. Use the REAL milestone numbers
     from the mapping above, not the M1..M8 ordinals, in any raw gh command:

       gh issue list --repo ${REPO} --milestone "${MILESTONE_TITLES[1]}"

  3. Then begin the loop:

       /iai:story-design <story>
       /iai:story-test-plan <story>
       /iai:task-create <story>
EOF
  printf '\n' >&2
}

# --- main -------------------------------------------------------------------

main() {
  parse_args "$@"
  preflight
  banner

  log "Repository: ${REPO}"

  if [[ "${DO_LABELS}" == true ]]; then create_labels; fi
  if [[ "${DO_MILESTONES}" == true ]]; then create_milestones; fi
  if [[ "${DO_EPICS}" == true ]]; then create_epic_trackers; fi

  summary

  if ((FAILED_COUNT > 0)); then
    warn "${FAILED_COUNT} operation(s) failed — re-run the script to retry only those"
    exit 1
  fi
  return 0
}

main "$@"

# ---------------------------------------------------------------------------
# TEARDOWN — MANUAL, DANGEROUS, NOT EXECUTED BY THIS SCRIPT.
#
# Nothing below runs. It is documentation of how to undo a bootstrap, kept here
# so the reversal path lives next to the creation path. Read every line before
# pasting any of it. Deleting a milestone or a label is IRREVERSIBLE and it
# silently strips that label or milestone from every issue that carried it,
# destroying the state machine described in docs/design/03-workflow.md.
#
# NEVER run this against a repository with real work in it.
#
#   REPO=owner/repo
#
#   # 1. Close (do NOT delete) the epic tracker issues — reversible.
#   for n in 1 2 3 4 5 6 7 8; do
#     title="Epic: $(printf 'M%s' "$n")"
#     num=$(gh issue list --repo "$REPO" --state all --limit 500 \
#             --json number,title \
#             --jq ".[] | select(.title | startswith(\"$title\")) | .number")
#     [ -n "$num" ] && gh issue close "$num" --repo "$REPO" \
#       --comment "Closed by manual teardown."
#   done
#
#   # 2. Delete the milestones. IRREVERSIBLE. Un-assigns every issue in them.
#   #    Inspect the list first:
#   #      gh api "repos/$REPO/milestones?state=all" --jq '.[] | "\(.number) \(.title)"'
#   #    Then, for each number you are certain about:
#   #      gh api --method DELETE "repos/$REPO/milestones/<number>"
#
#   # 3. Delete the labels. IRREVERSIBLE. Strips them from every issue and PR,
#   #    which destroys all status/domain/rung/gate state.
#   #      gh label delete "type:epic"   --repo "$REPO" --yes
#   #      gh label delete "type:story"  --repo "$REPO" --yes
#   #      ... one line per label in the LABELS array above ...
#
#   # Safer alternative to 2 and 3: close the milestones instead of deleting.
#   #      gh api --method PATCH "repos/$REPO/milestones/<number>" -f state=closed
# ---------------------------------------------------------------------------
