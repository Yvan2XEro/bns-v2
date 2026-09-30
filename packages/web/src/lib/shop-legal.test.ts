import { describe, expect, it } from "bun:test";
import {
	legalBlockLines,
	legalFormDefaults,
	legalFormSchema,
	toLegalUpdateInput,
} from "./shop-legal";

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

describe("legalFormDefaults / legalFormSchema / toLegalUpdateInput", () => {
	it("round-trips a shop's declared legal block through the form and back", () => {
		const legal = {
			businessType: "company" as const,
			legalName: "AKWA SARL",
			rccmNumber: "RC/DLA/2020/B/1234",
			niu: "P123456789",
			verifiedAt: null,
		};
		const defaults = legalFormDefaults(legal);
		expect(legalFormSchema.safeParse(defaults).success).toBe(true);
		expect(toLegalUpdateInput(defaults)).toEqual({
			businessType: "company",
			legalName: "AKWA SARL",
			rccmNumber: "RC/DLA/2020/B/1234",
			niu: "P123456789",
		});
	});

	it("defaults to blank fields for a shop that declared nothing, and submits them as null", () => {
		const defaults = legalFormDefaults(null);
		expect(defaults).toEqual({
			businessType: "",
			legalName: "",
			rccmNumber: "",
			niu: "",
		});
		expect(toLegalUpdateInput(defaults)).toEqual({
			businessType: null,
			legalName: null,
			rccmNumber: null,
			niu: null,
		});
	});

	it("rejects a business type outside the fixed list", () => {
		const result = legalFormSchema.safeParse({
			businessType: "not-a-real-type",
			legalName: "",
			rccmNumber: "",
			niu: "",
		});
		expect(result.success).toBe(false);
	});
});
