"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatOrderDate } from "~/lib/order-money";
import type { OrderTimelineEntry } from "~/types/order";
import { timelineLabelKey } from "../purchase-view";

export function Timeline({ entries }: { entries: OrderTimelineEntry[] }) {
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";

	return (
		<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
			<h2 className="font-semibold text-ink">{t("timeline")}</h2>
			{entries.length === 0 ? (
				<p className="text-ink-muted text-sm">{t("timelineEmpty")}</p>
			) : (
				<ol className="space-y-3 border-brand-tint border-l-2 pl-4">
					{entries.map((entry) => (
						<li key={entry.id} className="space-y-0.5">
							<p className="font-medium text-ink text-sm">
								{t(timelineLabelKey(entry.type))}
							</p>
							<p className="text-ink-muted text-xs">
								<time dateTime={entry.at}>
									{formatOrderDate(entry.at, locale)}
								</time>
								{entry.actorName ? ` · ${entry.actorName}` : ""}
							</p>
							{entry.note && (
								<p className="text-ink-soft text-sm">{entry.note}</p>
							)}
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
