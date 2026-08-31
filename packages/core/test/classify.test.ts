import { describe, expect, test } from "bun:test";
import { classify, classifyPath } from "../src/classify/index";

describe("classify — case 1 (P0, CLAIM-15.1): highest-class-wins over volume", () => {
  test("400 public fields plus one biomarker value classifies PRIVATE in its entirety", () => {
    const payload: Record<string, unknown> = {};
    for (let i = 0; i < 400; i += 1) {
      payload[`ticker${i}`] = `SYM${i}`;
    }
    payload.ldl = 130;
    expect(classify(payload)).toBe("PRIVATE");
  });
});

describe("classify — case 2 (P0, CLAIM-15.1): single-class payload classifies at its own level", () => {
  test("an all-PUBLIC payload classifies PUBLIC", () => {
    expect(classify({ ticker: "AAPL", broker: "Schwab", doi: "10.1000/xyz" })).toBe("PUBLIC");
  });

  test("an all-INTERNAL payload classifies INTERNAL", () => {
    expect(
      classify({
        design_doc: "docs/design/09-security.md",
        test_plan: "docs/test-plans/16-plan.md",
        issue_title: "four-level data classifier",
      }),
    ).toBe("INTERNAL");
  });

  test("an all-PRIVATE payload classifies PRIVATE", () => {
    expect(classify({ ldl: 130, hdl: 55, heart_rate: 62 })).toBe("PRIVATE");
  });

  test("an all-SECRET payload classifies SECRET", () => {
    expect(classify({ api_key: "x", password: "y", refresh_token: "z" })).toBe("SECRET");
  });
});

describe("classify — case 13 (P0, CLAIM-15.2): unrecognised values classify PRIVATE", () => {
  test("an unrecognised key with an unrecognised plain string value classifies PRIVATE", () => {
    expect(classify({ some_unknown_field: "plain value" })).toBe("PRIVATE");
  });

  test("a bare unrecognised top-level value classifies PRIVATE", () => {
    expect(classify("just some string")).toBe("PRIVATE");
    expect(classify(42)).toBe("PRIVATE");
    expect(classify(true)).toBe("PRIVATE");
  });
});

describe("classify — case 14 (P0, CLAIM-15.2): USER/ paths classify at least PRIVATE, never INTERNAL", () => {
  const corpus = [
    "USER/x",
    "USER/HEALTH/a.yaml",
    "USER/WEALTH/positions.yaml",
    "USER/TRADE/log.json",
    "./USER/x",
    "USER/",
  ];

  test("0 results at PUBLIC or INTERNAL across the corpus", () => {
    const results = corpus.map(classifyPath);
    const publicOrInternal = results.filter((r) => r === "PUBLIC" || r === "INTERNAL");
    expect(publicOrInternal.length).toBe(0);
  });

  test.each(corpus.map((p) => [p]))("classifyPath(%j) is at least PRIVATE", (path) => {
    const result = classifyPath(path);
    expect(result === "PRIVATE" || result === "SECRET").toBe(true);
  });
});

describe("classify — case 17 (P1, CLAIM-15.1): maximum is taken, not mode or first-hit", () => {
  function mixedPayload(sensitiveKey: string): Record<string, unknown> {
    return {
      ticker: "AAPL",
      broker: "Schwab",
      doi: "10.1000/xyz",
      market_price: 191.2,
      [sensitiveKey]: "value",
    };
  }

  test("a single INTERNAL field among public fields resolves INTERNAL", () => {
    expect(classify(mixedPayload("issue_title"))).toBe("INTERNAL");
  });

  test("a single PRIVATE field among public fields resolves PRIVATE", () => {
    expect(classify(mixedPayload("mrn"))).toBe("PRIVATE");
  });

  test("a single SECRET field among public fields resolves SECRET", () => {
    expect(classify(mixedPayload("api_key"))).toBe("SECRET");
  });
});

describe("classify — case 18 (P0, CLAIM-15.2): empty/absent values classify PRIVATE and never throw", () => {
  test.each([
    ["{}", {}],
    ["[]", []],
    ["null", null],
    ["undefined", undefined],
  ])("classify(%s) is PRIVATE and does not throw", (_label, value) => {
    expect(() => classify(value)).not.toThrow();
    expect(classify(value)).toBe("PRIVATE");
  });
});

describe("classify — case 19 (P1, CLAIM-15.1): deep nesting lifts the whole payload, and does not crash", () => {
  function nest(depth: number, leaf: unknown): unknown {
    let value = leaf;
    for (let i = 0; i < depth; i += 1) {
      value = { [`layer${i}`]: value };
    }
    return value;
  }

  test("a biomarker nested 10 levels deep classifies PRIVATE", () => {
    const payload = nest(10, { ldl: 130 });
    expect(classify(payload)).toBe("PRIVATE");
  });

  test("a public value nested 10 levels deep classifies PUBLIC", () => {
    const payload = nest(10, { ticker: "AAPL" });
    expect(classify(payload)).toBe("PUBLIC");
  });

  test("nesting 10,000 levels deep does not crash and resolves PRIVATE", () => {
    const payload = nest(10_000, { ldl: 130 });
    expect(() => classify(payload)).not.toThrow();
    expect(classify(payload)).toBe("PRIVATE");
  });

  test("a very long flat array does not crash", () => {
    const payload = Array.from({ length: 200_000 }, (_, i) => ({ ticker: `T${i}` }));
    expect(() => classify(payload)).not.toThrow();
    expect(classify(payload)).toBe("PUBLIC");
  });
});

describe("classify — case 20 (P1, CLAIM-15.2): USER/ lookalikes, both directions", () => {
  test.each([
    ["USER/x"],
    ["USER/HEALTH/a.yaml"],
    ["./USER/x"],
    ["USER/"],
  ])("classifyPath(%j) matches — at least PRIVATE", (path) => {
    const result = classifyPath(path);
    expect(result === "PRIVATE" || result === "SECRET").toBe(true);
  });

  test.each([
    ["USERS/x"],
    ["user/x"],
    ["docs/USER/x"],
    ["MYUSER/x"],
  ])("classifyPath(%j) does not match — falls through to ordinary classification (INTERNAL)", (path) => {
    expect(classifyPath(path)).toBe("INTERNAL");
  });

  test("ordinary repo paths fall through to INTERNAL", () => {
    expect(classifyPath("docs/design/09-security.md")).toBe("INTERNAL");
    expect(classifyPath("packages/core/src/index.ts")).toBe("INTERNAL");
  });
});

describe("classify — hostile input", () => {
  test("a circular reference does not infinite-loop and resolves sanely", () => {
    const node: Record<string, unknown> = { ticker: "AAPL" };
    node.self = node;
    expect(() => classify(node)).not.toThrow();
    expect(classify(node)).toBe("PUBLIC");
  });

  test("a circular reference containing a secret still lifts to SECRET", () => {
    const node: Record<string, unknown> = { api_key: "sk-abcdefgh12345678" };
    node.self = node;
    expect(() => classify(node)).not.toThrow();
    expect(classify(node)).toBe("SECRET");
  });

  test("mutual circular references (A -> B -> A) do not infinite-loop", () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { ldl: 130 };
    a.b = b;
    b.a = a;
    expect(() => classify(a)).not.toThrow();
    expect(classify(a)).toBe("PRIVATE");
  });

  test("a throwing getter does not crash classify and is treated as unknown (PRIVATE)", () => {
    const node: Record<string, unknown> = { ticker: "AAPL" };
    Object.defineProperty(node, "trap", {
      enumerable: true,
      get(): unknown {
        throw new Error("boom");
      },
    });
    expect(() => classify(node)).not.toThrow();
    expect(classify(node)).toBe("PRIVATE");
  });

  test("a throwing getter on an array element does not crash classify", () => {
    const arr: unknown[] = ["AAPL"];
    Object.defineProperty(arr, 1, {
      enumerable: true,
      get(): unknown {
        throw new Error("boom");
      },
    });
    expect(() => classify(arr)).not.toThrow();
    expect(classify(arr)).toBe("PRIVATE");
  });

  test("prototype pollution on Object.prototype does not corrupt classification", () => {
    // eslint-disable-next-line no-extend-native
    (Object.prototype as unknown as Record<string, unknown>).__iaiPolluted = "sk-abcdefgh12345678";
    try {
      expect(() => classify({})).not.toThrow();
      expect(classify({})).toBe("PRIVATE");
      expect(classify({ ticker: "AAPL" })).toBe("PUBLIC");
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).__iaiPolluted;
    }
  });

  test("a frozen object classifies normally", () => {
    const node = Object.freeze({ ticker: "AAPL" });
    expect(() => classify(node)).not.toThrow();
    expect(classify(node)).toBe("PUBLIC");
  });

  test("an object created with Object.create(null) classifies normally", () => {
    const node = Object.create(null) as Record<string, unknown>;
    node.ticker = "AAPL";
    expect(() => classify(node)).not.toThrow();
    expect(classify(node)).toBe("PUBLIC");
  });

  test("Symbol keys do not crash classify", () => {
    const sym = Symbol("hidden");
    const node: Record<string | symbol, unknown> = { ticker: "AAPL", [sym]: "sk-abcdefgh12345678" };
    expect(() => classify(node)).not.toThrow();
    expect(classify(node)).toBe("SECRET");
  });

  test("a Map is walked and its values classified", () => {
    const map = new Map<string, unknown>([
      ["ticker", "AAPL"],
      ["ldl", 130],
    ]);
    expect(() => classify(map)).not.toThrow();
    expect(classify(map)).toBe("PRIVATE");
  });

  test("an empty Map classifies PRIVATE", () => {
    expect(classify(new Map())).toBe("PRIVATE");
  });

  test("a Set is walked and its values classified", () => {
    const set = new Set<unknown>(["sk-abcdefgh12345678", "AAPL"]);
    expect(() => classify(set)).not.toThrow();
    expect(classify(set)).toBe("SECRET");
  });

  test("an empty Set classifies PRIVATE", () => {
    expect(classify(new Set())).toBe("PRIVATE");
  });

  test("a Date value classifies PRIVATE when unkeyed", () => {
    expect(classify(new Date())).toBe("PRIVATE");
  });

  test("classify never throws regardless of input shape", () => {
    const inputs: unknown[] = [
      NaN,
      Infinity,
      -Infinity,
      BigInt(9007199254740993),
      () => "fn",
      Symbol("bare"),
      new Proxy({}, { ownKeys: () => { throw new Error("boom"); } }),
    ];
    for (const input of inputs) {
      expect(() => classify(input)).not.toThrow();
    }
  });
});

describe("classify — value-shape secret recognition", () => {
  test("a private key PEM block lifts an unkeyed field to SECRET", () => {
    expect(
      classify({
        notes: "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJ...\n-----END RSA PRIVATE KEY-----",
      }),
    ).toBe("SECRET");
  });

  test("a GitHub token prefix lifts an unkeyed field to SECRET", () => {
    expect(classify({ notes: "ghp_1234567890abcdef1234567890abcdef1234" })).toBe("SECRET");
  });

  test("a Bearer-prefixed value lifts an unkeyed field to SECRET", () => {
    expect(classify({ notes: "Bearer eyJhbGciOiJIUzI1NiJ9.abc.def" })).toBe("SECRET");
  });
});
