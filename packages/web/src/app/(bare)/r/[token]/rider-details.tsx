"use client";

import { ExternalLink, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	FAILURE_REASON_LABELS,
	type FailureReason,
} from "~/lib/shipment-status";
import type { RiderLinkView } from "../../../../../../api/src/contracts/shipments";

const isReason = (reason: string): reason is FailureReason =>
	reason in FAILURE_REASON_LABELS;

/** Renders exactly the projection the route serves; nothing is looked up or derived from elsewhere. */
export function RiderDetails({ view }: { view: RiderLinkView }) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Rider");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const { destination } = view;
	const place = [destination.landmark, destination.district, destination.city]
		.filter(Boolean)
		.join(", ");

	return (
		<section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
			<header>
				<h1 className="font-bold text-ink text-lg">{view.shopName}</h1>
				<p className="text-ink-muted text-sm">{view.shipmentNumber}</p>
			</header>
			{view.origin.landmark && (
				<p className="text-ink-soft text-sm">
					<span className="font-medium">{t("pickupFrom")}</span>{" "}
					{view.origin.landmark}
				</p>
			)}
			<div className="space-y-1 text-sm">
				<p className="font-medium text-ink">
					{t("deliverTo", { name: destination.recipientFirstName })}
				</p>
				<p className="text-ink-soft">{place}</p>
				{destination.phone && (
					<a
						href={`tel:${destination.phone}`}
						className="inline-flex min-h-12 items-center gap-2 font-semibold text-brand"
					>
						<Phone aria-hidden className="h-5 w-5" /> {t("call")}
					</a>
				)}
				{destination.mapsUrl && (
					<a
						href={destination.mapsUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex min-h-12 items-center gap-2 font-semibold text-brand"
					>
						<ExternalLink aria-hidden className="h-5 w-5" /> {t("openInMaps")}
					</a>
				)}
			</div>
			{view.expectedCod !== null && (
				<p className="rounded-xl bg-warn-faint p-3 font-semibold text-warn-ink">
					{t("codDue", { amount: formatOrderMoney(view.expectedCod, locale) })}
				</p>
			)}
			<ul className="space-y-1 text-ink-soft text-sm">
				{view.items.map((item, index) => (
					<li key={`${item.title}-${index}`}>
						{t("item", { title: item.title, quantity: item.quantity })}
					</li>
				))}
			</ul>
			{view.attempts.length > 0 && (
				<ul className="space-y-1 text-ink-muted text-xs">
					{view.attempts.map((attempt) => (
						<li key={attempt.number}>
							{t("attemptRow", {
								number: attempt.number,
								reason: tRoot(
									`Delivery.${FAILURE_REASON_LABELS[isReason(attempt.reason) ? attempt.reason : "other"]}`,
								),
							})}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
