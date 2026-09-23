"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { CATALOGUE_FILTERS, type CatalogueFilter } from "~/lib/catalogue";
import { cn } from "~/lib/utils";
import type { CatalogueResponse } from "~/types";

export function CatalogueFilters({
	filter,
	counts,
	query,
	onFilterChange,
	onQueryChange,
}: {
	filter: CatalogueFilter;
	counts: CatalogueResponse["counts"] | undefined;
	query: string;
	onFilterChange: (filter: CatalogueFilter) => void;
	onQueryChange: (query: string) => void;
}) {
	const t = useTranslations("Catalogue");
	const searchId = useId();

	return (
		<div className="flex flex-wrap items-center gap-3">
			<fieldset className="flex flex-wrap gap-2 border-0 p-0">
				<legend className="sr-only">{t("filters")}</legend>
				{CATALOGUE_FILTERS.map((value) => {
					const active = value === filter;
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
							{counts && (
								<span
									className={cn(
										"font-bold text-[11px] tabular-nums",
										active ? "text-[#CBD5E1]" : "text-[#64748B]",
									)}
								>
									{counts[value]}
								</span>
							)}
						</button>
					);
				})}
			</fieldset>
			<div className="relative min-w-[220px] flex-1">
				<label className="sr-only" htmlFor={searchId}>
					{t("searchPlaceholder")}
				</label>
				<Search
					aria-hidden="true"
					className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]"
				/>
				<input
					id={searchId}
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={t("searchPlaceholder")}
					className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm focus:border-[#93C5FD] focus:outline-none"
				/>
			</div>
		</div>
	);
}
