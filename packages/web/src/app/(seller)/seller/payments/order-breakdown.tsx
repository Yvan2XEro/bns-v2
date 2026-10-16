"use client";

import { useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import { formatOrderDate } from "~/lib/order-money";
import { rateHeaders, sellerOrderRows } from "~/lib/seller-payments-view";
import { useLocaleKey } from "~/lib/use-locale-key";
import type {
	SellerPaymentOrderRow,
	SellerPaymentRates,
} from "~/types/payments";
import { OrderStatusLabel } from "./order-status-label";

export function OrderBreakdown({
	orders,
	rates,
}: {
	orders: readonly SellerPaymentOrderRow[];
	rates?: SellerPaymentRates;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Payments");
	const tPage = useTranslations("PaymentsPage");
	const locale = useLocaleKey();
	const rows = sellerOrderRows(orders);
	const headers = rateHeaders(rates, locale);

	if (rows.length === 0) return null;

	return (
		<section aria-labelledby="orders-title" className="space-y-3">
			<h2 id="orders-title" className="font-semibold text-ink">
				{t("seller_ordersTitle")}
			</h2>
			<div className="overflow-x-auto rounded-2xl border border-line bg-surface">
				<table className="w-full text-left text-sm">
					<thead className="border-line border-b text-ink-muted text-xs">
						<tr>
							<th className="px-4 py-2 font-medium">#</th>
							<th className="px-4 py-2 font-medium">{t("seller_colGoods")}</th>
							<th className="px-4 py-2 font-medium">
								{t("seller_colDelivery")}
							</th>
							<th className="px-4 py-2 font-medium">
								{headers.commission
									? tPage("colCommissionRate", { rate: headers.commission })
									: t("seller_colCommission")}
							</th>
							<th className="px-4 py-2 font-medium">
								{headers.vat
									? tPage("colVatRate", { rate: headers.vat })
									: t("seller_colVat")}
							</th>
							<th className="px-4 py-2 font-medium">{t("seller_colNet")}</th>
							<th className="px-4 py-2 font-medium">{t("seller_colStatus")}</th>
							<th className="px-4 py-2 font-medium">
								{t("seller_colReleaseDate")}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-line">
						{rows.map((row) => (
							<tr key={row.orderId}>
								<td className="px-4 py-3 font-medium text-ink">
									{row.orderNumber}
								</td>
								<td className="px-4 py-3 text-ink-soft">
									{formatOrderMoney(row.goods, locale)}
								</td>
								<td className="px-4 py-3 text-ink-soft">
									{formatOrderMoney(row.delivery, locale)}
								</td>
								<td className="px-4 py-3 text-ink-soft">
									{formatOrderMoney(row.commissionHt, locale)}
								</td>
								<td className="px-4 py-3 text-ink-soft">
									{formatOrderMoney(row.vat, locale)}
								</td>
								<td className="px-4 py-3 font-semibold text-ink">
									{formatOrderMoney(row.netToYou, locale)}
								</td>
								<td className="px-4 py-3">
									<OrderStatusLabel status={row.status} />
								</td>
								<td className="px-4 py-3 text-ink-muted">
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
