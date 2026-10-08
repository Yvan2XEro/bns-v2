"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useShopInsights } from "~/hooks/use-shop-insights";
import { formatXaf } from "~/lib/order-money";
import type {
	InsightsPeriod,
	ShopInsightsView,
} from "../../../../../api/src/types/shopInsights";
import { DailyInsightChart } from "./daily-insight-chart";

const PERIODS: readonly InsightsPeriod[] = ["7d", "30d", "90d"];

export function responseLabel(
	t: ReturnType<typeof useTranslations<"SellerInsights">>,
	bucket: ShopInsightsView["responseTime"]["medianBucket"],
) {
	if (!bucket) return t("noResponseData");
	return t(`responseBucket.${bucket}`);
}

export function InsightActionText({
	action,
}: {
	action: ShopInsightsView["actions"][number];
}) {
	const t = useTranslations("SellerInsights");
	switch (action.type) {
		case "awaiting_reply":
			return t("action.awaiting_reply", { count: action.count ?? 0 });
		case "out_of_stock_views":
			return t("action.out_of_stock_views", { count: action.count ?? 0 });
		case "restock":
			return t("action.restock");
		case "cod_refusal_rate":
			return t("action.cod_refusal_rate");
		case "seller_cancellation_rate":
			return t("action.seller_cancellation_rate");
		case "low_conversion":
			return t("action.low_conversion");
		case "slow_response":
			return t("action.slow_response");
	}
}

function rateLabel(
	value: number | null,
	t: ReturnType<typeof useTranslations<"SellerInsights">>,
) {
	return value === null ? t("unavailableRate") : `${Math.round(value * 100)}%`;
}

export function SellerInsightsClient({
	shopId,
	initialPeriod,
}: {
	shopId: string;
	initialPeriod: InsightsPeriod;
}) {
	const t = useTranslations("SellerInsights");
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const [period, setPeriod] = useState(initialPeriod);
	const query = useShopInsights(shopId, period);
	const view = query.data;
	const number = new Intl.NumberFormat(locale);
	const cards = view
		? [
				{
					key: "gmvDelivered",
					label: t("gmvDelivered"),
					value: formatXaf(view.totals.current.gmvDelivered, locale),
					delta: view.totals.delta.gmvDelivered,
				},
				{
					key: "ordersDelivered",
					label: t("ordersDelivered"),
					value: number.format(view.totals.current.ordersDelivered),
					delta: view.totals.delta.ordersDelivered,
				},
				{
					key: "conversationsStarted",
					label: t("conversationsStarted"),
					value: number.format(view.totals.current.conversationsStarted),
					delta: view.totals.delta.conversationsStarted,
				},
				{
					key: "unitsDelivered",
					label: t("unitsDelivered"),
					value: number.format(view.totals.current.unitsDelivered),
					delta: view.totals.delta.unitsDelivered,
				},
			]
		: [];

	return (
		<div className="space-y-6 pb-10">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
					<p className="mt-1 text-[#64748B] text-sm">{t("description")}</p>
				</div>
				<fieldset className="inline-flex rounded-xl border border-[#E2E8F0] bg-white p-1">
					<legend className="sr-only">{t("period.7d")}</legend>
					{PERIODS.map((item) => (
						<button
							aria-pressed={period === item}
							className={`rounded-lg px-3 py-2 font-semibold text-sm ${period === item ? "bg-[#1E40AF] text-white" : "text-[#475569] hover:bg-[#F1F5F9]"}`}
							key={item}
							onClick={() => setPeriod(item)}
							type="button"
						>
							{t(`period.${item}`)}
						</button>
					))}
				</fieldset>
			</header>

			{query.isLoading ? (
				<div
					aria-live="polite"
					className="rounded-2xl border bg-white p-8 text-[#64748B]"
				>
					{t("loading")}
				</div>
			) : query.isError || !view ? (
				<div
					className="rounded-2xl border border-red-200 bg-red-50 p-6"
					role="alert"
				>
					<p className="font-semibold text-red-900">{t("error")}</p>
					<button
						className="mt-3 rounded-lg bg-[#1E40AF] px-4 py-2 font-semibold text-sm text-white"
						onClick={() => void query.refetch()}
						type="button"
					>
						{t("retry")}
					</button>
				</div>
			) : (
				<>
					<section
						aria-label={t("totals")}
						className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
					>
						{cards.map((card) => (
							<article
								className="rounded-2xl border border-[#E2E8F0] bg-white p-5"
								key={card.key}
							>
								<p className="text-[#64748B] text-sm">{card.label}</p>
								<p className="mt-2 font-bold text-2xl text-[#0F172A]">
									{card.value}
								</p>
								<p
									className={`mt-2 text-xs ${card.delta >= 0 ? "text-emerald-700" : "text-amber-700"}`}
								>
									{t("delta", {
										value: `${card.delta > 0 ? "+" : ""}${number.format(card.delta)}`,
									})}
								</p>
							</article>
						))}
					</section>

					<section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
						<article className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
							<h2 className="font-bold text-[#0F172A] text-lg">{t("daily")}</h2>
							<div className="mt-5">
								<DailyInsightChart daily={view.daily} />
							</div>
						</article>
						<article className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
							<h2 className="font-bold text-[#0F172A] text-lg">
								{t("funnel")}
							</h2>
							<div className="mt-4 space-y-3">
								<FunnelRow
									label={t("views")}
									value={view.funnel.views}
									max={view.funnel.views}
									number={number}
								/>
								<FunnelRow
									label={t("engaged")}
									value={view.funnel.engaged}
									max={view.funnel.views}
									number={number}
								/>
								<FunnelRow
									label={t("ordersPlaced")}
									value={view.funnel.ordersPlaced}
									max={view.funnel.views}
									number={number}
								/>
								<FunnelRow
									label={t("ordersDelivered")}
									value={view.funnel.ordersDelivered}
									max={view.funnel.views}
									number={number}
								/>
								<p className="border-t pt-3 text-[#475569] text-sm">
									{t("conversion")}:{" "}
									<strong>{rateLabel(view.funnel.conversion, t)}</strong>
								</p>
							</div>
						</article>
					</section>

					<section className="grid gap-4 lg:grid-cols-2">
						<article className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
							<h2 className="font-bold text-[#0F172A] text-lg">{t("rates")}</h2>
							<dl className="mt-4 grid gap-4 sm:grid-cols-2">
								<Rate
									label={t("sellerCancellation")}
									value={rateLabel(view.rates.sellerCancellation, t)}
								/>
								<Rate
									label={t("codRefusal")}
									value={rateLabel(view.rates.codRefusal, t)}
								/>
								<Rate
									label={t("deliveryCompletion")}
									value={rateLabel(view.rates.deliveryCompletion, t)}
								/>
								<Rate
									label={t("responseTime")}
									value={responseLabel(t, view.responseTime.medianBucket)}
								/>
								<Rate
									label={t("responseWithinHour")}
									value={rateLabel(view.responseTime.answeredWithinOneHour, t)}
								/>
								<Rate
									label={t("awaitingReply")}
									value={number.format(view.responseTime.awaitingReply)}
								/>
							</dl>
						</article>
						<article className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
							<h2 className="font-bold text-[#0F172A] text-lg">
								{t("actions")}
							</h2>
							{view.actions.length ? (
								<ul className="mt-3 space-y-2">
									{view.actions.map((action, index) => (
										<li key={`${action.type}-${index}`}>
											<Link
												className="flex items-center justify-between gap-3 rounded-xl bg-[#F8FAFC] p-3 font-medium text-[#1E40AF] text-sm hover:bg-blue-50"
												href={action.href}
											>
												<InsightActionText action={action} />
												<span aria-hidden="true">→</span>
											</Link>
										</li>
									))}
								</ul>
							) : (
								<p className="mt-4 text-[#64748B] text-sm">{t("noActions")}</p>
							)}
						</article>
					</section>

					<section className="grid gap-4 xl:grid-cols-2">
						<article className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
							<h2 className="border-b px-5 py-4 font-bold text-[#0F172A] text-lg">
								{t("topProducts")}
							</h2>
							{view.topProducts.length ? (
								<div className="overflow-x-auto">
									<table className="w-full min-w-[560px] text-left text-sm">
										<thead className="bg-[#F8FAFC] text-[#64748B] text-xs uppercase">
											<tr>
												<th className="px-5 py-3">{t("product")}</th>
												<th className="px-4 py-3">{t("views")}</th>
												<th className="px-4 py-3">{t("ordersPlaced")}</th>
												<th className="px-5 py-3">{t("gmvDelivered")}</th>
											</tr>
										</thead>
										<tbody>
											{view.topProducts.map((product) => (
												<tr className="border-t" key={product.productId}>
													<td className="px-5 py-3 font-medium text-[#0F172A]">
														{product.productTitle}
													</td>
													<td className="px-4 py-3">
														{number.format(product.views)}
													</td>
													<td className="px-4 py-3">
														{number.format(product.ordersPlaced)}
													</td>
													<td className="px-5 py-3">
														{formatXaf(product.gmvDelivered, locale)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<p className="p-5 text-[#64748B] text-sm">{t("noProducts")}</p>
							)}
						</article>
						<article className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
							<h2 className="font-bold text-[#0F172A] text-lg">{t("stock")}</h2>
							<p className="mt-3 text-[#64748B] text-sm">
								{t("turnover")}:{" "}
								<strong className="text-[#0F172A]">
									{rateLabel(view.stock.turnover, t)}
								</strong>
							</p>
							<h3 className="mt-5 font-semibold text-[#0F172A] text-sm">
								{t("restock")}
							</h3>
							{view.stock.restock.length ? (
								<ul className="mt-2 space-y-2">
									{view.stock.restock.map((item) => (
										<li
											className="flex justify-between gap-3 text-sm"
											key={item.variantId}
										>
											<Link
												className="text-[#1E40AF] hover:underline"
												href={`/seller/catalogue/${encodeURIComponent(item.productId)}`}
											>
												{item.productTitle}
											</Link>
											<span className="shrink-0 text-[#64748B]">
												{t("daysOfCover", { days: item.daysOfCover })}
											</span>
										</li>
									))}
								</ul>
							) : (
								<p className="mt-2 text-[#64748B] text-sm">{t("noRestock")}</p>
							)}
							<h3 className="mt-5 font-semibold text-[#0F172A] text-sm">
								{t("outOfStock")}
							</h3>
							{view.stock.outOfStockWithViews.length ? (
								<ul className="mt-2 space-y-2">
									{view.stock.outOfStockWithViews.map((item) => (
										<li
											className="flex justify-between gap-3 text-sm"
											key={item.variantId}
										>
											<Link
												className="text-[#1E40AF] hover:underline"
												href={`/seller/catalogue/${encodeURIComponent(item.productId)}`}
											>
												{item.productTitle}
											</Link>
											<span className="text-[#64748B]">
												{number.format(item.views)}{" "}
												{t("chartViews").toLowerCase()}
											</span>
										</li>
									))}
								</ul>
							) : (
								<p className="mt-2 text-[#64748B] text-sm">
									{t("noOutOfStock")}
								</p>
							)}
						</article>
					</section>
				</>
			)}
		</div>
	);
}

function FunnelRow({
	label,
	value,
	max,
	number,
}: {
	label: string;
	value: number;
	max: number;
	number: Intl.NumberFormat;
}) {
	const width = max > 0 ? Math.max(3, (value / max) * 100) : 0;
	return (
		<div>
			<div className="mb-1 flex justify-between gap-2 text-sm">
				<span className="text-[#475569]">{label}</span>
				<strong className="text-[#0F172A]">{number.format(value)}</strong>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]">
				<div
					className="h-full rounded-full bg-[#1E40AF]"
					style={{ width: `${width}%` }}
				/>
			</div>
		</div>
	);
}

function Rate({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-[#64748B] text-xs">{label}</dt>
			<dd className="mt-1 font-semibold text-[#0F172A]">{value}</dd>
		</div>
	);
}
