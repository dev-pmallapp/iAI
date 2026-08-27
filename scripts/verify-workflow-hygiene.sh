#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# verify-workflow-hygiene.sh — mechanically verify ISC-8 of docs/design/stories/9.md.
#
# ISC-8 (anti-claim): "a CI check that is skipped or absent never causes the
# PR to report as passing." Two GitHub behaviours cause this if left
# unguarded:
#
#   1. A job skipped by an `if:` condition reports status "success" and does
#      not block, even as a required check.
#   2. A workflow skipped by `paths:`/`paths-ignore:`/`branches:` filters
#      leaves required checks permanently pending (never posted at all,
#      which blocks forever rather than passing, but is just as broken).
#
# This script parses the workflow file and FAILS if:
#   - any of the five required jobs (build, test, lint, typecheck,
#     skill-lint) carries a job-level `if:` key,
#   - the workflow-level `on:` block contains `paths`, `paths-ignore`,
#     anywhere, or a `branches:` filter under `pull_request`,
#   - any of the five required jobs carries `strategy:`/`matrix:` (a matrix
#     renames the reported context to "job (dim1, dim2)" and silently
#     breaks branch protection, which is required by ISC-2),
#   - any of the five required job names is missing from the workflow.
#
# Prefers a real YAML parse via PyYAML. Falls back to a careful grep/awk
# indentation-based scan if PyYAML is unavailable, and says so explicitly —
# it never silently degrades.
#
# Usage:
#   scripts/verify-workflow-hygiene.sh [path/to/ci.yml]
#   (default: .github/workflows/ci.yml)
# ---------------------------------------------------------------------------

SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

REQUIRED_JOBS=(build test lint typecheck skill-lint)
WORKFLOW_PATH="${REPO_ROOT}/.github/workflows/ci.yml"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
else
  C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE=""
fi

log() { printf '%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$*" >&2; }
warn() { printf '%swarn%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die() {
  printf '%sfatal%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2
  exit 1
}
rule_pass() { printf '  %s%s%s %s\n' "${C_GREEN}" "$(printf '\xe2\x9c\x93')" "${C_RESET}" "$1"; }
rule_fail() { printf '  %s%s%s %s\n' "${C_RED}" "$(printf '\xe2\x9c\x97')" "${C_RESET}" "$1"; }
pass_line() { printf '%s%s PASS%s %s\n' "${C_GREEN}${C_BOLD}" "$(printf '\xe2\x9c\x93')" "${C_RESET}" "$*"; }
fail_line() { printf '%s%s FAIL%s %s\n' "${C_RED}${C_BOLD}" "$(printf '\xe2\x9c\x97')" "${C_RESET}" "$*"; }

usage() {
  cat <<EOF
${SCRIPT_NAME} — verify ISC-8: a skipped or absent required check must never
report as passing.

Parses a workflow file and FAILS if:
  - any required job (${REQUIRED_JOBS[*]}) carries a job-level 'if:',
  - the 'on:' block has 'paths'/'paths-ignore' anywhere, or 'branches:'
    under 'pull_request',
  - any required job carries 'strategy:'/matrix,
  - any required job is missing entirely.

Usage:
  ${SCRIPT_NAME} [path/to/ci.yml]

  path/to/ci.yml   Defaults to .github/workflows/ci.yml relative to the repo
                   root this script lives in.

Options:
  --help, -h   Show this help.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help | -h)
        usage
        exit 0
        ;;
      -*)
        usage >&2
        die "unknown option: $1"
        ;;
      *)
        WORKFLOW_PATH="$1"
        shift
        ;;
    esac
  done
}

# --- real YAML parse (preferred) --------------------------------------------

# Runs a self-contained PyYAML program against the workflow file. Emits one
# "PASS|<rule>|<detail>" or "FAIL|<rule>|<detail>" line per rule on stdout,
# and exits 0 iff every rule passed.
run_yaml_parse() {
  local path="$1"
  python3 - "${path}" <<'PYEOF'
import sys
import yaml

path = sys.argv[1]
required = ["build", "test", "lint", "typecheck", "skill-lint"]

with open(path) as f:
    doc = yaml.safe_load(f)

if not isinstance(doc, dict):
    print(f"FAIL|workflow file parses to a mapping|top-level YAML is not a mapping in {path}")
    sys.exit(1)

jobs = doc.get("jobs") or {}

# YAML 1.1 treats a bare `on` key as the boolean True; PyYAML's safe_load
# follows that spec, so the trigger block may be keyed by True instead of
# the string "on" depending on how the file was written.
on_block = doc.get("on")
if on_block is None:
    on_block = doc.get(True) or {}

results = []

missing_jobs = [j for j in required if j not in jobs]
results.append((
    "all five required jobs are present in the workflow",
    not missing_jobs,
    "all present" if not missing_jobs else f"missing: {', '.join(missing_jobs)}",
))

if_jobs = [
    j for j in required
    if j in jobs and isinstance(jobs[j], dict) and "if" in jobs[j]
]
results.append((
    "no required job carries a job-level `if:`",
    not if_jobs,
    "none found" if not if_jobs else f"`if:` present on: {', '.join(if_jobs)}",
))

matrix_jobs = [
    j for j in required
    if j in jobs and isinstance(jobs[j], dict)
    and ("strategy" in jobs[j] or "matrix" in jobs[j])
]
results.append((
    "no required job carries `strategy:`/matrix",
    not matrix_jobs,
    "none found" if not matrix_jobs else f"strategy/matrix present on: {', '.join(matrix_jobs)}",
))


def find_keys(obj, keys, path=""):
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            label = f"{path}.{k}" if path else str(k)
            if k in keys:
                found.append(label)
            found.extend(find_keys(v, keys, label))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            found.extend(find_keys(v, keys, f"{path}[{i}]"))
    return found


path_filters = find_keys(on_block, {"paths", "paths-ignore"})
results.append((
    "no `paths:`/`paths-ignore:` filter anywhere in `on:`",
    not path_filters,
    "none found" if not path_filters else f"found at: {', '.join(path_filters)}",
))

pr_trigger = on_block.get("pull_request") if isinstance(on_block, dict) else None
pr_has_branches = isinstance(pr_trigger, dict) and "branches" in pr_trigger
results.append((
    "no `branches:` filter under `pull_request`",
    not pr_has_branches,
    "none found" if not pr_has_branches else "`branches:` present under `on.pull_request`",
))

overall_ok = all(ok for _, ok, _ in results)
for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}|{name}|{detail}")

sys.exit(0 if overall_ok else 1)
PYEOF
}

# --- grep/awk fallback (used only when PyYAML is unavailable) --------------

# Extracts the text block for a top-level job: from its "  <name>:" header
# (2-space indent) up to, but not including, the next line at indent <= 2
# that is itself a key (i.e. the next sibling job, or workflow dedent).
extract_job_block() {
  local file="$1" job="$2"
  awk -v job="${job}" '
    BEGIN { in_job = 0 }
    /^  [A-Za-z0-9_-]+:[[:space:]]*$/ {
      name = $0
      sub(/^  /, "", name)
      sub(/:.*/, "", name)
      if (in_job) exit
      if (name == job) { in_job = 1; next }
      next
    }
    in_job { print }
  ' "${file}"
}

# Extracts the text of the workflow-level `on:` trigger block.
extract_on_block() {
  local file="$1"
  awk '
    BEGIN { in_on = 0 }
    /^on:[[:space:]]*$/ { in_on = 1; next }
    in_on && /^[A-Za-z0-9_-]+:[[:space:]]*$/ { exit }
    in_on { print }
  ' "${file}"
}

# Extracts the `pull_request:` sub-block within an already-extracted `on:`
# block text (fed via stdin).
extract_pull_request_subblock() {
  awk '
    BEGIN { in_pr = 0 }
    /^  pull_request:/ { in_pr = 1; print; next }
    in_pr && /^  [A-Za-z0-9_-]+:/ { exit }
    in_pr { print }
  '
}

run_grep_fallback() {
  local file="$1"
  local overall_ok=0

  local missing_jobs=()
  local job
  for job in "${REQUIRED_JOBS[@]}"; do
    if ! grep -Eq "^  ${job}:[[:space:]]*\$" "${file}"; then
      missing_jobs+=("${job}")
    fi
  done
  if ((${#missing_jobs[@]} == 0)); then
    echo "PASS|all five required jobs are present in the workflow|all present"
  else
    echo "FAIL|all five required jobs are present in the workflow|missing: $(
      IFS=,
      echo "${missing_jobs[*]}"
    )"
    overall_ok=1
  fi

  local if_jobs=()
  local matrix_jobs=()
  for job in "${REQUIRED_JOBS[@]}"; do
    if ! grep -Eq "^  ${job}:[[:space:]]*\$" "${file}"; then
      continue
    fi
    local block
    block="$(extract_job_block "${file}" "${job}")"
    if grep -Eq '^    if:' <<<"${block}"; then
      if_jobs+=("${job}")
    fi
    if grep -Eq '^    (strategy|matrix):' <<<"${block}"; then
      matrix_jobs+=("${job}")
    fi
  done

  if ((${#if_jobs[@]} == 0)); then
    echo "PASS|no required job carries a job-level \`if:\`|none found"
  else
    echo "FAIL|no required job carries a job-level \`if:\`|\`if:\` present on: $(
      IFS=,
      echo "${if_jobs[*]}"
    )"
    overall_ok=1
  fi

  if ((${#matrix_jobs[@]} == 0)); then
    echo "PASS|no required job carries \`strategy:\`/matrix|none found"
  else
    echo "FAIL|no required job carries \`strategy:\`/matrix|strategy/matrix present on: $(
      IFS=,
      echo "${matrix_jobs[*]}"
    )"
    overall_ok=1
  fi

  local on_block
  on_block="$(extract_on_block "${file}")"

  if grep -Eq '^[[:space:]]*paths(-ignore)?:' <<<"${on_block}"; then
    echo "FAIL|no \`paths:\`/\`paths-ignore:\` filter anywhere in \`on:\`|found in on: block"
    overall_ok=1
  else
    echo "PASS|no \`paths:\`/\`paths-ignore:\` filter anywhere in \`on:\`|none found"
  fi

  local pr_block
  pr_block="$(extract_pull_request_subblock <<<"${on_block}")"
  if grep -Eq '^[[:space:]]*branches:' <<<"${pr_block}"; then
    echo "FAIL|no \`branches:\` filter under \`pull_request\`|\`branches:\` present under on.pull_request"
    overall_ok=1
  else
    echo "PASS|no \`branches:\` filter under \`pull_request\`|none found"
  fi

  return "${overall_ok}"
}

main() {
  parse_args "$@"

  log "Workflow: ${WORKFLOW_PATH}"

  if [[ ! -f "${WORKFLOW_PATH}" ]]; then
    printf '\n' >&2
    warn "workflow file not found: ${WORKFLOW_PATH}"
    cat >&2 <<EOF

  ISC-8 (docs/design/stories/9.md) cannot be checked without a workflow file to
  parse. Expected required jobs: ${REQUIRED_JOBS[*]}.

  If .github/workflows/ci.yml has not been written yet, this script has
  nothing to verify. Re-run once it exists, or pass an explicit path:
    ${SCRIPT_NAME} path/to/workflow.yml
EOF
    printf '\n' >&2
    fail_line "workflow file absent: ${WORKFLOW_PATH}"
    return 1
  fi

  local mode results_output overall_status
  if python3 -c "import yaml" >/dev/null 2>&1; then
    mode="yaml"
    log "Parse mode: real YAML parse via PyYAML"
  else
    mode="grep"
    warn "PyYAML is not available; falling back to a grep/awk indentation scan (approximate)"
  fi

  set +e
  if [[ "${mode}" == "yaml" ]]; then
    results_output="$(run_yaml_parse "${WORKFLOW_PATH}")"
    overall_status=$?
  else
    results_output="$(run_grep_fallback "${WORKFLOW_PATH}")"
    overall_status=$?
  fi
  set -e

  printf '\n%sRules checked (%s mode):%s\n' "${C_BOLD}" "${mode}" "${C_RESET}"
  local line rule_status name detail
  while IFS='|' read -r rule_status name detail; do
    [[ -n "${rule_status}" ]] || continue
    if [[ "${rule_status}" == "PASS" ]]; then
      rule_pass "${name} — ${detail}"
    else
      rule_fail "${name} — ${detail}"
    fi
  done <<<"${results_output}"
  printf '\n'

  if [[ "${mode}" == "grep" ]]; then
    warn "result computed via the grep/awk fallback, not a real YAML parse — treat as approximate"
  fi

  if ((overall_status == 0)); then
    pass_line "workflow hygiene holds for ${WORKFLOW_PATH} (ISC-8)"
    return 0
  else
    fail_line "workflow hygiene violated for ${WORKFLOW_PATH} (ISC-8)"
    return 1
  fi
}

main "$@"
