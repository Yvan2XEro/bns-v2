"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import { PAYOUT_STATUSES } from "~/lib/payment-status";
import type { SellerPayoutRow } from "~/types/payments";
import { useLocaleKey } from "./use-locale-key";

export function PayoutsTable({
	payouts,
}: {
	payouts: readonly SellerPayoutRow[];
}) {
	const t = useTranslations("Payments");
	const locale = useLocaleKey();

	return (
		<section aria-labelledby="payouts-title" className="space-y-3">
			<h2 id="payouts-title" className="font-semibold text-[#0F172A]">
				{t("seller_payoutsTitle")}
			</h2>
			{payouts.length === 0 ? (
				<p className="rounded-2xl border border-[#E2E8F0] border-dashed bg-white px-6 py-10 text-center text-[#64748B] text-sm">
					{t("seller_noPayouts")}
				</p>
			) : (
				<div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
					<table className="w-full text-left text-sm">
						<thead className="border-[#E2E8F0] border-b text-[#64748B] text-xs">
							<tr>
								<th className="px-4 py-2 font-medium">{t("seller_colDate")}</th>
								<th className="px-4 py-2 font-medium">
									{t("seller_colAmount")}
								</th>
								<th className="px-4 py-2 font-medium">{t("seller_colFee")}</th>
								<th className="px-4 py-2 font-medium">
									{t("seller_colDestination")}
								</th>
								<th className="px-4 py-2 font-medium">
									{t("seller_colStatus")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#E2E8F0]">
							{payouts.map((payout) => (
								<tr key={payout.id}>
									<td className="px-4 py-3">
										<Link
											href={`/seller/payments/payouts/${encodeURIComponent(payout.id)}`}
											className="inline-flex min-h-6 items-center text-[#1E40AF] hover:underline"
										>
											{formatOrderDate(payout.date, locale)}
										</Link>
									</td>
									<td className="px-4 py-3 font-semibold text-[#0F172A]">
										{formatXaf(payout.amount, locale)}
									</td>
									<td className="px-4 py-3 text-[#64748B]">
										{formatXaf(payout.fee, locale)}
									</td>
									<td className="px-4 py-3 text-[#334155]">
										{payout.destinationMasked}
									</td>
									<td className="px-4 py-3 text-[#334155]">
										{t(PAYOUT_STATUSES[payout.status])}
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
