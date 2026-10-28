import { describe, expect, test } from "bun:test";
import {
	CHANNEL_CARD,
	cardImageUrl,
	type ShareSubject,
	shareChannels,
	shareLink,
	shareMessage,
} from "./shareTargets";

const listing: ShareSubject = { kind: "listing", id: "l-1", title: "Canapé" };
const shop: ShareSubject = {
	kind: "shop",
	handle: "chez-awa",
	title: "Chez Awa",
};

describe("shareChannels", () => {
	test("offers the stories only with a Facebook app id", () => {
		expect(shareChannels(null)).toEqual([
			"whatsappStatus",
			"whatsappChat",
			"copyLink",
			"more",
		]);
		expect(shareChannels("123")).toContain("instagramStory");
		expect(shareChannels("123")).toContain("facebookStory");
	});

	test("Status and stories share the 9:16 card, a chat the link alone", () => {
		expect(CHANNEL_CARD.whatsappStatus).toBe("story");
		expect(CHANNEL_CARD.instagramStory).toBe("story");
		expect(CHANNEL_CARD.whatsappChat).toBeNull();
	});
});

describe("links", () => {
	test("say where they were shared", () => {
		expect(
			shareLink("https://buynsellem.com/", listing, "whatsappStatus"),
		).toBe(
			"https://buynsellem.com/listing/l-1?utm_source=whatsapp&utm_medium=status&utm_campaign=share_listing",
		);
		expect(shareLink("https://buynsellem.com", shop, "copyLink")).toBe(
			"https://buynsellem.com/s/chez-awa?utm_source=copy&utm_medium=link&utm_campaign=share_shop",
		);
	});

	test("name the card the website draws", () => {
		expect(cardImageUrl("https://buynsellem.com", listing, "story", "fr")).toBe(
			"https://buynsellem.com/share/listing/l-1/story?lang=fr",
		);
		expect(cardImageUrl("https://buynsellem.com", shop, "square", "en")).toBe(
			"https://buynsellem.com/share/shop/chez-awa/square?lang=en",
		);
	});

	test("the message is the title, then the link", () => {
		expect(shareMessage(listing, "https://x")).toBe("Canapé\nhttps://x");
	});
});
