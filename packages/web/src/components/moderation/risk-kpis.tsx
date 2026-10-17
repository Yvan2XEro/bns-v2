"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { falsePositiveRate } from "~/lib/moderation-risk";
import { cn } from "~/lib/utils";
import type { RiskFlagStats } from "../../../../api/src/contracts/moderationConsole";

function Tile({
	label,
	value,
	note,
	tone,
}: {
	label: string;
	value: ReactNode;
	note: string;
	tone?: "bad" | "warn";
}) {
	return (
		<div className="min-w-0 rounded-xl border border-line bg-surface p-4">
			<dt className="font-semibold text-[11px] text-ink-muted uppercase tracking-wide">
				{label}
			</dt>
			<dd
				className={cn(
					"mt-1 font-bold font-heading text-2xl tabular-nums",
					tone === "bad"
						? "text-bad-ink"
						: tone === "warn"
							? "text-warn-ink"
							: "text-ink",
				)}
			>
				{value}
			</dd>
			<dd className="mt-0.5 text-ink-muted text-xs">{note}</dd>
		</div>
	);
}

/**
 * The risk KPIs the data supports: high scores and automatic payout holds
 * among open flags, and the 30-day dismissal share. The mockup's retained
 * resale margins tile has no source yet and is left out.
 */
export function RiskKpis({ stats }: { stats: RiskFlagStats | undefined }) {
	const t = useTranslations("ModerationConsole");
	const locale = useLocale();
	if (!stats)
		return (
			<div
				aria-hidden="true"
				className="grid h-[104px] animate-pulse grid-cols-1 rounded-xl bg-subtle sm:grid-cols-3"
			/>
		);
	const rate = falsePositiveRate(stats);
	return (
		<dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<Tile
				label={t("risk.kpi.highScore", { threshold: stats.highScoreThreshold })}
				value={stats.highScore}
				note={t("risk.kpi.highScoreNote", { open: stats.open })}
				tone={stats.highScore > 0 ? "bad" : undefined}
			/>
			<Tile
				label={t("risk.kpi.payoutHeld")}
				value={stats.payoutHeld}
				note={t("risk.kpi.payoutHeldNote")}
				tone={stats.payoutHeld > 0 ? "warn" : undefined}
			/>
			<Tile
				label={t("risk.kpi.falsePositives")}
				value={
					rate === null
						? "—"
						: new Intl.NumberFormat(locale, { style: "percent" }).format(
								rate / 100,
							)
				}
				note={t("risk.kpi.falsePositivesNote", {
					dismissed: stats.dismissedLast30Days,
					decided: stats.decidedLast30Days,
				})}
			/>
		</dl>
	);
}
