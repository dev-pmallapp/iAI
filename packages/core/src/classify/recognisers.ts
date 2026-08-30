// Recogniser tables for the four-level classifier (issue #16). The tables
// below are transcribed directly from the Story's source tables and are the
// ONLY grounded source for what belongs to each level — nothing here invents
// a category beyond what those tables name.
//
// Key names are matched after normalisation to snake_case, so `api_key` and
// `apiKey` are the same table entry rather than two. Deliberately NOT a
// substring match: a whole-token match keeps `credential` from also lighting
// up `credentialing_report` or similar, which the source tables never named.
import type { DataClass } from "./levels";

export function normalizeKey(key: string): string {
  const withBoundaries = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const lowered = withBoundaries.toLowerCase();
  const snaked = lowered.replace(/[^a-z0-9]+/g, "_");
  return snaked.replace(/^_+/, "").replace(/_+$/, "");
}

// SECRET — API keys, broker credentials, OAuth tokens, session cookies,
// `.env` contents, private keys.
const SECRET_KEY_TOKENS: ReadonlySet<string> = new Set([
  "api_key",
  "token",
  "access_token",
  "refresh_token",
  "client_secret",
  "password",
  "passwd",
  "secret",
  "credential",
  "private_key",
  "session_cookie",
  "cookie",
  "authorization",
]);

// PRIVATE — health data and lab results, biomarker values, wearable
// streams, open positions and quantities, account balances, transaction
// history, statement PDFs, clinician notes.
const PRIVATE_KEY_TOKENS: ReadonlySet<string> = new Set([
  "biomarker",
  "apob",
  "ldl",
  "hdl",
  "cholesterol",
  "glucose",
  "hrv",
  "heart_rate",
  "sleep_score",
  "lab_result",
  "reference_range",
  "mrn",
  "date_of_birth",
  "dob",
  "patient_name",
  "balance",
  "account_number",
  "account_balance",
  "position",
  "quantity",
  "shares",
  "transaction",
  "clinician_note",
  "statement",
]);

// PUBLIC — ticker symbols, market prices, published papers and DOIs,
// open-source code, public GitHub issues, general medical literature.
// Notably `ticker` and broker NAME are PUBLIC — a ticker is not private.
const PUBLIC_KEY_TOKENS: ReadonlySet<string> = new Set([
  "ticker",
  "broker",
  "market_price",
  "doi",
]);

// INTERNAL — project code and design docs, test plans, evidence artifacts,
// work state, issue titles.
const INTERNAL_KEY_TOKENS: ReadonlySet<string> = new Set([
  "project_code",
  "design_doc",
  "test_plan",
  "evidence_artifact",
  "work_state",
  "issue_title",
]);

// Checked in this order — SECRET, then PRIVATE, then INTERNAL, then PUBLIC —
// so that if a token were ever accidentally shared between tables, the
// resolution is toward the more sensitive class, not the less sensitive one.
export function classifyKeyName(key: string): DataClass | null {
  const normalized = normalizeKey(key);
  if (normalized.length === 0) return null;
  if (SECRET_KEY_TOKENS.has(normalized)) return "SECRET";
  if (PRIVATE_KEY_TOKENS.has(normalized)) return "PRIVATE";
  if (INTERNAL_KEY_TOKENS.has(normalized)) return "INTERNAL";
  if (PUBLIC_KEY_TOKENS.has(normalized)) return "PUBLIC";
  return null;
}

// Value-shape recognisers for SECRET, applied regardless of key name — a
// field named `notes` that happens to hold a private key must still lift the
// payload to SECRET. Deliberately conservative: prefixes and markers named in
// the Story's source table, not an entropy heuristic.
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN[ A-Z]*PRIVATE KEY-----/;
const OPENAI_KEY_RE = /^sk-[A-Za-z0-9_-]{8,}/;
const GITHUB_TOKEN_RE = /^gh[po]_[A-Za-z0-9]{8,}/;
const BEARER_RE = /^Bearer\s+\S+/;

export function classifySecretShape(value: string): DataClass | null {
  if (PRIVATE_KEY_BLOCK_RE.test(value)) return "SECRET";
  if (OPENAI_KEY_RE.test(value)) return "SECRET";
  if (GITHUB_TOKEN_RE.test(value)) return "SECRET";
  if (BEARER_RE.test(value)) return "SECRET";
  return null;
}
