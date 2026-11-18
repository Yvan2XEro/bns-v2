"use client";

import { useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import { formatOrderDate } from "~/lib/order-money";
import { useLocaleKey } from "~/lib/use-locale-key";
import type { BillingView } from "~/types/order";

export function CurrentPeriodCard({
	period,
}: {
	period: BillingView["currentPeriod"];
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	return (
		<section
			aria-labelledby="current-period-title"
			className="rounded-2xl border border-line bg-surface p-5"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="current-period-title" className="font-semibold text-ink">
					{t("currentPeriod")}
				</h2>
				<p className="text-ink-muted text-xs">
					{t("periodRange", {
						start: formatOrderDate(period.periodStart, locale),
						end: formatOrderDate(period.periodEnd, locale),
					})}
				</p>
			</div>
			<p className="mt-3 text-ink-muted text-xs">{t("accruedSoFar")}</p>
			<p className="font-bold text-2xl text-ink">
				{formatOrderMoney(period.accrued, locale)}
				<span className="ml-3 font-normal text-ink-soft text-sm">
					{t("ordersCount", { count: period.ordersCount })}
				</span>
			</p>
			<p className="mt-2 text-ink-muted text-xs">{t("currentPeriodHint")}</p>
		</section>
	);
}
