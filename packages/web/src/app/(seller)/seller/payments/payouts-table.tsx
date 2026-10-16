"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import { formatOrderDate } from "~/lib/order-money";
import { PAYOUT_STATUSES } from "~/lib/payment-status";
import { rateHeaders } from "~/lib/seller-payments-view";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { SellerPaymentRates, SellerPayoutRow } from "~/types/payments";

/** Gross, the commission and VAT taken before sending, and what arrived. */
export function PayoutsTable({
	payouts,
	rates,
	onExport,
}: {
	payouts: readonly SellerPayoutRow[];
	rates?: SellerPaymentRates;
	onExport: () => void;
}) {
	const formatOrderMoney = useOrderMoney();
	const tPayments = useTranslations("Payments");
	const tPage = useTranslations("PaymentsPage");
	const locale = useLocaleKey();
	const headers = rateHeaders(rates, locale);

	return (
		<section
			aria-labelledby="payouts-title"
			className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
		>
			<div className="flex items-center justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-3.5">
				<h2 id="payouts-title" className="font-bold text-[#0F172A] text-base">
					{tPayments("seller_payoutsTitle")}
				</h2>
				{payouts.length > 0 && (
					<button
						type="button"
						onClick={onExport}
						className="font-semibold text-[#1E40AF] text-[13px] hover:underline"
					>
						{tPage("export")}
					</button>
				)}
			</div>
			{payouts.length === 0 ? (
				<p className="px-6 py-10 text-center text-[#64748B] text-sm">
					{tPayments("seller_noPayouts")}
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] text-left text-sm">
						<thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
							<tr>
								<th className="px-[18px] py-2.5 font-medium">
									{tPage("colPayout")}
								</th>
								<th className="px-3 py-2.5 text-right font-medium">
									{tPage("colGross")}
								</th>
								<th className="px-3 py-2.5 text-right font-medium">
									{headers.commission
										? tPage("colCommissionRate", {
												rate: headers.commission,
											})
										: tPayments("seller_colCommission")}
								</th>
								<th className="px-3 py-2.5 text-right font-medium">
									{headers.vat
										? tPage("colVatRate", { rate: headers.vat })
										: tPayments("seller_colVat")}
								</th>
								<th className="px-3 py-2.5 text-right font-medium">
									{tPage("colNetPaid")}
								</th>
								<th className="px-[18px] py-2.5 font-medium">
									{tPayments("seller_colStatus")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#F1F5F9]">
							{payouts.map((payout) => (
								<tr key={payout.id}>
									<td className="whitespace-nowrap px-[18px] py-3">
										<Link
											href={`/seller/payments/payouts/${encodeURIComponent(payout.id)}`}
											className="font-semibold text-[#1E40AF] hover:underline"
										>
											{formatOrderDate(payout.date, locale)}
										</Link>
										<p className="text-[#64748B] text-xs">
											{tPage("orderCount", { count: payout.orderCount })}
											{payout.destinationMasked
												? ` · ${payout.destinationMasked}`
												: ""}
										</p>
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-right text-[#334155] tabular-nums">
										{formatOrderMoney(payout.gross, locale)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-right text-[#64748B] tabular-nums">
										− {formatOrderMoney(payout.commissionHt, locale)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-right text-[#64748B] tabular-nums">
										− {formatOrderMoney(payout.vat, locale)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
										<p className="font-bold text-[#0F172A]">
											{formatOrderMoney(payout.amount, locale)}
										</p>
										{payout.fee > 0 && (
											<p className="text-[#64748B] text-xs">
												{tPage("providerFee", {
													amount: formatOrderMoney(payout.fee, locale),
												})}
											</p>
										)}
									</td>
									<td className="px-[18px] py-3 text-[#334155]">
										{tPayments(PAYOUT_STATUSES[payout.status])}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
