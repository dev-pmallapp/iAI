// The four-level classifier itself (issue #16, CLAIM-15.1, CLAIM-15.2).
//
// PURE: no fs, no net, no process, no Bun globals, no import of any node
// builtin. Same standing decision as guards/claim-lint.ts and
// guards/path-refs.ts — this module only ever reads the value it is handed.
//
// Two default rules drive the whole design, and neither is negotiable:
//
//   - Unknown classifies PRIVATE. An unrecognised value, an empty object, an
//     empty array, null and undefined all resolve PRIVATE. Defaulting to
//     SECRET would block everything with no recovery path; defaulting to
//     PUBLIC leaks. PRIVATE is the only fail-closed choice that is also
//     usable.
//   - The result is always the MAXIMUM class reached anywhere in the
//     structure, never a partial or per-field result, and never merely the
//     first hit or the most common level.
//
// Traversal is an explicit stack, not recursion, so that pathological input
// (deep nesting, a very long array) cannot exhaust the call stack — case 19
// requires ten levels of nesting to still resolve correctly, and deeper must
// not crash. Object references already visited are tracked so a circular
// structure cannot loop forever. Every per-node access (a getter, a Proxy
// trap) is wrapped in its own try/catch: a throw contributes PRIVATE for
// that one node rather than aborting the whole classification. The
// top-level entry point additionally wraps the entire walk, so classify()
// itself can never throw — any internal failure resolves PRIVATE.
import { maxClass, type DataClass } from "./levels";
import { classifyKeyName, classifySecretShape } from "./recognisers";

type QueueItem =
  | { kind: "node"; value: unknown; key: string | null }
  | { kind: "forced"; dataClass: DataClass };

function pushForced(queue: QueueItem[], dataClass: DataClass): void {
  queue.push({ kind: "forced", dataClass });
}

function pushNode(queue: QueueItem[], value: unknown, key: string | null): void {
  queue.push({ kind: "node", value, key });
}

/** Enumerate an object's own keys (string and symbol), tolerating a Proxy
 *  whose own-keys trap itself throws. Only own, enumerable properties are
 *  read (`Object.keys` / `Object.getOwnPropertySymbols` never walk the
 *  prototype chain), which is what keeps a prototype-polluted global from
 *  ever being mistaken for a property of the object under test. */
function safeOwnKeys(value: object): { strings: string[]; symbols: symbol[] } | null {
  try {
    const strings = Object.keys(value);
    const symbols = Object.getOwnPropertySymbols(value);
    return { strings, symbols };
  } catch {
    return null;
  }
}

function safeGet(value: object, key: PropertyKey): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (value as Record<PropertyKey, unknown>)[key] };
  } catch {
    return { ok: false };
  }
}

/** Process one queue item: compute its own contribution to the running
 *  maximum, and enqueue its children (if any) rather than recursing into
 *  them. Returns the class this single node contributes on its own. */
function step(item: QueueItem, visited: Set<object>, queue: QueueItem[]): DataClass {
  if (item.kind === "forced") return item.dataClass;

  const { value, key } = item;
  const keyClass = key !== null ? classifyKeyName(key) : null;

  if (value === null || value === undefined) return keyClass ?? "PRIVATE";

  if (typeof value === "string") {
    const shape = classifySecretShape(value);
    if (shape !== null) return maxClass(keyClass ?? "PUBLIC", shape);
    return keyClass ?? "PRIVATE";
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return keyClass ?? "PRIVATE";
  }

  // kind === "object" from here on.
  const obj = value as object;

  if (visited.has(obj)) {
    // A cycle, or simply a second reference to the same shared object. The
    // first visit already enqueued its children and their contribution is
    // already folded into the running max, so skipping the re-walk here is
    // safe: it can only under-count a node whose class was already counted.
    return keyClass ?? "PUBLIC";
  }
  visited.add(obj);

  if (value instanceof Date) return keyClass ?? "PRIVATE";

  if (Array.isArray(value)) {
    if (value.length === 0) return keyClass ?? "PRIVATE";
    for (let index = 0; index < value.length; index += 1) {
      const got = safeGet(value, index);
      if (!got.ok) {
        pushForced(queue, "PRIVATE");
        continue;
      }
      pushNode(queue, got.value, null);
    }
    return keyClass ?? "PUBLIC";
  }

  if (value instanceof Map) {
    try {
      if (value.size === 0) return keyClass ?? "PRIVATE";
      for (const [mapKey, mapValue] of value.entries()) {
        pushNode(queue, mapValue, typeof mapKey === "string" ? mapKey : null);
      }
      return keyClass ?? "PUBLIC";
    } catch {
      return keyClass ?? "PRIVATE";
    }
  }

  if (value instanceof Set) {
    try {
      if (value.size === 0) return keyClass ?? "PRIVATE";
      for (const member of value.values()) {
        pushNode(queue, member, null);
      }
      return keyClass ?? "PUBLIC";
    } catch {
      return keyClass ?? "PRIVATE";
    }
  }

  const keys = safeOwnKeys(obj);
  if (keys === null) return keyClass ?? "PRIVATE";
  if (keys.strings.length === 0 && keys.symbols.length === 0) return keyClass ?? "PRIVATE";

  for (const propKey of keys.strings) {
    const got = safeGet(obj, propKey);
    if (!got.ok) {
      pushForced(queue, "PRIVATE");
      continue;
    }
    pushNode(queue, got.value, propKey);
  }
  for (const propKey of keys.symbols) {
    const got = safeGet(obj, propKey);
    if (!got.ok) {
      pushForced(queue, "PRIVATE");
      continue;
    }
    pushNode(queue, got.value, null);
  }
  return keyClass ?? "PUBLIC";
}

function classifyInternal(payload: unknown): DataClass {
  const visited = new Set<object>();
  const queue: QueueItem[] = [{ kind: "node", value: payload, key: null }];
  let best: DataClass = "PUBLIC";

  let current = queue.pop();
  while (current !== undefined) {
    let contributed: DataClass;
    try {
      contributed = step(current, visited, queue);
    } catch {
      contributed = "PRIVATE";
    }
    best = maxClass(best, contributed);
    current = queue.pop();
  }

  return best;
}

export function classify(payload: unknown): DataClass {
  try {
    return classifyInternal(payload);
  } catch {
    return "PRIVATE";
  }
}
