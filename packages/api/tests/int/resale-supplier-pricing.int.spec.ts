// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	applyResalePriceChanges,
	updateSupplierResaleSettings,
} from "../../src/services/resaleSupplier";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

function world() {
	return fakePayload(
		{
			shops: [{ id: "supplier", name: "Supplier", status: "active", level: 3 }],
			"shop-members": [
				{
					id: "member-1",
					shop: "supplier",
					user: "owner-1",
					role: "owner",
					status: "active",
				},
			],
			products: [
				{
					id: "product-1",
					shop: "supplier",
					status: "active",
					resale: { enabled: true, resellerCount: 1, pendingChange: {} },
				},
			],
			"product-variants": [
				{
					id: "variant-1",
					product: "product-1",
					resale: {
						enabled: true,
						supplierPrice: 100,
						minRetailPrice: 200,
						suggestedRetailPrice: 300,
					},
				},
			],
			"resale-terms": [
				{
					id: "terms-1",
					role: "supplier",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance-1",
					shop: "supplier",
					role: "supplier",
					version: "2026-10-01",
				},
			],
			listings: [
				{
					id: "resale-listing-1",
					product: "product-1",
					shop: "reseller",
					status: "published",
					resale: {
						supplierShop: "supplier",
						desiredStatus: "published",
						holds: [],
						prices: [{ variant: "variant-1", price: 210 }],
					},
				},
			],
		},
		{ globals: { "app-settings": { resale: { enabled: true } } } },
	);
}

describe("supplier resale pricing", () => {
	it("defers supplier and minimum-price increases by 48 hours while applying suggested prices immediately", async () => {
		const payload = world();
		await updateSupplierResaleSettings(
			payload,
			{ id: "owner-1", role: "user" },
			"product-1",
			{
				enabled: true,
				approvalRequired: false,
				handlingHours: 24,
				codAccepted: true,
				resellerNotes: "",
				variants: [
					{
						id: "variant-1",
						enabled: true,
						supplierPrice: 120,
						minRetailPrice: 220,
						suggestedRetailPrice: 350,
					},
				],
			},
			NOW,
		);

		expect(payload.store["product-variants"]?.[0]?.resale).toMatchObject({
			supplierPrice: 100,
			minRetailPrice: 200,
			suggestedRetailPrice: 350,
		});
		expect(
			(await payload.findByID({ collection: "products", id: "product-1" }))
				.resale?.pendingChange,
		).toMatchObject({
			effectiveAt: "2026-10-06T12:00:00.000Z",
			variants: [
				{
					variant: "variant-1",
					supplierPrice: 120,
					minRetailPrice: 220,
					suggestedRetailPrice: 350,
				},
			],
		});
	});

	it("applies due increases once and holds reseller prices below the new minimum", async () => {
		const payload = world();
		await updateSupplierResaleSettings(
			payload,
			{ id: "owner-1", role: "user" },
			"product-1",
			{
				enabled: true,
				approvalRequired: false,
				handlingHours: 24,
				codAccepted: true,
				resellerNotes: "",
				variants: [
					{
						id: "variant-1",
						enabled: true,
						supplierPrice: 120,
						minRetailPrice: 220,
						suggestedRetailPrice: 350,
					},
				],
			},
			NOW,
		);

		expect(await applyResalePriceChanges(payload, NOW)).toEqual([]);
		const first = await applyResalePriceChanges(
			payload,
			new Date("2026-10-06T12:00:00.000Z"),
		);
		const second = await applyResalePriceChanges(
			payload,
			new Date("2026-10-06T13:00:00.000Z"),
		);

		expect(first).toEqual(["product-1"]);
		expect(second).toEqual([]);
		expect(payload.store["product-variants"]?.[0]?.resale).toMatchObject({
			supplierPrice: 120,
			minRetailPrice: 220,
			suggestedRetailPrice: 350,
		});
		expect(
			(await payload.findByID({ collection: "products", id: "product-1" }))
				.resale?.pendingChange,
		).toEqual({
			effectiveAt: null,
			variants: [],
		});
		expect(payload.store.listings?.[0]).toMatchObject({
			status: "draft",
			resale: { holds: ["price_below_minimum"] },
		});
	});
});
