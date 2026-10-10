"use client";

import { useTranslations } from "next-intl";
import { formatXaf } from "~/lib/order-money";
import {
	type AmountStripKey,
	amountStripRows,
} from "~/lib/seller-payments-view";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { SellerPaymentAmounts } from "~/types/payments";

const LABEL_KEYS: Record<AmountStripKey, string> = {
	awaitingDelivery: "seller_awaitingDelivery",
	inWithdrawalPeriod: "seller_withdrawalPeriod",
	readyForPayout: "seller_readyForPayout",
	payoutInTransit: "seller_payoutInProgress",
	paidThisMonth: "seller_paidThisMonth",
};

/**
 * The spec's five-tile amounts strip, read verbatim off the ledger. A null
 * `readyForPayout` (`provider_schedule`) renders the provider's own-schedule
 * sentence, never a silent "0 FCFA ready".
 */
export function AmountStrip({ amounts }: { amounts: SellerPaymentAmounts }) {
	const t = useTranslations("Payments");
	const locale = useLocaleKey();
	const rows = amountStripRows(amounts);

	return (
		<section aria-labelledby="amounts-title" className="space-y-3">
			<h2 id="amounts-title" className="font-semibold text-[#0F172A]">
				{t("seller_amountsTitle")}
			</h2>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{rows.map((row) => (
					<div
						key={row.key}
						className="rounded-2xl border border-[#E2E8F0] bg-white p-4"
					>
						<p className="text-[#64748B] text-xs">{t(LABEL_KEYS[row.key])}</p>
						{row.amount === null ? (
							<p className="mt-1 font-medium text-[#334155] text-sm">
								{t("seller_providerSchedule")}
							</p>
						) : (
							<p className="mt-1 font-bold text-[#0F172A] text-lg">
								{formatXaf(row.amount, locale)}
							</p>
						)}
					</div>
				))}
			</div>
			<p className="text-[#64748B] text-xs">{t("disclosure_sellerLegend")}</p>
		</section>
	);
}
