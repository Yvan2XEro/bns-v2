/**
 * The payment pill on an order row — the shop queue's and the buyer's
 * purchases alike. Each client maps the pill to its own audience's words;
 * the reading of `paymentStatus` lives here once.
 */
export type PaymentPill =
	| "cod"
	| "codCollected"
	| "codRefused"
	| "paid"
	| "awaiting"
	| "refunded"
	| "failed";

export function paymentPill(row: {
	paymentMethod?: string | null;
	paymentStatus?: string | null;
}): PaymentPill | null {
	if (!row.paymentMethod) return null;
	if (row.paymentMethod === "cod") {
		if (row.paymentStatus === "cod_collected") return "codCollected";
		if (row.paymentStatus === "cod_refused") return "codRefused";
		return "cod";
	}
	switch (row.paymentStatus) {
		case "paid":
			return "paid";
		case "refunded":
		case "partially_refunded":
			return "refunded";
		case "failed":
			return "failed";
		default:
			return "awaiting";
	}
}
