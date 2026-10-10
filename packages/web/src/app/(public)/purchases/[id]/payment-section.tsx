"use client";

import { useTranslations } from "next-intl";
import { useFeeInvoiceId } from "~/hooks/use-purchases";
import type { OrderView } from "~/types/order";
import { FeeInvoiceButton } from "./fee-invoice-button";

const REFUND_STATUSES = new Set<OrderView["paymentStatus"]>([
	"refunded",
	"partially_refunded",
]);

/**
 * The order's own payment facts: nothing here is an action — accepting or
 * declining a `paid` order is `order-actions.ts`'s row, untouched by this
 * screen. Protected-payment orders only: a COD order has no fee, no refund
 * delay of its own and never carries a fee invoice.
 */
export function PaymentSection({ order }: { order: OrderView }) {
	const t = useTranslations("Payments");
	const feeInvoice = useFeeInvoiceId(order.id);

	if (order.paymentMethod !== "mobile_money") return null;

	const refunding = REFUND_STATUSES.has(order.paymentStatus);

	return (
		<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-semibold text-[#0F172A]">
				{t("order_paymentTitle")}
			</h2>
			{order.paymentStatus === "paid" && (
				<p className="text-[#166534] text-sm">{t("order_paidProtected")}</p>
			)}
			{refunding && (
				<div className="space-y-1">
					<h3 className="font-medium text-[#0F172A] text-sm">
						{t("order_refundsTitle")}
					</h3>
					{/* The 5-7 business-day window is the spec's own commitment, not a
					    configurable AppSettings value, so it is not read off any config. */}
					<p className="text-[#64748B] text-sm">
						{t("order_refundDelay", { days: "5–7" })}
					</p>
				</div>
			)}
			{feeInvoice.data && <FeeInvoiceButton invoiceId={feeInvoice.data} />}
		</section>
	);
}
