"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, MapPin, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useReducer, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "~/components/empty-state";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useAppConfig } from "~/hooks/use-app-config";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useOrderSettings } from "~/hooks/use-order-settings";
import {
	type SellerOrderFilters,
	useSellerOrders,
} from "~/hooks/use-seller-orders";
import { resolveErrorMessage } from "~/lib/apiError";
import { DISTRICTS } from "~/lib/checkout-form";
import { orderActionPath } from "~/lib/order-actions";
import { SHOP_ORDER_TABS } from "~/lib/order-status";
import { purchasesRootKey, shopOrdersRootKey } from "~/lib/query-keys";
import { apiGet, apiPost, query as toQuery } from "~/lib/shop-api";
import { can } from "~/lib/shop-roles";
import { cn } from "~/lib/utils";
import type { ShopRole } from "~/types";
import type { OrderListEntry, ShopOrderPage } from "~/types/order";
import {
	areaLabel,
	type ListTab,
	PERIODS,
	type Period,
	paymentPill,
	periodSince,
	resaleNote,
	statusPill,
	toCsv,
} from "./order-list";
import { useResaleText } from "./order-pills";
import { OrdersTable } from "./orders-table";

interface State {
	tab: ListTab;
	search: string;
	district: string;
	period: Period;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

/** Bounds an export to what a seller would open in a spreadsheet at once. */
const EXPORT_MAX_PAGES = 50;

const FILTER =
	"h-[34px] rounded-lg border border-[#E2E8F0] bg-white pr-8 pl-8 font-semibold text-[#0F172A] text-[13px]";

function useMinuteClock(): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/**
 * The shop's order queue. The tab counts follow the district and period
 * filters but not the free-text search, so they keep saying how much work is
 * waiting while the seller looks for one order.
 */
export function OrdersClient({
	shopId,
	role,
	shopCity,
	initialTab,
}: {
	shopId: string;
	role: ShopRole | null;
	shopCity: string | null;
	initialTab: ListTab;
}) {
	const tList = useTranslations("SellerOrderList");
	const { launchCities } = useAppConfig();
	const cityLabel = (key: string) =>
		launchCities.find((option) => option.key === key)?.label ?? key;
	const tLegacy = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const queryClient = useQueryClient();
	const now = useMinuteClock();
	const resaleText = useResaleText();
	const [state, patch] = useReducer(reducer, {
		tab: initialTab,
		search: "",
		district: "",
		period: "all",
	});
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const q = useDebouncedValue(state.search.trim(), 300);
	// Fixed per period choice, so the query key does not change every minute.
	const [since, setSince] = useState<string | undefined>(undefined);
	const filters: SellerOrderFilters = {
		tab: state.tab,
		q: q || undefined,
		district: state.district || undefined,
		since,
	};
	const query = useSellerOrders(shopId, filters);
	const settings = useOrderSettings(can(role, "payments.view") ? shopId : null);

	const counts = query.data?.pages[0]?.counts;
	const rows = (query.data?.pages ?? []).flatMap((page) => page.docs);

	function update(next: Partial<State>) {
		patch(next);
		setSelected(new Set());
		if (next.period) setSince(periodSince(next.period, new Date()));
	}

	function toggle(id: string) {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleAll(ids: string[], select: boolean) {
		setSelected(select ? new Set(ids) : new Set());
	}

	const bulkAccept = useMutation({
		mutationFn: async (ids: string[]) => {
			const failures: unknown[] = [];
			for (const id of ids) {
				try {
					await apiPost(orderActionPath("accept", id));
				} catch (error) {
					failures.push(error);
				}
			}
			return { done: ids.length - failures.length, failures };
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: purchasesRootKey() });
			void queryClient.invalidateQueries({
				queryKey: shopOrdersRootKey(shopId),
			});
		},
		onSuccess: ({ done, failures }) => {
			setSelected(new Set());
			if (done > 0) toast.success(tList("bulkAccepted", { count: done }));
			if (failures.length > 0) {
				toast.error(
					tList("bulkFailed", {
						count: failures.length,
						reason: resolveErrorMessage(
							failures[0],
							tRoot,
							tLegacy("actionFailed"),
						),
					}),
				);
			}
		},
	});

	const exportCsv = useMutation({
		mutationFn: async () => {
			const all: OrderListEntry[] = [];
			let cursor: string | undefined;
			for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
				const result = await apiGet<ShopOrderPage>(
					`/api/shops/${encodeURIComponent(shopId)}/orders${toQuery({
						...filters,
						cursor,
					})}`,
				);
				all.push(...result.docs);
				if (!result.nextCursor) break;
				cursor = result.nextCursor;
			}
			return all;
		},
		onSuccess: (all) => {
			const csv = toCsv(
				[
					tList("csv.number"),
					tList("csv.date"),
					tList("csv.customer"),
					tList("csv.area"),
					tList("csv.items"),
					tList("csv.quantity"),
					tList("csv.total"),
					tList("csv.payment"),
					tList("csv.status"),
					tList("csv.resale"),
				],
				all.map((row) => {
					const payment = paymentPill(row);
					const note = resaleNote(row);
					return [
						row.orderNumber,
						row.placedAt,
						row.recipientName ?? "",
						areaLabel(row.area) ?? "",
						row.firstItemTitle,
						row.itemCount,
						row.total,
						payment ? tList(`payment.${payment}`) : "",
						tList(`status.${statusPill(row.status)}`),
						note ? resaleText(note) : "",
					];
				}),
			);
			// The BOM makes Excel read the file as UTF-8 (accents, "Deïdo").
			const blob = new Blob([`﻿${csv}`], {
				type: "text/csv;charset=utf-8",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${tList("csv.fileName")}-${new Date().toISOString().slice(0, 10)}.csv`;
			link.click();
			URL.revokeObjectURL(url);
		},
		onError: (error) =>
			toast.error(resolveErrorMessage(error, tRoot, tList("exportFailed"))),
	});

	const toProcess = counts ? counts.to_accept + counts.to_ship : null;
	const subtitle = [
		toProcess === null ? null : tList("toProcess", { count: toProcess }),
		settings.data?.codEnabled ? tList("subtitleCod") : null,
		settings.data?.sellerDeliveryEnabled && shopCity
			? tList("subtitleDelivery", { city: shopCity })
			: null,
	].filter(Boolean);

	const tabs: ListTab[] = ["all", ...SHOP_ORDER_TABS];
	const selectedIds = rows
		.filter((row) => selected.has(row.id))
		.map((row) => row.id);
	const canProcess = can(role, "orders.process");

	return (
		<div className="space-y-[18px]">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-1">
					<h1 className="font-extrabold text-[#0F172A] text-[28px] tracking-[-0.4px]">
						{tList("title")}
					</h1>
					{subtitle.length > 0 && (
						<p className="text-[#64748B] text-sm">{subtitle.join(" · ")}</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => exportCsv.mutate()}
					disabled={exportCsv.isPending || rows.length === 0}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm hover:bg-[#F8FAFC] disabled:opacity-50"
				>
					<Download aria-hidden="true" className="h-4 w-4" />
					{tList("export")}
				</button>
			</div>

			<div
				role="tablist"
				aria-label={tLegacy("tabsLabel")}
				className="flex gap-2 overflow-x-auto"
			>
				{tabs.map((tab) => {
					const active = state.tab === tab;
					const count = tab === "all" ? null : counts?.[tab];
					return (
						<button
							key={tab}
							type="button"
							role="tab"
							aria-selected={active}
							onClick={() => update({ tab })}
							className={cn(
								"inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px]",
								active
									? "border-[#0F172A] bg-[#0F172A] font-semibold text-white"
									: "border-[#E2E8F0] bg-white font-medium text-[#334155] hover:border-[#93C5FD]",
							)}
						>
							{tList(`tab.${tab}`)}
							{count ? (
								<span
									className={cn(
										"font-bold text-[11px] tabular-nums",
										active ? "text-[#CBD5E1]" : "text-[#64748B]",
									)}
								>
									{count}
								</span>
							) : null}
						</button>
					);
				})}
			</div>

			<div className="flex flex-wrap items-center gap-2.5">
				<label className="relative block w-full sm:w-[340px]">
					<span className="sr-only">{tList("search")}</span>
					<Search
						aria-hidden="true"
						className="absolute top-3 left-3 h-4 w-4 text-[#94A3B8]"
					/>
					<input
						type="search"
						value={state.search}
						maxLength={120}
						onChange={(event) => update({ search: event.target.value })}
						placeholder={tList("search")}
						className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm"
					/>
				</label>
				<label className="relative">
					<span className="sr-only">{tList("district")}</span>
					<MapPin
						aria-hidden="true"
						className="pointer-events-none absolute top-[9px] left-2.5 h-4 w-4 text-[#64748B]"
					/>
					<select
						value={state.district}
						onChange={(event) => update({ district: event.target.value })}
						className={FILTER}
					>
						<option value="">{tList("district")}</option>
						{Object.entries(DISTRICTS).map(([city, districts]) => (
							<optgroup key={city} label={cityLabel(city)}>
								{districts.map((district) => (
									<option key={district.key} value={district.key}>
										{district.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</label>
				<label className="relative">
					<span className="sr-only">{tList("period")}</span>
					<CalendarDays
						aria-hidden="true"
						className="pointer-events-none absolute top-[9px] left-2.5 h-4 w-4 text-[#64748B]"
					/>
					<select
						value={state.period}
						onChange={(event) =>
							update({ period: event.target.value as Period })
						}
						className={FILTER}
					>
						{PERIODS.map((period) => (
							<option key={period} value={period}>
								{tList(`periods.${period}`)}
							</option>
						))}
					</select>
				</label>
			</div>

			{canProcess && selectedIds.length > 0 && (
				<div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-2">
					<span className="font-semibold text-[#1E40AF] text-sm">
						{tList("selectedCount", { count: selectedIds.length })}
					</span>
					<span className="flex-1" />
					<button
						type="button"
						onClick={() => setSelected(new Set())}
						className="inline-flex h-[34px] items-center rounded-lg border border-[#E2E8F0] bg-white px-3 font-semibold text-[#0F172A] text-[13px]"
					>
						{tList("clearSelection")}
					</button>
					<button
						type="button"
						disabled={bulkAccept.isPending}
						onClick={() => bulkAccept.mutate(selectedIds)}
						className="inline-flex h-[34px] items-center rounded-lg bg-[#1E40AF] px-3 font-semibold text-[13px] text-white hover:bg-[#1E3A8A] disabled:opacity-50"
					>
						{tList("acceptSelected", { count: selectedIds.length })}
					</button>
				</div>
			)}

			{query.isPending && <LoadingRows />}
			{query.isError && (
				<LoadError
					title={tLegacy("loadError")}
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
								title={
									q ? tLegacy("emptySearch", { query: q }) : tLegacy("empty")
								}
							/>
						</div>
					) : (
						<OrdersTable
							rows={rows}
							shopId={shopId}
							role={role}
							now={now}
							selected={selected}
							onToggle={toggle}
							onToggleAll={toggleAll}
						/>
					)}
					{query.hasNextPage && (
						<div className="flex justify-center">
							<button
								type="button"
								disabled={query.isFetchingNextPage}
								onClick={() => void query.fetchNextPage()}
								className="h-11 rounded-lg border border-[#E2E8F0] bg-white px-4 font-medium text-sm disabled:opacity-40"
							>
								{tLegacy("loadMore")}
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
