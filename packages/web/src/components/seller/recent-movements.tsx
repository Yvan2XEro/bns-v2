"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { MovementRow } from "~/types";

export function RecentMovements({ movements }: { movements: MovementRow[] }) {
	const t = useTranslations("ProductEditor");
	const tType = useTranslations("StockMovement");
	const locale = useLocale();

	return (
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-[#0F172A]">{t("latestMovements")}</h2>
				<Link
					href="/seller/stock"
					className="text-[#1E40AF] text-sm hover:underline"
				>
					{t("fullHistory")}
				</Link>
			</div>
			{movements.length === 0 ? (
				<p className="mt-3 text-[#64748B] text-sm">{t("noMovements")}</p>
			) : (
				<ul className="mt-3 space-y-3">
					{movements.map((movement) => (
						<li key={movement.id} className="flex items-start gap-3">
							<span
								className={cn(
									"w-10 shrink-0 text-right font-bold text-sm",
									movement.quantity > 0 ? "text-[#166534]" : "text-[#991b1b]",
								)}
							>
								{movement.quantity > 0
									? `+${movement.quantity}`
									: `−${Math.abs(movement.quantity)}`}
							</span>
							<div className="min-w-0 text-sm">
								<p className="font-medium text-[#0F172A]">
									{tType(`type.${movement.type}`)}
								</p>
								<p className="truncate text-[#64748B] text-xs">
									{[movement.variant.label, movement.note]
										.filter(Boolean)
										.join(" · ")}
								</p>
								<p className="text-[#94A3B8] text-xs">
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
