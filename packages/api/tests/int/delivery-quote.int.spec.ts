// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getOrderSettings } from "../../src/lib/orderSettings";
import type { Shop } from "../../src/payload-types";
import {
	type QuoteItem,
	quoteDelivery,
} from "../../src/services/deliveryQuote";
import { fakePayload } from "./helpers/fakePayload";

type QuoteShop = Pick<Shop, "id" | "location" | "orderSettings">;

async function settingsOf() {
	// `getOrderSettings` fails closed with no global at all, which is fine here:
	// every field this module reads comes from its own defaults.
	return getOrderSettings(fakePayload());
}

const items = (overrides: Partial<QuoteItem> = {}): QuoteItem[] => [
	{
		variantId: "v-1",
		quantity: 1,
		lineSubtotal: 10_000,
		codAllowed: true,
		...overrides,
	},
];

const shop = (
	overrides: Partial<NonNullable<Shop["orderSettings"]>> = {},
): QuoteShop => ({
	id: "s-1",
	location: { city: "douala" },
	orderSettings: {
		codEnabled: true,
		sellerDeliveryEnabled: true,
		deliveryFee: null,
		deliveryEtaText: "24-48h",
		pickupEnabled: false,
		pickupPoint: undefined,
		...overrides,
	},
});

describe("quoteDelivery", () => {
	it("offers seller_delivery only in the shop's own city", async () => {
		const settings = await settingsOf();
		const { options } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop(),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		expect(options.map((o) => o.method)).toEqual(["seller_delivery"]);
	});

	it("offers nothing for another city", async () => {
		const settings = await settingsOf();
		const { options } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop(),
			items: items(),
			subtotal: 10_000,
			destination: { city: "yaounde" },
			settings,
		});
		expect(options).toHaveLength(0);
	});

	it("uses the shop's fee override, else the city default", async () => {
		const settings = await settingsOf();
		const { options: overridden } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop({ deliveryFee: 1_500 }),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		expect(overridden[0].fee).toBe(1_500);

		const { options: defaulted } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop({ deliveryFee: null }),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		expect(defaulted[0].fee).toBe(2_000); // Douala's launch default
	});

	it("offers pickup only when enabled and a pickup point is set, at fee 0", async () => {
		const settings = await settingsOf();
		const { options: noPoint } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop({
				sellerDeliveryEnabled: false,
				pickupEnabled: true,
				pickupPoint: undefined,
			}),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		expect(noPoint).toHaveLength(0);

		const { options: withPoint } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop({
				sellerDeliveryEnabled: false,
				pickupEnabled: true,
				pickupPoint: {
					address: "123 Rue de la Joie",
					landmark: "Pres du marche",
					hours: "9h-18h",
				},
			}),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		expect(withPoint).toHaveLength(1);
		expect(withPoint[0].method).toBe("pickup");
		expect(withPoint[0].fee).toBe(0);
		expect(withPoint[0].pickupPoint?.address).toBe("123 Rue de la Joie");
	});

	it("carries codAllowed false when any product forbids COD", async () => {
		const settings = await settingsOf();
		const { options } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop(),
			items: [
				{
					variantId: "v-1",
					quantity: 1,
					lineSubtotal: 10_000,
					codAllowed: true,
				},
				{
					variantId: "v-2",
					quantity: 1,
					lineSubtotal: 5_000,
					codAllowed: false,
				},
			],
			subtotal: 15_000,
			destination: { city: "douala" },
			settings,
		});
		expect(options[0].codAllowed).toBe(false);
	});

	it("the optionId is stable for the same shop and city", async () => {
		const settings = await settingsOf();
		const { options: first } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop(),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		const { options: second } = await quoteDelivery({
			payload: fakePayload(),
			shop: shop(),
			items: items(),
			subtotal: 10_000,
			destination: { city: "douala" },
			settings,
		});
		expect(first[0].optionId).toBe(second[0].optionId);
		expect(first[0].optionId).toBe("seller_delivery:douala");
	});
});
