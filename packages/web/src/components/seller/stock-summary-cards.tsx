"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatXaf } from "~/lib/money";
import type { StockSummary } from "~/types";

export function StockSummaryCards({ summary }: { summary: StockSummary }) {
	const t = useTranslations("Stock");
	const locale = useLocale();
	const firstAlert = summary.lowStock[0] ?? summary.outOfStock[0] ?? null;

	const cards = [
		{ label: t("costValue"), value: formatXaf(summary.costValue), hint: null },
		{
			label: t("unitsOnHand"),
			value: summary.unitsOnHand.toLocaleString(locale),
			hint: t("trackedVariants", { count: summary.trackedVariants }),
		},
		{
			label: t("unitsReserved"),
			value: summary.unitsReserved.toLocaleString(locale),
			hint: t("reservedHint"),
		},
		{
			label: t("alerts"),
			value: t("alertsValue", {
				low: summary.lowStock.length,
				out: summary.outOfStock.length,
			}),
			hint: firstAlert
				? `${firstAlert.productTitle} · ${firstAlert.label}`
				: null,
		},
	];

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{cards.map((card) => (
				<div
					key={card.label}
					className="rounded-xl border border-[#E2E8F0] bg-white p-5"
				>
					<p className="text-[#64748B] text-sm">{card.label}</p>
					<p className="mt-1 font-bold text-[#0F172A] text-xl">{card.value}</p>
					{card.hint && (
						<p className="mt-1 truncate text-[#64748B] text-xs">{card.hint}</p>
					)}
				</div>
			))}
		</div>
	);
}
