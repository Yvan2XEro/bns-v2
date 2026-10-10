"use client";

import { MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OrderView } from "~/types/order";
import { districtLabel, mapsUrl, telHref } from "../seller-orders";
import { TierBadge } from "../tier-badge";

/**
 * Who to call and where to go. The phone is whatever the API sent: in full
 * while the order is live, masked once it has been closed long enough that
 * there is no reason left to call — and then there is no call button.
 */
export function BuyerBlock({ order }: { order: OrderView }) {
	const t = useTranslations("SellerOrders");
	const { delivery } = order;
	const tel = telHref(delivery);
	const maps = mapsUrl(delivery);
	const place = [districtLabel(delivery), delivery.city]
		.filter(Boolean)
		.join(", ");

	return (
		<section
			aria-labelledby="buyer-block-title"
			className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-5"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="buyer-block-title" className="font-semibold text-[#0F172A]">
					{delivery.method === "pickup" ? t("pickupBlock") : t("deliveryBlock")}
				</h2>
				{order.risk && <TierBadge tier={order.risk.phoneTier} />}
			</div>

			<dl className="grid gap-3 text-sm sm:grid-cols-2">
				<div>
					<dt className="text-[#64748B]">{t("recipient")}</dt>
					<dd className="font-medium text-[#0F172A]">
						{delivery.recipientName}
					</dd>
				</div>
				<div>
					<dt className="text-[#64748B]">{t("phone")}</dt>
					<dd className="font-medium text-[#0F172A]">{delivery.phone}</dd>
					{delivery.phoneMasked && (
						<dd className="mt-1 text-[#64748B] text-xs">
							{t("phoneMaskedReason")}
						</dd>
					)}
				</div>
				{place && (
					<div>
						<dt className="text-[#64748B]">{t("address")}</dt>
						<dd className="text-[#0F172A]">{place}</dd>
					</div>
				)}
				{delivery.landmark && (
					<div>
						<dt className="text-[#64748B]">{t("landmark")}</dt>
						<dd className="text-[#0F172A]">{delivery.landmark}</dd>
					</div>
				)}
				{delivery.instructions && (
					<div className="sm:col-span-2">
						<dt className="text-[#64748B]">{t("instructions")}</dt>
						<dd className="text-[#0F172A]">{delivery.instructions}</dd>
					</div>
				)}
			</dl>

			<div className="flex flex-wrap gap-2">
				{tel && (
					<a
						href={tel}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						<Phone aria-hidden="true" className="h-4 w-4" />
						{t("callBuyer")}
					</a>
				)}
				{maps ? (
					<a
						href={maps}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm hover:border-[#93C5FD]"
					>
						<MapPin aria-hidden="true" className="h-4 w-4" />
						{t("openInMaps")}
					</a>
				) : (
					<p className="text-[#64748B] text-sm">{t("noLocation")}</p>
				)}
			</div>
		</section>
	);
}
