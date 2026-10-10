"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useShopInsights } from "~/hooks/use-shop-insights";
import { formatXaf } from "~/lib/order-money";
import type { ShopRole } from "~/types/shop";
import { InsightActionText, responseLabel } from "./seller-insights-client";

export function SellerInsightsPreview({
	shopId,
	role,
}: {
	shopId: string;
	role: ShopRole;
}) {
	const config = useAppConfig();
	const allowed =
		config.insightsEnabled && (role === "owner" || role === "manager");
	const query = useShopInsights(allowed ? shopId : null, "7d");
	const t = useTranslations("SellerInsights");
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	if (!allowed || !query.data) return null;
	const view = query.data;
	return (
		<section className="rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#EFF6FF] to-white p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-bold text-[#0F172A]">{t("title")}</p>
					<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<p>
							<span className="text-[#64748B]">{t("gmvDelivered")}</span>
							<br />
							<strong className="text-[#0F172A]">
								{formatXaf(view.totals.current.gmvDelivered, locale)}
							</strong>
						</p>
						<p>
							<span className="text-[#64748B]">{t("ordersDelivered")}</span>
							<br />
							<strong className="text-[#0F172A]">
								{view.totals.current.ordersDelivered}
							</strong>
						</p>
						<p>
							<span className="text-[#64748B]">{t("responseTime")}</span>
							<br />
							<strong className="text-[#0F172A]">
								{responseLabel(t, view.responseTime.medianBucket)}
							</strong>
						</p>
						<p>
							<span className="text-[#64748B]">{t("conversion")}</span>
							<br />
							<strong className="text-[#0F172A]">
								{rateLabel(view.funnel.conversion, t)}
							</strong>
						</p>
					</div>
				</div>
				<Link
					className="rounded-lg bg-[#1E40AF] px-4 py-2 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					href="/seller/insights"
				>
					{t("open")}
				</Link>
			</div>
			{view.actions.length ? (
				<ul className="mt-4 grid gap-2 sm:grid-cols-2">
					{view.actions.slice(0, 2).map((action, index) => (
						<li key={`${action.type}-${index}`}>
							<Link
								className="block rounded-lg border border-[#E2E8F0] bg-white/80 p-3 text-[#334155] text-sm hover:border-[#93C5FD]"
								href={action.href}
							>
								<InsightActionText action={action} />
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}

function rateLabel(
	value: number | null,
	t: ReturnType<typeof useTranslations<"SellerInsights">>,
) {
	return value === null ? t("unavailableRate") : `${Math.round(value * 100)}%`;
}
