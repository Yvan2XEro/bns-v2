import { describe, expect, it } from "bun:test";
import { legalBlockLines, legalFormSchema } from "./shopLegal";

describe("legalBlockLines", () => {
	it("shows only the fields the shop actually declared", () => {
		expect(
			legalBlockLines({
				businessType: "company",
				legalName: "AKWA SARL",
				rccmNumber: "RC/DLA/2020/B/1234",
				niu: null,
				verifiedAt: null,
			}),
		).toEqual([
			{ label: "legalName", value: "AKWA SARL" },
			{ label: "businessType", value: "company" },
			{ label: "rccm", value: "RC/DLA/2020/B/1234" },
		]);
	});

	it("is empty for a shop that declared nothing, so the block is not rendered", () => {
		expect(legalBlockLines(null)).toEqual([]);
		expect(
			legalBlockLines({
				businessType: null,
				legalName: null,
				rccmNumber: null,
				niu: null,
				verifiedAt: null,
			}),
		).toEqual([]);
	});
});

describe("legalFormSchema", () => {
	const base = { businessType: "" as const, legalName: "", rccmNumber: "" };

	it("rejects a NIU that is not exactly 14 letters or digits", () => {
		const result = legalFormSchema.safeParse({ ...base, niu: "1234567890123" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.flatten().fieldErrors.niu?.[0]).toBe(
				"shop.niuInvalid",
			);
		}
	});

	it("accepts an empty NIU — clearing the field is always valid", () => {
		expect(legalFormSchema.safeParse({ ...base, niu: "" }).success).toBe(true);
	});

	it("accepts a 14-character alphanumeric NIU", () => {
		expect(
			legalFormSchema.safeParse({ ...base, niu: "M123456789012M" }).success,
		).toBe(true);
	});

	it("rejects a NIU with a character outside letters and digits", () => {
		const result = legalFormSchema.safeParse({
			...base,
			niu: "M12345678901-M",
		});
		expect(result.success).toBe(false);
	});
});
