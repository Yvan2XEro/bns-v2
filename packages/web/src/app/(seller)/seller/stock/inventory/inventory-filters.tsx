"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import { FILTERS, type Filter } from "./inventory-table";

export function InventoryFilters({
	filter,
	onFilterChange,
	counts,
	q,
	onQueryChange,
}: {
	filter: Filter;
	onFilterChange: (value: Filter) => void;
	counts: Record<Filter, number>;
	q: string;
	onQueryChange: (value: string) => void;
}) {
	const t = useTranslations("Inventory");

	return (
		<div className="flex flex-wrap items-center gap-3 print:hidden">
			<input
				type="search"
				value={q}
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t("searchPlaceholder")}
				className="h-10 min-w-[220px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#93C5FD] sm:max-w-xs"
			/>
			<div className="flex flex-wrap gap-2 sm:ml-auto">
				{FILTERS.map((value) => {
					const active = filter === value;
					return (
						<button
							key={value}
							type="button"
							aria-pressed={active}
							onClick={() => onFilterChange(value)}
							className={cn(
								"inline-flex h-8 items-center gap-2 rounded-full border px-3 font-medium text-sm",
								active
									? "border-[#0F172A] bg-[#0F172A] font-semibold text-white"
									: "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#93C5FD]",
							)}
						>
							{t(`filter.${value}`)}
							<span
								className={cn(
									"font-bold text-[11px] tabular-nums",
									active ? "text-[#CBD5E1]" : "text-[#64748B]",
								)}
							>
								{counts[value]}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
