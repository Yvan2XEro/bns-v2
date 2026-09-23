"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { MovementRow } from "~/types";

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
	const t = useTranslations("Stock");
	const tType = useTranslations("StockMovement");
	const locale = useLocale();

	return (
		<div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
			<table className="w-full min-w-[720px] text-sm">
				<thead className="border-[#E2E8F0] border-b bg-[#F8FAFC] text-left text-[#64748B] text-xs uppercase">
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
						<tr
							key={row.id}
							className="border-[#F1F5F9] border-b last:border-0"
						>
							<td className="whitespace-nowrap px-4 py-3 text-[#64748B]">
								{new Date(row.createdAt).toLocaleString(locale, {
									day: "numeric",
									month: "short",
									hour: "2-digit",
									minute: "2-digit",
								})}
							</td>
							<td className="px-4 py-3">
								<p className="font-medium text-[#0F172A]">
									{row.product.title}
								</p>
								<p className="text-[#94A3B8] text-xs">{row.variant.label}</p>
							</td>
							<td className="px-4 py-3 text-[#334155]">
								{tType(`type.${row.type}`)}
							</td>
							<td
								className={cn(
									"px-4 py-3 text-right font-semibold",
									row.quantity > 0 ? "text-[#166534]" : "text-[#991b1b]",
								)}
							>
								{row.quantity > 0
									? `+${row.quantity}`
									: `−${Math.abs(row.quantity)}`}
							</td>
							<td className="px-4 py-3 text-right text-[#0F172A]">
								{row.stockAfter}
							</td>
							<td className="px-4 py-3 text-[#64748B]">
								{[row.note, row.actor?.name].filter(Boolean).join(" · ") || "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
