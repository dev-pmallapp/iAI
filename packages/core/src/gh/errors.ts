// The exit-code taxonomy and the rate-limit classification (issue #25,
// CLAIM-21.5, CLAIM-21.6, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// THE TAXONOMY DOES NOT EXIST ANYWHERE IN THIS REPOSITORY. THIS FILE AUTHORS
// IT FROM ZERO.
//
// docs/milestones/M1.md:140-141 requires "every gh exit code in the taxonomy
// has a fixture and is classified retryable or fatal", and no `gh` exit code
// is named anywhere in the tree. Writing one from imagination is precisely
// the failure PLAN.md:217 ("Plan authored by an agent contains invented
// detail") warns about, so Decision 3 of docs/design/stories/21.md binds this
// file to two rules:
//
//   1. Every entry carries `provenance: "observed" | "assumed"`. "observed"
//      means the code was confirmed by actually running `gh` on this machine
//      and reading its real exit status; "assumed" means it is reasoned from
//      `gh`'s own documented contract with no live reproduction. Marking
//      something "observed" that was only read about is exactly the
//      laundering Decision 3 exists to prevent.
//   2. The default is fatal. `classifyExitCode` never returns "retryable" for
//      a code absent from GH_EXIT_TAXONOMY. An incomplete taxonomy degrades to
//      "stop", never to "retry forever".
//
// WHAT WAS ACTUALLY RUN, on `gh version 2.92.0 (2026-05-18)`:
//
//   - `gh issue view 1 --repo dev-pmallapp/iAI --json number` -> exit 0.
//   - `gh nonexistent-command` -> exit 1 ("unknown command").
//   - `gh issue view 999999999 --repo dev-pmallapp/iAI` -> exit 1 (GraphQL
//     "could not resolve to an issue").
//   - `gh issue create --repo dev-pmallapp/iAI --bogus-flag` -> exit 1
//     ("unknown flag").
//   - `gh issue view` with no argument -> exit 1 ("accepts 1 arg(s), received
//     0").
//   - `GH_TOKEN=invalid_token_xyz gh issue view 1 --repo dev-pmallapp/iAI
//     --json number` -> exit 1 ("HTTP 401: Bad credentials"). Note this is
//     evidence that a REJECTED credential is exit 1, not exit 4 — 4 is
//     reserved for having no credential to try at all (below).
//   - With `GH_TOKEN`/`GITHUB_TOKEN` unset and `HOME` pointed at a directory
//     with no `gh` config, `gh issue view 1 --repo dev-pmallapp/iAI --json
//     number` -> exit 4 ("To get started with GitHub CLI, please run: gh auth
//     login").
//
// Exit code 2 ("cancelled") is marked "assumed" rather than "observed". `gh
// help exit-codes` — itself run against this binary — documents it as "If a
// command is running but gets cancelled, the exit code will be 2", but two
// attempts to reproduce it live by sending SIGINT to a running `gh api
// --paginate` invocation in this sandbox did not conclusively yield a clean
// exit(2) (the process either finished before the signal landed or had to be
// SIGKILLed). Per the instruction "if in doubt, mark assumed", it is assumed:
// reasoned from `gh`'s own shipped documentation, not from a witnessed exit
// status.
import { safeOwnValue, type GhResponse } from "./types";

// ---------------------------------------------------------------------------
// Exit-code taxonomy.
// ---------------------------------------------------------------------------

export type GhExitProvenance = "observed" | "assumed";

// "retryable" or "fatal" answers one question: should a FAILED invocation of
// this exit code be retried. It says nothing about whether the code means
// success — see the note on code 0 below, and classifyExitCode's own comment.
export type GhExitClassification = "retryable" | "fatal";

export interface GhExitTaxonomyEntry {
  readonly code: number;
  readonly meaning: string;
  readonly classification: GhExitClassification;
  readonly provenance: GhExitProvenance;
}

// Every row here was produced by one of the invocations logged in the file
// header above. None was invented; the codes not listed here (which is most
// integers) fall through classifyExitCode's default, which is Decision 3's
// point.
export const GH_EXIT_TAXONOMY: readonly GhExitTaxonomyEntry[] = [
  {
    code: 0,
    meaning:
      "success. Included for completeness, but classification is meaningless " +
      "here in the ordinary sense: there is nothing to retry. It is set to " +
      '"fatal" only so that a caller who consults classifyExitCode without ' +
      "first checking exitCode === 0 fails safe (refuses to retry) rather than " +
      're-running a side-effecting command because "retryable" looked true.',
    classification: "fatal",
    provenance: "observed",
  },
  {
    code: 1,
    meaning:
      "general error. gh's own catch-all: observed for an unknown subcommand, " +
      "an unknown flag, a missing required argument, a GraphQL not-found and a " +
      "rejected credential. Because this single code covers permanent usage " +
      "errors AND remote failures alike, it cannot be assumed retryable — doing " +
      "so would retry a permanently broken invocation forever.",
    classification: "fatal",
    provenance: "observed",
  },
  {
    code: 2,
    meaning:
      '"a command is running but gets cancelled" per `gh help exit-codes`. A ' +
      "cancellation is a deliberate stop, not a transient failure — retrying it " +
      "would fight the thing that cancelled it.",
    classification: "fatal",
    provenance: "assumed",
  },
  {
    code: 4,
    meaning:
      "a command requires authentication. Observed with no GH_TOKEN/GITHUB_TOKEN " +
      "and no `gh auth login` state. Retrying with the same, still-absent " +
      "credential cannot succeed, so this is fatal from this layer's point of " +
      "view; a caller that can obtain a fresh credential is doing something " +
      "this layer cannot see or influence.",
    classification: "fatal",
    provenance: "observed",
  },
];

export interface GhExitOutcome {
  readonly code: number;
  readonly classification: GhExitClassification;
  // "unmapped" names Decision 3's fail-closed default explicitly, so case 14
  // can tell "we know this code and it is fatal" apart from "we have never
  // seen this code and are refusing it anyway" — the same value either way,
  // but a different reason, and the reason is worth keeping visible for
  // whoever eventually writes references/gh-error-handling.md in M2.
  readonly provenance: GhExitProvenance | "unmapped";
}

// Total over every number, per NEVER-21.8: no throw, no lookup that could
// fail, a plain array scan against a fixed table.
export function classifyExitCode(code: unknown): GhExitOutcome {
  if (typeof code !== "number" || !Number.isFinite(code)) {
    return { code: Number.NaN, classification: "fatal", provenance: "unmapped" };
  }
  const entry = GH_EXIT_TAXONOMY.find((row) => row.code === code);
  if (entry === undefined) {
    // docs/milestones/M1.md:140-141: an unmapped code is fatal and not
    // retried. This is that default, and it is the only place it lives.
    return { code, classification: "fatal", provenance: "unmapped" };
  }
  return { code, classification: entry.classification, provenance: entry.provenance };
}

// ---------------------------------------------------------------------------
// Rate-limit classification — Decision 1 of docs/design/stories/21.md.
// ---------------------------------------------------------------------------

// HTTP header names are case-insensitive (RFC 7230 §3.2), and
// GhResponse.headers is a plain Record whose casing is whatever the adapter's
// capture happened to produce. Scanning own keys case-insensitively is the
// only correct lookup; a literal `headers["x-ratelimit-remaining"]` would
// silently miss `X-RateLimit-Remaining`, which is the form curl and many HTTP
// libraries actually emit.
export function getHeaderCaseInsensitive(
  headers: Readonly<Record<string, string>> | undefined,
  name: string,
): string | undefined {
  if (headers === null || typeof headers !== "object") return undefined;
  const target = name.toLowerCase();
  try {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === target) {
        const value = safeOwnValue(headers, key);
        return typeof value === "string" ? value : undefined;
      }
    }
  } catch {
    // A hostile `headers` value with a throwing Object.keys or iterator must
    // not throw out of a classifier, per NEVER-21.8.
    return undefined;
  }
  return undefined;
}

export type RateLimitClassification =
  | "not-rate-limited"
  | "rate-limited"
  | "possibly-rate-limited";

// GitHub's secondary rate limit (abuse detection) is a distinct mechanism
// from the primary `x-ratelimit-remaining` budget and carries no header this
// layer can rely on — it is reported only in the response body's error
// message. The phrase below is GitHub's own documented wording for it
// (https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api,
// "You have exceeded a secondary rate limit"), matched case-insensitively
// against both stdout and stderr because `gh`'s own error-printing path was
// observed (for a different error) to write the message to stderr while an
// upstream JSON body could still land on stdout depending on the subcommand.
// This is the one place text is matched rather than parsed, and it is
// deliberately narrow: a whole documented phrase, not a heuristic on the word
// "rate".
const SECONDARY_RATE_LIMIT_RE = /secondary rate limit/i;

// `gh`'s own error format, observed directly in this file's header comment
// for a 401 ("HTTP 401: Bad credentials"), is "<message> (HTTP <code>)" or
// "HTTP <code>: <message>" depending on the code path. A 403 was not
// reproduced live (provoking a real rate limit was not attempted, since doing
// so would mean deliberately exhausting this token's quota), so matching on
// the literal digits "403" appearing near the word "HTTP" is assumed from the
// same format actually observed for 401, not independently confirmed for 403.
const HTTP_403_RE = /\bHTTP[^0-9]{0,3}403\b/i;

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// CLAIM-21.5 begins "Given a 403 with x-ratelimit-remaining: 0". Decision 1
// requires the header's ABSENCE to be read conservatively, not as "not rate
// limited" — `gh api --include` appears nowhere in this repository, so the
// common case is that no headers were captured at all, and treating that as
// "definitely fine" would abandon a batch that would have succeeded on retry.
export function classifyRateLimit(response: GhResponse): RateLimitClassification {
  const stderr = safeString(safeOwnValue(response, "stderr"));
  const stdout = safeString(safeOwnValue(response, "stdout"));
  const headers = safeOwnValue(response, "headers") as
    | Readonly<Record<string, string>>
    | undefined;

  // Secondary rate limits fire independently of the primary header/budget, so
  // this check runs first and short-circuits regardless of what follows.
  if (SECONDARY_RATE_LIMIT_RE.test(stderr) || SECONDARY_RATE_LIMIT_RE.test(stdout)) {
    return "rate-limited";
  }

  const remaining = getHeaderCaseInsensitive(headers, "x-ratelimit-remaining");
  if (remaining !== undefined) {
    // The header is present, so this layer actually knows the budget rather
    // than guessing at it: trust it either way.
    return remaining === "0" ? "rate-limited" : "not-rate-limited";
  }

  // No header captured. Decision 1's conservative default: a 403 with no
  // header is "possibly" rate limited, and possibly-rate-limited still yields
  // a resume plan (case 12) rather than a fatal classification.
  if (HTTP_403_RE.test(stderr) || HTTP_403_RE.test(stdout)) {
    return "possibly-rate-limited";
  }

  return "not-rate-limited";
}

export interface RetryDecision {
  readonly retry: boolean;
  readonly reason: string;
  readonly rateLimit: RateLimitClassification;
  readonly exit: GhExitOutcome;
}

// Ties both classifications together into the one question an adapter
// actually has: given this response, is calling the resume planner in
// resume.ts warranted at all. This function decides; it does not itself plan
// anything, per Decision 4 — the plan is resume.ts's `planResume`, and it is
// only ever meant to be called when `shouldRetryResponse(...).retry` is true.
// That is the contract case 14 exercises: an unmapped, non-rate-limited
// response answers false here, and nothing downstream calls planResume for
// it.
export function shouldRetryResponse(response: GhResponse): RetryDecision {
  const exitCodeValue = safeOwnValue(response, "exitCode");
  const exit = classifyExitCode(exitCodeValue);
  const rateLimit = classifyRateLimit(response);

  if (rateLimit === "rate-limited" || rateLimit === "possibly-rate-limited") {
    return {
      retry: true,
      reason: `rate limit classification is "${rateLimit}"`,
      rateLimit,
      exit,
    };
  }

  if (exit.classification === "retryable") {
    return {
      retry: true,
      reason: `exit code ${String(exit.code)} classifies retryable (${exit.provenance})`,
      rateLimit,
      exit,
    };
  }

  return {
    retry: false,
    reason:
      `exit code ${String(exit.code)} classifies fatal (${exit.provenance}) and ` +
      `rate limit classification is "${rateLimit}"`,
    rateLimit,
    exit,
  };
}
