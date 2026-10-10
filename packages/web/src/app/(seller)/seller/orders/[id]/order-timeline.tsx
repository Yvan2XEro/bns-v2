"use client";

import { useLocale, useTranslations } from "next-intl";
import type { OrderTimelineEntry } from "~/types/order";
import { eventLabelKey } from "../seller-orders";

export function OrderTimeline({
	timeline,
}: {
	timeline: OrderTimelineEntry[];
}) {
	const t = useTranslations("SellerOrders");
	const locale = useLocale() === "en" ? "en-US" : "fr-FR";
	const format = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<section
			aria-labelledby="order-timeline-title"
			className="rounded-xl border border-[#E2E8F0] bg-white p-5"
		>
			<h2
				id="order-timeline-title"
				className="mb-3 font-semibold text-[#0F172A]"
			>
				{t("timeline")}
			</h2>
			<ol className="space-y-3 border-[#E2E8F0] border-l pl-4">
				{timeline.map((entry) => (
					<li key={entry.id} className="text-sm">
						<p className="font-medium text-[#0F172A]">
							{t(eventLabelKey(entry.type))}
							{entry.actorName && (
								<span className="font-normal text-[#64748B]">
									{" · "}
									{entry.actorName}
								</span>
							)}
						</p>
						<time dateTime={entry.at} className="text-[#64748B] text-xs">
							{format.format(new Date(entry.at))}
						</time>
						{entry.note && <p className="mt-1 text-[#475569]">{entry.note}</p>}
					</li>
				))}
			</ol>
		</section>
	);
}
