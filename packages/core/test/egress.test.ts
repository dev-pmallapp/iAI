import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONSENT_WITHHELD, checkEgress, type Destination, type EgressConsent } from "../src/guards/egress";
import { deidentifyPrivatePayload } from "../src/guards/index";

const ON_DEVICE: Destination = { vendor: "local", locality: "on-device" };
const CLOUD: Destination = { vendor: "anthropic", locality: "cloud" };
const CONSENT_GRANTED: EgressConsent = { granted: true };

const PUBLIC_PAYLOAD = { ticker: "AAPL", broker: "Schwab", doi: "10.1000/xyz" };
const INTERNAL_PAYLOAD = { design_doc: "docs/design/09-security.md", issue_title: "egress guard" };
const PRIVATE_PAYLOAD = { ldl: 130, account_balance: 1200 };
const SECRET_PAYLOAD = { api_key: "sk-abcdefgh12345678" };

describe("checkEgress — case 3 (P1, NEVER-15.7): PUBLIC allows against all three destination conditions", () => {
  test("on-device, cloud withheld and cloud granted all allow, none carries redacted, none warns", () => {
    const results = [
      checkEgress(PUBLIC_PAYLOAD, ON_DEVICE),
      checkEgress(PUBLIC_PAYLOAD, CLOUD, CONSENT_WITHHELD),
      checkEgress(PUBLIC_PAYLOAD, CLOUD, CONSENT_GRANTED),
    ];

    for (const result of results) {
      expect(result.action).toBe("allow");
      expect((result as { redacted?: unknown }).redacted).toBeUndefined();
      expect(result.action).not.toBe("warn");
    }
  });
});

describe("checkEgress — case 4 (P1, NEVER-15.7): INTERNAL allows against all three destination conditions", () => {
  test("on-device, cloud withheld and cloud granted all allow, none warns", () => {
    const results = [
      checkEgress(INTERNAL_PAYLOAD, ON_DEVICE),
      checkEgress(INTERNAL_PAYLOAD, CLOUD, CONSENT_WITHHELD),
      checkEgress(INTERNAL_PAYLOAD, CLOUD, CONSENT_GRANTED),
    ];

    for (const result of results) {
      expect(result.action).toBe("allow");
      expect(result.action).not.toBe("warn");
    }
  });
});

describe("checkEgress — case 5 (P1, NEVER-15.7): PRIVATE on-device allows the raw record", () => {
  test("action is allow and the payload passes through unredacted", () => {
    const result = checkEgress(PRIVATE_PAYLOAD, ON_DEVICE);
    expect(result.action).toBe("allow");
    expect((result as { redacted?: unknown }).redacted).toBeUndefined();
  });
});

// Was "case 6 (P0, CLAIM-15.4): PRIVATE to cloud with opt-in allows and
// de-identifies" under S1.2. #243 removed that cell: this is now the single
// behavioural change the Story makes, so the assertion flips from allow to
// block. The detailed shape assertions this test used to make about the
// redacted projection now live under case 8 below, exercised directly
// against `deidentifyPrivatePayload` rather than through `checkEgress` —
// there is no longer any path from this guard to that projection.
describe("checkEgress — case 3 (P0, CLAIM-243.2): PRIVATE to cloud blocks with consent granted (the changed cell)", () => {
  const payload = {
    account_number: "4147 2093 8871 3009",
    balance: 184209.44,
    ldl: 130,
    mrn: "MRN-SENTINEL-99",
    patient_name: "Jane Sentinel Doe",
  };

  test("action is block, not allow, even though consent is granted", () => {
    const result = checkEgress(payload, CLOUD, CONSENT_GRANTED);
    expect(result.action).toBe("block");
  });

  test("the block carries no redacted continuation", () => {
    const result = checkEgress(payload, CLOUD, CONSENT_GRANTED);
    expect("redacted" in result).toBe(false);
  });

  test("the block message names the required reroute to a local model, and names no specific model", () => {
    const result = checkEgress(payload, CLOUD, CONSENT_GRANTED);
    expect(result.message.toLowerCase()).toContain("local model");
    expect(result.message.toLowerCase()).toContain("on-device");
    // No model is named anywhere in the repo (Decision 3 of
    // docs/design/stories/243.md; the absence is a blocking dependency on
    // M5, tracked as #247). These are the vendor/model names in circulation
    // elsewhere in the design tree; none may appear in this message.
    for (const name of ["gpt", "claude", "gemini", "llama", "mistral", "phi-3", "qwen"]) {
      expect(result.message.toLowerCase()).not.toContain(name);
    }
  });

  test("no raw field value from the payload appears anywhere in the decision", () => {
    const serialised = JSON.stringify(checkEgress(payload, CLOUD, CONSENT_GRANTED));
    expect(serialised).not.toContain("4147 2093 8871 3009");
    expect(serialised).not.toContain("184209.44");
    expect(serialised).not.toContain("MRN-SENTINEL-99");
    expect(serialised).not.toContain("Jane Sentinel Doe");
  });
});

describe("checkEgress — case 4 (P0, CLAIM-243.2): PRIVATE to cloud blocks with consent withheld and omitted", () => {
  test("action is block with consent explicitly withheld, and the message names the required reroute", () => {
    const result = checkEgress(PRIVATE_PAYLOAD, CLOUD, CONSENT_WITHHELD);
    expect(result.action).toBe("block");
    expect(result.message.toLowerCase()).toContain("on-device");
  });

  test("action is block when consent is omitted entirely", () => {
    const result = checkEgress(PRIVATE_PAYLOAD, CLOUD);
    expect(result.action).toBe("block");
  });

  test("withheld and omitted produce the identical decision", () => {
    const withheld = checkEgress(PRIVATE_PAYLOAD, CLOUD, CONSENT_WITHHELD);
    const omitted = checkEgress(PRIVATE_PAYLOAD, CLOUD);
    expect(omitted).toEqual(withheld);
  });
});

describe("checkEgress — case 10 (P0, CLAIM-15.3): SECRET blocks against on-device", () => {
  test("action is block", () => {
    const result = checkEgress(SECRET_PAYLOAD, ON_DEVICE);
    expect(result.action).toBe("block");
  });

  test("locality is shown inert: the on-device and cloud results are identical in action", () => {
    const onDeviceResult = checkEgress(SECRET_PAYLOAD, ON_DEVICE);
    const cloudResult = checkEgress(SECRET_PAYLOAD, CLOUD, CONSENT_GRANTED);
    expect(onDeviceResult.action).toBe(cloudResult.action);
    expect(onDeviceResult.action).toBe("block");
  });
});

describe("checkEgress — case 11 (P0, CLAIM-15.3): SECRET blocks to cloud with consent both withheld and granted", () => {
  test("2/2 block; the opt-in changes nothing", () => {
    const withheld = checkEgress(SECRET_PAYLOAD, CLOUD, CONSENT_WITHHELD);
    const granted = checkEgress(SECRET_PAYLOAD, CLOUD, CONSENT_GRANTED);
    expect(withheld.action).toBe("block");
    expect(granted.action).toBe("block");
    expect(withheld.message).toBe(granted.message);
  });
});

describe("checkEgress — case 12 (P0, CLAIM-15.3): a SECRET block carries no redacted continuation", () => {
  test("redacted is absent at runtime on every SECRET block fixture", () => {
    const fixtures: Array<[Destination, EgressConsent | undefined]> = [
      [ON_DEVICE, undefined],
      [CLOUD, CONSENT_WITHHELD],
      [CLOUD, CONSENT_GRANTED],
    ];
    for (const [destination, consent] of fixtures) {
      const result = checkEgress(SECRET_PAYLOAD, destination, consent);
      expect(result.action).toBe("block");
      expect("redacted" in result).toBe(false);
    }
  });
});

describe("checkEgress — case 26 (P0, NEVER-15.8): omitted consent behaves exactly as withheld", () => {
  const destinations: Destination[] = [ON_DEVICE, CLOUD];
  const payloads: Array<[string, unknown]> = [
    ["PUBLIC", PUBLIC_PAYLOAD],
    ["INTERNAL", INTERNAL_PAYLOAD],
    ["PRIVATE", PRIVATE_PAYLOAD],
    ["SECRET", SECRET_PAYLOAD],
  ];

  for (const [label, payload] of payloads) {
    for (const destination of destinations) {
      test(`${label} against ${destination.locality}: two-argument call deep-equals explicit withheld`, () => {
        const omitted = checkEgress(payload, destination);
        const explicit = checkEgress(payload, destination, CONSENT_WITHHELD);
        expect(omitted).toEqual(explicit);
      });
    }
  }
});

describe("checkEgress — case 27 (P0, NEVER-15.8): unrecognised locality blocks", () => {
  const hostileLocalities: unknown[] = ["", null, undefined, "CLOUD", "On-Device", "remote", "local", "  "];

  test.each(hostileLocalities.map((locality) => [locality]))(
    "locality %j blocks rather than falling through to the cloud branch",
    (locality) => {
      const destination = { vendor: "anthropic", locality } as unknown as Destination;
      const result = checkEgress(PRIVATE_PAYLOAD, destination, CONSENT_GRANTED);
      expect(result.action).toBe("block");
    },
  );
});

describe("checkEgress — case 28 (P0, NEVER-15.8): hostile Destination blocks and does not throw", () => {
  test("a null destination blocks and does not throw", () => {
    expect(() => checkEgress(PUBLIC_PAYLOAD, null as unknown as Destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, null as unknown as Destination).action).toBe("block");
  });

  test("an undefined destination blocks and does not throw", () => {
    expect(() => checkEgress(PUBLIC_PAYLOAD, undefined as unknown as Destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, undefined as unknown as Destination).action).toBe("block");
  });

  test("a null vendor blocks and does not throw", () => {
    const destination = { vendor: null, locality: "on-device" } as unknown as Destination;
    expect(() => checkEgress(PUBLIC_PAYLOAD, destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, destination).action).toBe("block");
  });

  test("a missing vendor blocks and does not throw", () => {
    const destination = { locality: "on-device" } as unknown as Destination;
    expect(() => checkEgress(PUBLIC_PAYLOAD, destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, destination).action).toBe("block");
  });

  test("a prototype-polluted destination (own properties absent, inherited only) blocks and does not throw", () => {
    const proto = { vendor: "anthropic", locality: "on-device" };
    const destination = Object.create(proto) as Destination;
    expect(() => checkEgress(PUBLIC_PAYLOAD, destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, destination).action).toBe("block");
  });

  test("a destination whose locality getter throws blocks and does not throw", () => {
    const destination = {} as Destination;
    Object.defineProperty(destination, "locality", {
      enumerable: true,
      get(): string {
        throw new Error("boom");
      },
    });
    Object.defineProperty(destination, "vendor", { value: "anthropic", enumerable: true });
    expect(() => checkEgress(PUBLIC_PAYLOAD, destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, destination).action).toBe("block");
  });

  test("a destination whose vendor getter throws blocks and does not throw", () => {
    const destination = { locality: "on-device" } as Destination;
    Object.defineProperty(destination, "vendor", {
      enumerable: true,
      get(): string {
        throw new Error("boom");
      },
    });
    expect(() => checkEgress(PUBLIC_PAYLOAD, destination)).not.toThrow();
    expect(checkEgress(PUBLIC_PAYLOAD, destination).action).toBe("block");
  });

  test("no fixture in this case ever escapes as allow", () => {
    const destinations = [
      null,
      undefined,
      { vendor: null, locality: "on-device" },
      { locality: "cloud" },
      Object.create({ vendor: "x", locality: "cloud" }),
    ];
    for (const destination of destinations) {
      const result = checkEgress(PUBLIC_PAYLOAD, destination as unknown as Destination, CONSENT_GRANTED);
      expect(result.action).toBe("block");
    }
  });
});

describe("checkEgress — case 29 (P0, NEVER-15.9): no raw PRIVATE/SECRET value leaks, block paths included", () => {
  const SENTINEL_KEY = "sk-SENTINEL-ABC123abcdefgh";
  const SENTINEL_MRN = "MRN-SENTINEL-99";
  const SENTINEL_ACCOUNT = "4147-2093-8871-SENTINEL7009";
  const SENTINEL_BALANCE = "184209.445127";
  const SENTINEL_NAME = "Sentinel Q. Doe";

  const secretPayload = { api_key: SENTINEL_KEY, notes: "context" };
  const privatePayload = {
    account_number: SENTINEL_ACCOUNT,
    balance: 184209.445127,
    mrn: SENTINEL_MRN,
    patient_name: SENTINEL_NAME,
  };

  function serialiseDecision(result: unknown): string {
    return JSON.stringify(result);
  }

  test("a SECRET block, across every destination and consent state, never names the sentinel key", () => {
    const fixtures: Array<[Destination, EgressConsent | undefined]> = [
      [ON_DEVICE, undefined],
      [CLOUD, CONSENT_WITHHELD],
      [CLOUD, CONSENT_GRANTED],
    ];
    for (const [destination, consent] of fixtures) {
      const result = checkEgress(secretPayload, destination, consent);
      const serialised = serialiseDecision(result);
      expect(serialised).not.toContain(SENTINEL_KEY);
      expect(serialised).not.toContain("sk-SENTINEL");
    }
  });

  test("a PRIVATE block to cloud with no opt-in never names any sentinel field value", () => {
    const result = checkEgress(privatePayload, CLOUD, CONSENT_WITHHELD);
    expect(result.action).toBe("block");
    const serialised = serialiseDecision(result);
    expect(serialised).not.toContain(SENTINEL_ACCOUNT);
    expect(serialised).not.toContain(SENTINEL_MRN);
    expect(serialised).not.toContain(SENTINEL_NAME);
    expect(serialised).not.toContain(SENTINEL_BALANCE);
  });

  // Was "a PRIVATE allow to cloud with opt-in redacts every sentinel field
  // value out of the projection" under S1.2 (CLAIM-15.4). Post-#243 this
  // cell is a block, so there is no projection to check here at all — the
  // relevant assertion is simply that the block itself names no sentinel
  // value, same as the withheld case above.
  test("a PRIVATE block to cloud with opt-in granted never names any sentinel field value", () => {
    const result = checkEgress(privatePayload, CLOUD, CONSENT_GRANTED);
    expect(result.action).toBe("block");
    const serialised = serialiseDecision(result);
    expect(serialised).not.toContain(SENTINEL_ACCOUNT);
    expect(serialised).not.toContain(SENTINEL_MRN);
    expect(serialised).not.toContain(SENTINEL_NAME);
    expect(serialised).not.toContain(SENTINEL_BALANCE);
    expect(serialised).not.toContain("184209");
  });

  test("a PRIVATE allow on-device carries the raw record unredacted (not a leak: same-device, no egress occurred)", () => {
    const result = checkEgress(privatePayload, ON_DEVICE);
    expect(result.action).toBe("allow");
    // On-device is not an egress at all -- the record legitimately appears in
    // the returned message context here only insofar as the caller already
    // held it; the guard's own strings must still name no sentinel value.
    expect(result.message).not.toContain(SENTINEL_ACCOUNT);
    expect(result.message).not.toContain(SENTINEL_MRN);
    expect(result.message).not.toContain(SENTINEL_NAME);
  });
});

describe("checkEgress — case 5 (P0, CLAIM-243.2): the full twelve-cell matrix returns the documented action", () => {
  const MATRIX: Array<{
    dataClass: string;
    payload: unknown;
    destination: Destination;
    consent: EgressConsent | undefined;
    expected: "allow" | "block";
    expectRedacted: boolean;
  }> = [
    { dataClass: "PUBLIC", payload: PUBLIC_PAYLOAD, destination: ON_DEVICE, consent: undefined, expected: "allow", expectRedacted: false },
    { dataClass: "PUBLIC", payload: PUBLIC_PAYLOAD, destination: CLOUD, consent: CONSENT_WITHHELD, expected: "allow", expectRedacted: false },
    { dataClass: "PUBLIC", payload: PUBLIC_PAYLOAD, destination: CLOUD, consent: CONSENT_GRANTED, expected: "allow", expectRedacted: false },

    { dataClass: "INTERNAL", payload: INTERNAL_PAYLOAD, destination: ON_DEVICE, consent: undefined, expected: "allow", expectRedacted: false },
    { dataClass: "INTERNAL", payload: INTERNAL_PAYLOAD, destination: CLOUD, consent: CONSENT_WITHHELD, expected: "allow", expectRedacted: false },
    { dataClass: "INTERNAL", payload: INTERNAL_PAYLOAD, destination: CLOUD, consent: CONSENT_GRANTED, expected: "allow", expectRedacted: false },

    { dataClass: "PRIVATE", payload: PRIVATE_PAYLOAD, destination: ON_DEVICE, consent: undefined, expected: "allow", expectRedacted: false },
    { dataClass: "PRIVATE", payload: PRIVATE_PAYLOAD, destination: CLOUD, consent: CONSENT_WITHHELD, expected: "block", expectRedacted: false },
    // The changed cell (#243): was "allow", redacted, under S1.2. Every
    // other cell in this table is unchanged from CLAIM-15.3/15.4.
    { dataClass: "PRIVATE", payload: PRIVATE_PAYLOAD, destination: CLOUD, consent: CONSENT_GRANTED, expected: "block", expectRedacted: false },

    { dataClass: "SECRET", payload: SECRET_PAYLOAD, destination: ON_DEVICE, consent: undefined, expected: "block", expectRedacted: false },
    { dataClass: "SECRET", payload: SECRET_PAYLOAD, destination: CLOUD, consent: CONSENT_WITHHELD, expected: "block", expectRedacted: false },
    { dataClass: "SECRET", payload: SECRET_PAYLOAD, destination: CLOUD, consent: CONSENT_GRANTED, expected: "block", expectRedacted: false },
  ];

  expect(MATRIX.length).toBe(12);

  test.each(
    MATRIX.map((cell) => [
      `${cell.dataClass} / ${cell.destination.locality} / consent=${cell.consent?.granted ?? "omitted"}`,
      cell,
    ]),
  )("%s -> %s", (_label, cell) => {
    const { payload, destination, consent, expected, expectRedacted } = cell as (typeof MATRIX)[number];
    const result = checkEgress(payload, destination, consent);
    expect(result.action).toBe(expected);
    expect(result.action).not.toBe("warn");
    if (expectRedacted) {
      expect((result as { redacted?: unknown }).redacted).toBeDefined();
    } else if (result.action === "allow") {
      expect((result as { redacted?: unknown }).redacted).toBeUndefined();
    } else {
      expect("redacted" in result).toBe(false);
    }
  });
});

// Case 8 (P0, CLAIM-243.4): `deidentifyPrivatePayload` remains exported and
// under test. Decision 1 of docs/design/stories/243.md retains it for M5's
// locally-rendered clinician brief, which is rendered on-device and never
// egresses — so these assertions, INHERITED UNCHANGED from what used to be
// "case 6" and its addendum (S1.2, CLAIM-15.4), now call the projection
// directly rather than through `checkEgress`. There is no longer any path
// from `checkEgress` to this function at all (case 9 below proves that from
// the source); the projection's own behaviour is exactly as it was.
describe("checkEgress — case 8 (P0, CLAIM-243.4): deidentifyPrivatePayload remains exported and under test", () => {
  test("resolves as a function from the guards barrel", () => {
    expect(typeof deidentifyPrivatePayload).toBe("function");
  });

  test("de-identifies a full PRIVATE record the same way it did before #243", () => {
    const payload = {
      account_number: "4147 2093 8871 3009",
      balance: 184209.44,
      position: 300,
      ldl: 130,
      reference_range: "40-100",
      date_of_birth: "1985-03-12",
      mrn: "MRN-SENTINEL-99",
      patient_name: "Jane Sentinel Doe",
      timestamp: "2026-09-14T13:41:02Z",
      ticker: "VFVA",
      broker: "Schwab",
    };

    const redacted = deidentifyPrivatePayload(payload);
    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain("4147 2093 8871 3009");
    expect(serialised).not.toContain("184209.44");
    expect(serialised).not.toContain("MRN-SENTINEL-99");
    expect(serialised).not.toContain("Jane Sentinel Doe");
    expect(serialised).not.toContain("1985-03-12");
    expect(serialised).not.toContain("40-100");
    expect(serialised).not.toContain("130");

    expect(redacted).toMatchObject({
      account_number: { last_4: "3009" },
      balance: { magnitude: "1e5" },
      position: { magnitude: "1e2" },
      ldl: { in_range: false },
      timestamp: "2026-09-14",
      ticker: "VFVA",
      broker: "Schwab",
    });
    expect(redacted).not.toHaveProperty("date_of_birth");
    expect(redacted).not.toHaveProperty("mrn");
    expect(redacted).not.toHaveProperty("patient_name");
    expect(redacted).not.toHaveProperty("reference_range");
  });

  const redactedOf = (payload: unknown) => deidentifyPrivatePayload(payload);

  test("a biomarker with no reference range is absent, not null-valued", () => {
    expect(redactedOf({ apob: 88 })).toEqual({});
  });

  test("a biomarker with a reference range still projects", () => {
    expect(redactedOf({ apob: 88, reference_range: "40-100" })).toEqual({
      apob: { in_range: true, direction: "within" },
    });
  });

  test("an unparseable account number is absent rather than last_4 null", () => {
    expect(redactedOf({ account_number: "12" })).toEqual({});
  });

  test("an unparseable timestamp is absent rather than null", () => {
    expect(redactedOf({ timestamp: "not-a-date" })).toEqual({});
  });

  test("a non-numeric magnitude field is absent rather than magnitude unknown", () => {
    expect(redactedOf({ balance: "not-a-number" })).toEqual({});
  });

  test("no null husk survives anywhere in the projection", () => {
    const serialised = JSON.stringify(redactedOf({ apob: 88, mrn: "MRN-X", timestamp: "nope" }));
    expect(serialised).not.toContain("null");
    expect(serialised).not.toContain("unknown");
  });

  test("a container whose every leaf is dropped is itself dropped", () => {
    expect(redactedOf({ outer: { inner: { apob: 88 } } })).toEqual({});
  });

  test("dropping does not disturb fields that do project", () => {
    expect(redactedOf({ ticker: "VFVA", apob: 88, mrn: "MRN-X", balance: 5000 })).toEqual({
      ticker: "VFVA",
      balance: { magnitude: "1e3" },
    });
  });
});

describe("checkEgress — case 9 (P1, CLAIM-243.4): deidentifyPrivatePayload has no caller on any egress path", () => {
  const egressSource = readFileSync(join(import.meta.dir, "../src/guards/egress.ts"), "utf8");

  test("egress.ts does not reference deidentifyPrivatePayload anywhere, import or call", () => {
    expect(egressSource).not.toContain("deidentifyPrivatePayload");
  });

  test("egress.ts does not import from ./redact at all", () => {
    expect(egressSource).not.toMatch(/from\s+["']\.\/redact["']/);
  });
});

// Case 11 (P0, NEVER-243.6). NAMED DELIBERATELY: if you are reading this
// because you are re-enabling cloud egress for PRIVATE data and this test
// just failed, stop. Decision 2 of docs/design/stories/243.md ruled that no
// consent value may ever produce an allow here again, and NEVER-243.6 is
// what makes that ruling enforceable rather than a comment someone can miss.
// Narrowing or deleting this test is the one commit #243 exists to prevent.
describe("checkEgress — case 11 (P0, NEVER-243.6): a granted consent must never be made to allow PRIVATE egress to cloud — read this before you touch it", () => {
  test("consent: { granted: true } still blocks", () => {
    const result = checkEgress(PRIVATE_PAYLOAD, CLOUD, { granted: true });
    expect(result.action).toBe("block");
  });
});

describe("checkEgress — case 12 (P0, NEVER-243.6): no consent value in the corpus produces an allow for PRIVATE to cloud", () => {
  test("0 allows across the whole consent corpus", () => {
    const throwingGetterConsent = {} as EgressConsent;
    Object.defineProperty(throwingGetterConsent, "granted", {
      enumerable: true,
      get(): boolean {
        throw new Error("boom");
      },
    });

    const corpus: Array<[string, unknown]> = [
      ["granted", { granted: true }],
      ["withheld", CONSENT_WITHHELD],
      ["omitted", undefined],
      ["empty object", {}],
      ["null", null],
      ["undefined literal", undefined],
      ["malformed granted value", { granted: "yes" }],
      ["throwing getter", throwingGetterConsent],
    ];

    let allowCount = 0;
    for (const [, consent] of corpus) {
      const result = checkEgress(PRIVATE_PAYLOAD, CLOUD, consent as EgressConsent | undefined);
      if (result.action === "allow") allowCount += 1;
      expect(result.action).toBe("block");
    }
    expect(allowCount).toBe(0);
  });
});

// Case 13 (P0, NEVER-243.6) — THE STRONGEST FORM. Per Note 1 of
// docs/test-plans/243-plan.md: asserting that a granted consent blocks
// (case 11) only proves the one cell. Asserting DEEP EQUALITY between the
// granted-consent decision and the withheld-consent decision, across every
// class and every locality, proves consent cannot influence the decision at
// all — which is the property that makes retaining the parameter (Decision 2
// of docs/design/stories/243.md) safe. If consent is ever legitimately wired
// to something else, THIS is the test that must be consciously narrowed.
describe("checkEgress — case 13 (P0, NEVER-243.6): consent does not alter the decision for any class or locality", () => {
  const cases: Array<[string, unknown, Destination]> = [
    ["PUBLIC", PUBLIC_PAYLOAD, ON_DEVICE],
    ["PUBLIC", PUBLIC_PAYLOAD, CLOUD],
    ["INTERNAL", INTERNAL_PAYLOAD, ON_DEVICE],
    ["INTERNAL", INTERNAL_PAYLOAD, CLOUD],
    ["PRIVATE", PRIVATE_PAYLOAD, ON_DEVICE],
    ["PRIVATE", PRIVATE_PAYLOAD, CLOUD],
    ["SECRET", SECRET_PAYLOAD, ON_DEVICE],
    ["SECRET", SECRET_PAYLOAD, CLOUD],
  ];

  test.each(cases)("%s against %s: granted deep-equals withheld", (_label, payload, destination) => {
    const granted = checkEgress(payload, destination, CONSENT_GRANTED);
    const withheld = checkEgress(payload, destination, CONSENT_WITHHELD);
    expect(granted).toEqual(withheld);
  });

  test("all eight class/locality combinations pass, not merely the PRIVATE ones", () => {
    expect(cases.length).toBe(8);
    for (const [, payload, destination] of cases) {
      const granted = checkEgress(payload, destination, CONSENT_GRANTED);
      const withheld = checkEgress(payload, destination, CONSENT_WITHHELD);
      expect(granted).toEqual(withheld);
    }
  });
});

describe("checkEgress — case 14 (P0, NEVER-243.6): SECRET remains inert to consent under both localities", () => {
  test("on-device: granted deep-equals withheld", () => {
    const granted = checkEgress(SECRET_PAYLOAD, ON_DEVICE, CONSENT_GRANTED);
    const withheld = checkEgress(SECRET_PAYLOAD, ON_DEVICE, CONSENT_WITHHELD);
    expect(granted).toEqual(withheld);
    expect(granted.action).toBe("block");
  });

  test("cloud: granted deep-equals withheld", () => {
    const granted = checkEgress(SECRET_PAYLOAD, CLOUD, CONSENT_GRANTED);
    const withheld = checkEgress(SECRET_PAYLOAD, CLOUD, CONSENT_WITHHELD);
    expect(granted).toEqual(withheld);
    expect(granted.action).toBe("block");
  });

  test("locality itself is inert too: on-device and cloud produce the identical decision", () => {
    const onDevice = checkEgress(SECRET_PAYLOAD, ON_DEVICE, CONSENT_GRANTED);
    const cloud = checkEgress(SECRET_PAYLOAD, CLOUD, CONSENT_GRANTED);
    expect(onDevice).toEqual(cloud);
  });
});
