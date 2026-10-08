// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listSupplierResaleProducts } from "../../src/services/resaleSupplier";
import { fakePayload } from "./helpers/fakePayload";

describe("supplier offered resale products", () => {
	it("returns current pricing and recent delivered resale volume", async () => {
		const payload = fakePayload(
			{
				shops: [
					{ id: "supplier", name: "Supplier", status: "active", level: 3 },
				],
				"shop-members": [
					{
						id: "member",
						shop: "supplier",
						user: "owner",
						role: "owner",
						status: "active",
					},
				],
				"resale-terms": [
					{
						id: "terms",
						role: "supplier",
						version: "v1",
						publishedAt: "2026-10-01T00:00:00.000Z",
					},
				],
				"resale-terms-acceptances": [
					{
						id: "acceptance",
						shop: "supplier",
						role: "supplier",
						version: "v1",
					},
				],
				products: [
					{
						id: "product",
						shop: "supplier",
						title: "Lamp",
						status: "active",
						resale: {
							enabled: true,
							resellerCount: 4,
							pendingChange: { effectiveAt: "2026-10-06T00:00:00.000Z" },
						},
					},
				],
				"product-variants": [
					{
						id: "variant",
						product: "product",
						sku: "L-1",
						resale: {
							enabled: true,
							supplierPrice: 100,
							minRetailPrice: 150,
							suggestedRetailPrice: 200,
						},
					},
				],
				listings: [
					{
						id: "listing",
						product: "product",
						shop: "reseller",
						status: "published",
						resale: {
							supplierShop: "supplier",
							prices: [{ variant: "variant", price: 175 }],
						},
					},
				],
				"purchase-orders": [
					{
						id: "po",
						supplierShop: "supplier",
						link: "link",
						status: "delivered",
						items: [{ variant: "variant", quantity: 3 }],
						statusHistory: [
							{
								status: "delivered",
								at: "2026-10-03T00:00:00.000Z",
								source: "supplier",
							},
						],
					},
				],
			},
			{ globals: { "app-settings": { resale: { enabled: true } } } },
		);

		const products = await listSupplierResaleProducts(
			payload,
			{ id: "owner", role: "user" },
			"supplier",
			new Date("2026-10-04T00:00:00.000Z"),
		);

		expect(products).toEqual([
			{
				productId: "product",
				title: "Lamp",
				enabled: true,
				resellerCount: 4,
				unitsDelivered30d: 3,
				pendingEffectiveAt: "2026-10-06T00:00:00.000Z",
				variants: [
					{
						id: "variant",
						sku: "L-1",
						supplierPrice: 100,
						minRetailPrice: 150,
						suggestedRetailPrice: 200,
						resellerPrices: [175],
					},
				],
			},
		]);
	});
});
