"use client";

import { useTranslations } from "next-intl";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import { sellerOrderRows } from "~/lib/seller-payments-view";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { SellerPaymentOrderRow } from "~/types/payments";
import { OrderStatusLabel } from "./order-status-label";

export function OrderBreakdown({
	orders,
}: {
	orders: readonly SellerPaymentOrderRow[];
}) {
	const t = useTranslations("Payments");
	const locale = useLocaleKey();
	const rows = sellerOrderRows(orders);

	if (rows.length === 0) return null;

	return (
		<section aria-labelledby="orders-title" className="space-y-3">
			<h2 id="orders-title" className="font-semibold text-[#0F172A]">
				{t("seller_ordersTitle")}
			</h2>
			<div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
				<table className="w-full text-left text-sm">
					<thead className="border-[#E2E8F0] border-b text-[#64748B] text-xs">
						<tr>
							<th className="px-4 py-2 font-medium">#</th>
							<th className="px-4 py-2 font-medium">{t("seller_colGoods")}</th>
							<th className="px-4 py-2 font-medium">
								{t("seller_colDelivery")}
							</th>
							<th className="px-4 py-2 font-medium">
								{t("seller_colCommission")}
							</th>
							<th className="px-4 py-2 font-medium">{t("seller_colVat")}</th>
							<th className="px-4 py-2 font-medium">{t("seller_colNet")}</th>
							<th className="px-4 py-2 font-medium">{t("seller_colStatus")}</th>
							<th className="px-4 py-2 font-medium">
								{t("seller_colReleaseDate")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-[#E2E8F0]">
						{rows.map((row) => (
							<tr key={row.orderId}>
								<td className="px-4 py-3 font-medium text-[#0F172A]">
									{row.orderNumber}
								</td>
								<td className="px-4 py-3 text-[#334155]">
									{formatXaf(row.goods, locale)}
								</td>
								<td className="px-4 py-3 text-[#334155]">
									{formatXaf(row.delivery, locale)}
								</td>
								<td className="px-4 py-3 text-[#334155]">
									{formatXaf(row.commissionHt, locale)}
								</td>
								<td className="px-4 py-3 text-[#334155]">
									{formatXaf(row.vat, locale)}
								</td>
								<td className="px-4 py-3 font-semibold text-[#0F172A]">
									{formatXaf(row.netToYou, locale)}
								</td>
								<td className="px-4 py-3">
									<OrderStatusLabel status={row.status} />
								</td>
								<td className="px-4 py-3 text-[#64748B]">
									{row.releaseDate
										? formatOrderDate(row.releaseDate, locale)
										: "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
