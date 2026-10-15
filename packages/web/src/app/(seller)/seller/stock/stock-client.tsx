"use client";

import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useReducer } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { MovementsTable } from "~/components/seller/movements-table";
import { StockAdjustDrawer } from "~/components/seller/stock-adjust-drawer";
import { StockSummaryCards } from "~/components/seller/stock-summary-cards";
import { useMovements, useStockSummary } from "~/hooks/use-stock";
import { cn } from "~/lib/utils";
import type { ClientMovementType } from "~/types";

/** "all" plus exactly the types a member can record, in the ledger's order. */
const TYPE_FILTERS = [
	"all",
	"receipt",
	"adjustment",
	"loss",
	"return",
] as const satisfies readonly ("all" | ClientMovementType)[];
type TypeFilter = (typeof TYPE_FILTERS)[number];
const PAGE_SIZE = 30;

interface State {
	filter: TypeFilter;
	page: number;
	drawerOpen: boolean;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

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
	const [state, patch] = useReducer(reducer, {
		filter: "all",
		page: 1,
		drawerOpen: Boolean(adjustVariantId),
	});

	// The summary exposes the purchase cost, so it is asked for only when the
	// member may see it; the API refuses it to staff either way.
	const summary = useStockSummary(shopId, canSeeCosts);
	const movements = useMovements(shopId, {
		type: state.filter === "all" ? undefined : state.filter,
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

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
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
						onClick={() => patch({ drawerOpen: true })}
						className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						<Plus aria-hidden="true" className="h-4 w-4" />
						{t("adjustTitle")}
					</button>
				</div>
			</div>

			{summary.data && <StockSummaryCards summary={summary.data} />}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-bold text-[#0F172A] text-lg">
					{t("movementsTitle")}
				</h2>
				<div className="flex flex-wrap gap-2">
					{TYPE_FILTERS.map((value) => (
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
							{t(`filter.${value}`)}
						</button>
					))}
				</div>
			</div>

			{movements.isPending && <LoadingRows />}
			{movements.isError && (
				<LoadError title={t("errorTitle")} onRetry={retry} />
			)}
			{page && !movements.isError && (
				<div aria-busy={movements.isFetching} className="space-y-4">
					{page.docs.length === 0 ? (
						<p className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm">
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

			<StockAdjustDrawer
				shopId={shopId}
				open={state.drawerOpen}
				initialVariantId={adjustVariantId}
				onOpenChange={(drawerOpen) => patch({ drawerOpen })}
				// The mutation already dropped the ledger and the counters; the
				// new movement is the newest one, so the history goes back to
				// its first page to show it.
				onSaved={() => patch({ page: 1 })}
			/>
		</div>
	);
}
