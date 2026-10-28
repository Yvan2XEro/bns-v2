import { describe, expect, test } from "bun:test";
import { cardPath, clip, displayUrl, drawable, isCardFormat } from "./formats";

describe("share card formats", () => {
	test("name the three shapes, nothing else", () => {
		expect(["og", "story", "square"].every(isCardFormat)).toBe(true);
		expect(isCardFormat("toString")).toBe(false);
		expect(isCardFormat("banner")).toBe(false);
	});

	test("a card's URL carries the subject's version", () => {
		expect(
			cardPath(
				{ kind: "listing", id: "l-1" },
				"og",
				"2026-10-28T10:00:00.000Z",
			),
		).toBe("/share/listing/l-1/og?v=2026-10-28T10%3A00%3A00.000Z");
		expect(cardPath({ kind: "shop", handle: "chez-awa" }, "story")).toBe(
			"/share/shop/chez-awa/story",
		);
	});

	test("long text is cut at a word", () => {
		expect(clip("iPhone 15 Pro Max 256 Go comme neuf", 20)).toBe(
			"iPhone 15 Pro Max…",
		);
		expect(clip("  court  ", 20)).toBe("court");
	});

	test("links print without their scheme", () => {
		expect(displayUrl("https://www.buynsellem.com/s/chez-awa")).toBe(
			"buynsellem.com/s/chez-awa",
		);
	});
});

describe("drawable", () => {
	test("keeps accents and punctuation, drops what the font cannot draw", () => {
		expect(drawable("🔥 Écouteurs — prix cassé ★★★ 145\u202f000 FCFA 😍")).toBe(
			"Écouteurs — prix cassé 145 000 FCFA",
		);
		expect(drawable("Çà et là, l’œuvre…")).toBe("Çà et là, l’œuvre…");
	});
});
