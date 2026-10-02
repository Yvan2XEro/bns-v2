"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useMyShop } from "~/hooks/use-my-shop";
import { useSellerOrder } from "~/hooks/use-seller-orders";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import { statusLabelKey } from "~/lib/order-status";
import { ActionBar } from "./action-bar";
import { BuyerBlock } from "./buyer-block";
import { OrderSummary } from "./order-summary";
import { OrderTimeline } from "./order-timeline";

export function OrderClient({
	shopId,
	orderId,
}: {
	shopId: string;
	orderId: string;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const mine = useMyShop();
	const query = useSellerOrder(shopId, orderId);

	const back = (
		<Link
			href="/seller/orders"
			className="inline-flex min-h-11 items-center gap-2 font-medium text-[#1E40AF] text-sm hover:underline"
		>
			<ArrowLeft aria-hidden="true" className="h-4 w-4" />
			{t("back")}
		</Link>
	);

	if (query.isPending) {
		return (
			<div className="space-y-4">
				{back}
				<LoadingRows rows={4} />
			</div>
		);
	}
	if (query.isError) {
		return (
			<div className="space-y-4">
				{back}
				<LoadError
					title={resolveErrorMessage(query.error, tRoot, t("orderLoadError"))}
					onRetry={() => void query.refetch()}
				/>
			</div>
		);
	}

	const order = query.data;

	return (
		<div className="space-y-5">
			{back}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">
						{t("orderTitle", { number: order.orderNumber })}
					</h1>
					<p className="text-[#64748B] text-sm">
						{t("placedOn", {
							date: formatOrderDate(order.timestamps.placedAt, locale),
						})}
					</p>
				</div>
				<span className="rounded-full bg-[#EFF6FF] px-3 py-1 font-semibold text-[#1E40AF] text-sm">
					{tRoot(`OrderStatus.${statusLabelKey(order.status, "seller")}`)}
				</span>
			</div>

			<div className="grid gap-5 lg:grid-cols-[1fr_320px]">
				<div className="space-y-5">
					<BuyerBlock order={order} />
					<OrderSummary order={order} />
					<OrderTimeline timeline={order.timeline} />
				</div>
				<ActionBar
					order={order}
					shopId={shopId}
					role={mine.data?.role ?? null}
					roleLoading={mine.loading}
					onHandoverFailed={() => void query.refetch()}
				/>
			</div>
		</div>
	);
}
