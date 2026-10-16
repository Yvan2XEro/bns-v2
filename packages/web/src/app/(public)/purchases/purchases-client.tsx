"use client";

import { Clock } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "~/components/empty-state";
import { LevelBadge } from "~/components/shop/level-badge";
import { Button } from "~/components/ui/button";
import { useOrderMoney } from "~/hooks/use-order-money";
import { usePurchases } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import type { OrderListEntry } from "~/types/order";
import {
	groupPurchases,
	PURCHASE_TAB_LABEL_KEYS,
	PURCHASE_TABS,
	type PurchaseArrival,
	type PurchaseCardActionKind,
	type PurchaseTab,
	purchaseArrival,
	purchaseCardActions,
	purchasePaymentKey,
	purchaseTab,
} from "./purchase-view";
import { StatusLabel } from "./status-label";
import { useNow } from "./use-now";

const CARD_ACTION_KEYS: Record<PurchaseCardActionKind, string> = {
	confirm: "cardConfirm",
	track: "cardTrack",
	track_courier: "cardTrackCourier",
	review: "cardReview",
	return: "cardReturn",
};

function ArrivalLine({
	arrival,
	locale,
}: {
	arrival: PurchaseArrival;
	locale: "fr" | "en";
}) {
	const t = useTranslations("Purchases");
	const text =
		arrival.kind === "live"
			? t("arrivalLive", { time: arrival.clock })
			: arrival.kind === "eta"
				? t("arrivalEta", { eta: arrival.text })
				: arrival.kind === "promised"
					? t("arrivalPromised", {
							date: new Date(arrival.at).toLocaleString(locale, {
								dateStyle: "medium",
								timeStyle: "short",
							}),
						})
					: t("returnUntil", { date: formatOrderDate(arrival.at, locale) });
	return (
		<p className="flex items-center gap-1.5 text-[#334155] text-sm">
			<Clock aria-hidden className="h-4 w-4 shrink-0 text-[#1E40AF]" />
			{text}
		</p>
	);
}

function PurchaseRow({ entry, now }: { entry: OrderListEntry; now: Date }) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Purchases");
	const locale = useLocale() === "en" ? "en" : "fr";
	const actions = purchaseCardActions(entry, now);
	const arrival = purchaseArrival(entry, actions);
	const paymentKey = purchasePaymentKey(entry);
	return (
		<li className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white transition hover:border-[#93C5FD]">
			<Link
				href={`/purchases/${encodeURIComponent(entry.id)}`}
				className="flex min-h-11 items-center gap-4 p-4"
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
					<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[#64748B] text-sm">
						<span>{t("orderNumber", { number: entry.orderNumber })}</span>
						<span aria-hidden>·</span>
						<span className="inline-flex min-w-0 items-center gap-1.5">
							{entry.shopLogoUrl ? (
								// biome-ignore lint/performance/noImgElement: remote shop logo URL, not a static asset
								<img
									src={entry.shopLogoUrl}
									alt=""
									className="h-5 w-5 shrink-0 rounded-md object-cover"
								/>
							) : null}
							<span className="truncate">{entry.shopName}</span>
						</span>
						<LevelBadge badge={entry.shopBadge ?? null} size="sm" />
					</div>
					<p className="text-[#64748B] text-xs">
						{t("placedOn", { date: formatOrderDate(entry.placedAt, locale) })} ·{" "}
						{t("itemCount", { count: entry.itemCount })}
					</p>
				</div>
				<div className="shrink-0 space-y-1 text-right">
					<p className="font-semibold text-[#0F172A]">
						{formatOrderMoney(entry.total, locale)}
					</p>
					<StatusLabel status={entry.status} />
					{paymentKey ? (
						<p className="text-[#64748B] text-xs">{t(paymentKey)}</p>
					) : null}
				</div>
			</Link>
			{arrival || actions.length > 0 ? (
				<div className="flex flex-wrap items-center justify-between gap-3 border-[#F1F5F9] border-t px-4 py-3">
					{arrival ? (
						<ArrivalLine arrival={arrival} locale={locale} />
					) : (
						<span />
					)}
					{actions.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{actions.map((action, index) => (
								<Button
									key={action.kind}
									asChild
									size="sm"
									variant={index === 0 ? "default" : "outline"}
									className="min-h-11"
								>
									<Link href={action.href}>
										{t(CARD_ACTION_KEYS[action.kind])}
									</Link>
								</Button>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</li>
	);
}

export function PurchasesClient() {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const [tab, setTab] = useState<PurchaseTab>("open");
	const purchases = usePurchases();
	const now = useNow();

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
				{groupPurchases(entries).map((item) =>
					item.kind === "order" ? (
						<PurchaseRow key={item.entry.id} entry={item.entry} now={now} />
					) : (
						<li key={item.checkoutGroup} className="space-y-3">
							<div className="flex items-center justify-between gap-3 px-1">
								<p className="font-semibold text-[#0F172A] text-sm">
									{tRoot("CheckoutGroup.purchasesHeader", {
										count: item.entries.length,
									})}
								</p>
								<Link
									href={`/checkout/group/${encodeURIComponent(item.checkoutGroup)}`}
									className="min-h-11 content-center text-[#1E40AF] text-sm underline"
								>
									{tRoot("CheckoutGroup.purchasesGroupLink")}
								</Link>
							</div>
							<ul className="space-y-3 border-[#DBEAFE] border-l-2 pl-3">
								{item.entries.map((entry) => (
									<PurchaseRow key={entry.id} entry={entry} now={now} />
								))}
							</ul>
						</li>
					),
				)}
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
