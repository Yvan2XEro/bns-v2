"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { EmptyState } from "~/components/empty-state";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useSellerOrders } from "~/hooks/use-seller-orders";
import { SHOP_ORDER_TABS, type ShopOrderTab } from "~/lib/order-status";
import { cn } from "~/lib/utils";
import { OrdersTable } from "./orders-table";

interface State {
	tab: ShopOrderTab;
	search: string;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

/**
 * The shop's order queue. The tab counts come from the same response as the
 * rows and are narrowed by the same `q`, so the bar and the open tab agree.
 */
export function OrdersClient({
	shopId,
	initialTab,
}: {
	shopId: string;
	initialTab: ShopOrderTab;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const [state, patch] = useReducer(reducer, { tab: initialTab, search: "" });
	const q = useDebouncedValue(state.search.trim(), 300);
	const query = useSellerOrders(shopId, { tab: state.tab, q: q || undefined });

	const counts = query.data?.pages[0]?.counts;
	const rows = (query.data?.pages ?? []).flatMap((page) => page.docs);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
				<label className="relative block w-full sm:w-72">
					<span className="sr-only">{t("search")}</span>
					<Search
						aria-hidden="true"
						className="absolute top-3 left-3 h-4 w-4 text-[#94A3B8]"
					/>
					<input
						type="search"
						value={state.search}
						maxLength={120}
						onChange={(event) => patch({ search: event.target.value })}
						placeholder={t("search")}
						className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm"
					/>
				</label>
			</div>

			<div
				role="tablist"
				aria-label={t("tabsLabel")}
				className="flex gap-1 overflow-x-auto rounded-lg bg-[#F1F5F9] p-1"
			>
				{SHOP_ORDER_TABS.map((tab) => (
					<button
						key={tab}
						type="button"
						role="tab"
						aria-selected={state.tab === tab}
						onClick={() => patch({ tab })}
						className={cn(
							"inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 font-medium text-sm",
							state.tab === tab
								? "bg-white text-[#0F172A] shadow-sm"
								: "text-[#64748B]",
						)}
					>
						{tRoot(`OrderStatus.tab_${tab}`)}
						{counts && (
							<span className="rounded-full bg-[#E2E8F0] px-2 py-0.5 text-[#0F172A] text-xs">
								{counts[tab]}
							</span>
						)}
					</button>
				))}
			</div>

			{query.isPending && <LoadingRows />}
			{query.isError && (
				<LoadError
					title={t("loadError")}
					onRetry={() => void query.refetch()}
				/>
			)}
			{query.data && !query.isError && (
				<div aria-busy={query.isFetching} className="space-y-4">
					{rows.length === 0 ? (
						<div className="rounded-xl border border-[#E2E8F0] bg-white">
							<EmptyState
								illustration={q ? "searching" : "empty"}
								size={160}
								as="p"
								title={q ? t("emptySearch", { query: q }) : t("empty")}
							/>
						</div>
					) : (
						<OrdersTable rows={rows} tab={state.tab} />
					)}
					{query.hasNextPage && (
						<div className="flex justify-center">
							<button
								type="button"
								disabled={query.isFetchingNextPage}
								onClick={() => void query.fetchNextPage()}
								className="h-11 rounded-lg border border-[#E2E8F0] bg-white px-4 font-medium text-sm disabled:opacity-40"
							>
								{t("loadMore")}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
