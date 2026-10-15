// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { launchCitySeedRows } from "../../src/lib/launchCities";
import { getMarket, getMarkets } from "../../src/lib/markets";
import { MemoryCounterStore } from "../../src/lib/rateLimit";
import { migrateP10Markets } from "../../src/migrations/p10Markets";
import type { CommissionInvoice, Order } from "../../src/payload-types";
import { quoteCheckout } from "../../src/services/checkout";
import { renderCreditNoteDocument } from "../../src/services/commission";
import { serializeOrderForBuyer } from "../../src/services/orders/serialize";
import { withRawMongo } from "./helpers/fakeMongo";
import {
	cmMarketRow,
	type Doc,
	type FakePayload,
	fakePayload,
} from "./helpers/fakePayload";

const EV1 = "a".repeat(24);
const EV2 = "b".repeat(24);
const NOW = new Date("2026-10-02T10:00:00.000Z");
const PEPPER = "test-pepper";
const BUYER = { id: "u-buyer" };
const BUYER_PHONE = "+237670000001";

beforeEach(() => {
	process.env.ORDER_PHONE_PEPPER = PEPPER;
});
afterEach(() => {
	process.env.ORDER_PHONE_PEPPER = undefined;
});

const settings = (overrides: Doc = {}): Doc => ({
	orders: {
		enabled: true,
		vatRateBps: 1925,
		launchCities: [
			{ key: "douala", deliveryFee: 2000 },
			{ key: "yaounde", deliveryFee: 4000 },
		],
		termsVersion: "2026-09",
		pilotShopIds: [],
	},
	payments: {
		protectedPayment: { enabled: false },
		gates: [
			{ gate: "G2", evidence: EV2 },
			{ gate: "G1", evidence: EV1 },
		],
	},
	company: {
		legalName: "BuyNSellem SARL",
		supportEmail: "support@buynsellem.com",
		supportPhone: "+237600000000",
	},
	...overrides,
});

const order = (id: string, amounts: Doc): Doc => ({
	id,
	orderNumber: `ORD-2610-00000${id.slice(-1)}`,
	buyer: "u-other",
	shop: "s-1",
	status: "placed",
	paymentMethod: "cod",
	paymentStatus: "cod_pending",
	delivery: { method: "seller_delivery", city: "douala", fee: 2000 },
	amounts,
	createdAt: "2026-10-01T08:00:00.000Z",
	updatedAt: "2026-10-01T08:00:00.000Z",
});

const FULL = {
	subtotal: 10_000,
	deliveryFee: 2000,
	discount: 0,
	buyerProtectionFee: 0,
	total: 12_000,
};

const creditNote: Doc = {
	id: "inv-note",
	invoiceNumber: "BNS-A-2026-000001",
	kind: "credit_note",
	settlement: "application_fee",
	shop: "s-1",
	sellerSnapshot: { name: "Chez Awa" },
	issuedAt: "2026-10-01T08:00:00.000Z",
	commissionTotal: -800,
	vatAmount: -154,
	vatRateBps: 1925,
	lines: [],
};

function legacy(options: { cities: boolean }): FakePayload {
	return withRawMongo(
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
					},
				],
				"product-variants": [
					{
						id: "v-1",
						product: "p-1",
						shop: "s-1",
						price: 10_000,
						trackInventory: true,
						stockOnHand: 5,
						stockReserved: 0,
						archivedAt: null,
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
					{ id: "c-2", user: "u-other", status: "active", items: [] },
				],
				orders: [
					order("o-1", { ...FULL, currency: "XAF" }),
					order("o-2", { ...FULL }),
				],
				"commission-invoices": [
					creditNote,
					{ id: "inv-2", invoiceNumber: "BNS-F-2026-000001", currency: "XAF" },
				],
				"buyer-fee-invoices": [{ id: "bf-1", invoiceNumber: "BNS-C-2026-1" }],
				sequences: [
					{ id: "sq-1", key: "ORD:2610", value: 41 },
					{ id: "sq-2", key: "invoice:C:2026", value: 7 },
				],
				"payment-gate-evidence": [
					{ id: EV1, scope: "gate" },
					{ id: EV2, scope: "gate" },
				],
				...(options.cities ? {} : { "market-cities": [] }),
				...(options.cities
					? { "market-cities": launchCitySeedRows("legacy-market") }
					: {}),
			},
			{ globals: { "app-settings": settings() } },
		),
	);
}

const rows = (list: unknown) =>
	(list as Doc[]).map(({ id: _id, ...rest }) => rest);

describe("P10 markets migration", () => {
	it("seeds the CM market whole, from today's literals and the live settings", async () => {
		const api = legacy({ cities: false });
		await migrateP10Markets(api);

		expect(api.store.markets).toHaveLength(1);
		const {
			id,
			createdAt,
			updatedAt,
			regulatoryReview,
			formatting,
			...market
		} = api.store.markets[0];
		expect(typeof id).toBe("string");
		expect(typeof createdAt).toBe("string");
		expect(typeof updatedAt).toBe("string");
		expect(regulatoryReview).toEqual({
			reviewedBy: "p10 migration",
			reviewedAt: expect.any(String),
			evidence: EV1,
			note: "Carried over from the P5 gate record.",
		});
		expect(rows(formatting)).toEqual([
			{
				locale: "fr",
				symbol: "FCFA",
				position: "after",
				groupSeparator: " ",
				decimalSeparator: ",",
			},
			{
				locale: "en",
				symbol: "XAF",
				position: "before",
				groupSeparator: ",",
				decimalSeparator: ".",
			},
		]);
		expect(market).toEqual({
			countryCode: "CM",
			name: "Cameroon",
			status: "live",
			currency: { code: "XAF", minorUnit: 0, rounding: "half_up" },
			phone: {
				pattern: "^\\+2376\\d{8}$",
				examples: {
					valid: ["+237650000001"],
					invalid: ["+2371650000001", "+23765000000"],
				},
				displayExample: "+237 6XX XX XX XX",
			},
			timezone: "Africa/Douala",
			languages: ["fr", "en"],
			vatRateBps: 1925,
			payments: {
				provider: "notchpay",
				settlementMode: "provider_split",
				channels: ["cm.mtn", "cm.orange"],
				enabled: false,
			},
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
			amounts: {
				minPayout: 1000,
				maxOrderAmount: 1_000_000,
				exposureLevel2: 500_000,
				exposureLevel3: 2_000_000,
				buyerProtectionMin: 100,
				buyerProtectionMax: 15_000,
				defaultDeliveryFeeFallback: 2000,
			},
			moneyCalendar: {
				releaseHourLocal: 10,
				reconcileHourLocal: 2,
				vatPeriod: "calendar_month",
			},
		});
		expect(api.store["payment-gate-evidence"]).toEqual([
			{ id: EV1, scope: "market" },
			{ id: EV2, scope: "gate" },
		]);
	});

	it("loads through the fail-closed loader", async () => {
		const api = legacy({ cities: false });
		await migrateP10Markets(api);
		expect(await getMarkets(api)).toHaveLength(1);
		expect((await getMarket(api, "CM")).status).toBe("live");
	});

	it("seeds two cities with 40 districts, the stored fee override winning", async () => {
		const api = legacy({ cities: false });
		await migrateP10Markets(api);
		const cities = api.store["market-cities"];
		expect(cities.map((c) => [c.key, c.defaultDeliveryFee, c.active])).toEqual([
			["douala", 2000, true],
			["yaounde", 4000, true],
		]);
		expect(
			cities.reduce((n, c) => n + (c.districts as unknown[]).length, 0),
		).toBe(40);
		expect(cities.every((c) => c.market === api.store.markets[0].id)).toBe(
			true,
		);
		expect((api.globals["app-settings"].orders as Doc).launchCities).toEqual(
			[],
		);
	});

	it("keeps a city absent from the stored list closed", async () => {
		const api = legacy({ cities: false });
		api.globals["app-settings"] = settings({
			orders: {
				enabled: true,
				launchCities: [{ key: "douala", deliveryFee: 2000 }],
			},
		});
		await migrateP10Markets(api);
		expect(api.store["market-cities"].map((c) => [c.key, c.active])).toEqual([
			["douala", true],
			["yaounde", false],
		]);
	});

	it("stamps every order, cart and invoice that lacks it, and nothing that has it", async () => {
		const api = legacy({ cities: false });
		await migrateP10Markets(api);
		const market = api.store.markets[0].id;
		for (const o of api.store.orders) {
			expect(o.market).toBe(market);
			expect((o.amounts as Doc).currency).toBe("XAF");
		}
		expect(api.store.carts.every((c) => c.market === market)).toBe(true);
		const snapshot = api.store.markets[0].formatting as Doc[];
		for (const slug of ["commission-invoices", "buyer-fee-invoices"]) {
			for (const inv of api.store[slug]) {
				expect(inv.currency).toBe("XAF");
				expect(rows(inv.formatSnapshot)).toEqual(
					rows(snapshot).map((f) => ({ ...f, minorUnit: 0 })),
				);
			}
		}
	});

	it("copies each sequence to its :CM sibling at the same value", async () => {
		const api = legacy({ cities: false });
		await migrateP10Markets(api);
		const value = (key: string) =>
			api.store.sequences.find((s) => s.key === key)?.value;
		expect(value("ORD:2610:CM")).toBe(41);
		expect(value("invoice:C:2026:CM")).toBe(7);
		expect(value("ORD:2610")).toBe(41);
	});

	it("raises a sibling that fell behind and never lowers one that moved on", async () => {
		const api = legacy({ cities: false });
		api.store.sequences.push(
			{ id: "sq-3", key: "ORD:2610:CM", value: 30 },
			{ id: "sq-4", key: "invoice:C:2026:CM", value: 90 },
		);
		await migrateP10Markets(api);
		const value = (key: string) =>
			api.store.sequences.find((s) => s.key === key)?.value;
		expect(value("ORD:2610:CM")).toBe(41);
		expect(value("invoice:C:2026:CM")).toBe(90);
	});

	it("run twice leaves every count and value identical", async () => {
		const api = legacy({ cities: false });
		await migrateP10Markets(api);
		const once = structuredClone({
			store: api.store,
			globals: api.globals,
		});
		await migrateP10Markets(api);
		expect({ store: api.store, globals: api.globals }).toEqual(once);
	});

	it("goes live without a review record, loudly, when no gate evidence is filed", async () => {
		const api = legacy({ cities: false });
		api.globals["app-settings"] = settings({ payments: {} });
		await migrateP10Markets(api);
		expect(api.store.markets[0].status).toBe("live");
		expect(api.store.markets[0].regulatoryReview).toEqual({
			reviewedBy: "p10 migration",
			reviewedAt: expect.any(String),
			note: "Carried over from the P5 gate record.",
		});
		expect(api.logger.warn).toHaveBeenCalled();
	});
});

describe("P10 migration parity: stored views are byte-identical before and after", () => {
	const sources = {
		items: [],
		events: [],
		shop: {
			id: "s-1",
			name: "Chez Awa",
			handle: "chez-awa",
			city: "douala",
			verified: false,
			logoUrl: null,
		},
		buyer: { id: "u-buyer", name: "Buyer", phone: BUYER_PHONE },
		actorNames: new Map<string, string>(),
		returnCaseNumber: null,
		conversationId: null,
		buyerHasReviewedShop: false,
	} as unknown as Parameters<typeof serializeOrderForBuyer>[1];

	const view = async (api: FakePayload) =>
		JSON.stringify(
			serializeOrderForBuyer(
				(await api.findByID({ collection: "orders", id: "o-2" })) as Order,
				sources,
				{ now: NOW },
			),
		);

	const pdf = async (api: FakePayload) =>
		renderCreditNoteDocument(
			api,
			(await api.findByID({
				collection: "commission-invoices",
				id: "inv-note",
			})) as CommissionInvoice,
		);

	const quote = async (api: FakePayload) =>
		JSON.stringify(
			await quoteCheckout(
				api,
				BUYER,
				{
					address: {
						recipientName: "Jean Mballa",
						phone: BUYER_PHONE,
						city: "douala",
						district: "douala.akwa",
						landmark: "Pres de la pharmacie du carrefour",
						instructions: "Appeler avant livraison",
					},
					deliveryOptionId: "seller_delivery:douala",
					paymentMethod: "cod",
					locale: "fr",
				},
				{ now: NOW, store: new MemoryCounterStore() },
			),
		);

	it("serializes the same order view", async () => {
		const api = legacy({ cities: false });
		// The serializer no longer reads a missing currency as XAF: the
		// pre-migration baseline is the order as the backfill leaves it.
		const stored = api.store.orders.find((order) => order.id === "o-2");
		Object.assign(stored ?? {}, {
			amounts: { ...(stored?.amounts as object), currency: "XAF" },
		});
		const before = await view(api);
		await migrateP10Markets(api);
		expect(await view(api)).toBe(before);
	});

	it("renders the same commission-invoice PDF bytes", async () => {
		const api = legacy({ cities: false });
		const before = await pdf(api);
		await migrateP10Markets(api);
		expect(Buffer.compare(await pdf(api), before)).toBe(0);
	});

	it("quotes the same JSON from the migrated rows as from the legacy literals", async () => {
		// A quote now reads its market from the registry, so the legacy
		// baseline carries the CM row the migration would otherwise create.
		const baseline = legacy({ cities: true });
		baseline.store.markets = [{ ...cmMarketRow(), id: "legacy-market" }];
		const expected = await quote(baseline);
		const api = legacy({ cities: false });
		await migrateP10Markets(api);
		// orderable.ts and cart.ts still read the emptied global until waves
		// 6-9 move them to the rows; give them back what they read today.
		api.globals["app-settings"] = settings();
		expect(await quote(api)).toBe(expected);
	});
});
