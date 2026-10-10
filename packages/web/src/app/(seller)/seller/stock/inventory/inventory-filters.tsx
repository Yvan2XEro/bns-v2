"use client";

import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import { FILTERS, type Filter } from "./inventory-table";

export function InventoryFilters({
	filter,
	onFilterChange,
	q,
	onQueryChange,
}: {
	filter: Filter;
	onFilterChange: (value: Filter) => void;
	q: string;
	onQueryChange: (value: string) => void;
}) {
	const t = useTranslations("Inventory");

	return (
		<div className="flex flex-wrap items-center gap-3 print:hidden">
			<div className="flex gap-1 rounded-lg bg-[#F1F5F9] p-1">
				{FILTERS.map((value) => (
					<button
						key={value}
						type="button"
						aria-pressed={filter === value}
						onClick={() => onFilterChange(value)}
						className={cn(
							"rounded-md px-3 py-1.5 font-medium text-sm",
							filter === value
								? "bg-white text-[#0F172A] shadow-sm"
								: "text-[#64748B]",
						)}
					>
						{t(`filter.${value}`)}
					</button>
				))}
			</div>
			<input
				type="search"
				value={q}
				onChange={(event) => onQueryChange(event.target.value)}
				placeholder={t("searchPlaceholder")}
				className="h-10 min-w-[220px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#93C5FD]"
			/>
		</div>
	);
}
