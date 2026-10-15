"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import type { CountStats } from "~/lib/inventory";
import { cn } from "~/lib/utils";

export function InventoryStats({
	stats,
	total,
	units,
	showCost,
	startedBy,
}: {
	stats: CountStats;
	total: number;
	/** "commencé à 08:30 par Aïcha M.", once the count exists on the server. */
	startedBy: string | null;
	units: { counted: number; expected: number };
	/** Owner and manager only; the purchase cost is a shop secret. */
	showCost: boolean;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Inventory");
	const locale = useLocale();
	const progress =
		units.expected > 0
			? Math.min(100, (units.counted / units.expected) * 100)
			: 0;

	return (
		<div
			className={cn(
				"grid gap-5 rounded-xl border border-[#E2E8F0] bg-white px-5 py-4 sm:items-center",
				showCost
					? "sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]"
					: "sm:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]",
			)}
		>
			<div className="space-y-2">
				<p className="flex flex-wrap items-baseline gap-2">
					<span className="font-extrabold text-[#0F172A] text-[26px] tabular-nums">
						{units.counted.toLocaleString(locale)} /{" "}
						{units.expected.toLocaleString(locale)}
					</span>
					<span className="text-[#64748B] text-sm">{t("unitsCounted")}</span>
				</p>
				<div className="h-2 overflow-hidden rounded bg-[#E2E8F0]">
					<div className="h-2 bg-[#1E40AF]" style={{ width: `${progress}%` }} />
				</div>
				<p className="text-[#64748B] text-[13px]">
					{t("variantsProgress", { counted: stats.counted, total })}
					{startedBy && ` · ${startedBy}`}
				</p>
			</div>
			<Figure
				label={t("gapVariants")}
				value={String(stats.withGap)}
				hint={t("gapVariantsHint", { count: stats.counted })}
			/>
			<Figure
				label={t("units")}
				value={`${stats.missing < 0 ? "−" : ""}${Math.abs(stats.missing)} / +${stats.surplus}`}
				hint={t("unitsHint")}
				danger={stats.missing < 0}
			/>
			{showCost && (
				<Figure
					label={t("gapValue")}
					value={formatOrderMoney(stats.costDelta)}
					hint={t("gapValueHint")}
					danger={stats.costDelta < 0}
				/>
			)}
		</div>
	);
}

function Figure({
	label,
	value,
	hint,
	danger = false,
}: {
	label: string;
	value: string;
	hint: string;
	danger?: boolean;
}) {
	return (
		<div className="flex flex-col gap-0.5 sm:border-[#E2E8F0] sm:border-l sm:pl-5">
			<span className="text-[#64748B] text-[13px]">{label}</span>
			<span
				className={cn(
					"font-bold text-xl tabular-nums",
					danger ? "text-[#B91C1C]" : "text-[#0F172A]",
				)}
			>
				{value}
			</span>
			<span className="text-[#94A3B8] text-xs">{hint}</span>
		</div>
	);
}
