// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addCartItem, getCartView } from "../../src/services/cart";
import { fakePayload } from "./helpers/fakePayload";

function world() {
	return fakePayload(
		{
			users: [{ id: "buyer" }],
			shops: [
				{
					id: "reseller",
					owner: "reseller-owner",
					name: "Storefront",
					handle: "storefront",
					status: "active",
					level: 2,
					location: { city: "douala" },
					orderSettings: { codEnabled: true },
				},
				{
					id: "supplier",
					owner: "supplier-owner",
					name: "Supplier",
					status: "active",
					level: 3,
					location: { city: "douala" },
					orderSettings: { codEnabled: true },
				},
			],
			products: [
				{
					id: "product",
					shop: "supplier",
					status: "active",
					delivery: { codAllowed: true },
					resale: { enabled: true, codAccepted: true },
				},
			],
			"product-variants": [
				{
					id: "variant",
					product: "product",
					shop: "supplier",
					price: 9000,
					trackInventory: true,
					stockOnHand: 3,
					stockReserved: 0,
					resale: {
						enabled: true,
						supplierPrice: 4000,
						minRetailPrice: 6500,
						suggestedRetailPrice: 7500,
					},
				},
			],
			listings: [
				{
					id: "resale",
					shop: "reseller",
					product: "product",
					title: "Product",
					status: "published",
					resale: {
						supplierShop: "supplier",
						link: "link",
						prices: [{ variant: "variant", price: 7000 }],
						holds: [],
					},
				},
				{
					id: "own",
					shop: "reseller",
					product: "own-product",
					status: "published",
				},
			],
			"resale-links": [
				{
					id: "link",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "approved",
					riskHold: false,
				},
			],
			"resale-terms": [
				{
					id: "r-terms",
					role: "reseller",
					version: "v1",
					publishedAt: "2026-01-01T00:00:00Z",
				},
				{
					id: "s-terms",
					role: "supplier",
					version: "v1",
					publishedAt: "2026-01-01T00:00:00Z",
				},
			],
			"resale-terms-acceptances": [
				{ id: "r-accept", role: "reseller", shop: "reseller", version: "v1" },
				{ id: "s-accept", role: "supplier", shop: "supplier", version: "v1" },
			],
		},
		{
			globals: {
				"app-settings": {
					orders: {
						enabled: true,
						launchCities: [{ key: "douala", deliveryFee: 2000 }],
					},
					resale: { enabled: true },
				},
			},
		},
	);
}

const input = { listingId: "resale", variantId: "variant", quantity: 1 };
const buyer = { id: "buyer" };

describe("resale cart integration", () => {
	it("charges the reseller price and keeps supplier prices off the buyer wire", async () => {
		const payload = world();
		const cart = await addCartItem(payload, buyer, input);
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0]).toMatchObject({
			unitPrice: 7000,
			priceAtAdd: 7000,
			lineSubtotal: 7000,
			available: true,
			maxQuantity: 3,
			shopId: "reseller",
		});
		expect(cart.subtotal).toBe(7000);
		expect(cart.lines[0]).not.toHaveProperty("supplierUnitPrice");
	});
	it("revalidates the reseller price instead of replacing it with the supplier retail price", async () => {
		const payload = world();
		await addCartItem(payload, buyer, input);
		const listing = await payload.findByID({
			collection: "listings",
			id: "resale",
			overrideAccess: true,
		});
		await payload.update({
			collection: "listings",
			id: "resale",
			data: {
				resale: {
					...listing.resale,
					prices: [{ variant: "variant", price: 7500 }],
				},
			},
			overrideAccess: true,
		});
		const cart = await getCartView(payload, buyer);
		expect(cart.lines[0]).toMatchObject({
			unitPrice: 7500,
			priceAtAdd: 7000,
			priceChanged: true,
			available: true,
		});
	});
	it("refuses a supplier member as a buyer before writing the cart", async () => {
		const payload = world();
		payload.store["shop-members"] = [
			{
				id: "member",
				shop: "supplier",
				user: "buyer",
				status: "active",
				role: "staff",
			},
		];
		await expect(addCartItem(payload, buyer, input)).rejects.toMatchObject({
			code: "checkout.selfPurchase",
		});
		expect(payload.store.carts ?? []).toHaveLength(0);
	});
	it("refuses an unrelated variant even if its price and stock are valid", async () => {
		const payload = world();
		payload.store["product-variants"].push({
			id: "unrelated",
			product: "other-product",
			shop: "supplier",
			price: 100,
			stockOnHand: 10,
		});
		await expect(
			addCartItem(payload, buyer, { ...input, variantId: "unrelated" }),
		).rejects.toMatchObject({ code: "cart.itemUnavailable" });
		expect(payload.store.carts ?? []).toHaveLength(0);
	});
	it("does not mix own stock and supplier stock behind the same storefront", async () => {
		const payload = world();
		await addCartItem(payload, buyer, input);
		payload.store.products.push({
			id: "own-product",
			shop: "reseller",
			status: "active",
			delivery: { codAllowed: true },
		});
		payload.store["product-variants"].push({
			id: "own-variant",
			product: "own-product",
			shop: "reseller",
			price: 5000,
		});
		await expect(
			addCartItem(payload, buyer, {
				listingId: "own",
				variantId: "own-variant",
				quantity: 1,
			}),
		).rejects.toMatchObject({ code: "cart.singleFulfilment" });
		const cart = await getCartView(payload, buyer);
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0].listingId).toBe("resale");
	});
	it.each([
		"suspended",
		"revoked",
	])("makes a %s supplier link unavailable", async (status) => {
		const payload = world();
		await addCartItem(payload, buyer, input);
		await payload.update({
			collection: "resale-links",
			id: "link",
			data: { status: status === "suspended" ? "suspended" : "revoked" },
			overrideAccess: true,
		});
		const cart = await getCartView(payload, buyer);
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0].available).toBe(false);
		expect(cart.subtotal).toBe(0);
	});
});
