"use client";

import { Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useReducer } from "react";
import { CatalogueEmpty } from "~/components/seller/catalogue-empty";
import { CatalogueFilters } from "~/components/seller/catalogue-filters";
import { CatalogueTable } from "~/components/seller/catalogue-table";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useCatalogue } from "~/hooks/use-catalogue";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { type CatalogueFilter, catalogueParamsFor } from "~/lib/catalogue";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface State {
	filter: CatalogueFilter;
	query: string;
	page: number;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function CatalogueClient({
	shopId,
	initialFilter,
}: {
	shopId: string;
	initialFilter: CatalogueFilter;
}) {
	const t = useTranslations("Catalogue");
	const [state, patch] = useReducer(reducer, {
		filter: initialFilter,
		query: "",
		page: 1,
	});
	const debouncedQuery = useDebouncedValue(
		state.query.trim(),
		SEARCH_DEBOUNCE_MS,
	);

	const { data, isPending, isError, isFetching, refetch } = useCatalogue(
		shopId,
		{
			...catalogueParamsFor(state.filter),
			q: debouncedQuery || undefined,
			page: state.page,
			limit: PAGE_SIZE,
		},
	);
	const retry = useCallback(() => {
		void refetch();
	}, [refetch]);

	const counts = data?.counts;
	const isFirstRun = !isError && counts?.all === 0;

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					{counts && (
						<p className="text-[#64748B] text-sm">
							{t("summary", {
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
						disabled
						title={t("soon")}
						className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-[#94A3B8] text-sm"
					>
						<Upload aria-hidden="true" className="h-4 w-4" />
						{t("import")}
						<span className="rounded bg-[#F1F5F9] px-1.5 text-[10px] uppercase">
							{t("soon")}
						</span>
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
						onFilterChange={(filter) => patch({ filter, page: 1 })}
						onQueryChange={(query) => patch({ query, page: 1 })}
						query={state.query}
					/>

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
									<CatalogueTable rows={data.docs} />
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
												onClick={() => patch({ page: data.page - 1 })}
												className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 font-medium disabled:opacity-40"
											>
												{t("previous")}
											</button>
											<button
												type="button"
												disabled={data.page >= data.totalPages || isFetching}
												onClick={() => patch({ page: data.page + 1 })}
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
		</div>
	);
}
