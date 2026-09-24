"use client";

import { useTranslations } from "next-intl";
import type { FieldArrayWithId, UseFormRegister } from "react-hook-form";
import type { CountFormState, CountRow } from "~/lib/inventory";
import { formatXaf } from "~/lib/money";
import { parseAmount } from "~/lib/product-form";
import { cn } from "~/lib/utils";

export type Filter = "all" | "todo" | "counted" | "gap";
export const FILTERS: Filter[] = ["all", "todo", "counted", "gap"];

function matchesFilter(
	filter: Filter,
	expected: number,
	counted: number | null,
): boolean {
	if (filter === "todo") return counted === null;
	if (filter === "counted") return counted !== null;
	if (filter === "gap") return counted !== null && counted !== expected;
	return true;
}

export function InventoryTable({
	fields,
	rows,
	register,
	filter,
	query,
	showCost,
}: {
	fields: FieldArrayWithId<CountFormState, "rows", "id">[];
	rows: CountRow[];
	register: UseFormRegister<CountFormState>;
	filter: Filter;
	query: string;
	/** Owner and manager only; the purchase cost is a shop secret. */
	showCost: boolean;
}) {
	const t = useTranslations("Inventory");
	const q = query.trim().toLowerCase();

	return (
		<div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
			<table className="w-full min-w-[760px] text-sm">
				<thead className="border-[#E2E8F0] border-b bg-[#F8FAFC] text-left text-[#64748B] text-xs uppercase">
					<tr>
						<th className="px-4 py-3 font-semibold">{t("colVariant")}</th>
						<th className="px-4 py-3 text-right font-semibold">
							{t("colExpected")}
						</th>
						<th className="px-4 py-3 text-right font-semibold">
							{t("colCounted")}
						</th>
						<th className="px-4 py-3 text-right font-semibold">
							{t("colGap")}
						</th>
						{showCost && (
							<th className="px-4 py-3 text-right font-semibold">
								{t("colGapValue")}
							</th>
						)}
					</tr>
				</thead>
				<tbody>
					{fields.map((field, index) => {
						const row = rows[index] ?? field;
						const counted = parseAmount(row.counted);
						const haystack =
							`${row.productTitle} ${row.label} ${row.sku ?? ""}`.toLowerCase();
						if (q && !haystack.includes(q)) return null;
						if (!matchesFilter(filter, row.expected, counted)) return null;
						const delta = counted === null ? null : counted - row.expected;
						return (
							<tr
								key={field.id}
								className="border-[#F1F5F9] border-b last:border-0"
							>
								<td className="px-4 py-2">
									<p className="font-medium text-[#0F172A]">
										{row.productTitle}
									</p>
									<p className="text-[#94A3B8] text-xs">
										{[row.label, row.sku].filter(Boolean).join(" · ")}
									</p>
								</td>
								<td className="px-4 py-2 text-right">{row.expected}</td>
								<td className="w-28 px-4 py-2">
									<label className="sr-only" htmlFor={`count-${row.variantId}`}>
										{row.productTitle} {row.label}
									</label>
									<input
										id={`count-${row.variantId}`}
										inputMode="numeric"
										{...register(`rows.${index}.counted`)}
										className="h-9 w-full rounded-md border border-[#E2E8F0] px-2 text-right outline-none focus:border-[#93C5FD]"
									/>
								</td>
								<td
									className={cn(
										"px-4 py-2 text-right font-semibold",
										delta === null || delta === 0
											? "text-[#64748B]"
											: delta < 0
												? "text-[#991b1b]"
												: "text-[#166534]",
									)}
								>
									{delta === null ? "—" : delta > 0 ? `+${delta}` : delta}
								</td>
								{showCost && (
									<td className="px-4 py-2 text-right text-[#64748B]">
										{delta === null || row.cost === null
											? "—"
											: formatXaf(delta * row.cost)}
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
