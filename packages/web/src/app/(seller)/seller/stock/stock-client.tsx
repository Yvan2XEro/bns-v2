"use client";

import { ClipboardList, PackagePlus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { MovementsTable } from "~/components/seller/movements-table";
import { StockAdjust } from "~/components/seller/stock-adjust-drawer";
import { StockSummaryCards } from "~/components/seller/stock-summary-cards";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useMovements, useStockSummary } from "~/hooks/use-stock";
import { useStockCountOverview } from "~/hooks/use-stock-count-session";
import {
	type HistoryFilters,
	historyFiltersOf,
	historySearch,
	MOVEMENT_FILTERS,
	type MovementFilter,
	type MovementFormState,
} from "~/lib/stock";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 30;

/**
 * The shop's stock: its counters and the whole ledger, full width. Recording
 * a movement opens the adjust sheet over the page; the history's filters live
 * in the URL (`?type=`, `?page=`), and `?adjust=<variant>` opens the sheet on
 * that variant.
 */
export function StockClient({
	shopId,
	canSeeCosts,
	adjustVariantId,
}: {
	shopId: string;
	canSeeCosts: boolean;
	adjustVariantId: string | null;
}) {
	const t = useTranslations("Stock");
	const ts = useCatalogueStockT("stock");
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const search = useSearchParams();
	const filters = historyFiltersOf(search, []);
	const go = useCallback(
		(next: HistoryFilters) =>
			router.replace(`${pathname}${historySearch(next)}`, { scroll: false }),
		[router, pathname],
	);

	// The summary exposes the purchase cost, so it is asked for only when the
	// member may see it; the API refuses it to staff either way.
	const summary = useStockSummary(shopId, canSeeCosts);
	const overview = useStockCountOverview(shopId);
	const movements = useMovements(shopId, {
		type: MOVEMENT_FILTERS[filters.type],
		page: filters.page,
		limit: PAGE_SIZE,
	});

	const refetchMovements = movements.refetch;
	const refetchSummary = summary.refetch;
	const retry = useCallback(() => {
		void refetchMovements();
		if (canSeeCosts) void refetchSummary();
	}, [refetchMovements, refetchSummary, canSeeCosts]);

	// A movement is the newest of the ledger: after one, the history goes back
	// to its first page (the mutation already dropped the cached pages).
	const adjust = async (defaults?: Partial<MovementFormState>) => {
		const saved = await StockAdjust.call({ defaults });
		if (saved) go({ ...filters, page: 1 });
	};

	// `?adjust=` opens the sheet once, then leaves the URL.
	const deepLinked = useRef(false);
	useEffect(() => {
		if (!adjustVariantId || deepLinked.current) return;
		deepLinked.current = true;
		go(filters);
		// After the shell's sheet root has subscribed (its effect runs too).
		setTimeout(() => void StockAdjust.call({ variantId: adjustVariantId }), 0);
	}, [adjustVariantId, go, filters]);

	const page = movements.data;
	const lastCount = overview.data?.lastCompletedAt;
	const alerts = summary.data
		? summary.data.lowStock.length + summary.data.outOfStock.length
		: null;
	const subtitle = [
		lastCount
			? ts("lastCount", {
					date: new Date(lastCount).toLocaleDateString(locale, {
						day: "numeric",
						month: "long",
					}),
				})
			: overview.data
				? ts("neverCounted")
				: null,
		alerts === null ? null : ts("alerts", { count: alerts }),
	]
		.filter(Boolean)
		.join(" · ");

	const receiptPreset: Partial<MovementFormState> = {
		type: "receipt",
		note: ts("receiptNote", {
			date: new Date().toLocaleDateString(locale, {
				day: "numeric",
				month: "long",
			}),
		}),
	};

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-ink">{t("title")}</h1>
					{subtitle && <p className="text-ink-muted text-sm">{subtitle}</p>}
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						href="/seller/stock/inventory"
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
					>
						<ClipboardList aria-hidden="true" className="h-4 w-4" />
						{t("startInventory")}
					</Link>
					<button
						type="button"
						onClick={() => void adjust()}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
					>
						<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
						{t("adjustTitle")}
					</button>
					<button
						type="button"
						onClick={() => void adjust(receiptPreset)}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
					>
						<PackagePlus aria-hidden="true" className="h-4 w-4" />
						{ts("recordReceipt")}
					</button>
				</div>
			</div>

			{summary.data && <StockSummaryCards summary={summary.data} />}

			<section className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-bold text-base text-ink">
						{t("movementsTitle")}
					</h2>
					<div className="flex flex-wrap gap-2">
						{(Object.keys(MOVEMENT_FILTERS) as MovementFilter[]).map(
							(value) => (
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
							),
						)}
					</div>
				</div>

				{movements.isPending && <LoadingRows />}
				{movements.isError && (
					<LoadError title={t("errorTitle")} onRetry={retry} />
				)}
				{page && !movements.isError && (
					<div aria-busy={movements.isFetching} className="space-y-4">
						{page.docs.length === 0 ? (
							<p className="p-8 text-center text-ink-muted text-sm">
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
		</div>
	);
}
