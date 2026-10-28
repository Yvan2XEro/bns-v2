"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { MovementsTable } from "~/components/seller/movements-table";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useMovements } from "~/hooks/use-stock";
import {
	type HistoryFilters,
	historyFiltersOf,
	historySearch,
	MOVEMENT_FILTERS,
	type MovementFilter,
} from "~/lib/stock";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 30;

/** The shop's whole ledger, newest first; its filters live in the URL. */
export function StockMovements({ shopId }: { shopId: string }) {
	const t = useTranslations("Stock");
	const ts = useCatalogueStockT("stock");
	const router = useRouter();
	const pathname = usePathname();
	const filters = historyFiltersOf(useSearchParams(), []);
	const go = (next: HistoryFilters) =>
		router.replace(`${pathname}${historySearch(next)}`, { scroll: false });
	const movements = useMovements(shopId, {
		type: MOVEMENT_FILTERS[filters.type],
		page: filters.page,
		limit: PAGE_SIZE,
	});
	const page = movements.data;

	return (
		<section className="min-w-0 space-y-4">
			<div className="flex flex-wrap gap-2">
				{(Object.keys(MOVEMENT_FILTERS) as MovementFilter[]).map((value) => (
					<button
						key={value}
						type="button"
						aria-pressed={filters.type === value}
						onClick={() => go({ ...filters, type: value, page: 1 })}
						className={cn(
							"inline-flex h-8 items-center rounded-full border px-3 font-medium text-sm",
							filters.type === value
								? "border-ink bg-night font-semibold text-white"
								: "border-line bg-surface text-ink-soft hover:border-[var(--shop-accent-border,var(--c-brand-line))]",
						)}
					>
						{value === "reservation"
							? ts("reservationsFilter")
							: t(`filter.${value}`)}
					</button>
				))}
			</div>

			{movements.isPending && <LoadingRows />}
			{movements.isError && (
				<LoadError
					title={t("errorTitle")}
					onRetry={() => void movements.refetch()}
				/>
			)}
			{page && !movements.isError && (
				<div aria-busy={movements.isFetching} className="space-y-4">
					{page.docs.length === 0 ? (
						<p className="rounded-xl border border-line bg-surface p-8 text-center text-ink-muted text-sm">
							{t("noMovements")}
						</p>
					) : (
						<>
							<MovementsTable rows={page.docs} />
							<div className="flex justify-end gap-2 text-sm">
								<button
									type="button"
									disabled={page.page <= 1}
									onClick={() => go({ ...filters, page: filters.page - 1 })}
									className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
								>
									{t("previous")}
								</button>
								<button
									type="button"
									disabled={!page.hasNextPage}
									onClick={() => go({ ...filters, page: filters.page + 1 })}
									className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
								>
									{t("next")}
								</button>
							</div>
						</>
					)}
				</div>
			)}
		</section>
	);
}
