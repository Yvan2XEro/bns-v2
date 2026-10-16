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
			className="space-y-4 rounded-xl border border-line bg-surface p-5"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="buyer-block-title" className="font-semibold text-ink">
					{delivery.method === "pickup" ? t("pickupBlock") : t("deliveryBlock")}
				</h2>
				{order.risk && <TierBadge tier={order.risk.phoneTier} />}
			</div>

			<dl className="grid gap-3 text-sm sm:grid-cols-2">
				<div>
					<dt className="text-ink-muted">{t("recipient")}</dt>
					<dd className="font-medium text-ink">{delivery.recipientName}</dd>
				</div>
				<div>
					<dt className="text-ink-muted">{t("phone")}</dt>
					<dd className="font-medium text-ink">{delivery.phone}</dd>
					{delivery.phoneMasked && (
						<dd className="mt-1 text-ink-muted text-xs">
							{t("phoneMaskedReason")}
						</dd>
					)}
				</div>
				{place && (
					<div>
						<dt className="text-ink-muted">{t("address")}</dt>
						<dd className="text-ink">{place}</dd>
					</div>
				)}
				{delivery.landmark && (
					<div>
						<dt className="text-ink-muted">{t("landmark")}</dt>
						<dd className="text-ink">{delivery.landmark}</dd>
					</div>
				)}
				{delivery.instructions && (
					<div className="sm:col-span-2">
						<dt className="text-ink-muted">{t("instructions")}</dt>
						<dd className="text-ink">{delivery.instructions}</dd>
					</div>
				)}
			</dl>

			<div className="flex flex-wrap gap-2">
				{tel && (
					<a
						href={tel}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
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
						className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
					>
						<MapPin aria-hidden="true" className="h-4 w-4" />
						{t("openInMaps")}
					</a>
				) : (
					<p className="text-ink-muted text-sm">{t("noLocation")}</p>
				)}
			</div>
		</section>
	);
}
