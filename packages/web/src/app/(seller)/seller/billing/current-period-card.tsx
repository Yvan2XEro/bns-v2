"use client";

import { useTranslations } from "next-intl";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
import type { BillingView } from "~/types/order";
import { useLocaleKey } from "./use-locale-key";

export function CurrentPeriodCard({
	period,
}: {
	period: BillingView["currentPeriod"];
}) {
	const t = useTranslations("Billing");
	const locale = useLocaleKey();

	return (
		<section
			aria-labelledby="current-period-title"
			className="rounded-2xl border border-[#E2E8F0] bg-white p-5"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="current-period-title" className="font-semibold text-[#0F172A]">
					{t("currentPeriod")}
				</h2>
				<p className="text-[#64748B] text-xs">
					{t("periodRange", {
						start: formatOrderDate(period.periodStart, locale),
						end: formatOrderDate(period.periodEnd, locale),
					})}
				</p>
			</div>
			<p className="mt-3 text-[#64748B] text-xs">{t("accruedSoFar")}</p>
			<p className="font-bold text-2xl text-[#0F172A]">
				{formatXaf(period.accrued, locale)}
				<span className="ml-3 font-normal text-[#334155] text-sm">
					{t("ordersCount", { count: period.ordersCount })}
				</span>
			</p>
			<p className="mt-2 text-[#64748B] text-xs">{t("currentPeriodHint")}</p>
		</section>
	);
}
