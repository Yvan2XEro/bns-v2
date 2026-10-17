"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, MapPin, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "~/components/empty-state";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useAppConfig } from "~/hooks/use-app-config";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import {
	type SellerOrderFilters,
	useSellerOrders,
} from "~/hooks/use-seller-orders";
import { useUrlFilters } from "~/hooks/use-url-filters";
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
import { BulkDeclineDialog } from "./bulk-decline-dialog";
import type { SellerEndReason } from "./order-forms";
import {
	acceptableSelection,
	areaLabel,
	type BulkOutcome,
	isListTab,
	type ListTab,
	PERIODS,
	type Period,
	paymentPill,
	periodSince,
	refusableSelection,
	resaleNote,
	runOneByOne,
	selectableSelection,
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
	"h-[34px] rounded-lg border border-line bg-surface pr-8 pl-8 font-semibold text-ink text-[13px]";

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
	// Tab, search, area and period live in the URL: back from an order they
	// are still set, and a view can be sent to a teammate.
	const urlDefaults = useMemo(
		() => ({ tab: initialTab, search: "", district: "", period: "all" }),
		[initialTab],
	);
	const url = useUrlFilters(urlDefaults);
	const [state, patch] = useReducer(reducer, url.initial, (read) => ({
		tab: isListTab(read.tab) ? read.tab : initialTab,
		search: read.search,
		district: read.district,
		period: (PERIODS as readonly string[]).includes(read.period)
			? (read.period as Period)
			: "all",
	}));
	useEffect(() => url.sync(state), [url, state]);
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const q = useDebouncedValue(state.search.trim(), 300);
	// Fixed per period choice, so the query key does not change every minute.
	const [since, setSince] = useState<string | undefined>(() =>
		state.period === "all" ? undefined : periodSince(state.period, new Date()),
	);
	const filters: SellerOrderFilters = {
		tab: state.tab,
		q: q || undefined,
		district: state.district || undefined,
		since,
	};
	const query = useSellerOrders(shopId, filters);

	const counts = query.data?.pages[0]?.counts;
	const mentions = query.data?.pages[0]?.mentions;
	const rows = useMemo(
		() => (query.data?.pages ?? []).flatMap((page) => page.docs),
		[query.data],
	);

	useEffect(() => {
		setSelected((current) => {
			const keep = selectableSelection(rows, current, role, now);
			return keep.length === current.size ? current : new Set(keep);
		});
	}, [rows, role, now]);

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

	const [declineOpen, setDeclineOpen] = useState(false);
	const refreshOrders = () => {
		void queryClient.invalidateQueries({ queryKey: purchasesRootKey() });
		void queryClient.invalidateQueries({
			queryKey: shopOrdersRootKey(shopId),
		});
	};
	const failureReason = (failures: unknown[]) =>
		resolveErrorMessage(failures[0], tRoot, tLegacy("actionFailed"));

	const [progress, setProgress] = useState<string | null>(null);
	const onProgress = (finished: number, total: number) =>
		setProgress(`${finished}/${total}`);
	const bulkAccept = useMutation({
		mutationFn: (ids: string[]) =>
			runOneByOne(
				ids,
				(id) => apiPost(orderActionPath("accept", id)),
				onProgress,
			),
		onSettled: () => {
			setProgress(null);
			refreshOrders();
		},
		onSuccess: ({ done, failures, failedIds }) => {
			// Only the failures stay selected: retrying never redoes the rest.
			setSelected(new Set(failedIds));
			if (done > 0) toast.success(tList("bulkAccepted", { count: done }));
			if (failures.length > 0) {
				toast.error(
					tList("bulkFailed", {
						count: failures.length,
						reason: failureReason(failures),
					}),
					{
						action: {
							label: tList("bulkRetry"),
							onClick: () => bulkAccept.mutate(failedIds),
						},
					},
				);
			}
		},
	});

	const bulkDecline = useMutation({
		mutationFn: ({
			ids,
			input,
		}: {
			ids: string[];
			input: { reason: SellerEndReason; note?: string };
		}): Promise<BulkOutcome> =>
			runOneByOne(
				ids,
				(id) => apiPost(orderActionPath("decline", id), input),
				onProgress,
			),
		onSettled: () => {
			setProgress(null);
			refreshOrders();
		},
		onSuccess: ({ done, failures, failedIds }) => {
			setSelected(new Set(failedIds));
			setDeclineOpen(false);
			const summary = tList("bulkDeclined", { count: done });
			if (failures.length === 0) {
				toast.success(summary);
				return;
			}
			toast.error(
				`${summary}, ${tList("bulkDeclineFailed", {
					count: failures.length,
					reason: failureReason(failures),
				})}`,
			);
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
		mentions?.codEnabled ? tList("subtitleCod") : null,
		mentions?.sellerDeliveryEnabled && shopCity
			? tList("subtitleDelivery", { city: shopCity })
			: null,
	].filter(Boolean);

	const tabs: ListTab[] = ["all", ...SHOP_ORDER_TABS];
	const selectedIds = selectableSelection(rows, selected, role, now);
	const acceptIds = acceptableSelection(rows, selected, role, now);
	const refuseIds = refusableSelection(rows, selected, role);
	const canProcess = can(role, "orders.process");

	return (
		<div className="space-y-[18px]">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-1">
					<h1 className="font-extrabold text-[28px] text-ink tracking-[-0.4px]">
						{tList("title")}
					</h1>
					{subtitle.length > 0 && (
						<p className="text-ink-muted text-sm">{subtitle.join(" · ")}</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => exportCsv.mutate()}
					disabled={exportCsv.isPending || rows.length === 0}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:bg-canvas disabled:opacity-50"
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
									? "border-ink bg-night font-semibold text-white"
									: "border-line bg-surface font-medium text-ink-soft hover:border-[var(--shop-accent-border,var(--c-brand-line))]",
							)}
						>
							{tList(`tab.${tab}`)}
							{count ? (
								<span
									className={cn(
										"font-bold text-[11px] tabular-nums",
										active ? "text-ink-ghost" : "text-ink-muted",
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
						className="absolute top-3 left-3 h-4 w-4 text-ink-faint"
					/>
					<input
						type="search"
						value={state.search}
						maxLength={120}
						onChange={(event) => update({ search: event.target.value })}
						placeholder={tList("search")}
						className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm"
					/>
				</label>
				<label className="relative">
					<span className="sr-only">{tList("district")}</span>
					<MapPin
						aria-hidden="true"
						className="pointer-events-none absolute top-[9px] left-2.5 h-4 w-4 text-ink-muted"
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
						className="pointer-events-none absolute top-[9px] left-2.5 h-4 w-4 text-ink-muted"
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
				<div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--shop-accent-border,var(--c-brand-tint-strong))] bg-[var(--shop-accent-soft,var(--c-brand-soft))] px-3.5 py-2">
					<span className="font-semibold text-[var(--shop-accent-text,var(--c-brand))] text-sm">
						{tList("selectedCount", { count: selectedIds.length })}
					</span>
					<span className="flex-1" />
					<button
						type="button"
						onClick={() => setSelected(new Set())}
						className="inline-flex h-[34px] items-center rounded-lg border border-line bg-surface px-3 font-semibold text-[13px] text-ink"
					>
						{tList("clearSelection")}
					</button>
					{refuseIds.length > 0 && (
						<button
							type="button"
							disabled={bulkDecline.isPending || bulkAccept.isPending}
							onClick={() => setDeclineOpen(true)}
							className="inline-flex h-[34px] items-center rounded-lg border border-bad-line bg-surface px-3 font-semibold text-[13px] text-bad-ink-soft hover:bg-bad-faint disabled:opacity-50"
						>
							{bulkDecline.isPending && progress
								? tList("bulkProgress", { progress })
								: tList("declineSelected", { count: refuseIds.length })}
						</button>
					)}
					{acceptIds.length > 0 && (
						<button
							type="button"
							disabled={bulkAccept.isPending || bulkDecline.isPending}
							onClick={() =>
								bulkAccept.mutate(
									acceptableSelection(rows, selected, role, new Date()),
								)
							}
							className="inline-flex h-[34px] items-center rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-3 font-semibold text-[13px] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))] disabled:opacity-50"
						>
							{bulkAccept.isPending && progress
								? tList("bulkProgress", { progress })
								: tList("acceptSelected", { count: acceptIds.length })}
						</button>
					)}
				</div>
			)}
			<BulkDeclineDialog
				open={declineOpen}
				count={refuseIds.length}
				pending={bulkDecline.isPending}
				onClose={() => setDeclineOpen(false)}
				onSubmit={(input) =>
					bulkDecline.mutate({
						ids: refusableSelection(rows, selected, role),
						input,
					})
				}
			/>

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
						<div className="rounded-xl border border-line bg-surface">
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
								className="h-11 rounded-lg border border-line bg-surface px-4 font-medium text-sm disabled:opacity-40"
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
