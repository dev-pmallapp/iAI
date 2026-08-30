// Path classification (issue #16, CLAIM-15.2). PURE STRING MATCHING ONLY —
// no `fs`, no `path`, no `process.cwd()`, no resolving or stat-ing against a
// real filesystem. The caller supplies whatever string it has; this module
// never asks whether that string exists.
//
// The one rule that must never have a false negative: anything rooted at
// `USER/` is at least PRIVATE, never INTERNAL — that is where the private
// repo is symlinked in (CONTRIBUTING.md's "The private repo" section), and a
// path-based guard that let a `USER/` path read as merely INTERNAL would be
// exactly the kind of leak this classifier exists to prevent. A false
// positive (treating `USERS/x` or `docs/USER/x` as private) does not leak
// anything, so match ONLY the literal root segment `USER` at the head of the
// path — never a prefix, a case-insensitive match, or a match anywhere but
// the first segment.
import { classifyKeyName, classifySecretShape } from "./recognisers";
import { maxClass, type DataClass } from "./levels";

const USER_ROOT = "USER";

function stripLeadingDotSlash(path: string): string {
  let out = path;
  while (out.startsWith("./")) out = out.slice(2);
  while (out.startsWith("/")) out = out.slice(1);
  return out;
}

function stripExtension(segment: string): string {
  const dot = segment.lastIndexOf(".");
  if (dot <= 0) return segment;
  return segment.slice(0, dot);
}

export function classifyPath(path: string): DataClass {
  try {
    const normalized = stripLeadingDotSlash(path);
    const segments = normalized.split("/").filter((segment) => segment.length > 0);
    const root = segments[0] ?? "";
    const underUser = root === USER_ROOT;

    let best: DataClass = underUser ? "PRIVATE" : "INTERNAL";

    for (const segment of segments) {
      const keyClass = classifyKeyName(stripExtension(segment));
      if (keyClass !== null) best = maxClass(best, keyClass);
      const shapeClass = classifySecretShape(segment);
      if (shapeClass !== null) best = maxClass(best, shapeClass);
    }

    return best;
  } catch {
    return "PRIVATE";
  }
}
