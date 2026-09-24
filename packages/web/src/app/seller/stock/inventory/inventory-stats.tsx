"use client";

import { useTranslations } from "next-intl";
import type { CountStats } from "~/lib/inventory";
import { formatXaf } from "~/lib/money";
import { cn } from "~/lib/utils";

export function InventoryStats({
	stats,
	total,
	showCost,
}: {
	stats: CountStats;
	total: number;
	/** Owner and manager only; the purchase cost is a shop secret. */
	showCost: boolean;
}) {
	const t = useTranslations("Inventory");

	return (
		<div
			className={cn(
				"grid gap-4",
				showCost ? "sm:grid-cols-3" : "sm:grid-cols-2",
			)}
		>
			<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
				<p className="text-[#64748B] text-sm">{t("progress")}</p>
				<p className="mt-1 font-bold text-[#0F172A] text-xl">
					{stats.counted} / {total}
				</p>
			</div>
			<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
				<p className="text-[#64748B] text-sm">{t("gaps")}</p>
				<p className="mt-1 font-bold text-[#0F172A] text-xl">
					{stats.withGap} · {stats.missing} / +{stats.surplus}
				</p>
			</div>
			{showCost && (
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
					<p className="text-[#64748B] text-sm">{t("gapValue")}</p>
					<p
						className={cn(
							"mt-1 font-bold text-xl",
							stats.costDelta < 0 ? "text-[#991b1b]" : "text-[#0F172A]",
						)}
					>
						{formatXaf(stats.costDelta)}
					</p>
				</div>
			)}
		</div>
	);
}
