"use client";

import { useTranslations } from "next-intl";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { cn } from "~/lib/utils";
import { FILTERS, type Filter } from "./inventory-table";

const selectClass =
	"h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[#334155] text-sm outline-none focus:border-[#93C5FD]";

export function InventoryFilters({
	filter,
	onFilterChange,
	counts,
	q,
	onQueryChange,
	onQuerySubmit,
	categoryOptions,
	category,
	onCategoryChange,
	locations,
	location,
	onLocationChange,
}: {
	filter: Filter;
	onFilterChange: (value: Filter) => void;
	counts: Record<Filter, number>;
	q: string;
	onQueryChange: (value: string) => void;
	/** Enter in the search box: a USB scanner types the code then presses Enter. */
	onQuerySubmit: () => void;
	categoryOptions: { id: string; label: string }[];
	category: string;
	onCategoryChange: (value: string) => void;
	locations: { id: string; name: string }[];
	location: string;
	/** Stock is not kept per location: this records where the count took place. */
	onLocationChange: (value: string) => void;
}) {
	const t = useTranslations("Inventory");
	const ti = useCatalogueStockT("inventory");

	return (
		<div className="flex flex-wrap items-center gap-3 print:hidden">
			<input
				type="search"
				value={q}
				onChange={(event) => onQueryChange(event.target.value)}
				onKeyDown={(event) => {
					// The search sits inside the count form: Enter must not save it.
					if (event.key !== "Enter") return;
					event.preventDefault();
					onQuerySubmit();
				}}
				placeholder={t("searchPlaceholder")}
				className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#93C5FD] sm:max-w-[230px]"
			/>
			<select
				aria-label={ti("category")}
				value={category}
				onChange={(event) => onCategoryChange(event.target.value)}
				className={selectClass}
			>
				<option value="">{ti("allCategories")}</option>
				{categoryOptions.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
			{locations.length > 0 && (
				<select
					aria-label={ti("location")}
					title={ti("locationHint")}
					value={location}
					onChange={(event) => onLocationChange(event.target.value)}
					className={selectClass}
				>
					<option value="">{ti("noLocation")}</option>
					{locations.map((option) => (
						<option key={option.id} value={option.id}>
							{option.name}
						</option>
					))}
				</select>
			)}
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
