"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "~/components/empty-state";
import { Button } from "~/components/ui/button";
import { usePurchases } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import type { OrderListEntry } from "~/types/order";
import {
	PURCHASE_TAB_LABEL_KEYS,
	PURCHASE_TABS,
	type PurchaseTab,
	purchaseTab,
} from "./purchase-view";
import { StatusLabel } from "./status-label";

function PurchaseRow({ entry }: { entry: OrderListEntry }) {
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";
	return (
		<li>
			<Link
				href={`/purchases/${encodeURIComponent(entry.id)}`}
				className="flex min-h-11 items-center gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 transition hover:border-[#93C5FD]"
			>
				{entry.firstItemImageUrl ? (
					// biome-ignore lint/performance/noImgElement: remote order snapshot URL, not a static asset
					<img
						src={entry.firstItemImageUrl}
						alt=""
						className="h-16 w-16 shrink-0 rounded-xl object-cover"
					/>
				) : (
					<div className="h-16 w-16 shrink-0 rounded-xl bg-[#F1F5F9]" />
				)}
				<div className="min-w-0 flex-1 space-y-1">
					<p className="truncate font-semibold text-[#0F172A]">
						{entry.firstItemTitle}
					</p>
					<p className="text-[#64748B] text-sm">
						{t("orderNumber", { number: entry.orderNumber })} · {entry.shopName}
					</p>
					<p className="text-[#64748B] text-xs">
						{t("placedOn", { date: formatOrderDate(entry.placedAt, locale) })} ·{" "}
						{t("itemCount", { count: entry.itemCount })}
					</p>
				</div>
				<div className="shrink-0 space-y-1 text-right">
					<p className="font-semibold text-[#0F172A]">
						{formatXaf(entry.total, locale)}
					</p>
					<StatusLabel status={entry.status} />
				</div>
			</Link>
		</li>
	);
}

export function PurchasesClient() {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const [tab, setTab] = useState<PurchaseTab>("open");
	const purchases = usePurchases();

	const entries = (purchases.data?.pages ?? [])
		.flatMap((page) => page.docs)
		.filter((entry) => purchaseTab(entry.status) === tab);
	const nothingYet =
		purchases.isSuccess &&
		!purchases.hasNextPage &&
		purchases.data.pages.every((page) => page.docs.length === 0);

	return (
		<div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>

			<div role="tablist" className="flex gap-2">
				{PURCHASE_TABS.map((key) => (
					<button
						key={key}
						type="button"
						role="tab"
						aria-selected={tab === key}
						onClick={() => setTab(key)}
						className={`min-h-11 rounded-xl px-4 font-medium text-sm ${
							tab === key
								? "bg-[#1E40AF] text-white"
								: "bg-[#EFF6FF] text-[#1E40AF]"
						}`}
					>
						{t(PURCHASE_TAB_LABEL_KEYS[key])}
					</button>
				))}
			</div>

			{purchases.isPending && (
				<div className="space-y-3">
					{[0, 1, 2].map((row) => (
						<div
							key={row}
							className="h-24 animate-pulse rounded-2xl bg-[#F1F5F9]"
						/>
					))}
				</div>
			)}

			{purchases.isError && (
				<div role="alert" className="space-y-3 text-center">
					<p className="text-[#0F172A]">
						{resolveErrorMessage(purchases.error, tRoot)}
					</p>
					<Button onClick={() => void purchases.refetch()}>{t("retry")}</Button>
				</div>
			)}

			{nothingYet && <EmptyState illustration="empty" title={t("empty")} />}
			{purchases.isSuccess && !nothingYet && entries.length === 0 && (
				<p className="text-[#64748B]">{t("tabEmpty")}</p>
			)}

			<ul className="space-y-3">
				{entries.map((entry) => (
					<PurchaseRow key={entry.id} entry={entry} />
				))}
			</ul>

			{purchases.hasNextPage && (
				<Button
					variant="outline"
					className="w-full"
					disabled={purchases.isFetchingNextPage}
					onClick={() => void purchases.fetchNextPage()}
				>
					{t("loadMore")}
				</Button>
			)}
		</div>
	);
}
