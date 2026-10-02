/** U+202F, the narrow no-break space French typography uses between a
 * digit group and the currency symbol; a plain space is a different
 * character and would silently change the rendered amount. */
const NARROW_NBSP = " ";

/**
 * `47 000 FCFA` in French (narrow no-break space, the Cameroonian habit) and
 * `XAF 47,000` in English. Both clients mirror this and
 * `order-format-parity.int.spec.ts` (Task 7) compares the three against a
 * fixed table, because an amount that reads differently on the web and in the
 * app is a support ticket about a price, not a formatting nit.
 */
export function formatXaf(amount: number, locale: "fr" | "en"): string {
	const grouped = Math.trunc(Math.abs(amount))
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "fr" ? NARROW_NBSP : ",");
	const sign = amount < 0 ? "-" : "";
	return locale === "fr" ? `${sign}${grouped} FCFA` : `${sign}XAF ${grouped}`;
}

/** The eleven statuses, in the spec's order — the one list, re-exported by
 * Task 8 and mirrored by Task 7. */
export const ORDER_STATUS_NAMES = [
	"placed",
	"confirmed",
	"paid",
	"accepted",
	"shipped",
	"delivered",
	"completed",
	"cancelled",
	"delivery_failed",
	"returned",
	"disputed",
] as const;

export type OrderStatusName = (typeof ORDER_STATUS_NAMES)[number];

/** Keys, not copy: Task 7 owns the words, in four locale files. */
export const ORDER_STATUS_LABEL_KEYS: Record<
	OrderStatusName,
	{ buyer: string; seller: string }
> = {
	placed: { buyer: "status_placed_buyer", seller: "status_placed_seller" },
	confirmed: {
		buyer: "status_confirmed_buyer",
		seller: "status_placed_seller",
	},
	paid: { buyer: "status_paid_buyer", seller: "status_placed_seller" },
	accepted: {
		buyer: "status_accepted_buyer",
		seller: "status_accepted_seller",
	},
	shipped: { buyer: "status_shipped_buyer", seller: "status_shipped_seller" },
	delivered: {
		buyer: "status_delivered_buyer",
		seller: "status_delivered_seller",
	},
	completed: {
		buyer: "status_completed_buyer",
		seller: "status_delivered_seller",
	},
	cancelled: {
		buyer: "status_cancelled_buyer",
		seller: "status_cancelled_seller",
	},
	delivery_failed: {
		buyer: "status_failed_buyer",
		seller: "status_failed_seller",
	},
	returned: {
		buyer: "status_returned_buyer",
		seller: "status_returned_seller",
	},
	disputed: {
		buyer: "status_disputed_buyer",
		seller: "status_disputed_seller",
	},
};
