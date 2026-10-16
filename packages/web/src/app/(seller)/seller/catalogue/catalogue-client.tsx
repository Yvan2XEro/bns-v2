"use client";

import { Plus, Upload, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useReducer, useState } from "react";
import { CatalogueEmpty } from "~/components/seller/catalogue-empty";
import { CatalogueFilters } from "~/components/seller/catalogue-filters";
import { CatalogueImportDialog } from "~/components/seller/catalogue-import-dialog";
import { CatalogueTable } from "~/components/seller/catalogue-table";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useCatalogue } from "~/hooks/use-catalogue";
import { useSetProductsStatus } from "~/hooks/use-catalogue-actions";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type CatalogueFilter,
	type CatalogueProvenance,
	type CatalogueSort,
	catalogueParamsFor,
} from "~/lib/catalogue";
import type { Category, ProductStatus } from "~/types";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface State {
	filter: CatalogueFilter;
	query: string;
	page: number;
	category: string;
	provenance: CatalogueProvenance;
	sort: CatalogueSort;
	selected: ReadonlySet<string>;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

const NONE: ReadonlySet<string> = new Set();

export function CatalogueClient({
	shopId,
	initialFilter,
	categories,
	otherCategoryNames,
	permissions,
}: {
	shopId: string;
	initialFilter: CatalogueFilter;
	categories: Category[];
	/** Each category's name in the other language, by id, for the CSV import. */
	otherCategoryNames?: Record<string, string>;
	/** Display only; the API decides every one of these again. */
	permissions: { resale: boolean; archive: boolean; costs: boolean };
}) {
	const t = useTranslations("Catalogue");
	const tc = useCatalogueStockT("catalogue");
	const tRoot = useTranslations();
	const [importOpen, setImportOpen] = useState(false);
	const [state, patch] = useReducer(reducer, {
		filter: initialFilter,
		query: "",
		page: 1,
		category: "",
		provenance: permissions.resale ? ("any" as const) : ("own" as const),
		sort: "updated",
		selected: NONE,
	});
	const debouncedQuery = useDebouncedValue(
		state.query.trim(),
		SEARCH_DEBOUNCE_MS,
	);
	// Any filter change clears the selection: a bulk action only ever touches
	// rows the seller can see.
	const refilter = (next: Partial<State>) =>
		patch({ ...next, page: 1, selected: NONE });

	const { data, isPending, isError, isFetching, refetch } = useCatalogue(
		shopId,
		{
			...catalogueParamsFor(state.filter, state.provenance),
			q: debouncedQuery || undefined,
			category: state.category || undefined,
			sort: state.sort,
			page: state.page,
			limit: PAGE_SIZE,
		},
	);
	const setStatus = useSetProductsStatus(shopId);
	const retry = useCallback(() => {
		void refetch();
	}, [refetch]);

	const applyStatus = (productIds: string[], status: ProductStatus) => {
		setStatus.mutate(
			{ productIds, status },
			{ onSuccess: () => patch({ selected: NONE }) },
		);
	};

	const counts = data?.counts;
	const defaultProvenance = permissions.resale ? "any" : "own";
	// Only the unfiltered view may stand for "nothing yet": the empty state
	// hides the filters, so a narrowed view must keep them to undo itself.
	const isFirstRun =
		!isError &&
		counts?.all === 0 &&
		state.filter !== "resale" &&
		state.provenance === defaultProvenance;
	const selectedIds = [...state.selected];

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					{counts && (
						<p className="text-[#64748B] text-sm">
							{permissions.resale && (counts.resale ?? 0) > 0
								? tc("summaryWithResale", {
										all: counts.all,
										active: counts.active,
										resale: counts.resale ?? 0,
										draft: counts.draft,
									})
								: t("summary", {
										all: counts.all,
										active: counts.active,
										draft: counts.draft,
									})}
						</p>
					)}
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => setImportOpen(true)}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm hover:border-[#93C5FD]"
					>
						<Upload aria-hidden="true" className="h-4 w-4" />
						{t("import")}
					</button>
					<Link
						href="/seller/catalogue/new"
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						<Plus aria-hidden="true" className="h-4 w-4" />
						{t("add")}
					</Link>
				</div>
			</div>

			{isFirstRun ? (
				<CatalogueEmpty />
			) : (
				<>
					<CatalogueFilters
						counts={counts}
						filter={state.filter}
						onFilterChange={(filter) => refilter({ filter })}
						onQueryChange={(query) => refilter({ query })}
						query={state.query}
						categories={categories}
						category={state.category}
						onCategoryChange={(category) => refilter({ category })}
						provenance={state.provenance}
						onProvenanceChange={(provenance) => refilter({ provenance })}
						sort={state.sort}
						onSortChange={(sort) => patch({ sort, page: 1 })}
						showResale={permissions.resale}
					/>

					{selectedIds.length > 0 && (
						<div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-sm">
							<span className="font-semibold text-[#1E3A8A]">
								{tc("selected", { count: selectedIds.length })}
							</span>
							<div className="flex flex-wrap gap-2 sm:ml-auto">
								{(["active", "draft"] as const).map((status) => (
									<button
										key={status}
										type="button"
										disabled={setStatus.isPending}
										onClick={() => applyStatus(selectedIds, status)}
										className="h-8 rounded-lg border border-[#E2E8F0] bg-white px-3 font-medium text-[#0F172A] disabled:opacity-50"
									>
										{tc(`bulk.${status}`)}
									</button>
								))}
								{permissions.archive && (
									<button
										type="button"
										disabled={setStatus.isPending}
										onClick={() => applyStatus(selectedIds, "archived")}
										className="h-8 rounded-lg border border-[#FECACA] bg-white px-3 font-medium text-[#991b1b] disabled:opacity-50"
									>
										{tc("bulk.archived")}
									</button>
								)}
								<button
									type="button"
									aria-label={tc("clearSelection")}
									onClick={() => patch({ selected: NONE })}
									className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-white"
								>
									<X aria-hidden="true" className="h-4 w-4" />
								</button>
							</div>
						</div>
					)}
					{setStatus.isError && (
						<p
							role="alert"
							className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
						>
							{resolveErrorMessage(setStatus.error, tRoot)}
						</p>
					)}

					{isPending && <LoadingRows />}
					{isError && <LoadError onRetry={retry} title={t("errorTitle")} />}
					{!isPending && !isError && data && (
						<div aria-busy={isFetching} className="space-y-4">
							{data.docs.length === 0 ? (
								<p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm">
									{t("noMatch")}
								</p>
							) : (
								<>
									<CatalogueTable
										rows={data.docs}
										selected={state.selected}
										onToggle={(id) => {
											const next = new Set(state.selected);
											if (next.has(id)) next.delete(id);
											else next.add(id);
											patch({ selected: next });
										}}
										onToggleAll={(ids, select) => {
											const next = new Set(state.selected);
											for (const id of ids) {
												if (select) next.add(id);
												else next.delete(id);
											}
											patch({ selected: next });
										}}
										canArchive={permissions.archive}
										onSetStatus={applyStatus}
										showProvenance={permissions.resale}
									/>
									<div className="flex flex-wrap items-center justify-between gap-2 text-[#64748B] text-sm">
										<span>
											{t("range", {
												from: (data.page - 1) * PAGE_SIZE + 1,
												to: (data.page - 1) * PAGE_SIZE + data.docs.length,
												total: data.totalDocs,
											})}
										</span>
										<div className="flex gap-2">
											<button
												type="button"
												disabled={data.page <= 1 || isFetching}
												onClick={() =>
													patch({ page: data.page - 1, selected: NONE })
												}
												className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 font-medium disabled:opacity-40"
											>
												{t("previous")}
											</button>
											<button
												type="button"
												disabled={data.page >= data.totalPages || isFetching}
												onClick={() =>
													patch({ page: data.page + 1, selected: NONE })
												}
												className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 font-medium disabled:opacity-40"
											>
												{t("next")}
											</button>
										</div>
									</div>
								</>
							)}
						</div>
					)}
				</>
			)}

			<CatalogueImportDialog
				shopId={shopId}
				categories={categories}
				otherCategoryNames={otherCategoryNames}
				includeCost={permissions.costs}
				open={importOpen}
				onOpenChange={setImportOpen}
			/>
		</div>
	);
}
