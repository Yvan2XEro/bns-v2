// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	listResoldListings,
	updateResaleListingPrices,
} from "../../src/services/resaleResold";
import { getSupplierResaleSettings } from "../../src/services/resaleSupplier";
import { fakePayload } from "./helpers/fakePayload";

const reseller = { id: "reseller-user", role: "user" as const };
const supplier = { id: "supplier-user", role: "user" as const };

function world(
	options: {
		holds?: string[];
		price?: number;
		stockOnHand?: number;
		supplierPublished?: boolean;
	} = {},
) {
	return fakePayload(
		{
			users: [
				{ id: "reseller-user", role: "user" },
				{ id: "supplier-user", role: "user" },
			],
			shops: [
				{
					id: "reseller-shop",
					owner: "reseller-user",
					name: "Reseller",
					status: "active",
					level: 2,
				},
				{
					id: "supplier-shop",
					owner: "supplier-user",
					name: "Mboppi Accessoires",
					status: "active",
					level: 3,
				},
			],
			"shop-members": [
				{
					id: "reseller-member",
					shop: "reseller-shop",
					user: "reseller-user",
					role: "owner",
					status: "active",
				},
				{
					id: "supplier-member",
					shop: "supplier-shop",
					user: "supplier-user",
					role: "owner",
					status: "active",
				},
			],
			"resale-terms": [
				{
					id: "supplier-terms",
					role: "supplier",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [],
			"resale-links": [
				{
					id: "link-requested",
					supplierShop: "supplier-shop",
					resellerShop: "other-shop",
					status: "requested",
				},
			],
			products: [
				{
					id: "product",
					shop: "supplier-shop",
					title: "Câble USB-C",
					status: "active",
					resale: {
						enabled: true,
						approvalRequired: true,
						handlingHours: 24,
						codAccepted: true,
						resellerCount: 1,
					},
				},
			],
			"product-variants": [
				{
					id: "variant",
					product: "product",
					shop: "supplier-shop",
					price: 3500,
					optionValues: { Couleur: "Noir" },
					trackInventory: true,
					stockOnHand: options.stockOnHand ?? 12,
					stockReserved: 2,
					resale: {
						enabled: true,
						supplierPrice: 1500,
						minRetailPrice: 3000,
						suggestedRetailPrice: 3500,
					},
				},
			],
			listings: [
				{
					id: "supplier-listing",
					shop: "supplier-shop",
					product: "product",
					status: options.supplierPublished === false ? "draft" : "published",
				},
				{
					id: "resold",
					shop: "reseller-shop",
					product: "product",
					title: "Câble USB-C",
					status: options.holds?.length ? "draft" : "published",
					price: options.price ?? 2800,
					productSummary: { priceMin: 2800, priceMax: 2800 },
					resale: {
						supplierShop: "supplier-shop",
						link: "link",
						desiredStatus: "published",
						holds: options.holds ?? [],
						prices: [{ variant: "variant", price: options.price ?? 2800 }],
					},
				},
				{
					id: "own-listing",
					shop: "reseller-shop",
					product: "own-product",
					title: "Own stock",
					status: "published",
					resale: { supplierShop: null, holds: [] },
				},
			],
		},
		{ globals: { "app-settings": { resale: { enabled: true } } } },
	);
}

describe("listResoldListings", () => {
	it("returns only resale listings with supplier bounds, stock and the below-minimum state", async () => {
		const page = await listResoldListings(
			world({ holds: ["price_below_minimum"] }),
			reseller,
			"reseller-shop",
		);
		expect(page.commissionRateBps).toBeGreaterThan(0);
		expect(page.listings).toEqual([
			{
				listingId: "resold",
				productId: "product",
				title: "Câble USB-C",
				supplier: { id: "supplier-shop", name: "Mboppi Accessoires" },
				status: "below_minimum",
				variants: [
					{
						id: "variant",
						label: "Noir",
						sku: null,
						price: 2800,
						supplierPrice: 1500,
						minRetailPrice: 3000,
						suggestedRetailPrice: 3500,
						supplierStock: 10,
					},
				],
			},
		]);
	});

	it("reports a supplier stock-out", async () => {
		const page = await listResoldListings(
			world({ price: 3200, stockOnHand: 2 }),
			reseller,
			"reseller-shop",
		);
		expect(page.listings[0]?.status).toBe("out_of_stock");
	});

	it("refuses a shop the caller is not a member of", async () => {
		await expect(
			listResoldListings(world(), supplier, "reseller-shop"),
		).rejects.toMatchObject({ status: 403 });
	});
});

describe("updateResaleListingPrices", () => {
	it("lifts the below-minimum hold and republishes", async () => {
		const payload = world({ holds: ["price_below_minimum"] });
		const listing = await updateResaleListingPrices(
			payload,
			reseller,
			"reseller-shop",
			"resold",
			{ prices: [{ variantId: "variant", price: 3000 }] },
		);
		expect(listing).toMatchObject({
			status: "published",
			price: 3000,
			productSummary: { priceMin: 3000, priceMax: 3000 },
			resale: { holds: [], prices: [{ variant: "variant", price: 3000 }] },
		});
	});

	it("keeps the listing hidden while another hold remains", async () => {
		const listing = await updateResaleListingPrices(
			world({ holds: ["price_below_minimum", "link_inactive"] }),
			reseller,
			"reseller-shop",
			"resold",
			{ prices: [{ variantId: "variant", price: 3000 }] },
		);
		expect(listing.status).toBe("draft");
		expect(listing.resale.holds).toEqual(["link_inactive"]);
	});

	it("rejects a price under the supplier minimum", async () => {
		await expect(
			updateResaleListingPrices(
				world({ holds: ["price_below_minimum"] }),
				reseller,
				"reseller-shop",
				"resold",
				{ prices: [{ variantId: "variant", price: 2900 }] },
			),
		).rejects.toMatchObject({ status: 400 });
	});

	it("does not touch another shop's listing", async () => {
		await expect(
			updateResaleListingPrices(world(), supplier, "supplier-shop", "resold", {
				prices: [{ variantId: "variant", price: 3000 }],
			}),
		).rejects.toMatchObject({ status: 404 });
	});
});

describe("getSupplierResaleSettings", () => {
	it("returns the product's resale settings, reseller price range and open requests", async () => {
		const view = await getSupplierResaleSettings(world(), supplier, "product");
		expect(view).toMatchObject({
			productId: "product",
			eligible: true,
			termsAccepted: false,
			enabled: true,
			approvalRequired: true,
			handlingHours: 24,
			codAccepted: true,
			resellerCount: 1,
			pendingRequests: 1,
			resellerPriceRange: { min: 2800, max: 2800 },
			variants: [
				{
					id: "variant",
					label: "Noir",
					stock: 10,
					enabled: true,
					supplierPrice: 1500,
					minRetailPrice: 3000,
					suggestedRetailPrice: 3500,
				},
			],
		});
	});

	it("is closed to a non-member", async () => {
		await expect(
			getSupplierResaleSettings(world(), reseller, "product"),
		).rejects.toMatchObject({ status: 403 });
	});
});
