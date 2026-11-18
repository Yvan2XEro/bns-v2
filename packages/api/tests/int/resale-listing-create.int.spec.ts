// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasAcceptedCurrentResaleTerms } from "../../src/services/resale";
import { createResaleListing } from "../../src/services/resaleListings";
import { fakePayload } from "./helpers/fakePayload";

function resaleWorld(options: { approvalRequired?: boolean } = {}) {
	return fakePayload(
		{
			users: [{ id: "reseller-user", role: "user" }],
			shops: [
				{
					id: "reseller-shop",
					owner: "reseller-user",
					name: "Reseller",
					status: "active",
					level: 2,
					location: { city: "Douala" },
				},
				{
					id: "supplier-shop",
					owner: "supplier-user",
					name: "Supplier",
					status: "active",
					level: 3,
					location: { city: "Yaounde" },
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
			],
			"resale-terms": [
				{
					id: "terms",
					role: "reseller",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
				{
					id: "supplier-terms",
					role: "supplier",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance",
					shop: "reseller-shop",
					role: "reseller",
					version: "2026-10-01",
				},
				{
					id: "supplier-acceptance",
					shop: "supplier-shop",
					role: "supplier",
					version: "2026-10-01",
				},
			],
			products: [
				{
					id: "product",
					shop: "supplier-shop",
					title: "Supplier title",
					description: "Supplier description",
					category: "category",
					condition: "new",
					images: [],
					status: "active",
					resale: {
						enabled: true,
						approvalRequired: options.approvalRequired ?? false,
					},
				},
			],
			"product-variants": [
				{
					id: "variant",
					product: "product",
					shop: "supplier-shop",
					price: 9000,
					trackInventory: false,
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
					id: "supplier-listing",
					shop: "supplier-shop",
					product: "product",
					status: "published",
				},
			],
		},
		{
			uniques: {
				"resale-links": [["supplierShop", "resellerShop"]],
				listings: [["shop", "product"]],
			},
			globals: { "app-settings": { resale: { enabled: true } } },
		},
	);
}

describe("createResaleListing", () => {
	it("recognizes the reseller's current accepted terms", async () => {
		expect(
			await hasAcceptedCurrentResaleTerms(
				resaleWorld(),
				"reseller-shop",
				"reseller",
			),
		).toBe(true);
	});

	it("creates a supplier-derived listing and auto-approves a link when approval is not required", async () => {
		const payload = resaleWorld();
		const listing = await createResaleListing(
			payload,
			{ id: "reseller-user", role: "user" },
			"reseller-shop",
			{
				productId: "product",
				prices: [{ variantId: "variant", price: 7000 }],
				desiredStatus: "published",
			},
		);

		expect(listing).toMatchObject({
			shop: "reseller-shop",
			product: "product",
			seller: "reseller-user",
			title: "Supplier title",
			price: 7000,
			status: "published",
			resale: {
				supplierShop: "supplier-shop",
				prices: [{ variant: "variant", price: 7000 }],
				desiredStatus: "published",
				holds: [],
			},
		});
		expect(payload.store["resale-links"]).toHaveLength(1);
		expect(payload.store["resale-links"]?.[0]?.status).toBe("approved");
		expect(payload.store["resale-links"]?.[0]).not.toHaveProperty("decidedBy");
	});

	it("fails closed for an approval-required product until its supplier link is approved", async () => {
		const payload = resaleWorld({ approvalRequired: true });
		await expect(
			createResaleListing(
				payload,
				{ id: "reseller-user", role: "user" },
				"reseller-shop",
				{
					productId: "product",
					prices: [{ variantId: "variant", price: 7000 }],
					desiredStatus: "published",
				},
			),
		).rejects.toMatchObject({ code: "resale.linkInactive", status: 409 });
		expect(payload.store.listings).toHaveLength(1);
	});

	it("rejects a reseller price outside supplier limits and never creates the listing", async () => {
		const payload = resaleWorld();
		await expect(
			createResaleListing(
				payload,
				{ id: "reseller-user", role: "user" },
				"reseller-shop",
				{
					productId: "product",
					prices: [{ variantId: "variant", price: 6499 }],
					desiredStatus: "published",
				},
			),
		).rejects.toMatchObject({ code: "resale.invalidPricing", status: 400 });
		expect(payload.store.listings).toHaveLength(1);
	});

	it("refuses to create a duplicate shop-product listing", async () => {
		const payload = resaleWorld();
		await createResaleListing(
			payload,
			{ id: "reseller-user", role: "user" },
			"reseller-shop",
			{
				productId: "product",
				prices: [{ variantId: "variant", price: 7000 }],
				desiredStatus: "draft",
			},
		);
		await expect(
			createResaleListing(
				payload,
				{ id: "reseller-user", role: "user" },
				"reseller-shop",
				{
					productId: "product",
					prices: [{ variantId: "variant", price: 7000 }],
					desiredStatus: "draft",
				},
			),
		).rejects.toMatchObject({ code: "resale.alreadyReselling", status: 409 });
	});
});
