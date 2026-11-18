import { describe, expect, test } from "bun:test";
import { excerptAround, highlightSegments } from "./highlight";

describe("highlightSegments", () => {
	test("marks a word regardless of case and accents", () => {
		expect(highlightSegments("Téléphones neufs", "telephone")).toEqual([
			{ text: "Téléphone", match: true },
			{ text: "s neufs", match: false },
		]);
	});

	test("marks every occurrence of every word", () => {
		const marked = highlightSegments(
			"Coques et chargeurs de coques",
			"coque chargeur",
		)
			.filter((segment) => segment.match)
			.map((segment) => segment.text);
		expect(marked).toEqual(["Coque", "chargeur", "coque"]);
	});

	test("ignores one-letter words and an empty query", () => {
		expect(highlightSegments("a b c", "a")).toEqual([
			{ text: "a b c", match: false },
		]);
		expect(highlightSegments("", "tel")).toEqual([]);
	});

	test("keeps decomposed source text intact", () => {
		const text = "Téléphone";
		const segments = highlightSegments(text, "telephone");
		expect(segments.map((segment) => segment.text).join("")).toBe(text);
		expect(segments[0].match).toBe(true);
	});
});

describe("excerptAround", () => {
	test("leaves a description whose match is near the start alone", () => {
		expect(excerptAround("Téléphones et accessoires", "telephone")).toBe(
			"Téléphones et accessoires",
		);
	});

	test("starts a few words before a match that sits far in", () => {
		const text =
			"Boutique familiale ouverte depuis 2010 au marché central, vente de téléphones";
		const excerpt = excerptAround(text, "telephone");
		expect(excerpt.startsWith("…")).toBe(true);
		expect(excerpt.endsWith("téléphones")).toBe(true);
		expect(excerpt.length).toBeLessThan(text.length);
	});
});
