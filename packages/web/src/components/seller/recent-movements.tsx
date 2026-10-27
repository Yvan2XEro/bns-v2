"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { availableDelta, signedDelta } from "~/lib/stock";
import { cn } from "~/lib/utils";
import type { MovementRow } from "~/types";

export function RecentMovements({
	movements,
	historyHref,
}: {
	movements: MovementRow[];
	/** The product's own history (its stock tab). */
	historyHref: string;
}) {
	const t = useTranslations("ProductEditor");
	const tType = useTranslations("StockMovement");
	const locale = useLocale();

	return (
		<div className="rounded-xl border border-line bg-surface p-5">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-ink">{t("latestMovements")}</h2>
				<Link
					href={historyHref}
					className="text-[var(--shop-accent-text,var(--c-brand))] text-sm hover:underline"
				>
					{t("fullHistory")}
				</Link>
			</div>
			{movements.length === 0 ? (
				<p className="mt-3 text-ink-muted text-sm">{t("noMovements")}</p>
			) : (
				<ul className="mt-3 space-y-3">
					{movements.map((movement) => (
						<li key={movement.id} className="flex items-start gap-3">
							<span
								className={cn(
									"w-10 shrink-0 text-right font-bold text-sm",
									availableDelta(movement) > 0 ? "text-ok-ink" : "text-bad-ink",
								)}
							>
								{signedDelta(availableDelta(movement))}
							</span>
							<div className="min-w-0 text-sm">
								<p className="font-medium text-ink">
									{tType(`type.${movement.type}`)}
								</p>
								<p className="truncate text-ink-muted text-xs">
									{[movement.variant.label, movement.note]
										.filter(Boolean)
										.join(" · ")}
								</p>
								<p className="text-ink-faint text-xs">
									{new Date(movement.createdAt).toLocaleDateString(locale, {
										day: "numeric",
										month: "short",
									})}
								</p>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
