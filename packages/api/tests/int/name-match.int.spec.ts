// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	jaroWinkler,
	nameMatch,
	normalizeName,
} from "../../src/lib/nameMatch";

describe("jaroWinkler", () => {
	it("matches published reference values", () => {
		expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.9611, 3);
		expect(jaroWinkler("DWAYNE", "DUANE")).toBeCloseTo(0.84, 3);
		expect(jaroWinkler("DIXON", "DICKSONX")).toBeCloseTo(0.8133, 3);
	});

	it("scores an identical pair at 1 and a fully disjoint pair at 0", () => {
		expect(jaroWinkler("MBARGA", "MBARGA")).toBe(1);
		expect(jaroWinkler("ABC", "XYZ")).toBe(0);
	});
});

describe("normalizeName", () => {
	it("folds diacritics, upper-cases, strips punctuation and sorts tokens", () => {
		expect(normalizeName("NGONO Désiré")).toBe("DESIRE NGONO");
		expect(normalizeName("Desire Ngono")).toBe("DESIRE NGONO");
		expect(normalizeName("O'Brian-Fouda")).toBe("BRIAN FOUDA O");
	});
});

describe("nameMatch", () => {
	it("matches an exact name", () => {
		expect(
			nameMatch({ candidate: "Jean Mbarga", identityName: "Jean Mbarga" }),
		).toEqual({ result: "match", score: 1 });
	});

	it("matches the same tokens in a different order", () => {
		expect(
			nameMatch({ candidate: "Mbarga Jean", identityName: "Jean Mbarga" }),
		).toEqual({ result: "match", score: 1 });
	});

	it("matches across diacritics, the Cameroonian-name case", () => {
		expect(
			nameMatch({
				candidate: "NGONO Désiré",
				identityName: "Desire Ngono",
			}),
		).toEqual({ result: "match", score: 1 });
	});

	it("never reaches match for a one-token candidate, however close the score", () => {
		const result = nameMatch({
			candidate: "Jean",
			identityName: "Jean Mbarga",
		});
		expect(result.result).toBe("partial");
		expect(result.score).toBeLessThan(0.92);
	});

	it("is partial when only a surname token is shared", () => {
		expect(
			nameMatch({ candidate: "Paul Mbarga", identityName: "Jean Mbarga" }),
		).toEqual({ result: "partial", score: 0.49242424242424243 });
	});

	it("is mismatch when nothing is shared", () => {
		const result = nameMatch({
			candidate: "Paul Essomba",
			identityName: "Jean Mbarga",
		});
		expect(result.result).toBe("mismatch");
		expect(result.score).toBeLessThan(0.92);
	});

	it("accepts the business name as the identity side", () => {
		expect(
			nameMatch({
				candidate: "Boutique Fotso",
				identityName: "Jean Essiben",
				businessName: "Boutique Fotso",
			}),
		).toEqual({ result: "match", score: 1 });
	});

	it("caps at partial when providerName disagrees, even though the typed name matches identity", () => {
		expect(
			nameMatch({
				candidate: "Jean Mbarga",
				identityName: "Jean Mbarga",
				providerName: "Paul Essomba",
			}),
		).toEqual({ result: "partial", score: 1 });
	});

	it("stays match when providerName agrees too", () => {
		expect(
			nameMatch({
				candidate: "Jean Mbarga",
				identityName: "Jean Mbarga",
				providerName: "Mbarga Jean",
			}),
		).toEqual({ result: "match", score: 1 });
	});

	it("does not match on a Jaro-Winkler score just under the 0.92 threshold", () => {
		const result = nameMatch({
			candidate: "Desire Ngono",
			identityName: "Desire Ekono",
		});
		expect(result.score).toBeCloseTo(0.9133, 3);
		expect(result.score).toBeLessThan(0.92);
		expect(result.result).not.toBe("match");
	});

	it("matches via Jaro-Winkler when token containment fails on a typo'd surname", () => {
		const result = nameMatch({
			candidate: "Serge Ateba",
			identityName: "Serge Atemba",
		});
		expect(result.score).toBeGreaterThanOrEqual(0.92);
		expect(result.result).toBe("match");
	});
});
