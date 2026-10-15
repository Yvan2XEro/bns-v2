"use client";

import { ClipboardList, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { MovementsTable } from "~/components/seller/movements-table";
import {
	StockAdjustBody,
	StockAdjustDrawer,
} from "~/components/seller/stock-adjust-drawer";
import { StockSummaryCards } from "~/components/seller/stock-summary-cards";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useMovements, useStockSummary } from "~/hooks/use-stock";
import { useStockCountOverview } from "~/hooks/use-stock-count-session";
import type { MovementFormState } from "~/lib/stock";
import { cn } from "~/lib/utils";

/**
 * "all", the types a member can record, and the reservations orders write —
 * a reservation and its release read as one story, so they filter together.
 */
const TYPE_FILTERS = {
	all: undefined,
	receipt: "receipt",
	reservation: "reservation,release",
	adjustment: "adjustment",
	loss: "loss",
	return: "return",
} as const;
type TypeFilter = keyof typeof TYPE_FILTERS;
const PAGE_SIZE = 30;
/** Tailwind's `xl`: from here the adjust form sits beside the history. */
const PANEL_QUERY = "(min-width: 1280px)";

interface State {
	filter: TypeFilter;
	page: number;
	drawerOpen: boolean;
	/** Bumped to restart the side panel's form (after a save, or a new preset). */
	panelKey: number;
	/** Only the first form honours the `?adjust=` deep link. */
	deepLink: string | null;
	preset: Partial<MovementFormState> | undefined;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

const panelVisible = () =>
	typeof window !== "undefined" && window.matchMedia(PANEL_QUERY).matches;

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
	const panelRef = useRef<HTMLElement>(null);
	const [state, patch] = useReducer(reducer, {
		filter: "all",
		page: 1,
		drawerOpen: false,
		panelKey: 0,
		deepLink: adjustVariantId,
		preset: undefined,
	});

	// A deep link opens the drawer only where there is no side panel to show it.
	useEffect(() => {
		if (adjustVariantId && !panelVisible()) patch({ drawerOpen: true });
	}, [adjustVariantId]);

	// The summary exposes the purchase cost, so it is asked for only when the
	// member may see it; the API refuses it to staff either way.
	const summary = useStockSummary(shopId, canSeeCosts);
	const overview = useStockCountOverview(shopId);
	const movements = useMovements(shopId, {
		type: TYPE_FILTERS[state.filter],
		page: state.page,
		limit: PAGE_SIZE,
	});

	const refetchMovements = movements.refetch;
	const refetchSummary = summary.refetch;
	const retry = useCallback(() => {
		void refetchMovements();
		if (canSeeCosts) void refetchSummary();
	}, [refetchMovements, refetchSummary, canSeeCosts]);

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

	const openAdjust = (preset: Partial<MovementFormState> | undefined) => {
		if (panelVisible()) {
			patch({ preset, deepLink: null, panelKey: state.panelKey + 1 });
			panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
			panelRef.current?.querySelector<HTMLElement>("input")?.focus();
		} else {
			patch({ preset, deepLink: null, drawerOpen: true });
		}
	};
	const receiptPreset: Partial<MovementFormState> = {
		type: "receipt",
		note: ts("receiptNote", {
			date: new Date().toLocaleDateString(locale, {
				day: "numeric",
				month: "long",
			}),
		}),
	};
	// The mutation already dropped the ledger and the counters; the new
	// movement is the newest one, so the history goes back to its first page.
	const afterSave = () => patch({ page: 1 });

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					{subtitle && <p className="text-[#64748B] text-sm">{subtitle}</p>}
				</div>
				<div className="flex flex-wrap gap-2">
					<Link
						href="/seller/stock/inventory"
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm hover:border-[#93C5FD]"
					>
						<ClipboardList aria-hidden="true" className="h-4 w-4" />
						{t("startInventory")}
					</Link>
					<button
						type="button"
						onClick={() => openAdjust(receiptPreset)}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						<PackagePlus aria-hidden="true" className="h-4 w-4" />
						{ts("recordReceipt")}
					</button>
				</div>
			</div>

			{summary.data && <StockSummaryCards summary={summary.data} />}

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
				<section className="min-w-0 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-bold text-[#0F172A] text-base">
							{t("movementsTitle")}
						</h2>
						<div className="flex flex-wrap gap-2">
							{(Object.keys(TYPE_FILTERS) as TypeFilter[]).map((value) => (
								<button
									key={value}
									type="button"
									aria-pressed={state.filter === value}
									onClick={() => patch({ filter: value, page: 1 })}
									className={cn(
										"inline-flex h-8 items-center rounded-full border px-3 font-medium text-sm",
										state.filter === value
											? "border-[#0F172A] bg-[#0F172A] font-semibold text-white"
											: "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#93C5FD]",
									)}
								>
									{value === "reservation"
										? ts("reservationsFilter")
										: t(`filter.${value}`)}
								</button>
							))}
							<button
								type="button"
								onClick={() => openAdjust(undefined)}
								className="inline-flex h-8 items-center rounded-full border border-[#E2E8F0] bg-white px-3 font-medium text-[#1E40AF] text-sm hover:border-[#93C5FD] xl:hidden"
							>
								{t("adjustTitle")}
							</button>
						</div>
					</div>

					{movements.isPending && <LoadingRows />}
					{movements.isError && (
						<LoadError title={t("errorTitle")} onRetry={retry} />
					)}
					{page && !movements.isError && (
						<div aria-busy={movements.isFetching} className="space-y-4">
							{page.docs.length === 0 ? (
								<p className="p-8 text-center text-[#64748B] text-sm">
									{t("noMovements")}
								</p>
							) : (
								<>
									<MovementsTable rows={page.docs} />
									<div className="flex justify-end gap-2 text-sm">
										<button
											type="button"
											disabled={page.page <= 1}
											onClick={() => patch({ page: state.page - 1 })}
											className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 disabled:opacity-40"
										>
											{t("previous")}
										</button>
										<button
											type="button"
											disabled={!page.hasNextPage}
											onClick={() => patch({ page: state.page + 1 })}
											className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 disabled:opacity-40"
										>
											{t("next")}
										</button>
									</div>
								</>
							)}
						</div>
					)}
				</section>

				<section
					ref={panelRef}
					aria-labelledby="stock-adjust-panel"
					className="hidden scroll-mt-4 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-4 xl:sticky xl:top-4 xl:block"
				>
					<div className="space-y-1">
						<h2
							id="stock-adjust-panel"
							className="font-bold text-[#0F172A] text-base"
						>
							{t("adjustTitle")}
						</h2>
						<p className="text-[#64748B] text-sm">{t("adjustSubtitle")}</p>
					</div>
					<StockAdjustBody
						key={state.panelKey}
						shopId={shopId}
						initialVariantId={state.deepLink}
						defaults={state.preset}
						onSaved={afterSave}
						onOpenChange={() =>
							patch({
								deepLink: null,
								preset: undefined,
								panelKey: state.panelKey + 1,
							})
						}
					/>
				</section>
			</div>

			<StockAdjustDrawer
				shopId={shopId}
				open={state.drawerOpen}
				initialVariantId={state.deepLink}
				defaults={state.preset}
				onOpenChange={(drawerOpen) =>
					patch(drawerOpen ? { drawerOpen } : { drawerOpen, deepLink: null })
				}
				onSaved={afterSave}
			/>
		</div>
	);
}
