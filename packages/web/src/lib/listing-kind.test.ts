import { describe, expect, it } from "bun:test";
import en from "../../messages/en.json";
import { adAction, kindPriceText } from "./listing-kind";
import { listingStructuredData } from "./listing-structured-data";

/** Resolves a `ListingKind` key against the English catalogue. */
function t(key: string): string {
	let node: unknown = en.ListingKind;
	for (const part of key.split(".")) {
		node =
			node && typeof node === "object"
				? (node as Record<string, unknown>)[part]
				: undefined;
	}
	if (typeof node !== "string") throw new Error(`missing ListingKind.${key}`);
	return node;
}

describe("kindPriceText", () => {
	it("prints a rent with its unit", () => {
		expect(
			kindPriceText("150 000 FCFA", { kind: "rental", priceUnit: "month" }, t),
		).toBe("150 000 FCFA / month");
	});

	it("prints an old ad saved without a unit as a one-off price", () => {
		expect(kindPriceText("40 000 000 FCFA", { kind: "rental" }, t)).toBe(
			"40 000 000 FCFA",
		);
	});

	it("words a missing price for the kind", () => {
		expect(kindPriceText(null, { kind: "job" }, t)).toBe("Salary not stated");
		expect(kindPriceText(null, { kind: "service" }, t)).toBe("On quote");
		expect(kindPriceText(null, {}, t)).toBe("Price on request");
	});
});

describe("adAction", () => {
	it("orders a shop product and asks for a visit of a flat", () => {
		expect(adAction({ kind: "product" }, true)).toBe("order");
		expect(adAction({ kind: "rental" }, false)).toBe("visit");
		expect(adAction({ kind: "job" }, false)).toBe("apply");
	});
});

describe("listingStructuredData", () => {
	const base = {
		priceUnit: null,
		title: "Comptable confirmé",
		description: "CDI à Douala",
		url: "https://buynsellem.com/listing/1",
		images: [],
		price: 350000,
		currency: "XAF",
		location: "Douala",
		createdAt: "2026-10-01T00:00:00.000Z",
		expiresAt: "2026-10-31T00:00:00.000Z",
		available: true,
		attributes: { "contract-type": "Full-time", company: "Akwa SARL" },
		categoryName: "Offres d'emploi",
		seller: null,
	};

	it("describes a job offer as a JobPosting, never a Product", () => {
		const data = listingStructuredData({
			...base,
			kind: "job",
			priceUnit: "month",
		});
		expect(data).toMatchObject({
			"@type": "JobPosting",
			employmentType: "FULL_TIME",
			hiringOrganization: { name: "Akwa SARL" },
			baseSalary: { currency: "XAF", value: { unitText: "MONTH" } },
		});
	});

	it("describes a rent as an Offer of an Accommodation, priced per month", () => {
		const data = listingStructuredData({
			...base,
			kind: "rental",
			priceUnit: "month",
		});
		expect(data).toMatchObject({
			"@type": "Offer",
			itemOffered: { "@type": "Accommodation" },
			priceSpecification: { unitCode: "MON" },
		});
	});

	it("keeps goods as a Product", () => {
		expect(listingStructuredData({ ...base, kind: "product" })).toMatchObject({
			"@type": "Product",
			offers: { price: 350000, availability: "https://schema.org/InStock" },
		});
	});
});
