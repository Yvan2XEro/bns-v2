"use client";

import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { formatXaf } from "~/lib/order-money";
import type { OrderView } from "~/types/order";

function AmountRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between text-sm">
			<dt className="text-[#64748B]">{label}</dt>
			<dd className="text-[#0F172A]">{value}</dd>
		</div>
	);
}

/** Items, amounts and delivery details: everything here is read, nothing acts. */
export function PurchaseSummary({ order }: { order: OrderView }) {
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";
	const { launchCities } = useAppConfig();
	const money = (amount: number) => formatXaf(amount, locale);
	const { delivery } = order;
	const city =
		launchCities.find((option) => option.key === delivery.city)?.label ??
		delivery.city;

	return (
		<>
			<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<h2 className="font-semibold text-[#0F172A]">{t("items")}</h2>
				<ul className="divide-y divide-[#F1F5F9]">
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
								<div className="h-14 w-14 shrink-0 rounded-xl bg-[#F1F5F9]" />
							)}
							<div className="min-w-0 flex-1">
								<p className="font-medium text-[#0F172A]">{item.title}</p>
								{item.variantLabel && (
									<p className="text-[#64748B] text-sm">{item.variantLabel}</p>
								)}
								<p className="text-[#64748B] text-sm">
									{t("lineQuantity", {
										quantity: item.quantity,
										price: money(item.unitPrice),
									})}
								</p>
							</div>
							<p className="shrink-0 font-medium text-[#0F172A]">
								{money(item.lineSubtotal)}
							</p>
						</li>
					))}
				</ul>
			</section>

			<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<h2 className="font-semibold text-[#0F172A]">{t("amounts")}</h2>
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
				<p className="text-[#64748B] text-sm">
					{order.paymentMethod === "cod"
						? t("paymentCod")
						: t("paymentMobileMoney")}
				</p>
			</section>

			<section className="space-y-2 rounded-2xl border border-[#E2E8F0] bg-white p-5 text-sm">
				<h2 className="font-semibold text-[#0F172A] text-base">
					{t("deliveryDetails")}
				</h2>
				<p className="text-[#0F172A]">
					{delivery.method === "pickup"
						? t("deliveryPickup")
						: t("deliverySeller")}
				</p>
				<p className="text-[#64748B]">
					{t("deliveryEta", { eta: delivery.etaText })}
				</p>
				<p>
					<span className="block text-[#64748B] text-xs">
						{t("deliveryRecipient")}
					</span>
					{delivery.recipientName}, {delivery.phone}
				</p>
				{delivery.pickupPoint ? (
					<p>
						<span className="block text-[#64748B] text-xs">
							{t("pickupPoint")}
						</span>
						{delivery.pickupPoint.address}
						{delivery.pickupPoint.landmark
							? ` (${delivery.pickupPoint.landmark})`
							: ""}
					</p>
				) : (
					<p>
						<span className="block text-[#64748B] text-xs">
							{t("deliveryAddress")}
						</span>
						{[city, delivery.districtOther, delivery.landmark]
							.filter(Boolean)
							.join(", ")}
					</p>
				)}
				{delivery.instructions && (
					<p className="text-[#64748B]">{delivery.instructions}</p>
				)}
			</section>
		</>
	);
}
