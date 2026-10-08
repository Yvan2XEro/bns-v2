// @vitest-environment node
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.hoisted(() => vi.fn());
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => {
	const actual = await importOriginal<typeof import("payload")>();
	return { ...actual, getPayload: getPayloadMock };
});

import {
	DEFAULT_MARKETS,
	PAYMENT_DEFAULTS,
	type PaymentSettings,
} from "../../src/lib/paymentSettings";
import { FakeMarketplaceProvider } from "../../src/lib/payments/fakeMarketplace";
import {
	adapterPresenceRefusal,
	getMarketplaceProvider,
	sharedFakeMarketplace,
} from "../../src/lib/payments/marketplaceRegistry";
import { NotchPayMarketplaceProvider } from "../../src/lib/payments/notchpayMarketplace";
import {
	notchpayConfigured,
	registerConfiguredAdapters,
} from "../../src/lib/payments/registerAdapters";

const KEYS = {
	NOTCHPAY_PUBLIC_KEY: "pk_reg",
	NOTCHPAY_PRIVATE_KEY: "sk_reg",
	NOTCHPAY_HASH_KEY: "hash_reg",
};
const settings: PaymentSettings = {
	...PAYMENT_DEFAULTS,
	markets: DEFAULT_MARKETS.map((m) => ({ ...m })),
};
const enabling = {
	protectedPayment: { enabled: true },
	markets: [{ provider: "notchpay", enabled: true }],
};

let savedEnv: NodeJS.ProcessEnv;
let undo: (() => void) | undefined;
beforeEach(() => {
	savedEnv = { ...process.env };
	setEnv({
		NOTCHPAY_PUBLIC_KEY: undefined,
		NOTCHPAY_PRIVATE_KEY: undefined,
		NOTCHPAY_HASH_KEY: undefined,
		NOTCHPAY_BASE_URL: undefined,
		PAYMENTS_PROVIDER: undefined,
	});
});
afterEach(() => {
	undo?.();
	undo = undefined;
	process.env = savedEnv;
});

function setEnv(values: Record<string, string | undefined>) {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

const REFUSAL = /no payment adapter is registered for "notchpay"/;

describe("registerConfiguredAdapters", () => {
	it("registers nothing while a key is missing, so the presence refusal stands", () => {
		for (const missing of Object.keys(KEYS)) {
			const partial = { ...KEYS, [missing]: undefined };
			setEnv({ ...partial, NODE_ENV: "production" });
			expect(notchpayConfigured()).toBe(false);
			undo = registerConfiguredAdapters();
			expect(
				adapterPresenceRefusal(enabling, { NODE_ENV: "production" }),
			).toMatch(REFUSAL);
			undo();
			undo = undefined;
		}
	});

	it("serves the NotchPay adapter in production, memoised, and stops refusing", () => {
		setEnv({ ...KEYS, NODE_ENV: "production" });
		expect(adapterPresenceRefusal(enabling, process.env)).toMatch(REFUSAL);
		undo = registerConfiguredAdapters();
		expect(adapterPresenceRefusal(enabling, process.env)).toBeNull();
		const provider = getMarketplaceProvider(settings);
		expect(provider).toBeInstanceOf(NotchPayMarketplaceProvider);
		expect(provider.id).toBe("notchpay");
		expect(getMarketplaceProvider(settings)).toBe(provider);
		expect(getMarketplaceProvider(settings, { countryCode: "CM" })).toBe(
			provider,
		);
	});

	it("builds a new instance when the keys change", () => {
		setEnv({ ...KEYS, NODE_ENV: "production" });
		undo = registerConfiguredAdapters();
		const first = getMarketplaceProvider(settings);
		const rotated = getMarketplaceProvider(settings, {
			env: { ...process.env, NOTCHPAY_HASH_KEY: "rotated" },
		});
		expect(rotated).not.toBe(first);
	});

	it("keeps the fake outside production and under PAYMENTS_PROVIDER=fake", () => {
		undo = registerConfiguredAdapters({ ...KEYS });
		setEnv({ ...KEYS, NODE_ENV: "development" });
		expect(getMarketplaceProvider(settings)).toBeInstanceOf(
			FakeMarketplaceProvider,
		);
		expect(getMarketplaceProvider(settings)).toBe(sharedFakeMarketplace());
		setEnv({ NODE_ENV: "production", PAYMENTS_PROVIDER: "fake" });
		expect(getMarketplaceProvider(settings)).toBe(sharedFakeMarketplace());
	});

	it("refuses again once undone", () => {
		setEnv({ ...KEYS, NODE_ENV: "production" });
		registerConfiguredAdapters()();
		expect(adapterPresenceRefusal(enabling, process.env)).toMatch(REFUSAL);
		expect(() => getMarketplaceProvider(settings)).toThrow();
	});

	it("fails closed with a 503 when the runtime env lost a key", () => {
		setEnv({ ...KEYS, NODE_ENV: "production" });
		undo = registerConfiguredAdapters();
		expect(() =>
			getMarketplaceProvider(settings, {
				env: { NODE_ENV: "production", NOTCHPAY_PUBLIC_KEY: "pk_reg" },
			}),
		).toThrow(expect.objectContaining({ status: 503 }));
	});
});

describe("the marketplace webhook route reaches the registered adapter", () => {
	let post: (request: Request) => Promise<Response>;
	beforeAll(async () => {
		({ POST: post } = await import(
			"../../src/app/(frontend)/api/public/payments/webhook/notchpay/route"
		));
	}, 60_000);

	const body = JSON.stringify({
		id: "evt_reg_succeeded",
		type: "payment.succeeded",
		data: {
			merchant_reference: "PI-reg",
			reference: "trx.reg",
			amount: 5000,
			currency: "XAF",
			fee: 100,
			destination: { account: "acct_reg" },
		},
	});
	const sign = (key: string, raw = body) =>
		createHmac("sha256", key).update(raw).digest("hex");
	const request = (signature: string, raw = body) =>
		new Request("http://localhost/api/public/payments/webhook/notchpay", {
			method: "POST",
			headers: { "x-notch-signature": signature },
			body: raw,
		});

	let payload: ReturnType<typeof fakePayload>;
	beforeEach(() => {
		setEnv({ ...KEYS, NODE_ENV: "production" });
		undo = registerConfiguredAdapters();
		payload = fakePayload(
			{},
			{
				globals: { "app-settings": { payments: {} } },
				uniques: { "webhook-events": [["provider", "providerEventId"]] },
			},
		);
		getPayloadMock.mockResolvedValue(payload);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});
	afterEach(() => vi.restoreAllMocks());

	it("stores a correctly signed event under provider notchpay", async () => {
		const response = await post(request(sign(KEYS.NOTCHPAY_HASH_KEY)));
		expect(response.status).toBe(200);
		const stored = payload.store["webhook-events"] ?? [];
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({ provider: "notchpay" });
	});

	it("answers 400 to a tampered event and stores nothing", async () => {
		const tampered = body.replace("5000", "9000");
		const response = await post(
			request(sign(KEYS.NOTCHPAY_HASH_KEY), tampered),
		);
		expect(response.status).toBe(400);
		expect(payload.store["webhook-events"] ?? []).toHaveLength(0);
	});
});

describe("the bootstrap", () => {
	it("payload.config calls registerConfiguredAdapters at load, outside any function", () => {
		const source = readFileSync(
			fileURLToPath(new URL("../../src/payload.config.ts", import.meta.url)),
			"utf8",
		);
		expect(source).toMatch(/^registerConfiguredAdapters\(\);$/m);
	});
});

describe("single importer", () => {
	it("only registerAdapters imports the NotchPay marketplace adapter", () => {
		const root = fileURLToPath(new URL("../../src", import.meta.url));
		const importers = readdirSync(root, { recursive: true })
			.map((entry) => String(entry).replaceAll("\\", "/"))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) =>
				/from\s+["'][./]+(?:[\w/]*\/)?notchpayMarketplace["']/.test(
					readFileSync(`${root}/${file}`, "utf8"),
				),
			)
			.sort();
		expect(importers).toEqual(["lib/payments/registerAdapters.ts"]);
	});
});
