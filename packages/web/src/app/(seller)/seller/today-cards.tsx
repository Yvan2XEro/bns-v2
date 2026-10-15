"use client";

import { PackageCheck, ReceiptText, Truck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useSellerOrders } from "~/hooks/use-seller-orders";
import { OrdersTable } from "./orders/orders-table";

/**
 * What needs the seller today, as the design's dashboard opens: orders to
 * accept and to ship (the counts the orders route already returns with its
 * rows), stock alerts, and the orders still waiting for an answer.
 */
export function SellerTodayCards({
	shopId,
	lowStock,
}: {
	shopId: string;
	lowStock: number;
}) {
	const t = useTranslations("Seller");
	const { ordersEnabled } = useAppConfig();
	const query = useSellerOrders(ordersEnabled ? shopId : null, {
		tab: "to_accept",
	});
	const page = query.data?.pages[0];
	if (!ordersEnabled || !page) return null;

	const cards = [
		{
			icon: ReceiptText,
			tone: "bg-[#FEF3C7] text-[#B45309]",
			value: page.counts.to_accept,
			label: t("today.toAccept", { count: page.counts.to_accept }),
			action: t("today.process"),
			href: "/seller/orders?tab=to_accept",
		},
		{
			icon: Truck,
			tone: "bg-[#DBEAFE] text-[#1E40AF]",
			value: page.counts.to_ship,
			label: t("today.toShip"),
			action: t("today.prepare"),
			href: "/seller/orders?tab=to_ship",
		},
		{
			icon: PackageCheck,
			tone: "bg-[#FEE2E2] text-[#B91C1C]",
			value: lowStock,
			label: t("today.lowStock", { count: lowStock }),
			action: t("today.restock"),
			href: "/seller/catalogue?stock=low",
		},
	];
	const waiting = page.docs.slice(0, 5);

	return (
		<section aria-label={t("today.title")} className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-3">
				{cards.map(({ icon: Icon, tone, value, label, action, href }) => (
					<div
						key={href}
						className="rounded-xl border border-[#E2E8F0] bg-white p-4"
					>
						<span
							className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}
						>
							<Icon aria-hidden="true" className="h-4 w-4" />
						</span>
						<p className="mt-3 text-[#0F172A] text-sm">
							<span className="mr-1.5 font-extrabold text-2xl">{value}</span>
							{label}
						</p>
						<Link
							href={href}
							className="mt-2 inline-block font-semibold text-[#1E40AF] text-sm hover:underline"
						>
							{action}
						</Link>
					</div>
				))}
			</div>
			{waiting.length > 0 && (
				<div className="rounded-xl border border-[#E2E8F0] bg-white">
					<div className="flex items-center justify-between px-4 py-3">
						<h2 className="font-bold text-[#0F172A]">
							{t("today.waitingTitle")}
						</h2>
						<Link
							href="/seller/orders"
							className="font-semibold text-[#1E40AF] text-sm hover:underline"
						>
							{t("today.allOrders")}
						</Link>
					</div>
					<OrdersTable rows={waiting} tab="to_accept" />
				</div>
			)}
		</section>
	);
}
