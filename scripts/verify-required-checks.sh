#!/usr/bin/env bash
set -euo pipefail

# Scratch file for API response bodies; cleaned up once, on exit.
http_body=""
trap '[[ -n "${http_body:-}" ]] && rm -f "${http_body}"' EXIT

# ---------------------------------------------------------------------------
# verify-required-checks.sh — mechanically verify ISC-2 of docs/design/9-isa.md.
#
# ISC-2: "A pull request reports build, test, lint, typecheck and skill-lint
# as five separately named required checks; failing any one leaves the PR
# unmergeable."
#
# Two modes, matching docs/test-plans/9-plan.md:
#
#   Configuration mode (no --pr, case 3): read the branch protection rule for
#   the target branch and assert SET EQUALITY against the five required
#   context names below. Both a missing context and a sixth, unexpected one
#   are failures — "exactly five" is exact, not "at least".
#
#   PR mode (--pr N, case 14): read that PR's mergeStateStatus and
#   statusCheckRollup and report which contexts are blocking. The pass
#   criterion is that a failing/pending required context is reported as
#   blocking AND mergeStateStatus is not CLEAN — the boolean `mergeable`
#   field is not sufficient (GitHub sets it true even while blocked by
#   required checks in some states), so mergeStateStatus is the field this
#   script trusts.
#
# Usage:
#   scripts/verify-required-checks.sh [--repo owner/name] [--branch main] [--pr N]
# ---------------------------------------------------------------------------

SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

REPO=""
BRANCH="main"
PR=""

REQUIRED_CONTEXTS=(build test lint typecheck skill-lint)

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
ok() { printf '%s  ok%s %s\n' "${C_GREEN}" "${C_RESET}" "$*" >&2; }
warn() { printf '%swarn%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die() {
  printf '%sfatal%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2
  exit 1
}
pass_line() { printf '%s%s PASS%s %s\n' "${C_GREEN}${C_BOLD}" "$(printf '\xe2\x9c\x93')" "${C_RESET}" "$*"; }
fail_line() { printf '%s%s FAIL%s %s\n' "${C_RED}${C_BOLD}" "$(printf '\xe2\x9c\x97')" "${C_RESET}" "$*"; }

usage() {
  cat <<EOF
${SCRIPT_NAME} — verify ISC-2: exactly five named required checks.

Configuration mode (default, no --pr): reads branch protection for --branch
and asserts its required status checks are EXACTLY:
  ${REQUIRED_CONTEXTS[*]}

PR mode (--pr N): reads that PR's mergeStateStatus and statusCheckRollup and
reports which required contexts are currently blocking merge.

Options:
  --repo <owner/repo>   Target repository.
                        Default: gh repo view --json nameWithOwner
  --branch <name>       Branch whose protection to check. Default: main
  --pr <N>              Check a specific PR instead of branch config.
  --help, -h            Show this help.

Examples:
  ${SCRIPT_NAME}
  ${SCRIPT_NAME} --branch main
  ${SCRIPT_NAME} --pr 42
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        [[ $# -ge 2 ]] || die "--repo requires an argument"
        REPO="$2"
        shift 2
        ;;
      --repo=*)
        REPO="${1#*=}"
        shift
        ;;
      --branch)
        [[ $# -ge 2 ]] || die "--branch requires an argument"
        BRANCH="$2"
        shift 2
        ;;
      --branch=*)
        BRANCH="${1#*=}"
        shift
        ;;
      --pr)
        [[ $# -ge 2 ]] || die "--pr requires an argument"
        PR="$2"
        shift 2
        ;;
      --pr=*)
        PR="${1#*=}"
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

preflight() {
  command -v gh >/dev/null 2>&1 ||
    die "gh (GitHub CLI) is not installed. Install it: https://cli.github.com"

  command -v jq >/dev/null 2>&1 ||
    die "jq is not installed. Install it: https://jqlang.github.io/jq"

  gh auth status >/dev/null 2>&1 ||
    die "gh is not authenticated. Run: gh auth login"

  if [[ -z "${REPO}" ]]; then
    REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
    [[ -n "${REPO}" ]] ||
      die "could not derive the repository from the current directory. Pass one explicitly: ${SCRIPT_NAME} --repo <owner/repo>"
  fi

  [[ "${REPO}" == */* ]] ||
    die "--repo must be in owner/repo form, got: ${REPO}"
}

# Join a bash array with ", " for display.
join_display() {
  local IFS=', '
  echo "$*"
}

# --- configuration mode ------------------------------------------------------

check_configuration() {
  log "Configuration mode: branch protection for '${BRANCH}' on ${REPO}"

  local http_status
  # Deliberately not a RETURN trap on a local: a RETURN trap set inside a
  # function stays installed and fires again when the caller returns, at
  # which point the local is out of scope and `set -u` aborts a run that had
  # already passed. Script-scoped variable plus a single EXIT trap instead.
  http_body="$(mktemp)"

  # gh api exits non-zero on a 4xx/5xx and writes the JSON error body to
  # stdout; we capture the body regardless of exit code so a 404 can be
  # distinguished from a genuine transport failure, and never surfaces as a
  # raw stack trace or uncaught `set -e` exit.
  if gh api "repos/${REPO}/branches/${BRANCH}/protection" >"${http_body}" 2>/dev/null; then
    http_status="200"
  else
    if jq -e '.message == "Branch not protected"' "${http_body}" >/dev/null 2>&1; then
      http_status="404"
    else
      http_status="error"
    fi
  fi

  if [[ "${http_status}" == "404" ]]; then
    printf '\n'
    warn "Branch '${BRANCH}' on ${REPO} is NOT protected."
    printf '\n' >&2
    cat >&2 <<EOF
  GitHub's response: "Branch not protected" (404 from
  GET /repos/${REPO}/branches/${BRANCH}/protection).

  ISC-2 (docs/design/9-isa.md) requires branch protection on '${BRANCH}' with
  exactly these five required status check contexts:
    ${REQUIRED_CONTEXTS[*]}

  Until branch protection is configured with required status checks, ISC-2
  cannot be satisfied: there is no rule forcing a PR to wait on build, test,
  lint, typecheck and skill-lint before it can merge.

  To configure it:
    gh api --method PUT repos/${REPO}/branches/${BRANCH}/protection \\
      -f required_status_checks.strict=true \\
      -f 'required_status_checks.contexts[]=build' \\
      -f 'required_status_checks.contexts[]=test' \\
      -f 'required_status_checks.contexts[]=lint' \\
      -f 'required_status_checks.contexts[]=typecheck' \\
      -f 'required_status_checks.contexts[]=skill-lint' \\
      -f enforce_admins=true \\
      -f required_pull_request_reviews=null \\
      -f restrictions=null
EOF
    printf '\n' >&2
    fail_line "branch protection is not configured on '${BRANCH}'; ISC-2 is unmet"
    return 1
  fi

  if [[ "${http_status}" != "200" ]]; then
    die "unexpected error fetching branch protection for '${BRANCH}' on ${REPO}: $(cat "${http_body}" 2>/dev/null)"
  fi

  # Read both possible response shapes: legacy `.contexts` (a flat array of
  # strings) and the current `.checks[].context` (an array of objects).
  local legacy current actual_json
  legacy="$(jq -r '.required_status_checks.contexts // [] | .[]' "${http_body}" 2>/dev/null || true)"
  current="$(jq -r '.required_status_checks.checks // [] | .[].context' "${http_body}" 2>/dev/null || true)"

  actual_json="$(
    { printf '%s\n' "${legacy}"; printf '%s\n' "${current}"; } |
      sed '/^$/d' | sort -u
  )"

  if [[ -z "${actual_json}" ]]; then
    warn "branch '${BRANCH}' is protected but has NO required status checks configured"
  fi

  local expected_sorted
  expected_sorted="$(printf '%s\n' "${REQUIRED_CONTEXTS[@]}" | sort -u)"

  printf '\n'
  printf '%sExpected required contexts (5):%s\n' "${C_BOLD}" "${C_RESET}"
  printf '  %s\n' "${REQUIRED_CONTEXTS[@]}"
  printf '\n'
  printf '%sActual required contexts (%d):%s\n' "${C_BOLD}" "$(printf '%s\n' "${actual_json}" | sed '/^$/d' | wc -l | tr -d ' ')" "${C_RESET}"
  if [[ -n "${actual_json}" ]]; then
    printf '  %s\n' ${actual_json}
  else
    printf '  (none)\n'
  fi
  printf '\n'

  if [[ "${expected_sorted}" == "${actual_json}" ]]; then
    pass_line "branch '${BRANCH}' requires exactly the five named contexts"
    return 0
  fi

  local missing extra
  missing="$(comm -23 <(printf '%s\n' "${expected_sorted}") <(printf '%s\n' "${actual_json}") 2>/dev/null || true)"
  extra="$(comm -13 <(printf '%s\n' "${expected_sorted}") <(printf '%s\n' "${actual_json}") 2>/dev/null || true)"

  [[ -z "${missing}" ]] || printf '%sMissing (required by ISC-2, absent from config):%s\n  %s\n\n' "${C_RED}" "${C_RESET}" "$(printf '%s ' ${missing})" >&2
  [[ -z "${extra}" ]] || printf '%sUnexpected (present but not one of the five):%s\n  %s\n\n' "${C_RED}" "${C_RESET}" "$(printf '%s ' ${extra})" >&2

  fail_line "branch '${BRANCH}' does not require exactly the five named contexts"
  return 1
}

# --- PR mode ------------------------------------------------------------------

check_pr() {
  log "PR mode: #${PR} on ${REPO}"

  local json
  if ! json="$(gh pr view "${PR}" --repo "${REPO}" \
      --json mergeable,mergeStateStatus,statusCheckRollup 2>&1)"; then
    die "could not read PR #${PR} on ${REPO}: ${json}"
  fi

  local mergeable merge_state
  mergeable="$(jq -r '.mergeable' <<<"${json}")"
  merge_state="$(jq -r '.mergeStateStatus' <<<"${json}")"

  printf '\n%smergeable:%s        %s\n' "${C_BOLD}" "${C_RESET}" "${mergeable}"
  printf '%smergeStateStatus:%s %s\n\n' "${C_BOLD}" "${C_RESET}" "${merge_state}"

  printf '%sRequired-context status:%s\n' "${C_BOLD}" "${C_RESET}"
  local ctx blocking=() ok_ctx=() missing_ctx=()
  for ctx in "${REQUIRED_CONTEXTS[@]}"; do
    local entry state
    entry="$(jq -r --arg c "${ctx}" '
      .statusCheckRollup[]? |
      select((.context // .name) == $c) |
      (.state // .conclusion // "UNKNOWN")
    ' <<<"${json}" | head -n1)"

    if [[ -z "${entry}" ]]; then
      missing_ctx+=("${ctx}")
      printf '  %-12s %s(absent from rollup)%s\n' "${ctx}" "${C_YELLOW}" "${C_RESET}"
      continue
    fi

    state="$(tr '[:upper:]' '[:lower:]' <<<"${entry}")"
    case "${state}" in
      success)
        ok_ctx+=("${ctx}")
        printf '  %-12s %ssuccess%s\n' "${ctx}" "${C_GREEN}" "${C_RESET}"
        ;;
      pending | queued | in_progress)
        blocking+=("${ctx}")
        printf '  %-12s %s%s (blocking)%s\n' "${ctx}" "${C_YELLOW}" "${state}" "${C_RESET}"
        ;;
      *)
        blocking+=("${ctx}")
        printf '  %-12s %s%s (blocking)%s\n' "${ctx}" "${C_RED}" "${state}" "${C_RESET}"
        ;;
    esac
  done
  printf '\n'

  if ((${#missing_ctx[@]} > 0)); then
    warn "context(s) absent from statusCheckRollup: $(join_display "${missing_ctx[@]}")"
  fi

  # Pass criterion (plan case 14): a blocking context is identified AND
  # mergeStateStatus is not CLEAN. Both must hold together — a PR that is
  # CLEAN with no blocking context is a genuinely mergeable PR, which is not
  # what case 14 exercises.
  local upper_state
  upper_state="$(tr '[:lower:]' '[:upper:]' <<<"${merge_state}")"

  if ((${#blocking[@]} > 0)) && [[ "${upper_state}" != "CLEAN" ]]; then
    printf '%sBlocking context(s):%s %s\n\n' "${C_RED}${C_BOLD}" "${C_RESET}" "$(join_display "${blocking[@]}")"
    pass_line "PR #${PR} is correctly blocked: mergeStateStatus='${merge_state}', blocking=[$(join_display "${blocking[@]}")]"
    return 0
  fi

  if ((${#blocking[@]} == 0)) && [[ "${upper_state}" == "CLEAN" ]]; then
    fail_line "PR #${PR} reports mergeStateStatus=CLEAN with no blocking context — nothing to verify was blocked (this is a genuinely green PR, not the failing-check scenario this check exercises)"
    return 1
  fi

  fail_line "PR #${PR} is inconclusive: blocking=[$(join_display "${blocking[@]:-}")], mergeStateStatus='${merge_state}' — expected a blocking context together with a non-CLEAN mergeStateStatus"
  return 1
}

main() {
  parse_args "$@"
  preflight

  log "Repository: ${REPO}"

  if [[ -n "${PR}" ]]; then
    check_pr
  else
    check_configuration
  fi
}

main "$@"
