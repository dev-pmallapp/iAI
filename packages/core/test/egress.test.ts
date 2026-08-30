import { describe, expect, test } from "bun:test";
import { CONSENT_WITHHELD, checkEgress, type Destination, type EgressConsent } from "../src/guards/egress";

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

describe("checkEgress — case 6 (P0, CLAIM-15.4): PRIVATE to cloud with opt-in allows and de-identifies", () => {
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

  test("action is allow and redacted is present", () => {
    const result = checkEgress(payload, CLOUD, CONSENT_GRANTED);
    expect(result.action).toBe("allow");
    expect((result as { redacted?: unknown }).redacted).toBeDefined();
  });

  test("the raw record is absent from the redacted projection", () => {
    const result = checkEgress(payload, CLOUD, CONSENT_GRANTED);
    const redacted = (result as { redacted?: unknown }).redacted;
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
});

describe("checkEgress — case 9 (P0, CLAIM-15.4): PRIVATE to cloud with no opt-in blocks", () => {
  test("action is block and the message names the required reroute", () => {
    const result = checkEgress(PRIVATE_PAYLOAD, CLOUD, CONSENT_WITHHELD);
    expect(result.action).toBe("block");
    expect(result.message.toLowerCase()).toContain("on-device");
  });

  test("blocks even when consent is omitted entirely", () => {
    const result = checkEgress(PRIVATE_PAYLOAD, CLOUD);
    expect(result.action).toBe("block");
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

  test("a PRIVATE allow to cloud with opt-in redacts every sentinel field value out of the projection", () => {
    const result = checkEgress(privatePayload, CLOUD, CONSENT_GRANTED);
    expect(result.action).toBe("allow");
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

describe("checkEgress — the twelve-cell policy matrix, every branch documented and driven from one table", () => {
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
    { dataClass: "PRIVATE", payload: PRIVATE_PAYLOAD, destination: CLOUD, consent: CONSENT_GRANTED, expected: "allow", expectRedacted: true },

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
