"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useShopInsights } from "~/hooks/use-shop-insights";
import { downloadCsv } from "~/lib/csv";
import { insightsCsv } from "~/lib/insights-view";
import type {
	InsightsPeriod,
	ShopInsightsView,
} from "../../../../../../api/src/types/shopInsights";
import {
	DormantStockCard,
	FunnelCard,
	ThresholdMeters,
	TopProductsCard,
	WeeklySalesCard,
} from "./insights-sections";

const PERIODS: readonly InsightsPeriod[] = ["7d", "30d", "90d"];

export function responseLabel(
	tInsights: ReturnType<typeof useTranslations<"SellerInsights">>,
	bucket: ShopInsightsView["responseTime"]["medianBucket"],
) {
	if (!bucket) return tInsights("noResponseData");
	return tInsights(`responseBucket.${bucket}`);
}

export function InsightActionText({
	action,
}: {
	action: ShopInsightsView["actions"][number];
}) {
	const tInsights = useTranslations("SellerInsights");
	switch (action.type) {
		case "awaiting_reply":
			return tInsights("action.awaiting_reply", { count: action.count ?? 0 });
		case "out_of_stock_views":
			return tInsights("action.out_of_stock_views", {
				count: action.count ?? 0,
			});
		case "restock":
			return tInsights("action.restock");
		case "cod_refusal_rate":
			return tInsights("action.cod_refusal_rate");
		case "seller_cancellation_rate":
			return tInsights("action.seller_cancellation_rate");
		case "low_conversion":
			return tInsights("action.low_conversion");
		case "slow_response":
			return tInsights("action.slow_response");
	}
}

/**
 * Only the figures a seller can act on: weekly delivered sales, the funnel,
 * the four operating thresholds, best products and stock that is not
 * selling. Actions the meters do not carry (stock running out, out-of-stock
 * products still viewed) keep their own card below.
 */
export function SellerInsightsClient({
	shopId,
	initialPeriod,
}: {
	shopId: string;
	initialPeriod: InsightsPeriod;
}) {
	const tInsights = useTranslations("SellerInsights");
	const tPage = useTranslations("InsightsPage");
	const [period, setPeriod] = useState(initialPeriod);
	const query = useShopInsights(shopId, period);
	const view = query.data;

	const exportCsv = () => {
		if (!view) return;
		downloadCsv(
			`${tPage("exportFilename")}-${view.from}-${view.to}.csv`,
			insightsCsv(view, {
				weekly: tPage("csv.weekly"),
				product: tPage("csv.product"),
				dormant: tPage("csv.dormant"),
				header: [
					tPage("csv.kind"),
					tPage("csv.label"),
					tPage("csv.units"),
					tPage("csv.amount"),
					tPage("csv.views"),
					tPage("csv.stock"),
				],
			}),
		);
	};

	return (
		<div className="space-y-[18px] pb-10">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-bold text-2xl text-ink">{tInsights("title")}</h1>
					<p className="mt-1 text-ink-muted text-sm">{tPage("subtitle")}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<fieldset className="inline-flex rounded-xl border border-line bg-surface p-1">
						<legend className="sr-only">{tPage("periodLabel")}</legend>
						{PERIODS.map((item) => (
							<button
								aria-pressed={period === item}
								className={`rounded-lg px-3 py-1.5 font-semibold text-sm ${period === item ? "bg-[var(--shop-accent,var(--c-brand))] text-[var(--shop-on-accent,#FFFFFF)]" : "text-ink-mid hover:bg-subtle"}`}
								key={item}
								onClick={() => setPeriod(item)}
								type="button"
							>
								{tInsights(`period.${item}`)}
							</button>
						))}
					</fieldset>
					<button
						type="button"
						onClick={exportCsv}
						disabled={!view}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:border-[var(--shop-accent-border,var(--c-brand-line))] disabled:opacity-60"
					>
						<Download aria-hidden="true" className="h-4 w-4" />
						{tPage("export")}
					</button>
				</div>
			</header>

			{query.isLoading ? (
				<div
					aria-live="polite"
					className="rounded-2xl border bg-surface p-8 text-ink-muted"
				>
					{tInsights("loading")}
				</div>
			) : query.isError || !view ? (
				<div
					className="rounded-2xl border border-red-200 bg-red-50 p-6"
					role="alert"
				>
					<p className="font-semibold text-red-900">{tInsights("error")}</p>
					<button
						className="mt-3 rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-4 py-2 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm"
						onClick={() => void query.refetch()}
						type="button"
					>
						{tInsights("retry")}
					</button>
				</div>
			) : (
				<>
					<div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
						<WeeklySalesCard view={view} />
						<FunnelCard view={view} />
					</div>
					<ThresholdMeters view={view} />
					<div className="grid items-start gap-[18px] xl:grid-cols-2">
						<TopProductsCard view={view} />
						<DormantStockCard view={view} />
					</div>
					<StockWatch view={view} />
				</>
			)}
		</div>
	);
}

function StockWatch({ view }: { view: ShopInsightsView }) {
	const tInsights = useTranslations("SellerInsights");
	const number = new Intl.NumberFormat();
	if (
		view.stock.restock.length === 0 &&
		view.stock.outOfStockWithViews.length === 0
	) {
		return null;
	}
	return (
		<section className="grid gap-[18px] rounded-2xl border border-line bg-surface p-[18px] lg:grid-cols-2">
			<div>
				<h2 className="font-bold text-base text-ink">{tInsights("restock")}</h2>
				{view.stock.restock.length ? (
					<ul className="mt-2 space-y-2">
						{view.stock.restock.map((item) => (
							<li
								className="flex justify-between gap-3 text-sm"
								key={item.variantId}
							>
								<Link
									className="text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
									href={`/seller/catalogue/${encodeURIComponent(item.productId)}`}
								>
									{item.productTitle}
								</Link>
								<span className="shrink-0 text-ink-muted">
									{tInsights("daysOfCover", { days: item.daysOfCover })}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="mt-2 text-ink-muted text-sm">
						{tInsights("noRestock")}
					</p>
				)}
			</div>
			<div>
				<h2 className="font-bold text-base text-ink">
					{tInsights("outOfStock")}
				</h2>
				{view.stock.outOfStockWithViews.length ? (
					<ul className="mt-2 space-y-2">
						{view.stock.outOfStockWithViews.map((item) => (
							<li
								className="flex justify-between gap-3 text-sm"
								key={item.variantId}
							>
								<Link
									className="text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
									href={`/seller/catalogue/${encodeURIComponent(item.productId)}`}
								>
									{item.productTitle}
								</Link>
								<span className="text-ink-muted">
									{number.format(item.views)}{" "}
									{tInsights("chartViews").toLowerCase()}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="mt-2 text-ink-muted text-sm">
						{tInsights("noOutOfStock")}
					</p>
				)}
			</div>
		</section>
	);
}
