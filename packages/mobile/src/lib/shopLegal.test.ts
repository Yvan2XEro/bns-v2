import { describe, expect, it } from "bun:test";
import { legalBlockLines, legalIsVerified } from "./shopLegal";

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

describe("legalIsVerified", () => {
	it("is true only once a reviewer has approved it", () => {
		expect(
			legalIsVerified({
				businessType: null,
				legalName: "X",
				rccmNumber: null,
				niu: null,
				verifiedAt: "2026-10-01T00:00:00.000Z",
			}),
		).toBe(true);
		expect(
			legalIsVerified({
				businessType: null,
				legalName: "X",
				rccmNumber: null,
				niu: null,
				verifiedAt: null,
			}),
		).toBe(false);
		expect(legalIsVerified(null)).toBe(false);
	});
});
