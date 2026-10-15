// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/searchEvents", () => ({
	queueSearchEvent: vi.fn(async () => undefined),
}));

import { SHOP_SERVICE_FIELDS, Shops } from "../../src/collections/Shops";
import { serializePublicShop } from "../../src/lib/publicShop";
import type { Shop } from "../../src/payload-types";
import { resolvePublicShop } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

interface TextFieldShape {
	name: string;
	validate: (value: unknown) => true | string;
	hooks: { beforeChange: ((args: { value: unknown }) => unknown)[] };
}

const brandField = Shops.fields.find(
	(field) => "name" in field && field.name === "brandColor",
) as unknown as TextFieldShape;

const beforeChange = Shops.hooks?.beforeChange?.[0] as (
	args: unknown,
) => Promise<Record<string, unknown>>;

describe("Shops.brandColor", () => {
	it("is a field a member edits, not one the shop service pins", () => {
		expect(brandField).toBeDefined();
		expect(SHOP_SERVICE_FIELDS).not.toContain("brandColor");
	});

	it("accepts a #RRGGBB colour, or nothing to fall back to the platform's", () => {
		for (const value of ["#1E40AF", "#0f766e", null, undefined, ""]) {
			expect(brandField.validate(value)).toBe(true);
		}
	});

	it("refuses anything else with a message on the field", () => {
		for (const value of [
			"red",
			"#12345",
			"#1234567",
			"1E40AF",
			"#GGGGGG",
			"url(javascript:alert(1))",
			"#1E40AF;background:red",
			42,
		]) {
			expect(brandField.validate(value)).toEqual(expect.any(String));
		}
	});

	it("stores the colour upper-cased, and an empty value as null", () => {
		const [normalize] = brandField.hooks.beforeChange;
		expect(normalize({ value: "#0f766e" })).toBe("#0F766E");
		expect(normalize({ value: "" })).toBeNull();
		expect(normalize({ value: null })).toBeNull();
	});

	it("survives a member's profile update untouched", async () => {
		const payload = fakePayload({ users: [{ id: "u-1" }] });
		const original = {
			id: "s-1",
			handle: "akwa",
			name: "Akwa",
			owner: "u-1",
			status: "active",
			level: 1,
			legal: null,
		};
		const result = await beforeChange({
			operation: "update",
			originalDoc: original,
			data: { ...original, brandColor: "#B45309" },
			req: { payload, user: { id: "u-1" }, context: {} },
		});
		expect(result.brandColor).toBe("#B45309");
	});
});

describe("the public shop shape", () => {
	const base = {
		id: "s-1",
		handle: "akwa",
		name: "Akwa",
		owner: "u-1",
		status: "active",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	} as unknown as Shop;

	it("carries the brand colour", () => {
		expect(
			serializePublicShop({ ...base, brandColor: "#0F766E" }, null).brandColor,
		).toBe("#0F766E");
	});

	it("serves null for no colour, and for a stored value that is not one", () => {
		expect(serializePublicShop(base, null).brandColor).toBeNull();
		expect(
			serializePublicShop({ ...base, brandColor: "red" }, null).brandColor,
		).toBeNull();
	});

	it("reaches the shop page through the public lookup", async () => {
		const payload = fakePayload({
			users: [{ id: "u-1", name: "Aïcha", createdAt: base.createdAt }],
			shops: [{ ...base, brandColor: "#7C3AED", publishedListingCount: 0 }],
			listings: [],
		});
		const result = await resolvePublicShop(payload, "akwa");
		expect(result && "shop" in result && result.shop.brandColor).toBe(
			"#7C3AED",
		);
	});
});
