"use client";

import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import type { OrderView } from "~/types/order";

function AmountRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between text-sm">
			<dt className="text-ink-muted">{label}</dt>
			<dd className="text-ink">{value}</dd>
		</div>
	);
}

/** Items, amounts and delivery details: everything here is read, nothing acts. */
export function PurchaseSummary({ order }: { order: OrderView }) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";
	const { launchCities } = useAppConfig();
	const money = (amount: number) => formatOrderMoney(amount, locale);
	const { delivery } = order;
	const city =
		launchCities.find((option) => option.key === delivery.city)?.label ??
		delivery.city;

	return (
		<>
			<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
				<h2 className="font-semibold text-ink">{t("items")}</h2>
				<ul className="divide-y divide-subtle">
					{order.items.map((item) => (
						<li key={item.id} className="flex gap-3 py-3">
							{item.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: remote order snapshot URL, not a static asset
								<img
									src={item.imageUrl}
									alt=""
									className="h-14 w-14 shrink-0 rounded-xl object-cover"
								/>
							) : (
								<div className="h-14 w-14 shrink-0 rounded-xl bg-subtle" />
							)}
							<div className="min-w-0 flex-1">
								<p className="font-medium text-ink">{item.title}</p>
								{item.variantLabel && (
									<p className="text-ink-muted text-sm">{item.variantLabel}</p>
								)}
								<p className="text-ink-muted text-sm">
									{t("lineQuantity", {
										quantity: item.quantity,
										price: money(item.unitPrice),
									})}
								</p>
							</div>
							<p className="shrink-0 font-medium text-ink">
								{money(item.lineSubtotal)}
							</p>
						</li>
					))}
				</ul>
			</section>

			<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
				<h2 className="font-semibold text-ink">{t("amounts")}</h2>
				<dl className="space-y-1.5">
					<AmountRow
						label={t("subtotal")}
						value={money(order.amounts.subtotal)}
					/>
					<AmountRow
						label={t("deliveryFee")}
						value={money(order.amounts.deliveryFee)}
					/>
					<AmountRow label={t("total")} value={money(order.amounts.total)} />
				</dl>
				<p className="text-ink-muted text-sm">
					{order.paymentMethod === "cod"
						? t("paymentCod")
						: t("paymentMobileMoney")}
				</p>
			</section>

			<section className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm">
				<h2 className="font-semibold text-base text-ink">
					{t("deliveryDetails")}
				</h2>
				<p className="text-ink">
					{delivery.method === "pickup"
						? t("deliveryPickup")
						: t("deliverySeller")}
				</p>
				<p className="text-ink-muted">
					{t("deliveryEta", { eta: delivery.etaText })}
				</p>
				<p>
					<span className="block text-ink-muted text-xs">
						{t("deliveryRecipient")}
					</span>
					{delivery.recipientName}, {delivery.phone}
				</p>
				{delivery.pickupPoint ? (
					<p>
						<span className="block text-ink-muted text-xs">
							{t("pickupPoint")}
						</span>
						{delivery.pickupPoint.address}
						{delivery.pickupPoint.landmark
							? ` (${delivery.pickupPoint.landmark})`
							: ""}
					</p>
				) : (
					<p>
						<span className="block text-ink-muted text-xs">
							{t("deliveryAddress")}
						</span>
						{[city, delivery.districtOther, delivery.landmark]
							.filter(Boolean)
							.join(", ")}
					</p>
				)}
				{delivery.instructions && (
					<p className="text-ink-muted">{delivery.instructions}</p>
				)}
			</section>
		</>
	);
}
