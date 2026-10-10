"use client";

import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { WorkspaceBreadcrumb } from "~/components/seller/workspace-breadcrumb";
import { useSellerPayout } from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import { PAYOUT_STATUSES } from "~/lib/payment-status";
import { useLocaleKey } from "~/lib/use-locale-key";

function isPayoutStatus(value: string): value is keyof typeof PAYOUT_STATUSES {
	return Object.hasOwn(PAYOUT_STATUSES, value);
}

export function PayoutDetailClient({
	shopId,
	payoutId,
}: {
	shopId: string;
	payoutId: string;
}) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const payout = useSellerPayout(shopId, payoutId);

	if (payout.isPending) return <LoadingRows rows={4} />;
	if (payout.isError) {
		return (
			<LoadError
				title={`${t("payout_title")} — ${resolveErrorMessage(payout.error, tRoot)}`}
				onRetry={() => void payout.refetch()}
			/>
		);
	}

	const view = payout.data;

	return (
		<div className="space-y-6">
			<WorkspaceBreadcrumb
				section="payments"
				href="/seller/payments"
				reference={view.id}
			/>
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("payout_title")}</h1>

			<section className="grid grid-cols-2 gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:grid-cols-4">
				<div>
					<p className="text-[#64748B] text-xs">{t("seller_colDate")}</p>
					<p className="font-semibold text-[#0F172A]">
						{formatOrderDate(view.date, locale)}
					</p>
				</div>
				<div>
					<p className="text-[#64748B] text-xs">{t("seller_colAmount")}</p>
					<p className="font-semibold text-[#0F172A]">
						{formatXaf(view.amount, locale)}
					</p>
				</div>
				<div>
					<p className="text-[#64748B] text-xs">{t("seller_colFee")}</p>
					<p className="font-semibold text-[#0F172A]">
						{formatXaf(view.fee, locale)}
					</p>
				</div>
				<div>
					<p className="text-[#64748B] text-xs">{t("seller_colDestination")}</p>
					<p className="font-semibold text-[#0F172A]">
						{view.destinationMasked}
					</p>
				</div>
				<div>
					<p className="text-[#64748B] text-xs">{t("seller_colStatus")}</p>
					<p className="font-semibold text-[#0F172A]">
						{t(PAYOUT_STATUSES[view.status])}
					</p>
				</div>
			</section>

			<section aria-labelledby="payout-orders-title" className="space-y-3">
				<h2 id="payout-orders-title" className="font-semibold text-[#0F172A]">
					{t("payout_orders")}
				</h2>
				<ul className="divide-y divide-[#E2E8F0] rounded-2xl border border-[#E2E8F0] bg-white">
					{view.orders.map((order) => (
						<li
							key={order.orderId}
							className="flex items-center justify-between gap-3 p-4 text-sm"
						>
							<span className="font-medium text-[#0F172A]">
								{order.orderNumber}
							</span>
							<span className="text-[#334155]">
								{formatXaf(order.amount, locale)}
							</span>
						</li>
					))}
				</ul>
			</section>

			<section aria-labelledby="payout-history-title" className="space-y-3">
				<h2 id="payout-history-title" className="font-semibold text-[#0F172A]">
					{t("payout_history")}
				</h2>
				<ol className="space-y-2">
					{view.statusHistory.map((entry, index) => (
						<li
							key={`${entry.status}-${entry.at}-${index}`}
							className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm"
						>
							<span className="text-[#334155]">
								{isPayoutStatus(entry.status)
									? t(PAYOUT_STATUSES[entry.status])
									: entry.status}
							</span>
							<span className="text-[#64748B] text-xs">
								{formatOrderDate(entry.at, locale)}
							</span>
						</li>
					))}
				</ol>
			</section>
		</div>
	);
}
