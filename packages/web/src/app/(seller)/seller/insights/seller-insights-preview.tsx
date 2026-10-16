"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import { useShopInsights } from "~/hooks/use-shop-insights";
import type { ShopRole } from "~/types/shop";
import { InsightActionText, responseLabel } from "./seller-insights-client";

export function SellerInsightsPreview({
	shopId,
	role,
}: {
	shopId: string;
	role: ShopRole;
}) {
	const formatOrderMoney = useOrderMoney();
	const config = useAppConfig();
	const allowed =
		config.insightsEnabled && (role === "owner" || role === "manager");
	const query = useShopInsights(allowed ? shopId : null, "7d");
	const t = useTranslations("SellerInsights");
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	if (!allowed || !query.data) return null;
	const view = query.data;
	return (
		<section className="rounded-2xl border border-[var(--shop-accent-border,var(--c-brand-tint-strong))] bg-gradient-to-br from-[var(--shop-accent-soft,var(--c-brand-soft))] to-surface p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-bold text-ink">{t("title")}</p>
					<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
						<p>
							<span className="text-ink-muted">{t("gmvDelivered")}</span>
							<br />
							<strong className="text-ink">
								{formatOrderMoney(view.totals.current.gmvDelivered, locale)}
							</strong>
						</p>
						<p>
							<span className="text-ink-muted">{t("ordersDelivered")}</span>
							<br />
							<strong className="text-ink">
								{view.totals.current.ordersDelivered}
							</strong>
						</p>
						<p>
							<span className="text-ink-muted">{t("responseTime")}</span>
							<br />
							<strong className="text-ink">
								{responseLabel(t, view.responseTime.medianBucket)}
							</strong>
						</p>
						<p>
							<span className="text-ink-muted">{t("conversion")}</span>
							<br />
							<strong className="text-ink">
								{rateLabel(view.funnel.conversion, t)}
							</strong>
						</p>
					</div>
				</div>
				<Link
					className="rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-4 py-2 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
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
								className="block rounded-lg border border-line bg-surface/80 p-3 text-ink-soft text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))]"
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
