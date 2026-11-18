"use client";

import { MessageSquare, PackageCheck, ReceiptText, Truck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useMyShops } from "~/hooks/use-my-shops";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	useSellerOrderQueue,
	useSellerOrders,
	useSellerOrderWeek,
} from "~/hooks/use-seller-orders";
import { resaleNote } from "./orders/order-list";
import { PaymentPill, StatusPill, useResaleText } from "./orders/order-pills";

/** What needs the seller now: the four counts the dashboard's cards and subtitle share. */
function usePending(
	shopId: string,
	canViewOrders: boolean,
	canReply: boolean,
	lowStock: number,
) {
	const { ordersEnabled } = useAppConfig();
	const orders = ordersEnabled && canViewOrders;
	const queue = useSellerOrderQueue(orders ? shopId : null);
	const { data: myShops } = useMyShops();
	const unread = canReply
		? (myShops?.find((entry) => entry.shopId === shopId)?.inboxUnread ?? 0)
		: 0;
	return {
		orders,
		ready: !orders || Boolean(queue.data),
		toAccept: queue.data?.toAccept ?? 0,
		toShip: queue.data?.toShip ?? 0,
		lowStock,
		unread,
		canReply,
	};
}

export type PendingProps = {
	shopId: string;
	canViewOrders: boolean;
	canReply: boolean;
	lowStock: number;
};

/** "Mardi 15 septembre · 7 actions en attente", in the viewer's own time zone. */
export function DashboardSubtitle(props: PendingProps) {
	const tDash = useTranslations("SellerDashboard");
	const locale = useLocale();
	const pending = usePending(
		props.shopId,
		props.canViewOrders,
		props.canReply,
		props.lowStock,
	);
	const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(new Date());
	const total =
		pending.toAccept + pending.toShip + pending.lowStock + pending.unread;
	return (
		<p className="text-ink-muted text-sm" suppressHydrationWarning>
			{date.charAt(0).toUpperCase() + date.slice(1)}
			{pending.ready && ` · ${tDash("pendingActions", { count: total })}`}
		</p>
	);
}

export function SellerTodayCards({
	hideWhenEmpty = false,
	...props
}: PendingProps & { hideWhenEmpty?: boolean }) {
	const tDash = useTranslations("SellerDashboard");
	const pending = usePending(
		props.shopId,
		props.canViewOrders,
		props.canReply,
		props.lowStock,
	);
	const work =
		pending.toAccept + pending.toShip + pending.lowStock + pending.unread;
	if (hideWhenEmpty && (!pending.ready || work === 0)) return null;

	const cards = [
		...(pending.orders
			? [
					{
						icon: ReceiptText,
						tone: "bg-warn-soft text-warn-ink-soft",
						value: pending.toAccept,
						label: tDash("toAccept", { count: pending.toAccept }),
						action: tDash("process"),
						href: "/seller/orders?tab=to_accept",
					},
					{
						icon: Truck,
						tone: "bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]",
						value: pending.toShip,
						label: tDash("toShip", { count: pending.toShip }),
						action: tDash("prepare"),
						href: "/seller/orders?tab=to_ship",
					},
				]
			: []),
		{
			icon: PackageCheck,
			tone: "bg-bad-soft text-bad",
			value: pending.lowStock,
			label: tDash("lowStock", { count: pending.lowStock }),
			action: tDash("restock"),
			href: "/seller/catalogue?stock=low",
		},
		...(pending.canReply
			? [
					{
						icon: MessageSquare,
						tone: "bg-subtle text-ink-mid",
						value: pending.unread,
						label: tDash("unanswered", { count: pending.unread }),
						action: tDash("reply"),
						href: "/seller/messages",
					},
				]
			: []),
	];

	return (
		<section
			aria-label={tDash("pendingTitle")}
			className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
		>
			{cards.map(({ icon: Icon, tone, value, label, action, href }) => (
				<div
					key={href}
					className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4"
				>
					<span
						className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] ${tone}`}
					>
						<Icon aria-hidden="true" className="h-[19px] w-[19px]" />
					</span>
					<p className="flex items-baseline gap-2">
						<span className="font-bold text-[28px] text-ink leading-none">
							{value}
						</span>
						<span className="text-ink-soft text-sm">{label}</span>
					</p>
					<Link
						href={href}
						className="font-semibold text-[var(--shop-accent-text,var(--c-brand))] text-sm hover:underline"
					>
						{action}
					</Link>
				</div>
			))}
		</section>
	);
}

const RECENT_ROWS = 6;

/** The latest orders across every status, as the design's dashboard lists them. */
export function RecentOrders({ shopId }: { shopId: string }) {
	const tDash = useTranslations("SellerDashboard");
	const tList = useTranslations("SellerOrderList");
	const formatOrderMoney = useOrderMoney();
	const resaleText = useResaleText();
	const query = useSellerOrders(shopId, { tab: "all" });
	const rows = query.data?.pages[0]?.docs.slice(0, RECENT_ROWS) ?? [];

	return (
		<section className="overflow-hidden rounded-xl border border-line bg-surface">
			<div className="flex items-center justify-between p-4">
				<h2 className="font-bold text-[17px] text-ink">
					{tDash("recentTitle")}
				</h2>
				<Link
					href="/seller/orders"
					className="font-medium text-[var(--shop-accent-text,var(--c-brand))] text-sm hover:underline"
				>
					{tDash("allOrders")}
				</Link>
			</div>
			{query.isPending ? (
				<div className="space-y-2 px-4 pb-4">
					{[0, 1, 2].map((key) => (
						<span
							key={key}
							className="block h-9 animate-pulse rounded-lg bg-subtle"
						/>
					))}
				</div>
			) : rows.length === 0 ? (
				<p className="px-4 pb-6 text-ink-muted text-sm">{tDash("noOrders")}</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[640px] border-collapse text-left text-sm">
						<thead className="bg-canvas text-ink-muted text-xs uppercase tracking-[0.4px]">
							<tr className="border-line border-y">
								<th scope="col" className="px-4 py-2.5 font-semibold">
									{tList("columnOrder")}
								</th>
								<th scope="col" className="px-4 py-2.5 font-semibold">
									{tList("columnCustomer")}
								</th>
								<th scope="col" className="px-4 py-2.5 font-semibold">
									{tDash("columnItem")}
								</th>
								<th
									scope="col"
									className="px-4 py-2.5 text-right font-semibold"
								>
									{tList("columnTotal")}
								</th>
								<th scope="col" className="px-4 py-2.5 font-semibold">
									{tList("columnPayment")}
								</th>
								<th scope="col" className="px-4 py-2.5 font-semibold">
									{tList("columnStatus")}
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const note = resaleNote(row);
								return (
									<tr
										key={row.id}
										className="border-subtle border-b text-ink-soft last:border-b-0 hover:bg-canvas"
									>
										<td className="px-4 py-3">
											<Link
												href={`/seller/orders/${encodeURIComponent(row.id)}`}
												className="font-semibold text-ink hover:text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
											>
												{row.orderNumber}
											</Link>
										</td>
										<td className="px-4 py-3">{row.recipientName ?? "—"}</td>
										<td className="px-4 py-3">
											{row.firstItemTitle}
											{note && (
												<span className="text-ink-muted">
													{" · "}
													{resaleText(note)}
												</span>
											)}
										</td>
										<td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
											{formatOrderMoney(row.total)}
										</td>
										<td className="px-4 py-3">
											<PaymentPill row={row} />
										</td>
										<td className="px-4 py-3">
											<StatusPill status={row.status} />
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

export function WeekStats({ shopId }: { shopId: string }) {
	const tDash = useTranslations("SellerDashboard");
	const formatOrderMoney = useOrderMoney();
	const query = useSellerOrderWeek(shopId);
	const week = query.data;
	if (!week) return null;

	const figures = [
		{ value: week.orders, label: tDash("weekOrders", { count: week.orders }) },
		{
			value: week.delivered,
			label: tDash("weekDelivered", { count: week.delivered }),
		},
		{
			value: week.refused,
			label: tDash("weekRefused", { count: week.refused }),
			warn: week.refused > 0,
		},
	];

	return (
		<section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
			<h2 className="font-bold text-[15px] text-ink">{tDash("weekTitle")}</h2>
			<div className="grid grid-cols-3">
				{figures.map(({ value, label, warn }, index) => (
					<div
						key={label}
						className={
							index > 0
								? "flex flex-col border-line border-l pl-3"
								: "flex flex-col"
						}
					>
						<span
							className={`font-bold text-[22px] ${warn ? "text-warn-ink-soft" : "text-ink"}`}
						>
							{value}
						</span>
						<span className="text-ink-muted text-xs">{label}</span>
					</div>
				))}
			</div>
			<div className="flex justify-between gap-3 border-subtle border-t pt-3 text-sm">
				<span className="text-ink-muted">{tDash("weekSales")}</span>
				<strong className="tabular-nums">
					{formatOrderMoney(week.deliveredSales)}
				</strong>
			</div>
			{week.commission && (
				<div className="flex justify-between gap-3 text-sm">
					<span className="text-ink-muted">
						{week.commission.rateBps !== null
							? tDash("weekCommissionRate", {
									rate: week.commission.rateBps / 100,
								})
							: tDash("weekCommission")}
					</span>
					<strong className="tabular-nums">
						{formatOrderMoney(week.commission.amount)}
					</strong>
				</div>
			)}
		</section>
	);
}
