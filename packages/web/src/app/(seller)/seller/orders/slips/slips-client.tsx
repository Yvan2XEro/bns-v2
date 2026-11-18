"use client";

import { useQueries } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { QrCode } from "~/components/qr-code";
import { useOrderMoney } from "~/hooks/use-order-money";
import { shopOrderKey } from "~/hooks/use-seller-orders";
import { amountToCollect, slipAddress } from "~/lib/delivery-slip";
import { apiGet } from "~/lib/shop-api";
import type { OrderView } from "~/types/order";

/**
 * A6 delivery slips, one per page: reference, recipient, address, items and
 * the cash to collect in large print, with a QR code that opens the order.
 * Printed for one order from its page or for a selection from the list.
 */
export function SlipsClient({
	shopId,
	orderIds,
}: {
	shopId: string;
	orderIds: string[];
}) {
	const t = useTranslations("SellerOrderList");
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale() === "en" ? "en" : "fr";
	const orders = useQueries({
		queries: orderIds.map((id) => ({
			queryKey: shopOrderKey(shopId, id),
			queryFn: () => apiGet<OrderView>(`/api/orders/${encodeURIComponent(id)}`),
		})),
	});
	const loaded = orders.flatMap((query) => (query.data ? [query.data] : []));
	const pending = orders.some((query) => query.isPending);
	const origin = typeof window === "undefined" ? "" : window.location.origin;

	return (
		<div className="space-y-4">
			<style>{`@media print {
	@page { size: A6; margin: 5mm; }
	body * { visibility: hidden; }
	#delivery-slips, #delivery-slips * { visibility: visible; }
	#delivery-slips { position: absolute; inset: 0 auto auto 0; width: 100%; }
	.delivery-slip { break-after: page; border: none !important; }
}`}</style>
			<div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
				<h1 className="font-bold text-2xl text-ink">
					{t("slipsHeading", { count: orderIds.length })}
				</h1>
				<button
					type="button"
					onClick={() => window.print()}
					disabled={pending || loaded.length === 0}
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm disabled:opacity-50"
				>
					<Printer aria-hidden="true" className="h-4 w-4" />
					{t("slipsPrint")}
				</button>
			</div>
			{orderIds.length === 0 && (
				<p className="text-ink-muted">{t("slipsNone")}</p>
			)}
			<div id="delivery-slips" className="grid gap-4 sm:grid-cols-2">
				{loaded.map((order) => {
					const collect = amountToCollect(order);
					return (
						<article
							key={order.id}
							className="delivery-slip space-y-2 rounded-xl border border-line bg-white p-4 text-[#111]"
						>
							<header className="flex items-start justify-between gap-3">
								<div>
									<p className="font-bold text-lg">{order.orderNumber}</p>
									<p className="text-xs">{order.shop.name}</p>
								</div>
								<QrCode
									value={`${origin}/seller/orders/${order.id}`}
									size={72}
									label={t("slipsQr", { number: order.orderNumber })}
								/>
							</header>
							<section>
								<p className="font-semibold">{order.delivery.recipientName}</p>
								{!order.delivery.phoneMasked && (
									<p className="font-mono">{order.delivery.phone}</p>
								)}
								<p className="text-sm">
									{slipAddress(order.delivery).join(", ")}
								</p>
								{order.delivery.instructions && (
									<p className="text-xs italic">
										{order.delivery.instructions}
									</p>
								)}
							</section>
							<ul className="border-[#ccc] border-y py-1 text-sm">
								{order.items.map((item) => (
									<li key={item.id} className="flex justify-between gap-2">
										<span className="truncate">
											{item.title}
											{item.variantLabel ? ` · ${item.variantLabel}` : ""}
										</span>
										<span>×{item.quantity}</span>
									</li>
								))}
							</ul>
							<p className="font-bold text-xl">
								{collect > 0
									? t("slipsCollect", {
											amount: formatOrderMoney(collect, locale),
										})
									: t("slipsPaid")}
							</p>
						</article>
					);
				})}
			</div>
		</div>
	);
}
