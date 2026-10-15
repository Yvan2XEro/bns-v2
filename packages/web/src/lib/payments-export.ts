import type { PayoutStatus } from "~/lib/payment-status";
import type { SellerPaymentsView } from "~/types/payments";
import { toCsv } from "./csv";

export interface PaymentsCsvLabels {
	header: readonly string[];
	payoutKind: string;
	orderKind: string;
	payoutStatus: (status: PayoutStatus) => string;
}

/**
 * One sheet for the accountant: every listed payout, then every listed
 * order, with raw integer amounts (no thousands separators) so a spreadsheet
 * reads them as numbers.
 */
export function paymentsCsv(
	view: SellerPaymentsView,
	labels: PaymentsCsvLabels,
): string {
	const currency = view.amounts.currency;
	return toCsv(labels.header, [
		...view.payouts.map((payout) => [
			labels.payoutKind,
			payout.id,
			payout.date.slice(0, 10),
			payout.gross,
			payout.commissionHt,
			payout.vat,
			payout.fee,
			payout.amount,
			labels.payoutStatus(payout.status),
			currency,
		]),
		...view.orders.map((order) => [
			labels.orderKind,
			order.orderNumber,
			order.releaseDate?.slice(0, 10) ?? "",
			order.goods + order.delivery,
			order.commissionHt,
			order.vat,
			"",
			order.netToYou,
			order.status,
			currency,
		]),
	]);
}
