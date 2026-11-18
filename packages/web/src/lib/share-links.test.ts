import { describe, expect, test } from "bun:test";
import { cardFileName, networkShareUrl, webShareLink } from "./share-links";

const listing = { kind: "listing", id: "l-1" } as const;
const shop = { kind: "shop", handle: "chez-awa" } as const;

describe("share links", () => {
	test("say where they were shared", () => {
		expect(webShareLink("https://buynsellem.com/", listing, "whatsapp")).toBe(
			"https://buynsellem.com/listing/l-1?utm_source=whatsapp&utm_medium=chat&utm_campaign=share_listing",
		);
		expect(webShareLink("https://buynsellem.com", shop, "files")).toBe(
			"https://buynsellem.com/s/chez-awa?utm_source=share_sheet&utm_medium=share&utm_campaign=share_shop",
		);
	});

	test("use each network's own share address", () => {
		const link = "https://buynsellem.com/listing/l-1?a=1&b=2";
		expect(networkShareUrl("whatsapp", link, "Canapé")).toBe(
			`https://wa.me/?text=${encodeURIComponent(`Canapé\n${link}`)}`,
		);
		expect(networkShareUrl("facebook", link, "x")).toBe(
			`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
		);
		expect(networkShareUrl("x", link, "Canapé")).toContain(
			`url=${encodeURIComponent(link)}`,
		);
		expect(networkShareUrl("linkedin", link, "")).toBe(
			`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
		);
	});

	test("name a downloaded card after what it shows", () => {
		expect(cardFileName(shop, "story")).toBe(
			"buynsellem-shop-chez-awa-story.jpg",
		);
	});
});
