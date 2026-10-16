// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	isMinResellerLevel,
	meetsMinResellerLevel,
	minResellerLevelOf,
} from "../../src/contracts/resale";
import { ERROR_CODES } from "../../src/lib/errors";
import { listResaleCatalogue } from "../../src/services/resaleCatalogue";
import { requestResaleLink } from "../../src/services/resaleLinks";
import { createResaleListing } from "../../src/services/resaleListings";
import { enforceResellerLevelMinimums } from "../../src/services/resaleMaintenance";
import {
	listResoldListings,
	updateResaleListingPrices,
} from "../../src/services/resaleResold";
import {
	getSupplierResaleSettings,
	listSupplierResaleProducts,
	updateSupplierResaleSettings,
} from "../../src/services/resaleSupplier";
import { fakePayload } from "./helpers/fakePayload";

const supplier = { id: "supplier-user", role: "user" as const };
const level2 = { id: "r2-user", role: "user" as const };
const level3 = { id: "r3-user", role: "user" as const };
const NOW = new Date("2026-10-16T12:00:00.000Z");

function variant(id: string, product: string) {
	return {
		id,
		product,
		shop: "supplier-shop",
		price: 9000,
		trackInventory: false,
		resale: {
			enabled: true,
			supplierPrice: 4000,
			minRetailPrice: 6000,
			suggestedRetailPrice: 7500,
		},
	};
}

function resaleListing(id: string, shop: string, product: string) {
	return {
		id,
		shop,
		product,
		title: product,
		status: "published",
		resale: {
			supplierShop: "supplier-shop",
			desiredStatus: "published",
			holds: [],
			prices: [{ variant: `v-${product}`, price: 7000 }],
		},
	};
}

function world() {
	const member = (shop: string, user: string) => ({
		id: `${shop}-member`,
		shop,
		user,
		role: "owner",
		status: "active",
	});
	const accepted = (shop: string, role: string) => ({
		id: `${shop}-${role}`,
		shop,
		role,
		version: "2026-10-01",
		acceptedAt: "2026-10-01T00:00:00.000Z",
	});
	return fakePayload(
		{
			users: [supplier, level2, level3],
			shops: [
				{
					id: "supplier-shop",
					owner: "supplier-user",
					name: "Supplier",
					status: "active",
					level: 3,
				},
				{
					id: "r2",
					owner: "r2-user",
					name: "Reseller two",
					status: "active",
					level: 2,
				},
				{
					id: "r3",
					owner: "r3-user",
					name: "Reseller three",
					status: "active",
					level: 3,
				},
			],
			"shop-members": [
				member("supplier-shop", "supplier-user"),
				member("r2", "r2-user"),
				member("r3", "r3-user"),
			],
			"resale-terms": ["supplier", "reseller"].map((role) => ({
				id: `${role}-terms`,
				role,
				version: "2026-10-01",
				publishedAt: "2026-10-01T00:00:00.000Z",
			})),
			"resale-terms-acceptances": [
				accepted("supplier-shop", "supplier"),
				accepted("r2", "reseller"),
				accepted("r3", "reseller"),
			],
			products: [
				{
					id: "reserved",
					shop: "supplier-shop",
					title: "Reserved",
					category: "category",
					condition: "new",
					images: [],
					status: "active",
					resale: { enabled: true, minResellerLevel: 3, pendingChange: {} },
				},
				{
					id: "open",
					shop: "supplier-shop",
					title: "Open",
					category: "category",
					condition: "new",
					images: [],
					status: "active",
					resale: { enabled: true, pendingChange: {} },
				},
			],
			"product-variants": [
				variant("v-reserved", "reserved"),
				variant("v-open", "open"),
			],
			listings: [
				{
					id: "supplier-reserved",
					shop: "supplier-shop",
					product: "reserved",
					status: "published",
				},
				{
					id: "supplier-open",
					shop: "supplier-shop",
					product: "open",
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

const settingsInput = (minResellerLevel?: 2 | 3 | null) => ({
	enabled: true,
	approvalRequired: false,
	handlingHours: 24,
	codAccepted: false,
	resellerNotes: "",
	...(minResellerLevel === undefined ? {} : { minResellerLevel }),
	variants: [
		{
			id: "v-open",
			enabled: true,
			supplierPrice: 4000,
			minRetailPrice: 6000,
			suggestedRetailPrice: 7500,
		},
	],
});

const listing = (payload: ReturnType<typeof world>, id: string) =>
	payload.store.listings?.find((row) => row.id === id) as
		| { status: string; resale: { holds: string[] } }
		| undefined;

describe("the minimum reseller level rule", () => {
	it("accepts only no minimum, 2 or 3", () => {
		expect([null, 2, 3].every(isMinResellerLevel)).toBe(true);
		expect([undefined, 0, 1, 4, 2.5, "3"].some(isMinResellerLevel)).toBe(false);
	});

	it("reads a stored value outside the rule as no minimum", () => {
		expect(minResellerLevelOf(7)).toBeNull();
		expect(meetsMinResellerLevel(2, 7)).toBe(true);
		expect(meetsMinResellerLevel(2, 3)).toBe(false);
		expect(meetsMinResellerLevel(3, 3)).toBe(true);
		expect(meetsMinResellerLevel(2, null)).toBe(true);
	});

	it.each([
		[
			"the settings route",
			"../../src/app/(frontend)/api/products/[id]/resale/route.ts",
		],
		["the supplier service", "../../src/services/resaleSupplier.ts"],
		["the Products collection", "../../src/collections/Products.ts"],
		[
			"the web product resale editor",
			"../../../web/src/app/(seller)/seller/resale/products/[id]/product-resale-client.tsx",
		],
	])("%s validates with the shared rule", (_, path) => {
		const source = readFileSync(
			decodeURIComponent(new URL(path, import.meta.url).pathname),
			"utf8",
		);
		expect(source).toMatch(/isMinResellerLevel/);
	});
});

describe("supplier product resale settings", () => {
	it("returns, saves and clears the minimum level", async () => {
		const payload = world();
		expect(
			(await getSupplierResaleSettings(payload, supplier, "reserved", NOW))
				.minResellerLevel,
		).toBe(3);
		expect(
			(await getSupplierResaleSettings(payload, supplier, "open", NOW))
				.minResellerLevel,
		).toBeNull();

		await updateSupplierResaleSettings(
			payload,
			supplier,
			"open",
			settingsInput(2),
			NOW,
		);
		expect(
			(await getSupplierResaleSettings(payload, supplier, "open", NOW))
				.minResellerLevel,
		).toBe(2);

		await updateSupplierResaleSettings(
			payload,
			supplier,
			"open",
			settingsInput(),
			NOW,
		);
		expect(
			(await getSupplierResaleSettings(payload, supplier, "open", NOW))
				.minResellerLevel,
		).toBe(2);

		await updateSupplierResaleSettings(
			payload,
			supplier,
			"open",
			settingsInput(null),
			NOW,
		);
		const offered = await listSupplierResaleProducts(
			payload,
			supplier,
			"supplier-shop",
			NOW,
		);
		expect(
			offered.find((row) => row.productId === "open")?.minResellerLevel,
		).toBeNull();
		expect(
			offered.find((row) => row.productId === "reserved")?.minResellerLevel,
		).toBe(3);
	});

	it("refuses a level outside the rule", async () => {
		const payload = world();
		await expect(
			updateSupplierResaleSettings(
				payload,
				supplier,
				"open",
				Object.assign(settingsInput(), { minResellerLevel: 1 }),
				NOW,
			),
		).rejects.toMatchObject({ code: ERROR_CODES.validation, status: 400 });
	});

	it("holds, without deleting, the listings of resellers below a raised level and releases them when it is lowered", async () => {
		const payload = world();
		payload.store.listings?.push(
			resaleListing("r2-open", "r2", "open"),
			resaleListing("r3-open", "r3", "open"),
		);

		await updateSupplierResaleSettings(
			payload,
			supplier,
			"open",
			settingsInput(3),
			NOW,
		);
		expect(listing(payload, "r2-open")).toMatchObject({
			status: "draft",
			resale: { holds: ["reseller_level_too_low"] },
		});
		expect(listing(payload, "r3-open")).toMatchObject({
			status: "published",
			resale: { holds: [] },
		});
		const resold = await listResoldListings(payload, level2, "r2");
		expect(resold.listings[0]).toMatchObject({
			listingId: "r2-open",
			status: "held",
		});

		await updateSupplierResaleSettings(
			payload,
			supplier,
			"open",
			settingsInput(null),
			NOW,
		);
		expect(listing(payload, "r2-open")).toMatchObject({
			status: "published",
			resale: { holds: [] },
		});
	});
});

describe("what a reseller below the level can do", () => {
	it("sees the product marked in the catalogue, without supplier price or stock", async () => {
		const payload = world();
		const page = await listResaleCatalogue(payload, level2, "r2");
		const reserved = page.products.find((row) => row.productId === "reserved");
		expect(reserved).toMatchObject({ minResellerLevel: 3, levelLocked: true });
		expect(reserved?.variants[0]).not.toHaveProperty("supplierPrice");
		expect(reserved?.variants[0]).not.toHaveProperty("supplierStock");
		expect(page.products.find((row) => row.productId === "open")).toMatchObject(
			{ minResellerLevel: null, levelLocked: false },
		);

		const forLevel3 = await listResaleCatalogue(payload, level3, "r3");
		expect(
			forLevel3.products.find((row) => row.productId === "reserved"),
		).toMatchObject({
			levelLocked: false,
			variants: [{ supplierPrice: 4000 }],
		});
	});

	it("cannot list the product", async () => {
		const payload = world();
		await expect(
			createResaleListing(payload, level2, "r2", {
				productId: "reserved",
				prices: [{ variantId: "v-reserved", price: 7000 }],
				desiredStatus: "published",
			}),
		).rejects.toMatchObject({
			code: ERROR_CODES.resaleResellerLevelTooLow,
			status: 403,
		});
		expect(payload.store["resale-links"] ?? []).toHaveLength(0);

		const created = await createResaleListing(payload, level3, "r3", {
			productId: "reserved",
			prices: [{ variantId: "v-reserved", price: 7000 }],
			desiredStatus: "published",
		});
		expect(created).toMatchObject({ status: "published" });
	});

	it("cannot ask access for that product, nor from a supplier whose every product is above its level", async () => {
		const payload = world();
		const request = (productId?: string) =>
			requestResaleLink(payload, level2, "r2", {
				supplierShop: "supplier-shop",
				acceptTermsVersion: "2026-10-01",
				...(productId ? { productId } : {}),
			});

		await expect(request("reserved")).rejects.toMatchObject({
			code: ERROR_CODES.resaleResellerLevelTooLow,
			status: 403,
		});

		const open = payload.store.products?.find((row) => row.id === "open") as {
			resale: Record<string, unknown>;
		};
		open.resale.minResellerLevel = 3;
		await expect(request()).rejects.toMatchObject({
			code: ERROR_CODES.resaleResellerLevelTooLow,
		});
		expect(payload.store["resale-links"] ?? []).toHaveLength(0);

		open.resale.minResellerLevel = null;
		await expect(request()).resolves.toMatchObject({ status: "requested" });
	});

	it("cannot fix the prices of a listing held for its level", async () => {
		const payload = world();
		payload.store.listings?.push(
			resaleListing("r2-reserved", "r2", "reserved"),
		);
		await expect(
			updateResaleListingPrices(payload, level2, "r2", "r2-reserved", {
				prices: [{ variantId: "v-reserved", price: 7100 }],
			}),
		).rejects.toMatchObject({
			code: ERROR_CODES.resaleResellerLevelTooLow,
			status: 403,
		});
	});
});

describe("the nightly level check", () => {
	it("holds a listing when the reseller's level drops and releases it when the level is back", async () => {
		const payload = world();
		payload.store.listings?.push(
			resaleListing("r3-reserved", "r3", "reserved"),
		);
		const shop = payload.store.shops?.find((row) => row.id === "r3") as {
			level: number;
		};

		shop.level = 2;
		expect(await enforceResellerLevelMinimums(payload, NOW)).toBe(1);
		expect(listing(payload, "r3-reserved")).toMatchObject({
			status: "draft",
			resale: { holds: ["reseller_level_too_low"] },
		});
		expect(await enforceResellerLevelMinimums(payload, NOW)).toBe(0);

		shop.level = 3;
		await enforceResellerLevelMinimums(payload, NOW);
		expect(listing(payload, "r3-reserved")).toMatchObject({
			status: "published",
			resale: { holds: [] },
		});
	});
});
