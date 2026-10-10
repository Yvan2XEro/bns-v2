"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatOrderDate } from "~/lib/order-money";
import type { OrderTimelineEntry } from "~/types/order";
import { timelineLabelKey } from "../purchase-view";

export function Timeline({ entries }: { entries: OrderTimelineEntry[] }) {
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";

	return (
		<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-semibold text-[#0F172A]">{t("timeline")}</h2>
			{entries.length === 0 ? (
				<p className="text-[#64748B] text-sm">{t("timelineEmpty")}</p>
			) : (
				<ol className="space-y-3 border-[#DBEAFE] border-l-2 pl-4">
					{entries.map((entry) => (
						<li key={entry.id} className="space-y-0.5">
							<p className="font-medium text-[#0F172A] text-sm">
								{t(timelineLabelKey(entry.type))}
							</p>
							<p className="text-[#64748B] text-xs">
								<time dateTime={entry.at}>
									{formatOrderDate(entry.at, locale)}
								</time>
								{entry.actorName ? ` · ${entry.actorName}` : ""}
							</p>
							{entry.note && (
								<p className="text-[#334155] text-sm">{entry.note}</p>
							)}
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
