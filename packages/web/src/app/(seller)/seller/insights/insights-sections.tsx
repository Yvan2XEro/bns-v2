"use client";

import { ArrowRight, Eye, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BoostDialog } from "~/components/listing/boost-dialog";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	dormantLastSale,
	formatMinutes,
	type MeterTone,
	meterFill,
	meterTone,
	RESPONSE_BUCKET_MINUTES,
	ratio,
	slowestResponseDay,
	weeklyChange,
} from "~/lib/insights-view";
import { cn } from "~/lib/utils";
import type { ShopInsightsView } from "../../../../../../api/src/types/shopInsights";

/** "Recommended under 1 h" and "under 4 h", in minutes. */
const RESPONSE_TARGET = 60;
const ACCEPTANCE_TARGET = 240;

function Card({
	title,
	aside,
	children,
	id,
}: {
	title: string;
	aside?: ReactNode;
	children: ReactNode;
	id: string;
}) {
	return (
		<section
			aria-labelledby={id}
			className="min-w-0 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-3.5">
				<h2 id={id} className="font-bold text-[#0F172A] text-base">
					{title}
				</h2>
				{aside && <span className="text-[#64748B] text-[13px]">{aside}</span>}
			</div>
			{children}
		</section>
	);
}

function percent(value: number | null, locale: string, digits = 1): string {
	if (value === null) return "—";
	return new Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: digits,
	}).format(value);
}

export function WeeklySalesCard({ view }: { view: ShopInsightsView }) {
	const tPage = useTranslations("InsightsPage");
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale();
	const weekly = view.weekly ?? [];
	const last = weekly.at(-1);
	const max = Math.max(...weekly.map((week) => week.gmvDelivered), 0);
	const change = weeklyChange(weekly);
	const compact = new Intl.NumberFormat(locale, {
		notation: "compact",
		maximumFractionDigits: 2,
	});
	const day = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
	});
	const label = (iso: string) => day.format(new Date(`${iso}T12:00:00`));

	return (
		<Card
			id="weekly-sales-title"
			title={tPage("weeklyTitle")}
			aside={tPage("weeks", { count: weekly.length })}
		>
			<div className="space-y-2 px-[18px] py-4">
				{last && (
					<>
						<div className="flex flex-wrap items-baseline gap-2.5">
							<span className="font-bold text-[#0F172A] text-[26px] tabular-nums">
								{formatOrderMoney(last.gmvDelivered)}
							</span>
							{change !== null && (
								<span
									className={cn(
										"flex items-center gap-1 font-semibold text-[13px]",
										change >= 0 ? "text-[#15803D]" : "text-[#B45309]",
									)}
								>
									{change >= 0 ? (
										<TrendingUp aria-hidden="true" className="h-4 w-4" />
									) : (
										<TrendingDown aria-hidden="true" className="h-4 w-4" />
									)}
									{tPage("weeklyChange", {
										value: `${change > 0 ? "+" : ""}${percent(change, locale)}`,
									})}
								</span>
							)}
						</div>
						<p className="text-[#64748B] text-xs">
							{tPage("weeklyCaption", {
								from: label(last.from),
								to: label(last.to),
							})}
						</p>
					</>
				)}
				<div
					role="img"
					aria-label={weekly
						.map(
							(week) =>
								`${label(week.from)}: ${formatOrderMoney(week.gmvDelivered)}`,
						)
						.join(", ")}
					className="flex h-[200px] items-end gap-2 border-[#E2E8F0] border-b pt-2 sm:gap-3.5"
				>
					{weekly.map((week, index) => {
						const isLast = index === weekly.length - 1;
						return (
							<div
								key={week.from}
								className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
							>
								<span
									className={cn(
										"text-[11px] tabular-nums sm:text-xs",
										isLast
											? "font-bold text-[#1E40AF]"
											: "font-medium text-[#64748B]",
									)}
								>
									{compact.format(week.gmvDelivered)}
								</span>
								<div
									className={cn(
										"w-full max-w-[54px] rounded-t-md",
										isLast ? "bg-[#1E40AF]" : "bg-[#BFDBFE]",
									)}
									style={{
										height: `${max > 0 ? Math.max(2, (week.gmvDelivered / max) * 150) : 2}px`,
									}}
								/>
							</div>
						);
					})}
				</div>
				<div aria-hidden="true" className="flex gap-2 sm:gap-3.5">
					{weekly.map((week, index) => (
						<span
							key={week.from}
							className={cn(
								"flex-1 text-center text-[11px] sm:text-xs",
								index === weekly.length - 1
									? "font-semibold text-[#0F172A]"
									: "font-medium text-[#94A3B8]",
							)}
						>
							{label(week.from)}
						</span>
					))}
				</div>
			</div>
		</Card>
	);
}

export function FunnelCard({ view }: { view: ShopInsightsView }) {
	const tPage = useTranslations("InsightsPage");
	const tInsights = useTranslations("SellerInsights");
	const locale = useLocale();
	const formatOrderMoney = useOrderMoney();
	const number = new Intl.NumberFormat(locale);
	const { funnel } = view;
	const lowConversion = view.actions.find(
		(action) => action.type === "low_conversion",
	);
	const lowProduct = lowConversion
		? view.topProducts.find(
				(product) => product.productId === lowConversion.productId,
			)
		: undefined;
	const comparison =
		funnel.priceComparison?.productId === lowProduct?.productId
			? funnel.priceComparison
			: null;
	const steps = [
		{
			key: "views",
			label: tPage("funnelViews"),
			value: funnel.views,
			note: null,
			color: "bg-[#BFDBFE]",
		},
		{
			key: "engaged",
			label: tInsights("engaged"),
			value: funnel.engaged,
			note: tPage("ofViews", {
				value: percent(ratio(funnel.engaged, funnel.views), locale),
			}),
			color: "bg-[#93C5FD]",
		},
		{
			key: "placed",
			label: tInsights("ordersPlaced"),
			value: funnel.ordersPlaced,
			note: tPage("ofViews", {
				value: percent(ratio(funnel.ordersPlaced, funnel.views), locale, 2),
			}),
			color: "bg-[#3B82F6]",
		},
		{
			key: "delivered",
			label: tInsights("ordersDelivered"),
			value: funnel.ordersDelivered,
			note: tPage("ofOrders", {
				value: percent(
					ratio(funnel.ordersDelivered, funnel.ordersPlaced),
					locale,
					0,
				),
			}),
			color: "bg-[#1E40AF]",
		},
	];

	return (
		<Card
			id="funnel-title"
			title={tPage("funnelTitle")}
			aside={tInsights(`period.${view.period}`)}
		>
			<div className="space-y-3 px-[18px] py-3.5">
				{steps.map((step) => (
					<div key={step.key} className="space-y-1.5">
						<div className="flex justify-between gap-2 text-[13px]">
							<span className="text-[#334155]">{step.label}</span>
							<span>
								<strong className="tabular-nums">
									{number.format(step.value)}
								</strong>{" "}
								{step.note && (
									<span className="text-[#64748B] text-xs">{step.note}</span>
								)}
							</span>
						</div>
						<div className="h-2.5 rounded-full bg-[#F1F5F9]">
							<div
								className={cn("h-2.5 rounded-full", step.color)}
								style={{
									width: `${funnel.views > 0 ? Math.max(2, (step.value / funnel.views) * 100) : 0}%`,
								}}
							/>
						</div>
					</div>
				))}
				{lowConversion && lowProduct && (
					<Link
						href={lowConversion.href}
						className="flex gap-2 rounded-[10px] bg-[#FFFBEB] p-3 text-[#92400E] text-xs leading-[17px] hover:bg-[#FEF3C7]"
					>
						<Eye aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
						<span>
							<strong>{lowProduct.productTitle}</strong>{" "}
							{tPage("lowConversion", {
								views: number.format(lowProduct.views),
								orders: number.format(lowProduct.ordersPlaced),
							})}
							{comparison && (
								<span className="mt-1 block">
									{tPage("priceComparison", {
										median: formatOrderMoney(comparison.medianPrice),
										yours: formatOrderMoney(comparison.yourPrice),
									})}
								</span>
							)}
						</span>
					</Link>
				)}
			</div>
		</Card>
	);
}

const TONE_TEXT: Record<MeterTone, string> = {
	ok: "text-[#15803D]",
	warn: "text-[#B45309]",
	ko: "text-[#DC2626]",
};
const TONE_FILL: Record<MeterTone, string> = {
	ok: "bg-[#22C55E]",
	warn: "bg-[#F59E0B]",
	ko: "bg-[#EF4444]",
};

function Meter({
	label,
	value,
	fill,
	tone,
	verdict,
	detail,
	action,
	children,
}: {
	label: string;
	value: string;
	fill: number | null;
	tone: MeterTone | null;
	verdict: string;
	detail: string;
	action?: { href: string; label: string } | null;
	children?: ReactNode;
}) {
	return (
		<article className="flex flex-col gap-2 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3.5">
			<p className="text-[#64748B] text-[13px]">{label}</p>
			<div className="flex items-baseline justify-between gap-2">
				<span
					className={cn(
						"font-bold text-2xl tabular-nums",
						tone ? TONE_TEXT[tone] : "text-[#94A3B8]",
					)}
				>
					{value}
				</span>
				<span
					className={cn(
						"text-right font-semibold text-xs",
						tone ? TONE_TEXT[tone] : "text-[#64748B]",
					)}
				>
					{verdict}
				</span>
			</div>
			<div className="relative h-2 rounded bg-[#F1F5F9]">
				{fill !== null && tone && (
					<div
						className={cn("h-2 rounded", TONE_FILL[tone])}
						style={{ width: `${fill}%` }}
					/>
				)}
				<span
					aria-hidden="true"
					className="absolute top-[-4px] left-1/2 h-4 w-0.5 bg-[#0F172A]"
				/>
			</div>
			<p className="text-[#475569] text-xs leading-[17px]">{detail}</p>
			{children}
			{action && (
				<Link
					href={action.href}
					className="mt-0.5 inline-flex items-center gap-1 font-semibold text-[#1E40AF] text-[13px] hover:underline"
				>
					{action.label}
					<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
				</Link>
			)}
		</article>
	);
}

/** One bar per day, the median reply time, so a slow day stands out. */
function ResponseByDay({
	days,
	dayText,
	summary,
	title,
}: {
	days: NonNullable<ShopInsightsView["responseTime"]["daily"]>;
	dayText: (date: string, minutes: number | null) => string;
	summary: string;
	title: string;
}) {
	const max = Math.max(...days.map((day) => day.medianMinutes ?? 0), 1);
	return (
		<div className="space-y-1.5">
			<p className="text-[#475569] text-xs leading-[17px]">{summary}</p>
			<ul aria-label={title} className="flex h-10 items-end gap-0.5">
				{days.map((day) => {
					const text = dayText(day.date, day.medianMinutes);
					return (
						<li
							key={day.date}
							title={text}
							className="flex h-full flex-1 items-end"
						>
							<span className="sr-only">{text}</span>
							<span
								aria-hidden="true"
								className={cn(
									"block w-full rounded-sm",
									day.medianMinutes === null
										? "h-0.5 bg-[#E2E8F0]"
										: day.medianMinutes > RESPONSE_TARGET
											? "bg-[#F59E0B]"
											: "bg-[#22C55E]",
								)}
								style={
									day.medianMinutes === null
										? undefined
										: {
												height: `${Math.max(8, (day.medianMinutes / max) * 100)}%`,
											}
								}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

export function ThresholdMeters({ view }: { view: ShopInsightsView }) {
	const tPage = useTranslations("InsightsPage");
	const tInsights = useTranslations("SellerInsights");
	const locale = useLocale();
	const thresholds = view.thresholds ?? {
		sellerCancellation: 0.1,
		codRefusal: 0.2,
	};
	const counts = view.rateCounts;
	const actionOf = (type: ShopInsightsView["actions"][number]["type"]) =>
		view.actions.find((action) => action.type === type);
	const cancellation = view.rates.sellerCancellation;
	const refusal = view.rates.codRefusal;
	const cancellationTone =
		cancellation === null
			? null
			: meterTone(cancellation, thresholds.sellerCancellation);
	const refusalTone =
		refusal === null ? null : meterTone(refusal, thresholds.codRefusal);
	const cancellationAction = actionOf("seller_cancellation_rate");
	const refusalAction = actionOf("cod_refusal_rate");

	const bucket = view.responseTime.medianBucket;
	const responseMinutes = bucket ? RESPONSE_BUCKET_MINUTES[bucket] : null;
	const responseTone =
		responseMinutes === null
			? null
			: responseMinutes <= RESPONSE_TARGET
				? "ok"
				: meterTone(responseMinutes, RESPONSE_TARGET * 2);
	const acceptance = view.acceptance?.medianMinutes ?? null;
	const acceptanceTone =
		acceptance === null
			? null
			: acceptance < ACCEPTANCE_TARGET
				? "ok"
				: meterTone(acceptance, ACCEPTANCE_TARGET * 2);
	const awaiting = view.responseTime.awaitingReply;
	const responseDaily = view.responseTime.daily ?? [];
	const slowest = slowestResponseDay(responseDaily);
	const dayName = (date: string, weekday: "long" | "short") =>
		new Date(`${date}T12:00:00.000Z`).toLocaleDateString(locale, {
			weekday,
			day: "numeric",
			timeZone: "UTC",
		});

	return (
		<section
			aria-label={tPage("metersLabel")}
			className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
		>
			<Meter
				label={tPage("cancellationLabel", {
					period: tInsights(`period.${view.period}`),
				})}
				value={percent(cancellation, locale)}
				fill={
					cancellation === null
						? null
						: meterFill(cancellation, thresholds.sellerCancellation)
				}
				tone={cancellationTone}
				verdict={
					cancellation === null
						? tInsights("unavailableRate")
						: tPage(cancellationTone === "ko" ? "thresholdOver" : "threshold", {
								value: percent(thresholds.sellerCancellation, locale, 0),
							})
				}
				detail={
					counts
						? tPage("cancellationDetail", {
								count: counts.sellerCancellations,
								total: counts.ordersPlaced,
							})
						: tInsights("sellerCancellation")
				}
				action={
					cancellationAction
						? {
								href: cancellationAction.href,
								label: tPage("cancellationAction"),
							}
						: null
				}
			/>
			<Meter
				label={tPage("refusalLabel", {
					period: tInsights(`period.${view.period}`),
				})}
				value={percent(refusal, locale)}
				fill={
					refusal === null ? null : meterFill(refusal, thresholds.codRefusal)
				}
				tone={refusalTone}
				verdict={
					refusal === null
						? tInsights("unavailableRate")
						: tPage(refusalTone === "ko" ? "thresholdOver" : "threshold", {
								value: percent(thresholds.codRefusal, locale, 0),
							})
				}
				detail={
					counts
						? tPage("refusalDetail", {
								count: counts.codRefused,
								total: counts.codShipped,
							})
						: tInsights("codRefusal")
				}
				action={
					refusalAction
						? { href: refusalAction.href, label: tPage("refusalAction") }
						: null
				}
			/>
			<Meter
				label={tPage("responseLabel")}
				value={bucket ? tInsights(`responseBucket.${bucket}`) : "—"}
				fill={
					responseMinutes === null
						? null
						: meterFill(responseMinutes, RESPONSE_TARGET)
				}
				tone={responseTone}
				verdict={tPage("recommendedUnder", {
					value: formatMinutes(RESPONSE_TARGET),
				})}
				detail={
					bucket
						? tPage("responseDetail", {
								rate: percent(
									view.responseTime.answeredWithinOneHour,
									locale,
									0,
								),
								awaiting,
							})
						: tInsights("noResponseData")
				}
				action={
					awaiting > 0
						? { href: "/seller/messages", label: tPage("responseAction") }
						: null
				}
			>
				{slowest && (
					<ResponseByDay
						days={responseDaily}
						dayText={(date, minutes) =>
							tPage("responseDay", {
								day: dayName(date, "short"),
								value:
									minutes === null
										? tPage("responseNoReply")
										: formatMinutes(minutes),
							})
						}
						summary={tPage("responseSlowest", {
							day: dayName(slowest.date, "long"),
							value: formatMinutes(slowest.medianMinutes),
						})}
						title={tPage("responseByDay", { count: responseDaily.length })}
					/>
				)}
			</Meter>
			<Meter
				label={tPage("acceptanceLabel")}
				value={acceptance === null ? "—" : formatMinutes(acceptance)}
				fill={
					acceptance === null ? null : meterFill(acceptance, ACCEPTANCE_TARGET)
				}
				tone={acceptanceTone}
				verdict={tPage("recommendedUnder", {
					value: formatMinutes(ACCEPTANCE_TARGET),
				})}
				detail={
					acceptance === null
						? tPage("acceptanceNone")
						: tPage("acceptanceDetail", { count: view.acceptance?.sample ?? 0 })
				}
			/>
		</section>
	);
}

export function TopProductsCard({ view }: { view: ShopInsightsView }) {
	const tPage = useTranslations("InsightsPage");
	const tInsights = useTranslations("SellerInsights");
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale();
	const number = new Intl.NumberFormat(locale);
	const lowStock = new Set(view.stock.restock.map((item) => item.productId));

	return (
		<Card
			id="top-products-title"
			title={tInsights("topProducts")}
			aside={tInsights(`period.${view.period}`)}
		>
			{view.topProducts.length === 0 ? (
				<p className="px-[18px] py-5 text-[#64748B] text-sm">
					{tInsights("noProducts")}
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[480px] text-left text-sm">
						<thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
							<tr>
								<th className="px-[18px] py-2.5 font-medium">
									{tInsights("product")}
								</th>
								<th className="px-3 py-2.5 font-medium">
									{tPage("colDelivered")}
								</th>
								<th className="px-3 py-2.5 font-medium">{tPage("colSales")}</th>
								<th className="px-3 py-2.5 font-medium">
									{tPage("colConversion")}
								</th>
								<th className="px-[18px] py-2.5 font-medium">
									{tPage("colStock")}
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[#F1F5F9]">
							{view.topProducts.map((product) => (
								<tr key={product.productId}>
									<td className="px-[18px] py-3">
										<Link
											href={`/seller/catalogue/${encodeURIComponent(product.productId)}`}
											className="font-semibold text-[#0F172A] hover:text-[#1E40AF] hover:underline"
										>
											{product.productTitle}
										</Link>
										<p className="text-[#64748B] text-xs">
											{tPage("viewsCount", { count: product.views })}
										</p>
									</td>
									<td className="px-3 py-3 font-bold text-[#0F172A] tabular-nums">
										{number.format(product.unitsDelivered)}
									</td>
									<td className="whitespace-nowrap px-3 py-3 tabular-nums">
										{formatOrderMoney(product.gmvDelivered)}
									</td>
									<td className="px-3 py-3 tabular-nums">
										{percent(
											ratio(product.ordersPlaced, product.views),
											locale,
										)}
									</td>
									<td className="px-[18px] py-3">
										{product.available === null ||
										product.available === undefined ? (
											<span className="text-[#94A3B8]">—</span>
										) : lowStock.has(product.productId) ? (
											<span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 font-semibold text-[#92400E] text-xs">
												{tPage("lowStock", { count: product.available })}
											</span>
										) : (
											<span className="tabular-nums">
												{number.format(product.available)}
											</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Card>
	);
}

function DormantLastSaleText({
	item,
}: {
	item: NonNullable<ShopInsightsView["stock"]["dormant"]>[number];
}) {
	const tPage = useTranslations("InsightsPage");
	const lastSale = dormantLastSale(item);
	if (!lastSale) return null;
	return (
		<p className="text-[#94A3B8] text-xs">
			{lastSale.kind === "days"
				? tPage("dormantLastSaleDays", { count: lastSale.days })
				: lastSale.kind === "today"
					? tPage("dormantLastSaleToday")
					: tPage("dormantNeverSold")}
		</p>
	);
}

export function DormantStockCard({ view }: { view: ShopInsightsView }) {
	const tPage = useTranslations("InsightsPage");
	const formatOrderMoney = useOrderMoney();
	const dormant = view.stock.dormant ?? [];

	return (
		<Card
			id="dormant-title"
			title={tPage("dormantTitle")}
			aside={tPage("dormantAside")}
		>
			{dormant.length === 0 ? (
				<p className="px-[18px] py-5 text-[#64748B] text-sm">
					{tPage("dormantEmpty")}
				</p>
			) : (
				<ul>
					{dormant.map((item) => (
						<li
							key={item.productId}
							className="flex flex-wrap items-center gap-3 border-[#F1F5F9] border-b px-[18px] py-3"
						>
							<div className="min-w-0 flex-1">
								<p className="font-semibold text-[#0F172A]">
									{item.productTitle}
								</p>
								<p className="text-[#64748B] text-xs">
									{tPage("dormantLine", { count: item.available })}
								</p>
								<DormantLastSaleText item={item} />
							</div>
							<div className="text-right">
								<p className="font-bold text-[#0F172A] tabular-nums">
									{formatOrderMoney(item.costValue)}
								</p>
								<p className="text-[#94A3B8] text-[11px]">{tPage("atCost")}</p>
							</div>
							<div className="flex gap-2">
								{item.boostListingId && (
									<BoostDialog listingId={item.boostListingId}>
										<button
											type="button"
											className="inline-flex h-8 items-center rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 font-semibold text-[#92400E] text-xs hover:border-[#F59E0B]"
										>
											{tPage("dormantBoost")}
										</button>
									</BoostDialog>
								)}
								<Link
									href={`/seller/catalogue/${encodeURIComponent(item.productId)}`}
									className="inline-flex h-8 items-center rounded-lg border border-[#E2E8F0] px-3 font-semibold text-[#0F172A] text-xs hover:border-[#93C5FD]"
								>
									{tPage("dormantPrice")}
								</Link>
								<Link
									href="/seller/stock"
									className="inline-flex h-8 items-center rounded-lg border border-[#E2E8F0] px-3 font-semibold text-[#0F172A] text-xs hover:border-[#93C5FD]"
								>
									{tPage("dormantStock")}
								</Link>
							</div>
						</li>
					))}
				</ul>
			)}
			{view.stock.dormantValue !== undefined && view.stock.dormantValue > 0 && (
				<div className="flex justify-between gap-3 bg-[#F8FAFC] px-[18px] py-3 text-sm">
					<span className="text-[#64748B]">{tPage("dormantFooter")}</span>
					<strong className="tabular-nums">
						{tPage("dormantTotal", {
							amount: formatOrderMoney(view.stock.dormantValue),
						})}
					</strong>
				</div>
			)}
		</Card>
	);
}
