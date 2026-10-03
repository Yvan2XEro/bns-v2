"use client";

import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useSellerPayments } from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";
import { AmountStrip } from "./amount-strip";
import { HoldList } from "./hold-list";
import { OrderBreakdown } from "./order-breakdown";
import { PayoutsTable } from "./payouts-table";

export function PaymentsClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const payments = useSellerPayments(shopId);

	if (payments.isPending) return <LoadingRows rows={4} />;
	if (payments.isError) {
		return (
			<LoadError
				title={`${t("seller_title")} — ${resolveErrorMessage(payments.error, tRoot)}`}
				onRetry={() => void payments.refetch()}
			/>
		);
	}

	const view = payments.data;

	return (
		<div className="space-y-6">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("seller_title")}</h1>
			<AmountStrip amounts={view.amounts} />
			<HoldList holds={view.holds} />
			<PayoutsTable payouts={view.payouts} />
			<OrderBreakdown orders={view.orders} />
		</div>
	);
}
