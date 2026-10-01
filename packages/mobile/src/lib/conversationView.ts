export interface ConversationHeader {
	title: string;
	subtitle: string | null;
	logoUrl: string | null;
	isShop: boolean;
}

/**
 * Who a conversation is "with" depends on which side is looking. A buyer is
 * talking to the shop, whoever answers; a member is talking to the buyer,
 * with the shop as context.
 */
export function conversationHeader(input: {
	shop: { name: string; logoUrl: string | null } | null;
	other: { name: string | null; avatarUrl: string | null } | null;
	viewerIsShopSide: boolean;
	buyerName: string | null;
}): ConversationHeader {
	if (input.shop && !input.viewerIsShopSide) {
		return {
			title: input.shop.name,
			subtitle: null,
			logoUrl: input.shop.logoUrl,
			isShop: true,
		};
	}
	if (input.shop && input.viewerIsShopSide) {
		return {
			title: input.other?.name ?? input.buyerName ?? "",
			subtitle: input.shop.name,
			logoUrl: input.other?.avatarUrl ?? null,
			isShop: false,
		};
	}
	return {
		title: input.other?.name ?? "",
		subtitle: null,
		logoUrl: input.other?.avatarUrl ?? null,
		isShop: false,
	};
}

/**
 * `secondary` is a translation key when it is `"formerMember"`, and a name
 * otherwise. The caller resolves it through next-intl rather than rendering it
 * raw — a buyer must never learn which member typed, which is why the shop
 * side collapses to the shop name for them.
 */
export function messageAuthorLabel(input: {
	senderSide: "buyer" | "shop" | null;
	shopName: string | null;
	senderFirstName: string | null;
	formerMemberAuthor: boolean;
	viewerIsShopSide: boolean;
}): { primary: string; secondary: string | null } {
	if (input.senderSide !== "shop") {
		return { primary: input.senderFirstName ?? "", secondary: null };
	}
	const primary = input.shopName ?? "";
	if (!input.viewerIsShopSide) return { primary, secondary: null };
	return {
		primary,
		secondary: input.formerMemberAuthor
			? "formerMember"
			: (input.senderFirstName ?? null),
	};
}
