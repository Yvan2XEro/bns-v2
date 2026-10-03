import type {
	PaymentHoldView,
	SellerPaymentAmounts,
	SellerPaymentOrderRow,
} from "~/types/payments";
import {
	HOLD_CATEGORY_DESCRIPTIONS,
	HOLD_CATEGORY_LABELS,
} from "./payment-status";

export type AmountStripKey =
	| "awaitingDelivery"
	| "inWithdrawalPeriod"
	| "readyForPayout"
	| "payoutInTransit"
	| "paidThisMonth";

export interface AmountStripRow {
	key: AmountStripKey;
	/** Null only for `readyForPayout` under `provider_schedule` — the
	 * provider pays out on its own schedule, which the screen renders as a
	 * sentence, never as a silent 0. */
	amount: number | null;
}

/**
 * The amounts strip, in the spec's own order. Every figure is the ledger's,
 * read verbatim off `SellerPaymentsView.amounts` — this is a pass-through on
 * purpose, not a reducer: the server already nets holds, in-transit payouts
 * and the withdrawal split (`sellerPaymentsView` in
 * `packages/api/src/services/sellerPayments.ts`), so a screen that recomputed
 * any of these from the payouts or orders lists would silently disagree with
 * it the moment a hold or a refund made the two diverge.
 */
export function amountStripRows(
	amounts: SellerPaymentAmounts,
): AmountStripRow[] {
	return [
		{ key: "awaitingDelivery", amount: amounts.awaitingDelivery },
		{ key: "inWithdrawalPeriod", amount: amounts.inWithdrawalPeriod },
		{ key: "readyForPayout", amount: amounts.readyForPayout },
		{ key: "payoutInTransit", amount: amounts.payoutInTransit },
		{ key: "paidThisMonth", amount: amounts.paidThisMonth },
	];
}

/**
 * The per-order breakdown, unchanged from the wire. `netToYou` in particular
 * is never `goods + delivery - commissionHt - vat`: the server's own figure
 * (`sellerPosition` in `sellerPayments.ts`) nets what a later refund took
 * back after release, which that arithmetic cannot see.
 */
export function sellerOrderRows(
	orders: readonly SellerPaymentOrderRow[],
): SellerPaymentOrderRow[] {
	return orders.map((order) => ({ ...order }));
}

export interface HoldRow {
	scope: PaymentHoldView["scope"];
	labelKey: string;
	descriptionKey: string;
	until: string | null;
}

/** Every hold the shop or one of its orders carries, category-only — no
 * amount and no order id, the contract change described in the brief stays
 * parked. */
export function holdRows(holds: readonly PaymentHoldView[]): HoldRow[] {
	return holds.map((hold) => ({
		scope: hold.scope,
		labelKey: HOLD_CATEGORY_LABELS[hold.reasonCategory],
		descriptionKey: HOLD_CATEGORY_DESCRIPTIONS[hold.reasonCategory],
		until: hold.until,
	}));
}
