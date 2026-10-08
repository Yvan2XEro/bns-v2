// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listResaleCatalogue } from "../../src/services/resaleCatalogue";
import { fakePayload } from "./helpers/fakePayload";

function catalogueWorld() {
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
				},
				{
					id: "supplier-shop",
					owner: "supplier-user",
					name: "Supplier",
					status: "active",
					level: 3,
				},
				{
					id: "inactive-supplier",
					owner: "other-user",
					name: "Inactive",
					status: "suspended",
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
			],
			"resale-terms": [
				{
					id: "terms",
					role: "reseller",
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
			],
			products: [
				{
					id: "product-visible-price",
					shop: "supplier-shop",
					title: "Adapter",
					description: "USB-C",
					category: "electronics",
					status: "active",
					resale: { enabled: true, approvalRequired: false },
				},
				{
					id: "product-private-price",
					shop: "supplier-shop",
					title: "Battery",
					category: "electronics",
					status: "active",
					resale: { enabled: true, approvalRequired: true },
				},
				{
					id: "product-inactive-supplier",
					shop: "inactive-supplier",
					title: "Hidden",
					category: "electronics",
					status: "active",
					resale: { enabled: true, approvalRequired: false },
				},
				{
					id: "product-disabled",
					shop: "supplier-shop",
					title: "Disabled",
					category: "electronics",
					status: "active",
					resale: { enabled: false },
				},
			],
			"product-variants": [
				{
					id: "variant-public",
					product: "product-visible-price",
					shop: "supplier-shop",
					sku: "A-1",
					optionValues: { color: "black" },
					price: 7000,
					resale: {
						enabled: true,
						supplierPrice: 4000,
						minRetailPrice: 6000,
						suggestedRetailPrice: 8000,
					},
				},
				{
					id: "variant-private",
					product: "product-private-price",
					shop: "supplier-shop",
					sku: "B-1",
					price: 5000,
					resale: {
						enabled: true,
						supplierPrice: 3000,
						minRetailPrice: 4500,
						suggestedRetailPrice: 5500,
					},
				},
			],
			"resale-links": [
				{
					id: "requested",
					supplierShop: "supplier-shop",
					resellerShop: "reseller-shop",
					status: "requested",
				},
			],
		},
		{ globals: { "app-settings": { resale: { enabled: true } } } },
	);
}

describe("reseller resale catalogue", () => {
	it("hides supplier prices while approval is pending and only returns active suppliers", async () => {
		const result = await listResaleCatalogue(
			catalogueWorld(),
			{ id: "reseller-user", role: "user" },
			"reseller-shop",
		);

		expect(result.products).toHaveLength(2);
		expect(result.products[0]).toMatchObject({
			productId: "product-visible-price",
			linkStatus: "requested",
			variants: [{ id: "variant-public", supplierPrice: 4000 }],
		});
		expect(result.products[1]).toMatchObject({
			productId: "product-private-price",
			linkStatus: "requested",
			variants: [{ id: "variant-private", minRetailPrice: 4500 }],
		});
		expect(result.products[1]?.variants[0]).not.toHaveProperty("supplierPrice");
	});

	it("refuses catalogue access until the global feature and terms are enabled", async () => {
		const payload = catalogueWorld();
		payload.globals["app-settings"].resale = { enabled: false };
		await expect(
			listResaleCatalogue(
				payload,
				{ id: "reseller-user", role: "user" },
				"reseller-shop",
			),
		).rejects.toMatchObject({ code: "resale.disabled", status: 404 });
		payload.globals["app-settings"].resale = { enabled: true };
		payload.store["resale-terms-acceptances"] = [];
		await expect(
			listResaleCatalogue(
				payload,
				{ id: "reseller-user", role: "user" },
				"reseller-shop",
			),
		).rejects.toMatchObject({ status: 409 });
	});

	it("reveals a private supplier price only after the link is approved", async () => {
		const payload = catalogueWorld();
		payload.store["resale-links"][0].status = "approved";
		const result = await listResaleCatalogue(
			payload,
			{ id: "reseller-user", role: "user" },
			"reseller-shop",
		);

		expect(result.products[1]?.variants[0]?.supplierPrice).toBe(3000);
	});
});
