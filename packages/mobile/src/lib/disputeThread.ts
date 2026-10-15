import type { DisputeView } from "../../../api/src/contracts/disputes";

export type DisputeTone = "warning" | "primary" | "success" | "neutral";

/** The banner colour: waiting on someone, under review, settled for the buyer, or closed. */
export function disputeTone(status: DisputeView["status"]): DisputeTone {
	switch (status) {
		case "open":
		case "awaiting_seller":
		case "awaiting_buyer":
			return "warning";
		case "under_review":
			return "primary";
		case "resolved_buyer":
		case "resolved_split":
			return "success";
		default:
			return "neutral";
	}
}

/** The one deadline the current status runs against, if any. */
export function disputeDeadline(
	dispute: Pick<DisputeView, "status" | "deadlines">,
): string | null {
	switch (dispute.status) {
		case "open":
			return dispute.deadlines.submitBy;
		case "awaiting_seller":
		case "awaiting_buyer":
			return dispute.deadlines.respondBy;
		case "under_review":
			return dispute.deadlines.reviewDueAt;
		default:
			return null;
	}
}

export type MessageAuthor = "self" | "buyer" | "shop" | "staff";

/** Who a thread message reads as from the viewer's seat; a supplier speaks for the shop side. */
export function messageAuthor(
	authorType: string,
	viewerRole: DisputeView["viewerRole"],
): MessageAuthor {
	const side =
		authorType === "buyer"
			? "buyer"
			: authorType === "seller" || authorType === "supplier"
				? "seller"
				: "moderator";
	if (side === viewerRole) return "self";
	if (side === "buyer") return "buyer";
	if (side === "seller") return "shop";
	return "staff";
}
