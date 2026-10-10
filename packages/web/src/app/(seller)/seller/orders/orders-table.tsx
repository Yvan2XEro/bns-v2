"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import type { ShopOrderTab } from "~/lib/order-status";
import type { OrderListEntry } from "~/types/order";
import { AcceptCountdown } from "./accept-countdown";
import { TierBadge } from "./tier-badge";

export function OrdersTable({
	rows,
	tab,
}: {
	rows: OrderListEntry[];
	tab: ShopOrderTab;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";

	return (
		<div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
			<table className="w-full min-w-[760px] text-left text-sm">
				<thead className="bg-[#F8FAFC] text-[#64748B] text-xs uppercase">
					<tr>
						<th scope="col" className="px-4 py-3">
							{t("columnNumber")}
						</th>
						<th scope="col" className="px-4 py-3">
							{t("columnDate")}
						</th>
						<th scope="col" className="px-4 py-3">
							{t("columnCustomer")}
						</th>
						<th scope="col" className="px-4 py-3">
							{t("columnItems")}
						</th>
						<th scope="col" className="px-4 py-3 text-right">
							{t("columnTotal")}
						</th>
						<th scope="col" className="px-4 py-3">
							{t("columnDeadline")}
						</th>
						<th scope="col" className="px-4 py-3">
							{t("columnTier")}
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[#E2E8F0]">
					{rows.map((row) => (
						<tr key={row.id} className="hover:bg-[#F8FAFC]">
							<td className="px-4 py-3">
								<Link
									href={`/seller/orders/${encodeURIComponent(row.id)}`}
									className="font-semibold text-[#1E40AF] hover:underline"
								>
									{row.orderNumber}
								</Link>
							</td>
							<td className="px-4 py-3 text-[#475569]">
								{formatOrderDate(row.placedAt, locale)}
							</td>
							<td className="px-4 py-3 text-[#0F172A]">
								{row.recipientName ?? "—"}
							</td>
							<td className="px-4 py-3 text-[#475569]">
								{t("itemsSummary", {
									title: row.firstItemTitle,
									count: row.itemCount,
								})}
							</td>
							<td className="px-4 py-3 text-right font-semibold text-[#0F172A]">
								{formatXaf(row.total, locale)}
							</td>
							<td className="px-4 py-3">
								{tab === "to_accept" ? (
									<AcceptCountdown acceptBy={row.acceptBy ?? null} />
								) : tab === "failed" && row.deliveryFailureReason ? (
									<span className="text-[#B91C1C]">
										{tRoot(`OrderStatus.failure_${row.deliveryFailureReason}`)}
									</span>
								) : (
									<span className="text-[#94A3B8]">—</span>
								)}
							</td>
							<td className="px-4 py-3">
								{row.phoneTier ? <TierBadge tier={row.phoneTier} /> : "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
