import { describe, expect, it } from "vitest";
import { Listings } from "../../src/collections/Listings";
import {
	type IsListingOrderableInput,
	isListingOrderable,
	type OrderableShop,
} from "../../src/lib/orderable";
import { BUYER_CAPS, type OrderSettings } from "../../src/lib/orderSettings";
import { fakePayload } from "./helpers/fakePayload";

type Hook = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** Payload's typed local API hands back a `Listing`/`Shop`; this test treats
 * it as the plain record a hook actually receives, through `unknown` rather
 * than a direct cast between the two named types. */
function asRecord(value: unknown): Record<string, unknown> {
	return value as Record<string, unknown>;
}
const beforeRead = (Listings.hooks?.beforeRead as Hook[])[0];

const NOW = new Date("2026-10-02T10:00:00.000Z");

const baseSettings: OrderSettings = {
	enabled: true,
	launchCities: [
		{ key: "douala", deliveryFee: 2000 },
		{ key: "yaounde", deliveryFee: 3500 },
	],
	defaultCommissionRateBps: 800,
	vatRateBps: 1925,
	minInvoiceAmount: 500,
	invoiceDueDays: 7,
	restrictAfterOverdueDays: 3,
	confirmHours: 24,
	acceptHours: 48,
	withdrawalDays: 15,
	staleShippedDays: 14,
	shopCaps: {},
	buyerCaps: BUYER_CAPS,
	termsVersion: "2026-09",
	pilotShopIds: [],
	strikeEffectsEnabled: false,
};

/**
 * All nine conditions hold. Every test below overrides exactly one field off
 * this baseline, so the nine clauses stay independent of each other and of
 * execution order — same discipline as `checkout-quote.int.spec.ts`'s `world`.
 */
function baseShop(): OrderableShop {
	return {
		status: "active",
		level: 1,
		levelExpiresAt: null,
		ordersRestrictedAt: null,
		orderSettings: { codEnabled: true },
		location: { city: "douala" },
	};
}

function baseInput(
	patch: Partial<IsListingOrderableInput> = {},
): IsListingOrderableInput {
	return {
		listingStatus: "published",
		shopId: "s-1",
		shop: baseShop(),
		product: { delivery: { codAllowed: true } },
		productAvailable: true,
		settings: baseSettings,
		now: NOW,
		...patch,
	};
}

describe("isListingOrderable", () => {
	it("is true when all nine conditions hold", () => {
		expect(isListingOrderable(baseInput())).toBe(true);
	});

	it("is false when the flag is off", () => {
		const input = baseInput({ settings: { ...baseSettings, enabled: false } });
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when the listing is not published", () => {
		const input = baseInput({ listingStatus: "pending" });
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when the shop is not active", () => {
		const input = baseInput({
			shop: { ...baseShop(), status: "suspended" },
		});
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when the shop is restricted", () => {
		const input = baseInput({
			shop: { ...baseShop(), ordersRestrictedAt: NOW.toISOString() },
		});
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when codEnabled is false", () => {
		const input = baseInput({
			shop: { ...baseShop(), orderSettings: { codEnabled: false } },
		});
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when the shop's city is not a launch city", () => {
		// "douala" is a structurally valid launch-city key, but the settings
		// below only enable "yaounde" — exercises the settings lookup, not just
		// the type guard, which a bogus string would not.
		const input = baseInput({
			settings: {
				...baseSettings,
				launchCities: [{ key: "yaounde", deliveryFee: 3500 }],
			},
		});
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when the product forbids COD", () => {
		const input = baseInput({ product: { delivery: { codAllowed: false } } });
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when no variant is available", () => {
		const input = baseInput({ productAvailable: false });
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when the shop is not in a non-empty pilot list", () => {
		const input = baseInput({
			settings: { ...baseSettings, pilotShopIds: ["s-other"] },
		});
		expect(isListingOrderable(input)).toBe(false);
	});

	it("is false when delivery zones are active but the shop has no COD option", () => {
		expect(
			isListingOrderable(baseInput({ deliveryOptionAvailable: false })),
		).toBe(false);
	});
});

describe("the listing read's orderable field", () => {
	function seed(zonesEnabled = false) {
		return fakePayload(
			{
				shops: [
					{
						id: "s-1",
						handle: "akwa",
						name: "Akwa",
						owner: "u-owner",
						status: "active",
						level: 1,
						levelExpiresAt: null,
						ordersRestrictedAt: null,
						location: { city: "douala" },
						orderSettings: { codEnabled: true },
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
						productSummary: { available: true },
					},
				],
			},
			{
				globals: {
					"app-settings": {
						delivery: { zonesEnabled },
						orders: {
							enabled: true,
							launchCities: [{ key: "douala", deliveryFee: 2000 }],
							termsVersion: "2026-09",
							pilotShopIds: [],
						},
					},
				},
			},
		);
	}

	it("carries orderable and stores no such field", async () => {
		const payload = seed();

		// The raw read, as the collection would hand back before this hook
		// touches it — proves `orderable` is never a key the store carries.
		const raw = asRecord(
			await payload.findByID({
				collection: "listings",
				id: "l-1",
				depth: 0,
				overrideAccess: true,
			}),
		);
		expect("orderable" in raw).toBe(false);

		const doc = await beforeRead({
			doc: { ...raw },
			req: { payload },
		});

		expect(doc.orderable).toBe(true);

		// Still nothing persisted after the hook ran once.
		const rawAgain = asRecord(
			await payload.findByID({
				collection: "listings",
				id: "l-1",
				depth: 0,
				overrideAccess: true,
			}),
		);
		expect("orderable" in rawAgain).toBe(false);
	});

	it("is false when the shop that owns the listing is restricted", async () => {
		const payload = seed();
		const shop = asRecord(
			await payload.findByID({
				collection: "shops",
				id: "s-1",
				depth: 0,
				overrideAccess: true,
			}),
		);
		await payload.update({
			collection: "shops",
			id: "s-1",
			data: { ...shop, ordersRestrictedAt: NOW.toISOString() },
			overrideAccess: true,
		});

		const raw = asRecord(
			await payload.findByID({
				collection: "listings",
				id: "l-1",
				depth: 0,
				overrideAccess: true,
			}),
		);
		const doc = await beforeRead({ doc: { ...raw }, req: { payload } });

		expect(doc.orderable).toBe(false);
	});

	it("is false if zones are enabled and no active COD delivery option exists", async () => {
		const payload = seed(true);
		const raw = asRecord(
			await payload.findByID({
				collection: "listings",
				id: "l-1",
				depth: 0,
				overrideAccess: true,
			}),
		);
		const doc = await beforeRead({ doc: { ...raw }, req: { payload } });

		expect(doc.orderable).toBe(false);
	});

	it("keeps orderability when an active pickup location is the COD option", async () => {
		const payload = seed(true);
		await payload.create({
			collection: "shop-locations",
			overrideAccess: true,
			data: {
				shop: "s-1",
				name: "Pickup",
				city: "douala",
				district: "douala.other",
				landmark: "Near the market",
				gps: { lat: 4.05, lng: 9.7 },
				openingHours: [{ day: "mon", opens: "08:00", closes: "17:00" }],
				pickupEnabled: true,
				active: true,
			},
		});
		const raw = asRecord(
			await payload.findByID({
				collection: "listings",
				id: "l-1",
				depth: 0,
				overrideAccess: true,
			}),
		);
		const doc = await beforeRead({ doc: { ...raw }, req: { payload } });

		expect(doc.orderable).toBe(true);
	});
});
