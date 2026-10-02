"use client";

import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useBilling } from "~/hooks/use-billing";
import { resolveErrorMessage } from "~/lib/apiError";
import { CurrentPeriodCard } from "./current-period-card";
import { InvoiceList } from "./invoice-list";
import { isPayable } from "./invoice-status";
import { RestrictionBanner } from "./restriction-banner";

export function BillingClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Billing");
	const tRoot = useTranslations();
	const billing = useBilling(shopId);

	if (billing.isPending) return <LoadingRows rows={4} />;
	if (billing.isError) {
		return (
			<LoadError
				title={`${t("loadError")} — ${resolveErrorMessage(billing.error, tRoot)}`}
				onRetry={() => void billing.refetch()}
			/>
		);
	}

	const view = billing.data;
	const hasPayable = view.invoices.some((invoice) => isPayable(invoice.status));

	return (
		<div className="space-y-5">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
			{view.restricted && <RestrictionBanner restricted={view.restricted} />}
			<CurrentPeriodCard period={view.currentPeriod} />
			<section aria-labelledby="invoices-title" className="space-y-3">
				<h2 id="invoices-title" className="font-semibold text-[#0F172A]">
					{t("invoicesTitle")}
				</h2>
				{hasPayable && <p className="text-[#64748B] text-xs">{t("payHint")}</p>}
				<InvoiceList shopId={shopId} invoices={view.invoices} />
			</section>
		</div>
	);
}
