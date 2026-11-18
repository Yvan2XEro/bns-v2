import { describe, expect, test } from "bun:test";
import { conversationHeader, messageAuthorLabel } from "./conversation-view";

describe("conversationHeader", () => {
	test("a buyer looking at a shop conversation sees the shop", () => {
		expect(
			conversationHeader({
				shop: { name: "Akwa", logoUrl: "/logo.png" },
				other: { name: "Aicha", avatarUrl: "/a.png" },
				viewerIsShopSide: false,
				buyerName: "Eve",
			}),
		).toEqual({
			title: "Akwa",
			subtitle: null,
			logoUrl: "/logo.png",
			isShop: true,
		});
	});

	test("a member looking at the same conversation sees the buyer", () => {
		expect(
			conversationHeader({
				shop: { name: "Akwa", logoUrl: "/logo.png" },
				other: { name: "Eve", avatarUrl: "/e.png" },
				viewerIsShopSide: true,
				buyerName: "Eve",
			}),
		).toEqual({
			title: "Eve",
			subtitle: "Akwa",
			logoUrl: "/e.png",
			isShop: false,
		});
	});

	test("a classic conversation shows the other person", () => {
		expect(
			conversationHeader({
				shop: null,
				other: { name: "Bruno", avatarUrl: null },
				viewerIsShopSide: false,
				buyerName: null,
			}),
		).toEqual({ title: "Bruno", subtitle: null, logoUrl: null, isShop: false });
	});

	test("survives a conversation whose other party has no name", () => {
		expect(
			conversationHeader({
				shop: null,
				other: null,
				viewerIsShopSide: false,
				buyerName: null,
			}),
		).toEqual({ title: "", subtitle: null, logoUrl: null, isShop: false });
	});
});

describe("messageAuthorLabel", () => {
	test("a buyer sees the shop name, with no member name at all", () => {
		expect(
			messageAuthorLabel({
				senderSide: "shop",
				shopName: "Akwa",
				senderFirstName: "Clara",
				formerMemberAuthor: false,
				viewerIsShopSide: false,
			}),
		).toEqual({ primary: "Akwa", secondary: null });
	});

	test("a member sees the shop name with the colleague's first name underneath", () => {
		expect(
			messageAuthorLabel({
				senderSide: "shop",
				shopName: "Akwa",
				senderFirstName: "Clara",
				formerMemberAuthor: false,
				viewerIsShopSide: true,
			}),
		).toEqual({ primary: "Akwa", secondary: "Clara" });
	});

	test("a former member's message reads as such inside the inbox", () => {
		expect(
			messageAuthorLabel({
				senderSide: "shop",
				shopName: "Akwa",
				senderFirstName: "Aicha",
				formerMemberAuthor: true,
				viewerIsShopSide: true,
			}),
		).toEqual({ primary: "Akwa", secondary: "formerMember" });
	});

	test("and still reads as the shop to the buyer", () => {
		expect(
			messageAuthorLabel({
				senderSide: "shop",
				shopName: "Akwa",
				senderFirstName: "Aicha",
				formerMemberAuthor: true,
				viewerIsShopSide: false,
			}),
		).toEqual({ primary: "Akwa", secondary: null });
	});

	test("a buyer-side message is labelled by its sender", () => {
		expect(
			messageAuthorLabel({
				senderSide: "buyer",
				shopName: "Akwa",
				senderFirstName: "Eve",
				formerMemberAuthor: false,
				viewerIsShopSide: true,
			}),
		).toEqual({ primary: "Eve", secondary: null });
	});

	test("a classic conversation has no sides", () => {
		expect(
			messageAuthorLabel({
				senderSide: null,
				shopName: null,
				senderFirstName: "Bruno",
				formerMemberAuthor: false,
				viewerIsShopSide: false,
			}),
		).toEqual({ primary: "Bruno", secondary: null });
	});
});
