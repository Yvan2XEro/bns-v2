import { describe, expect, it } from "vitest";
import * as indexer from "../../../search-indexer/src/locationKeys";
import * as api from "../../src/lib/locationKeys";
import { locationFilter } from "../../src/lib/meiliFilter";

const samples = [
	"Douala",
	"YAOUNDÉ",
	"  yaoundé ",
	"Akwa, Douala",
	"Bonabéri/Douala",
	"N'Gaoundéré",
	"Ngaoundere",
	"Kribi-Centre",
	"",
	"   ",
];

describe("location keys", () => {
	it("folds case, accents, punctuation and spacing", () => {
		expect(api.foldLocation("  YAOUNDÉ ")).toBe("yaounde");
		expect(api.foldLocation("N'Gaoundéré")).toBe("n gaoundere");
		expect(api.foldLocation("Kribi-Centre")).toBe("kribi centre");
	});

	it("keys the whole value and each part", () => {
		expect(api.locationKeys("Akwa, Douala")).toEqual([
			"akwa, douala",
			"akwa",
			"douala",
		]);
		expect(api.locationKeys("Douala")).toEqual(["douala"]);
		expect(api.locationKeys(null)).toEqual([]);
		expect(api.locationKeys("  ")).toEqual([]);
	});

	it("the indexer's copy agrees with the API's", () => {
		for (const sample of samples) {
			expect(indexer.foldLocation(sample)).toBe(api.foldLocation(sample));
			expect(indexer.locationKeys(sample)).toEqual(api.locationKeys(sample));
		}
	});

	it("a searched city matches an indexed listing however it was typed", () => {
		for (const stored of ["YAOUNDÉ", "yaounde", "Bastos, Yaoundé"]) {
			expect(api.locationKeys(stored)).toContain(api.foldLocation("Yaoundé"));
		}
	});

	it("filters on the folded key or the exact value, quoted", () => {
		expect(locationFilter("Yaoundé")).toBe(
			'(locationKeys = "yaounde" OR location = "Yaoundé")',
		);
		expect(locationFilter('Dou"ala')).toBe(
			'(locationKeys = "dou\\"ala" OR location = "Dou\\"ala")',
		);
		expect(locationFilter("  ")).toBe('location = "  "');
	});
});
