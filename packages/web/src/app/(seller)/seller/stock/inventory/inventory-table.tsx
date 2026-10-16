"use client";

import { useTranslations } from "next-intl";
import type {
	FieldArrayWithId,
	FieldErrors,
	UseFormRegister,
} from "react-hook-form";
import { useCurrencyCode, useOrderMoney } from "~/hooks/use-order-money";
import type { CountFilter, CountFormState, CountRow } from "~/lib/inventory";
import { parseAmount } from "~/lib/product-form";
import { cn } from "~/lib/utils";

export type Filter = CountFilter;
export const FILTERS: Filter[] = ["all", "todo", "counted", "gap"];

export function InventoryTable({
	fields,
	rows,
	register,
	errors,
	indexes,
	showCost,
}: {
	fields: FieldArrayWithId<CountFormState, "rows", "id">[];
	rows: CountRow[];
	register: UseFormRegister<CountFormState>;
	/** Per-row validation errors from a failed submit; drives the invalid highlight. */
	errors: FieldErrors<CountFormState>["rows"];
	/** The rows to show, in order: filtered and paginated by the caller. */
	indexes: number[];
	/** Owner and manager only; the purchase cost is a shop secret. */
	showCost: boolean;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Inventory");
	const currencyCode = useCurrencyCode();

	return (
		<div className="overflow-x-auto">
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
								{t("colGapValue", { currency: currencyCode })}
							</th>
						)}
						<th className="px-4 py-3 font-semibold print:hidden">
							{t("colStatus")}
						</th>
					</tr>
				</thead>
				<tbody>
					{indexes.map((index) => {
						const field = fields[index];
						if (!field) return null;
						const row = rows[index] ?? field;
						const counted = parseAmount(row.counted);
						const delta = counted === null ? null : counted - row.expected;
						const invalid = Boolean(errors?.[index]?.counted);
						return (
							<tr
								key={field.id}
								className="border-[#F1F5F9] border-b last:border-0"
							>
								<td className="px-4 py-2">
									<div className="flex items-center gap-3">
										<div className="h-[38px] w-[38px] shrink-0 overflow-hidden rounded-lg bg-[#F1F5F9] print:hidden">
											{row.image && (
												// biome-ignore lint/performance/noImgElement: thumbnails come from arbitrary storage hosts
												<img
													src={row.image}
													alt=""
													className="h-full w-full object-cover"
												/>
											)}
										</div>
										<div className="min-w-0">
											<p className="font-medium text-[#0F172A]">
												{row.productTitle}
											</p>
											<p className="text-[#94A3B8] text-xs">
												{[row.label, row.sku].filter(Boolean).join(" · ")}
											</p>
										</div>
									</div>
								</td>
								<td className="px-4 py-2 text-right">{row.expected}</td>
								<td className="w-28 px-4 py-2">
									<label className="sr-only" htmlFor={`count-${row.variantId}`}>
										{row.productTitle} {row.label}
									</label>
									<input
										id={`count-${row.variantId}`}
										inputMode="numeric"
										aria-invalid={invalid}
										{...register(`rows.${index}.counted`)}
										className={cn(
											"h-9 w-full rounded-md border px-2 text-right outline-none focus:border-[var(--shop-accent-border,#93C5FD)]",
											invalid ? "border-red-400 bg-red-50" : "border-[#E2E8F0]",
										)}
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
											: formatOrderMoney(delta * row.cost)}
									</td>
								)}
								<td className="px-4 py-2 print:hidden">
									<span
										className={cn(
											"inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs",
											counted === null
												? "bg-[#F1F5F9] text-[#475569]"
												: "bg-[#DCFCE7] text-[#166534]",
										)}
									>
										{t(counted === null ? "statusTodo" : "statusCounted")}
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
