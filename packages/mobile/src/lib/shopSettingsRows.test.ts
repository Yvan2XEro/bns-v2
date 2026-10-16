import { describe, expect, test } from "bun:test";
import type { MyShop } from "../types/api";
import {
	categoriesSummary,
	isShopSettingsSection,
	shopSettingsGroups,
} from "./shopSettingsRows";

function shop(overrides: Partial<MyShop> = {}): MyShop {
	return {
		id: "s-1",
		handle: "akwatech",
		name: "Akwa Tech Store",
		description: null,
		logo: null,
		banner: null,
		contact: { phone: "+237690421807", whatsapp: null, email: null },
		location: {
			city: "Douala",
			region: "Littoral",
			country: null,
			countryCode: null,
		},
		categories: [],
		legal: null,
		brandColor: null,
		...overrides,
	} as MyShop;
}

describe("shopSettingsGroups", () => {
	test("shows each field's current value, or nothing when it is not set", () => {
		const rows = shopSettingsGroups(shop(), true).flatMap((g) => g.rows);
		const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
		expect(byId.name.value).toEqual({ text: "Akwa Tech Store" });
		expect(byId.city.value).toEqual({ text: "Douala, Littoral" });
		expect(byId.description.value).toBeNull();
		expect(byId.whatsapp.value).toBeNull();
		expect(byId.whatsapp.section).toBe("contacts");
		expect(byId.address.value).toEqual({ text: "buynsellem.com/s/akwatech" });
		expect(byId.color.value).toEqual({ key: "shop.settingsRows.colorDefault" });
	});

	test("keeps the brand colour reachable and the close row for the owner only", () => {
		const ids = (owner: boolean) =>
			shopSettingsGroups(shop({ brandColor: "#1e40af" }), owner)
				.flatMap((g) => g.rows)
				.map((row) => row.id);
		expect(ids(true)).toContain("color");
		expect(ids(true)).toContain("close");
		expect(ids(false)).toContain("color");
		expect(ids(false)).not.toContain("close");
	});

	test("names the declared business type", () => {
		const legal = shopSettingsGroups(
			shop({
				legal: {
					businessType: "company",
					legalName: null,
					rccmNumber: null,
					niu: null,
					verifiedAt: null,
				},
			}),
			true,
		)
			.flatMap((g) => g.rows)
			.find((row) => row.id === "legal");
		expect(legal?.value).toEqual({ key: "shop.businessTypeCompany" });
	});
});

describe("categoriesSummary", () => {
	test("names two categories and counts the rest against the limit", () => {
		expect(categoriesSummary([])).toBeNull();
		expect(categoriesSummary([{ name: "A" }])).toEqual({
			key: "shop.settingsRows.categoriesValue",
			values: { names: "A", extra: 0, count: 1, max: 5 },
		});
		expect(
			categoriesSummary([{ name: "A" }, { name: "B" }, { name: "C" }]),
		).toEqual({
			key: "shop.settingsRows.categoriesMore",
			values: { names: "A, B", extra: 1, count: 3, max: 5 },
		});
	});
});

describe("isShopSettingsSection", () => {
	test("accepts only the known sections", () => {
		expect(isShopSettingsSection("color")).toBe(true);
		expect(isShopSettingsSection("banner")).toBe(false);
		expect(isShopSettingsSection(undefined)).toBe(false);
	});
});
