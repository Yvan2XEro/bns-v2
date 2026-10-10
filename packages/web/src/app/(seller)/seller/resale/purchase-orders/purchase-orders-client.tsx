"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useReducer } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useShopPurchaseOrders } from "~/hooks/use-purchase-orders";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import { cn } from "~/lib/utils";
import type { PurchaseOrderView } from "../../../../../../../api/src/contracts/purchaseOrders";

type Side = "supplier" | "reseller";

interface State {
	side: Side;
	search: string;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function PurchaseOrdersClient({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResale");
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const [state, patch] = useReducer(reducer, {
		side: "supplier",
		search: "",
	});
	const queryText = useDebouncedValue(state.search.trim(), 300);
	const query = useShopPurchaseOrders(shopId, {
		side: state.side,
		q: queryText || undefined,
	});
	const rows = (query.data?.pages ?? []).flatMap((page) => page.docs);
	const statusLabels: Record<PurchaseOrderView["status"], string> = {
		sent: t("status.sent"),
		accepted: t("status.accepted"),
		shipped: t("status.shipped"),
		delivered: t("status.delivered"),
		cancelled: t("status.cancelled"),
		returned: t("status.returned"),
	};

	return (
		<section className="space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="font-semibold text-[#B45309] text-xs uppercase tracking-[0.18em]">
						BuyNSellem · Resale
					</p>
					<h1 className="mt-2 font-bold text-2xl text-[#0F172A]">
						{t("title")}
					</h1>
					<p className="mt-1 max-w-2xl text-[#64748B] text-sm">
						{t("description")}
					</p>
				</div>
				<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
					<Link
						href="/seller/resale/finance"
						className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm hover:border-[#F59E0B]"
					>
						{t("finance.title")}
					</Link>
					<label className="relative block sm:w-80">
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
							className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm outline-none focus:border-[#B45309] focus:ring-2 focus:ring-[#FDE68A]"
						/>
					</label>
				</div>
			</header>

			<div
				role="tablist"
				aria-label={t("title")}
				className="grid grid-cols-2 gap-2 rounded-xl bg-[#F1F5F9] p-1"
			>
				{(["supplier", "reseller"] as const).map((side) => (
					<button
						key={side}
						type="button"
						role="tab"
						aria-selected={state.side === side}
						onClick={() => patch({ side })}
						className={cn(
							"min-h-11 rounded-lg px-3 py-2 text-left font-semibold text-sm transition-colors",
							state.side === side
								? "bg-white text-[#0F172A] shadow-sm"
								: "text-[#64748B] hover:text-[#0F172A]",
						)}
					>
						{side === "supplier" ? t("supplierSide") : t("resellerSide")}
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
				<div aria-busy={query.isFetching} className="space-y-3">
					{rows.length === 0 ? (
						<div className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white px-6 py-14 text-center">
							<p className="font-semibold text-[#334155]">{t("empty")}</p>
						</div>
					) : (
						rows.map((row) => {
							const deadline = row.shipBy ?? row.acceptBy;
							const amount =
								state.side === "supplier"
									? row.supplierAmount
									: row.collectAmount;
							return (
								<Link
									key={row.id}
									href={`/seller/resale/purchase-orders/${encodeURIComponent(row.id)}?side=${state.side}`}
									aria-label={`${t("open")}: ${row.number}`}
									className="group hover:-translate-y-0.5 grid gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 transition hover:border-[#F59E0B] hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-bold text-[#0F172A]">
												{row.number}
											</span>
											<span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 font-semibold text-[#92400E] text-xs">
												{statusLabels[row.status]}
											</span>
										</div>
										<p className="mt-1 truncate text-[#475569] text-sm">
											{row.counterparty.name} ·{" "}
											{row.items
												.map((item) => `${item.quantity} × ${item.title}`)
												.join(", ")}
										</p>
										<p className="mt-2 text-[#64748B] text-xs">
											{t("date")}: {formatOrderDate(row.sentAt, locale)} ·{" "}
											{t("deadline")}: {formatOrderDate(deadline, locale)}
										</p>
									</div>
									<div className="flex items-center justify-between gap-4 sm:justify-end">
										<div className="sm:text-right">
											<p className="text-[#64748B] text-xs">
												{state.side === "supplier"
													? t("amount")
													: t("collectAmount")}
											</p>
											<p className="mt-1 font-bold text-[#0F172A] text-sm">
												{amount === null ? "—" : formatXaf(amount, locale)}
											</p>
										</div>
										<ArrowRight
											aria-hidden="true"
											className="h-5 w-5 shrink-0 text-[#94A3B8] transition group-hover:translate-x-1 group-hover:text-[#B45309]"
										/>
									</div>
								</Link>
							);
						})
					)}
					{query.hasNextPage && (
						<div className="flex justify-center pt-2">
							<button
								type="button"
								disabled={query.isFetchingNextPage}
								onClick={() => void query.fetchNextPage()}
								className="min-h-11 rounded-lg border border-[#E2E8F0] bg-white px-5 font-semibold text-sm disabled:opacity-50"
							>
								{t("loadMore")}
							</button>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
