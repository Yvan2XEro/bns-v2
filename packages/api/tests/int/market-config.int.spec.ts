// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
	hasPushCredential: vi.fn(async () => true),
}));
vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));

import type { MarketConfig } from "../../src/contracts/marketConfig";
import { launchCitySeedRows } from "../../src/lib/launchCities";
import { migrateP10Markets } from "../../src/migrations/p10Markets";
import { withRawMongo } from "./helpers/fakeMongo";
import {
	cmMarketRow,
	type FakePayload,
	fakePayload,
} from "./helpers/fakePayload";

const CONFIG = "../../src/app/(frontend)/api/public/config/route";
const QUOTE = "../../src/app/(frontend)/api/checkout/quote/route";
const PLACE = "../../src/app/(frontend)/api/checkout/place/route";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const BUYER_PHONE = "+237670000001";

const rwanda = (patch: Record<string, unknown> = {}) => ({
	id: "market-rw",
	countryCode: "RW",
	name: "Rwanda",
	status: "live",
	currency: { code: "RWF", minorUnit: 0, rounding: "half_up" },
	formatting: [
		{
			locale: "en",
			symbol: "RWF",
			position: "before",
			groupSeparator: ",",
			decimalSeparator: ".",
		},
	],
	phone: { pattern: "^\\+2507\\d{8}$", displayExample: "+250 7 88 00 00 00" },
	timezone: "Africa/Kigali",
	languages: ["en"],
	vatRateBps: 1800,
	payments: {
		provider: "notchpay",
		settlementMode: "provider_split",
		channels: ["rw.mtn"],
		enabled: true,
	},
	features: { cod: true, protectedPayment: true, boosts: true },
	amounts: {
		minPayout: 1000,
		maxOrderAmount: 1_000_000,
		exposureLevel2: 500_000,
		exposureLevel3: 2_000_000,
		buyerProtectionMin: 100,
		buyerProtectionMax: 15_000,
		defaultDeliveryFeeFallback: 1500,
	},
	moneyCalendar: {
		releaseHourLocal: 10,
		reconcileHourLocal: 2,
		vatPeriod: "calendar_month",
	},
	updatedAt: "2026-10-09T10:00:00.000Z",
	...patch,
});

const kigali = {
	id: "rw:kigali",
	market: "market-rw",
	key: "kigali",
	label: "Kigali",
	defaultDeliveryFee: 1200,
	districts: [{ slug: "nyarugenge", label: "Nyarugenge" }],
	active: true,
	sortOrder: 0,
};

async function world(
	options: {
		extraMarkets?: object[];
		cities?: object[];
		migrate?: boolean;
	} = {},
) {
	const payload = withRawMongo(
		fakePayload(
			{
				users: [
					{
						id: "u-buyer",
						name: "Buyer",
						phone: BUYER_PHONE,
						phoneVerifiedAt: NOW.toISOString(),
						suspendedAt: null,
						suspendedUntil: null,
					},
					{ id: "u-owner", name: "Owner" },
				],
				shops: [
					{
						id: "s-1",
						name: "Chez Awa",
						handle: "chez-awa",
						owner: "u-owner",
						status: "active",
						level: 1,
						levelExpiresAt: null,
						ordersRestrictedAt: null,
						location: { city: "douala" },
						contact: { phone: "+237690000000" },
						orderSettings: {
							codEnabled: true,
							sellerDeliveryEnabled: true,
							deliveryFee: null,
							deliveryEtaText: "24-48h",
							pickupEnabled: false,
							salesTermsExtra: null,
						},
					},
				],
				products: [
					{
						id: "p-1",
						shop: "s-1",
						title: "AirPods",
						status: "active",
						delivery: { codAllowed: true },
						returnPolicy: "30 jours",
					},
				],
				listings: [
					{
						id: "l-1",
						title: "AirPods Pro",
						status: "published",
						shop: "s-1",
						product: "p-1",
						condition: "new",
						category: "cat-1",
					},
				],
				"product-variants": [
					{
						id: "v-1",
						product: "p-1",
						shop: "s-1",
						sku: "AP-1",
						price: 10_000,
						trackInventory: true,
						stockOnHand: 5,
						stockReserved: 0,
						archivedAt: null,
					},
				],
				categories: [{ id: "cat-1", name: "Audio" }],
				"shop-members": [
					{
						id: "sm-1",
						shop: "s-1",
						user: "u-owner",
						status: "active",
						role: "owner",
					},
				],
				carts: [
					{
						id: "c-1",
						user: "u-buyer",
						status: "active",
						items: [
							{
								id: "i-1",
								listing: "l-1",
								product: "p-1",
								variant: "v-1",
								shop: "s-1",
								quantity: 1,
								priceAtAdd: 10_000,
								addedAt: NOW.toISOString(),
							},
						],
					},
				],
				orders: [],
				"order-items": [],
				"order-events": [],
				"stock-movements": [],
				sequences: [],
				"buyer-phone-scores": [],
				markets: options.extraMarkets ?? [],
				"market-cities": options.cities ?? [],
			},
			{
				uniques: {
					carts: [["user", "status"]],
					orders: [["buyer", "idempotencyKey"]],
				},
				globals: {
					"app-settings": {
						orders: {
							enabled: true,
							termsVersion: "2026-09",
							launchCities: [
								{ key: "douala", deliveryFee: 2000 },
								{ key: "yaounde", deliveryFee: 3500 },
							],
						},
						company: {
							legalName: "BuyNSellem SARL",
							supportEmail: "support@buynsellem.com",
							supportPhone: "+237600000000",
						},
					},
				},
				secret: "test-payload-secret",
			},
		),
	);
	// The migration empties orders.launchCities; the placement path still reads them.
	if (options.migrate !== false) await migrateP10Markets(payload);
	getPayloadMock.mockResolvedValue(payload);
	return payload;
}

async function config(query = ""): Promise<Record<string, unknown>> {
	const { GET } = await import(CONFIG);
	return (
		await GET(new Request(`http://api.test/api/public/config${query}`))
	).json();
}

beforeEach(() => {
	getPayloadMock.mockReset();
	vi.stubEnv("ORDER_PHONE_PEPPER", "test-pepper");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("GET /api/public/config market block", () => {
	it("serves the CM market whole, from the rows", async () => {
		await world();
		const body = await config("?country=CM");
		const cm = launchCitySeedRows("market-cm");
		expect(body.market).toEqual({
			countryCode: "CM",
			name: "Cameroon",
			currency: { code: "XAF", minorUnit: 0 },
			formats: [
				{
					locale: "fr",
					symbol: "FCFA",
					position: "after",
					groupSeparator: " ",
					decimalSeparator: ",",
					minorUnit: 0,
				},
				{
					locale: "en",
					symbol: "XAF",
					position: "before",
					groupSeparator: ",",
					decimalSeparator: ".",
					minorUnit: 0,
				},
			],
			phone: { pattern: "^\\+2376\\d{8}$", displayExample: expect.any(String) },
			cities: cm.map((row) => ({
				key: row.key,
				label: row.label,
				districts: row.districts.map((d) => ({ key: d.slug, label: d.label })),
				fee: row.defaultDeliveryFee,
			})),
			features: {
				cod: true,
				protectedPayment: false,
				deliveryZones: false,
				couriers: false,
				disputes: false,
				resale: false,
				resalePrepaid: false,
				boosts: false,
			},
			languages: ["fr", "en"],
		} satisfies MarketConfig);
		const { cities } = body.market as MarketConfig;
		expect(cities).toHaveLength(2);
		expect(cities.flatMap((c) => c.districts)).toHaveLength(40);
	});

	it("refuses to guess: an unknown country has no block and every ordering flag off", async () => {
		await world();
		const body = await config("?country=XX");
		expect(body).not.toHaveProperty("market");
		expect(body).toMatchObject({
			ordersEnabled: false,
			protectedPaymentEnabled: false,
			disputesEnabled: false,
			deliveryZonesEnabled: false,
			couriersEnabled: false,
			intercityEnabled: false,
			resaleEnabled: false,
			resalePrepaidEnabled: false,
			launchCities: [],
		});
	});

	it("treats a market in review exactly as unknown", async () => {
		await world({
			extraMarkets: [rwanda({ status: "review" })],
			cities: [kigali],
		});
		const review = await config("?country=RW");
		expect(review).not.toHaveProperty("market");
		expect(review.ordersEnabled).toBe(false);
		expect(review).toEqual(await config("?country=XX"));
	});

	it("keeps the legacy flat shape for CM and for a caller with no country", async () => {
		await world();
		const flat = await config();
		expect(flat).not.toHaveProperty("market");
		expect(flat).toMatchObject({
			ordersEnabled: true,
			launchCities: [
				{ key: "douala", label: "Douala", fee: 2000 },
				{ key: "yaounde", label: "Yaoundé", fee: 3500 },
			],
		});
		const { market: _market, ...withCountry } = await config("?country=CM");
		expect(withCountry).toEqual(flat);
	});

	it("serves a second live market its own rows and nothing of CM", async () => {
		await world({ extraMarkets: [rwanda()], cities: [kigali] });
		const body = (await config("?country=rw")).market as MarketConfig;
		expect(body.currency).toEqual({ code: "RWF", minorUnit: 0 });
		expect(body.cities).toEqual([
			{
				key: "kigali",
				label: "Kigali",
				districts: [{ key: "nyarugenge", label: "Nyarugenge" }],
				fee: 1200,
			},
		]);
		expect(body.features.cod).toBe(true);
	});
});

describe("a spoofed ?country= changes what is shown, never what is charged", () => {
	const address = {
		recipientName: "Jean Mballa",
		phone: BUYER_PHONE,
		city: "douala",
		district: "douala.akwa",
		landmark: "Pres de la pharmacie du carrefour",
		instructions: "Appeler avant livraison",
	};
	const post = (url: string, body: unknown) =>
		new Request(url, {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "content-type": "application/json" },
		});

	async function run(query: string) {
		const payload: FakePayload = await world({
			extraMarkets: [rwanda(), cmMarketRow()],
			cities: [kigali, ...launchCitySeedRows("market-cm")],
			migrate: false,
		});
		payload.auth.mockResolvedValue({ user: { id: "u-buyer", role: "user" } });
		const draft = {
			address,
			deliveryOptionId: "seller_delivery:douala",
			paymentMethod: "cod",
			locale: "fr",
		};
		const { POST: quote } = await import(QUOTE);
		const quoted = await quote(
			post(`http://api.test/api/checkout/quote${query}`, draft),
		);
		expect(quoted.status).toBe(200);
		const { POST: place } = await import(PLACE);
		const placed = await place(
			post(`http://api.test/api/checkout/place${query}`, {
				...draft,
				quoteHash: (await quoted.clone().json()).quoteHash,
				termsAccepted: true,
				idempotencyKey: "idem-spoof",
			}),
		);
		expect(placed.status).toBe(200);
		const order = payload.store.orders[0] as Record<string, unknown> & {
			amounts: Record<string, unknown>;
			market?: unknown;
		};
		return { quote: await quoted.json(), order };
	}

	it("places the same CM order with the same amounts", async () => {
		const plain = await run("");
		const spoofed = await run("?country=RW");
		expect(spoofed.order.amounts.currency).toBe("XAF");
		expect(spoofed.order.amounts).toEqual(plain.order.amounts);
		expect(spoofed.quote).toEqual(plain.quote);
		expect(plain.order.market).toBe("market-cm");
		expect(spoofed.order.market).toBe("market-cm");
	});
});
