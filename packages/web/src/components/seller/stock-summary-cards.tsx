"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useOrderMoney } from "~/hooks/use-order-money";
import { cn } from "~/lib/utils";
import type { StockSummary } from "~/types";

export function StockSummaryCards({ summary }: { summary: StockSummary }) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Stock");
	const ts = useCatalogueStockT("stock");
	const locale = useLocale();
	const firstAlert = summary.lowStock[0] ?? summary.outOfStock[0] ?? null;

	const cards = [
		{
			label: t("costValue"),
			value: formatOrderMoney(summary.costValue),
			hint: null,
		},
		{
			label: t("unitsOnHand"),
			value: summary.unitsOnHand.toLocaleString(locale),
			hint:
				summary.trackedProducts === undefined
					? t("trackedVariants", { count: summary.trackedVariants })
					: ts("trackedProducts", { count: summary.trackedProducts }),
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
			warn: summary.lowStock.length + summary.outOfStock.length > 0,
		},
	];

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{cards.map((card) => (
				<div
					key={card.label}
					className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3.5"
				>
					<p className="text-[#64748B] text-sm">{card.label}</p>
					<p
						className={cn(
							"mt-1 font-bold text-[22px] tabular-nums",
							card.warn ? "text-[#B45309]" : "text-[#0F172A]",
						)}
					>
						{card.value}
					</p>
					{card.hint && (
						<p className="mt-1 truncate text-[#94A3B8] text-xs">{card.hint}</p>
					)}
				</div>
			))}
		</div>
	);
}
