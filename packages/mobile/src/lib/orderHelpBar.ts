export type OrderHelpAction = "report_problem" | "message_shop";

/**
 * The fixed bar under an order. "Un problème ?" follows the rule the screen
 * already applied to its report link (disputes on, `contest_delivery`
 * offered); writing to the shop needs only a shop to write to.
 */
export function orderHelpActions(input: {
	canReportProblem: boolean;
	shopId: string | null | undefined;
}): OrderHelpAction[] {
	const actions: OrderHelpAction[] = [];
	if (input.canReportProblem) actions.push("report_problem");
	if (input.shopId) actions.push("message_shop");
	return actions;
}

export type ShopMessageTarget =
	| { kind: "open"; conversationId: string }
	| { kind: "start"; shopId: string };

/** The order's own conversation when it has one, else a buyer↔shop thread. */
export function shopMessageTarget(
	conversationId: string | null | undefined,
	shopId: string,
): ShopMessageTarget {
	return conversationId
		? { kind: "open", conversationId }
		: { kind: "start", shopId };
}
