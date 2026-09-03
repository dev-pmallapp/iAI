// Response parsing: the one sanctioned scrape and the safe `--json` reader
// (issue #25, Decision 7 of docs/design/stories/21.md, NEVER-21.8).
//
// PURE: no fs, no net, no process, no Bun globals, no node builtin import.
//
// docs/design/09-security.md:192: "Use `gh` with `--json` and parse; never
// scrape human-formatted output." `gh issue create` has no `--json` flag, and
// the number of the issue it just created exists only in the URL it prints on
// stdout. Decision 7 records the one place that rule cannot be honoured:
//
//   "Exactly one parser is permitted to read unstructured `gh` stdout, and it
//    does nothing but extract a trailing issue number from a URL. It
//    validates: a line that is not a GitHub issue URL is a typed failure, not
//    a guessed integer. Every other operation uses `--json` and a structured
//    parser."
//
// `parseIssueCreateUrl` below is that one parser, and it is the ONLY function
// in this file — or this directory — that reads free-form `gh` stdout as
// text. Every other operation's response goes through `parseGhJson`.
//
// scripts/bootstrap-stories.py:276 recovers the number the same way this
// repository's own issue tree was built:
//   `int(r.stdout.strip().rstrip("/").split("/")[-1])`
// That line is NOT copied here. It accepts the trailing path segment of ANY
// string that has one — a stray log line, a warning, garbage — as a valid
// issue number, because it never checks that the string was a GitHub issue
// URL in the first place. Decision 7 requires stricter behaviour ("a line
// that is not a GitHub issue URL is a typed failure, not a guessed integer"),
// so this parser anchors a real URL pattern across the whole trimmed string
// rather than blindly taking the last "/"-separated token.
import { ghFail, ghOk, isPositiveInteger, type GhResult } from "./types";

// Whole-string match, same discipline as repo.ts's SEGMENT_RE: a value like
// "https://github.com/a/b/issues/1 && rm -rf /" must fail rather than have its
// prefix accepted. Owner and repo segments follow GitHub's own character
// rules (alphanumerics, hyphen, underscore, dot); the issue number is
// unsigned digits only, and an optional single trailing slash is tolerated
// because `gh` has been observed to emit one on some object URLs.
const GITHUB_ISSUE_URL_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/(\d+)\/?$/;

// docs/design/09-security.md's ingestion rule ("bound every retrieval of
// external content: size cap, timeout and redirect cap; unbounded ingestion is
// a denial-of-service against your own context window") is written about
// retrieving remote content, but the underlying reasoning applies just as
// well to a stdout string handed to a regex here: a real gh issue create URL
// is well under 200 characters, so anything past a generous multiple of that
// is hostile input, not a URL this layer failed to anchor correctly.
const MAX_URL_LENGTH = 2048;

// The sanctioned exception (Decision 7). Nothing else in this file, or this
// directory, is permitted to read unstructured stdout as text.
export function parseIssueCreateUrl(stdout: unknown): GhResult<number> {
  if (typeof stdout !== "string") {
    return ghFail("gh issue create stdout must be a string");
  }
  if (stdout.length > MAX_URL_LENGTH) {
    return ghFail(
      `stdout exceeds ${MAX_URL_LENGTH} characters, refusing to treat it as a gh issue create URL`,
    );
  }
  // Trimmed once, then matched as a whole string. `gh issue create` prints
  // nothing but the URL on success, so a value that survives trim and still
  // fails the anchor is not a mis-parsed URL — it is not a URL, and Decision
  // 7 requires that to be a typed failure rather than a guess.
  const line = stdout.trim();
  const match = GITHUB_ISSUE_URL_RE.exec(line);
  if (match === null) {
    const snippet = line.length > 200 ? `${line.slice(0, 200)}...` : line;
    return ghFail(`stdout is not a GitHub issue URL, refusing to guess a number: "${snippet}"`);
  }
  const issue = Number(match[1]);
  if (!isPositiveInteger(issue)) {
    // Unreachable given the regex's \d+, kept as a second gate rather than a
    // trust in the regex alone — the same posture safeOwnValue takes for
    // reading an untrusted field.
    return ghFail(`gh issue create URL carried a non-positive issue number: ${match[1]}`);
  }
  return ghOk(issue);
}

// Everything else. A total, non-throwing wrapper around JSON.parse for the
// `--json` output every other constructor in this directory produces.
export function parseGhJson<T = unknown>(stdout: unknown): GhResult<T> {
  if (typeof stdout !== "string") {
    return ghFail("gh --json output must be a string");
  }
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return ghFail("gh --json output is empty");
  }
  try {
    return ghOk(JSON.parse(trimmed) as T);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ghFail(`gh --json output is not valid JSON: ${message}`);
  }
}
