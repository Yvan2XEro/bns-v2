"use client";

import { Package, Truck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAcceptOrder, useShipOrder } from "~/hooks/use-order-actions";
import { useOrderMoney } from "~/hooks/use-order-money";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import { cn } from "~/lib/utils";
import type { ShopRole } from "~/types";
import type { OrderListEntry } from "~/types/order";
import { AcceptCountdown } from "./accept-countdown";
import {
	areaLabel,
	isSelectable,
	itemLines,
	placedWhen,
	type RowAction,
	rowAction,
} from "./order-list";
import { PaymentPill, ResalePill, StatusPill } from "./order-pills";

const ACTION_BUTTON =
	"inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-lg px-3 font-semibold text-[13px] disabled:opacity-50";

function RowActionButton({
	row,
	action,
	shopId,
}: {
	row: OrderListEntry;
	action: RowAction;
	shopId: string;
}) {
	const t = useTranslations("SellerOrderList");
	const tRoot = useTranslations();
	const target = { orderId: row.id, shopId };
	const accept = useAcceptOrder(target);
	const ship = useShipOrder(target);
	const mutation = action === "accept" ? accept : ship;

	function run() {
		mutation.mutate(undefined, {
			onSuccess: () =>
				toast.success(
					t(action === "accept" ? "accepted" : "shipped", {
						number: row.orderNumber,
					}),
				),
			onError: (error) =>
				toast.error(
					resolveErrorMessage(
						error,
						tRoot,
						t("actionFailed", { number: row.orderNumber }),
					),
				),
		});
	}

	return (
		<button
			type="button"
			onClick={run}
			disabled={mutation.isPending}
			className={cn(
				ACTION_BUTTON,
				action === "accept"
					? "bg-[var(--shop-accent,#1E40AF)] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,#1E3A8A)]"
					: "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
			)}
		>
			{action === "ship" && <Truck aria-hidden="true" className="h-4 w-4" />}
			{t(action === "accept" ? "accept" : "ship")}
		</button>
	);
}

function PlacedLabel({ placedAt, now }: { placedAt: string; now: Date }) {
	const t = useTranslations("SellerOrderList");
	const locale = useLocale() === "en" ? "en" : "fr";
	const when = placedWhen(placedAt, now);
	const text =
		when.kind === "minutes"
			? t("placedMinutes", { minutes: when.minutes })
			: when.kind === "today"
				? t("placedToday", {
						time: new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
							hour: "2-digit",
							minute: "2-digit",
						}).format(when.at),
					})
				: formatOrderDate(when.at, locale);
	return <span className="text-[#94A3B8] text-xs">{text}</span>;
}

function ItemLinesText({ row }: { row: OrderListEntry }) {
	const t = useTranslations("SellerOrderList");
	const summary = itemLines(row);
	if (!summary) {
		return (
			<span>
				{t("itemLine", { title: row.firstItemTitle, count: row.itemCount })}
			</span>
		);
	}
	return (
		<span className="flex flex-col">
			{summary.lines.map((line, index) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: two lines can share a title
					key={index}
					className="max-w-[260px] truncate"
				>
					{t("lineQuantity", { title: line.title, quantity: line.quantity })}
				</span>
			))}
			{summary.more > 0 && (
				<span className="text-[#64748B] text-xs">
					{t("moreLines", { count: summary.more })}
				</span>
			)}
		</span>
	);
}

/**
 * The seller's order queue. A row's quick action posts to the same order
 * route the order page's action bar does, through the same hooks; which
 * action shows is `rowAction`, read off the same action table.
 */
export function OrdersTable({
	rows,
	shopId,
	role,
	now,
	selected,
	onToggle,
	onToggleAll,
}: {
	rows: OrderListEntry[];
	shopId: string;
	role: ShopRole | null;
	now: Date;
	selected: ReadonlySet<string>;
	onToggle: (id: string) => void;
	onToggleAll: (ids: string[], select: boolean) => void;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("SellerOrderList");
	const locale = useLocale() === "en" ? "en" : "fr";
	const selectable = rows
		.filter((row) => isSelectable(row, role, now))
		.map((row) => row.id);
	const allSelected =
		selectable.length > 0 && selectable.every((id) => selected.has(id));

	return (
		<div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
			<table className="w-full min-w-[900px] border-collapse text-left text-sm">
				<thead className="bg-[#F8FAFC] text-[#64748B] text-xs uppercase tracking-[0.4px]">
					<tr className="border-[#E2E8F0] border-b">
						<th scope="col" className="w-9 px-4 py-2.5">
							<input
								type="checkbox"
								aria-label={t("selectAll")}
								disabled={selectable.length === 0}
								checked={allSelected}
								onChange={() => onToggleAll(selectable, !allSelected)}
								className="h-4 w-4 accent-[var(--shop-accent,#1E40AF)]"
							/>
						</th>
						<th scope="col" className="px-4 py-2.5 font-semibold">
							{t("columnOrder")}
						</th>
						<th scope="col" className="px-4 py-2.5 font-semibold">
							{t("columnCustomer")}
						</th>
						<th scope="col" className="px-4 py-2.5 font-semibold">
							{t("columnItems")}
						</th>
						<th scope="col" className="px-4 py-2.5 font-semibold">
							{t("columnTotal")}
						</th>
						<th scope="col" className="px-4 py-2.5 font-semibold">
							{t("columnPayment")}
						</th>
						<th scope="col" className="px-4 py-2.5 font-semibold">
							{t("columnStatus")}
						</th>
						<th scope="col" className="px-4 py-2.5">
							<span className="sr-only">{t("columnAction")}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const action = rowAction(row, role, now);
						const isSelected = selected.has(row.id);
						const area = areaLabel(row.area);
						const href = `/seller/orders/${encodeURIComponent(row.id)}`;
						return (
							<tr
								key={row.id}
								className={cn(
									"border-[#F1F5F9] border-b text-[#334155] last:border-b-0",
									isSelected ? "bg-[#F8FBFF]" : "hover:bg-[#F8FAFC]",
								)}
							>
								<td className="w-9 px-4 py-3">
									{isSelectable(row, role, now) && (
										<input
											type="checkbox"
											aria-label={t("selectOrder", { number: row.orderNumber })}
											checked={isSelected}
											onChange={() => onToggle(row.id)}
											className="h-4 w-4 accent-[var(--shop-accent,#1E40AF)]"
										/>
									)}
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-col">
										<Link
											href={href}
											className="font-semibold text-[#0F172A] hover:text-[var(--shop-accent-text,#1E40AF)] hover:underline"
										>
											{row.orderNumber}
										</Link>
										<PlacedLabel placedAt={row.placedAt} now={now} />
									</div>
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-col">
										<span className="font-medium text-[#0F172A]">
											{row.recipientName ?? "—"}
										</span>
										{area && (
											<span className="text-[#64748B] text-xs">{area}</span>
										)}
									</div>
								</td>
								<td className="px-4 py-3">
									<div className="flex items-center gap-2.5">
										<span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F1F5F9] text-[#475569]">
											{row.firstItemImageUrl ? (
												// biome-ignore lint/performance/noImgElement: order snapshots point at arbitrary storage hosts
												<img
													src={row.firstItemImageUrl}
													alt=""
													className="h-full w-full object-cover"
												/>
											) : (
												<Package aria-hidden="true" className="h-4 w-4" />
											)}
										</span>
										<div className="flex min-w-0 flex-col gap-0.5">
											<ItemLinesText row={row} />
											<ResalePill row={row} />
										</div>
									</div>
								</td>
								<td className="whitespace-nowrap px-4 py-3 font-bold text-[#0F172A] tabular-nums">
									{formatOrderMoney(row.total, locale)}
								</td>
								<td className="px-4 py-3">
									<PaymentPill row={row} />
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-col items-start gap-1">
										<StatusPill status={row.status} />
										{action === "accept" && (
											<span className="text-xs">
												<AcceptCountdown acceptBy={row.acceptBy ?? null} />
											</span>
										)}
									</div>
								</td>
								<td className="px-4 py-3 text-right">
									{action ? (
										<RowActionButton
											row={row}
											action={action}
											shopId={shopId}
										/>
									) : row.status === "shipped" ? (
										<Link
											href={href}
											className={cn(
												ACTION_BUTTON,
												"border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
											)}
										>
											{t("track")}
										</Link>
									) : row.status === "placed" || row.hasShipment ? (
										<Link
											href={href}
											className={cn(
												ACTION_BUTTON,
												"border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
											)}
										>
											{t("open")}
										</Link>
									) : null}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
