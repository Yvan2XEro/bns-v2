"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo } from "react";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import {
	CATALOGUE_FILTERS,
	CATALOGUE_PROVENANCES,
	CATALOGUE_SORTS,
	type CatalogueFilter,
	type CatalogueProvenance,
	type CatalogueSort,
} from "~/lib/catalogue";
import { relationId } from "~/lib/relation-id";
import { cn } from "~/lib/utils";
import type { CatalogueResponse, Category } from "~/types";

const selectClass =
	"h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[#334155] text-sm focus:border-[#93C5FD] focus:outline-none";

/** Top-level categories, each followed by its direct subcategories. */
function categoryOptions(categories: Category[]) {
	const roots = categories.filter((c) => !relationId(c.parent));
	const byParent = new Map<string, Category[]>();
	for (const category of categories) {
		const parent = relationId(category.parent);
		if (parent)
			byParent.set(parent, [...(byParent.get(parent) ?? []), category]);
	}
	return roots.flatMap((root) => [
		{ id: root.id, label: root.name },
		...(byParent.get(root.id) ?? []).map((child) => ({
			id: child.id,
			label: `— ${child.name}`,
		})),
	]);
}

export function CatalogueFilters({
	filter,
	counts,
	query,
	onFilterChange,
	onQueryChange,
	categories,
	category,
	onCategoryChange,
	provenance,
	onProvenanceChange,
	sort,
	onSortChange,
	showResale,
}: {
	filter: CatalogueFilter;
	counts: CatalogueResponse["counts"] | undefined;
	query: string;
	onFilterChange: (filter: CatalogueFilter) => void;
	onQueryChange: (query: string) => void;
	categories: Category[];
	category: string;
	onCategoryChange: (category: string) => void;
	provenance: CatalogueProvenance;
	onProvenanceChange: (provenance: CatalogueProvenance) => void;
	sort: CatalogueSort;
	onSortChange: (sort: CatalogueSort) => void;
	/** Resale rows only reach members who manage resale. */
	showResale: boolean;
}) {
	const t = useTranslations("Catalogue");
	const tc = useCatalogueStockT("catalogue");
	const searchId = useId();
	const options = useMemo(() => categoryOptions(categories), [categories]);
	const tabs = CATALOGUE_FILTERS.filter(
		(value) => value !== "resale" || showResale,
	);

	return (
		<div className="space-y-3">
			<fieldset className="flex flex-wrap gap-2 border-0 p-0">
				<legend className="sr-only">{t("filters")}</legend>
				{tabs.map((value) => {
					const active = value === filter;
					const count = counts?.[value];
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
							{value === "resale" ? tc("resaleTab") : t(`filter.${value}`)}
							{count !== undefined && (
								<span
									className={cn(
										"font-bold text-[11px] tabular-nums",
										active ? "text-[#CBD5E1]" : "text-[#64748B]",
									)}
								>
									{count}
								</span>
							)}
						</button>
					);
				})}
			</fieldset>
			<div className="flex flex-wrap items-center gap-3">
				<div className="relative min-w-[220px] flex-1 sm:max-w-[340px]">
					<label className="sr-only" htmlFor={searchId}>
						{tc("searchPlaceholder")}
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
						placeholder={tc("searchPlaceholder")}
						className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm focus:border-[#93C5FD] focus:outline-none"
					/>
				</div>
				<select
					aria-label={tc("category")}
					value={category}
					onChange={(event) => onCategoryChange(event.target.value)}
					className={selectClass}
				>
					<option value="">{tc("allCategories")}</option>
					{options.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
				{showResale && (
					<select
						aria-label={tc("provenance")}
						value={filter === "resale" ? "resale" : provenance}
						disabled={filter === "resale"}
						onChange={(event) =>
							onProvenanceChange(event.target.value as CatalogueProvenance)
						}
						className={selectClass}
					>
						{CATALOGUE_PROVENANCES.map((value) => (
							<option key={value} value={value}>
								{tc(`provenanceOption.${value}`)}
							</option>
						))}
					</select>
				)}
				<select
					aria-label={tc("sortLabel")}
					value={sort}
					onChange={(event) =>
						onSortChange(event.target.value as CatalogueSort)
					}
					className={cn(selectClass, "sm:ml-auto")}
				>
					{CATALOGUE_SORTS.map((value) => (
						<option key={value} value={value}>
							{tc(`sort.${value}`)}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
