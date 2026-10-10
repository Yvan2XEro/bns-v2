"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DISTRICTS } from "~/lib/checkout-form";
import { formatXaf } from "~/lib/order-money";
import type { QuoteResponse } from "~/types/order";
import { PaymentMethodLabel } from "./payment-method-label";
import { ProtectionFeeRow } from "./protection-fee-row";

function Changed({ on, children }: { on: boolean; children: ReactNode }) {
	const t = useTranslations("Checkout");
	if (!on) return <>{children}</>;
	return (
		<span className="rounded bg-[#FEF3C7] px-1 font-semibold text-[#92400E]">
			{children} <span className="ml-1 text-xs">({t("changed")})</span>
		</span>
	);
}

function EditButton({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="min-h-11 text-[#1E40AF] text-sm underline"
		>
			{label}
		</button>
	);
}

/** The art. 17 summary. `changed` holds `quoteDifferences`' keys. */
export function OrderSummary({
	quote,
	changed,
	onEditAddress,
	onEditDelivery,
}: {
	quote: QuoteResponse;
	changed: Set<string>;
	onEditAddress: () => void;
	onEditDelivery: () => void;
}) {
	const t = useTranslations("Checkout");
	const locale = useLocale() === "en" ? "en" : "fr";
	const money = (amount: number) => formatXaf(amount, locale);
	const { lines, amounts, delivery, paymentMethod } = quote.summary;
	const protectedPayment = paymentMethod === "mobile_money";
	const address = delivery.address;
	const districtName =
		address.districtOther ??
		DISTRICTS[address.city]?.find((d) => d.key === address.district)?.label ??
		address.district;

	return (
		<section className="space-y-4 rounded-2xl border border-[#E2E8F0] p-4">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-[#0F172A] text-lg">{t("summary")}</h2>
				<Link
					href="/cart"
					className="inline-flex min-h-11 items-center text-[#1E40AF] text-sm underline"
				>
					{t("editCart")}
				</Link>
			</div>
			<ul className="divide-y divide-[#F1F5F9]">
				{lines.map((line, i) => (
					<li
						key={`${line.title}-${line.variantLabel}`}
						className="flex justify-between gap-3 py-2 text-sm"
					>
						<div>
							<p className="font-medium text-[#0F172A]">{line.title}</p>
							{line.variantLabel && (
								<p className="text-[#64748B]">{line.variantLabel}</p>
							)}
							<p className="text-[#64748B]">
								<Changed on={changed.has(`line:${i}`)}>
									{t("quantity", { quantity: line.quantity })} ×{" "}
									{money(line.unitPrice)}
								</Changed>
							</p>
						</div>
						<p className="whitespace-nowrap">{money(line.lineSubtotal)}</p>
					</li>
				))}
			</ul>
			<dl className="space-y-1 text-sm">
				<div className="flex justify-between">
					<dt>{t("subtotal")}</dt>
					<dd>
						<Changed on={changed.has("subtotal")}>
							{money(amounts.subtotal)}
						</Changed>
					</dd>
				</div>
				<div className="flex justify-between">
					<dt>{t("fee")}</dt>
					<dd>
						<Changed on={changed.has("deliveryFee")}>
							{amounts.deliveryFee === 0
								? t("free")
								: money(amounts.deliveryFee)}
						</Changed>
					</dd>
				</div>
				{protectedPayment && amounts.buyerProtectionFee > 0 && (
					<ProtectionFeeRow amount={money(amounts.buyerProtectionFee)} />
				)}
				<div className="flex justify-between font-semibold text-[#0F172A] text-base">
					<dt>{t("total")}</dt>
					<dd>
						<Changed on={changed.has("total")}>{money(amounts.total)}</Changed>
					</dd>
				</div>
			</dl>
			<div className="space-y-1 border-[#F1F5F9] border-t pt-3 text-sm">
				<div className="flex items-center justify-between">
					<p className="font-medium">{t("deliverTo")}</p>
					<EditButton label={t("editAddress")} onClick={onEditAddress} />
				</div>
				<p>
					{address.recipientName} · {address.phone}
				</p>
				<p className="text-[#64748B]">
					{districtName}
					{address.landmark ? ` — ${address.landmark}` : ""}
				</p>
				<div className="flex items-center justify-between pt-2">
					<p className="font-medium">
						{delivery.method === "pickup"
							? t("pickupAtShop")
							: t("sellerDelivery")}
					</p>
					<EditButton label={t("editDelivery")} onClick={onEditDelivery} />
				</div>
				<p className="text-[#64748B]">
					<Changed on={changed.has("etaText")}>
						{t("eta", { eta: delivery.etaText })}
					</Changed>
				</p>
				{delivery.pickupPoint && (
					<p className="text-[#64748B]">{delivery.pickupPoint.address}</p>
				)}
				<p className="pt-2">
					<span className="font-medium">{t("paymentMethod")}</span> ·{" "}
					<PaymentMethodLabel method={paymentMethod} />
				</p>
			</div>
		</section>
	);
}
