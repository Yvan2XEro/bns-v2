"use client";

import { useLocale, useTranslations } from "next-intl";
import {
	availableDelta,
	MOVEMENT_TONES,
	type MovementTone,
	signedDelta,
} from "~/lib/stock";
import { cn } from "~/lib/utils";
import type { MovementRow } from "~/types";

const TONE_CLASSES: Record<MovementTone, string> = {
	success: "bg-ok-soft text-ok-ink",
	info: "bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]",
	warning: "bg-warn-soft text-warn-ink",
	danger: "bg-bad-soft text-bad-ink",
	neutral: "bg-subtle text-ink-mid",
};

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
	const t = useTranslations("Stock");
	const tType = useTranslations("StockMovement");
	const locale = useLocale();

	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full min-w-[720px] text-sm">
				<thead className="border-line border-b bg-canvas text-left text-ink-muted text-xs uppercase">
					<tr>
						<th className="px-4 py-3 font-semibold">{t("colDate")}</th>
						<th className="px-4 py-3 font-semibold">{t("colProduct")}</th>
						<th className="px-4 py-3 font-semibold">{t("colType")}</th>
						<th className="px-4 py-3 text-right font-semibold">
							{t("colQty")}
						</th>
						<th className="px-4 py-3 text-right font-semibold">
							{t("colAfter")}
						</th>
						<th className="px-4 py-3 font-semibold">{t("colReference")}</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.id} className="border-subtle border-b last:border-0">
							<td className="whitespace-nowrap px-4 py-3 text-ink-muted">
								{new Date(row.createdAt).toLocaleString(locale, {
									day: "numeric",
									month: "short",
									hour: "2-digit",
									minute: "2-digit",
								})}
							</td>
							<td className="px-4 py-3">
								<p className="font-medium text-ink">{row.product.title}</p>
								<p className="text-ink-faint text-xs">{row.variant.label}</p>
							</td>
							<td className="px-4 py-3">
								<span
									className={cn(
										"inline-flex rounded-full px-2 py-0.5 font-semibold text-xs",
										TONE_CLASSES[MOVEMENT_TONES[row.type]],
									)}
								>
									{tType(`type.${row.type}`)}
								</span>
							</td>
							<td
								className={cn(
									"px-4 py-3 text-right font-semibold",
									availableDelta(row) > 0 ? "text-ok-ink" : "text-bad-ink",
								)}
							>
								{signedDelta(availableDelta(row), locale)}
							</td>
							<td className="px-4 py-3 text-right text-ink">
								{row.stockAfter.toLocaleString(locale)}
							</td>
							<td className="px-4 py-3 text-ink-muted">
								{[row.note, row.actor?.name].filter(Boolean).join(" · ") || "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
