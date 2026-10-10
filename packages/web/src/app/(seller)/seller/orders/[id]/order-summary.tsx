"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatXaf } from "~/lib/order-money";
import type { OrderView } from "~/types/order";
import { ratePercent } from "../seller-orders";

/**
 * Items and amounts. Commission lines appear only when the API sent them —
 * it sends them to a role holding `payments.view` and to nobody else, so this
 * component asks no permission question of its own.
 */
export function OrderSummary({ order }: { order: OrderView }) {
	const t = useTranslations("SellerOrders");
	const locale = useLocale() === "en" ? "en" : "fr";
	const money = (amount: number) => formatXaf(amount, locale);

	return (
		<section
			aria-labelledby="order-summary-title"
			className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-5"
		>
			<h2 id="order-summary-title" className="font-semibold text-[#0F172A]">
				{t("items")}
			</h2>
			<ul className="divide-y divide-[#E2E8F0]">
				{order.items.map((item) => (
					<li key={item.id} className="flex gap-3 py-3 first:pt-0">
						{item.imageUrl && (
							// biome-ignore lint/performance/noImgElement: order snapshots are arbitrary remote urls
							<img
								src={item.imageUrl}
								alt=""
								className="h-14 w-14 shrink-0 rounded-lg object-cover"
							/>
						)}
						<div className="min-w-0 flex-1 text-sm">
							<p className="font-medium text-[#0F172A]">{item.title}</p>
							{item.variantLabel && (
								<p className="text-[#64748B]">{item.variantLabel}</p>
							)}
							<p className="text-[#64748B]">
								{t("lineQuantity", {
									quantity: item.quantity,
									price: money(item.unitPrice),
								})}
							</p>
							{item.commissionAmount !== undefined && (
								<p className="text-[#64748B] text-xs">
									{t("lineCommission", {
										amount: money(item.commissionAmount),
									})}
								</p>
							)}
						</div>
						<p className="font-semibold text-[#0F172A] text-sm">
							{money(item.lineSubtotal)}
						</p>
					</li>
				))}
			</ul>

			<dl className="space-y-1 border-[#E2E8F0] border-t pt-3 text-sm">
				<div className="flex justify-between">
					<dt className="text-[#64748B]">{t("subtotal")}</dt>
					<dd>{money(order.amounts.subtotal)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-[#64748B]">{t("deliveryFee")}</dt>
					<dd>{money(order.amounts.deliveryFee)}</dd>
				</div>
				<div className="flex justify-between font-semibold text-[#0F172A]">
					<dt>{t("total")}</dt>
					<dd>{money(order.amounts.total)}</dd>
				</div>
				{order.commission && (
					<div className="flex justify-between text-[#64748B]">
						<dt>
							{t("commissionRate", {
								rate: ratePercent(order.commission.rateBps),
							})}
						</dt>
						<dd>{money(order.commission.amount)}</dd>
					</div>
				)}
			</dl>
		</section>
	);
}
