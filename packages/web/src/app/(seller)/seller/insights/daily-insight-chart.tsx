"use client";

import { useLocale, useTranslations } from "next-intl";
import { insightPolyline } from "~/lib/insight-chart";
import type { ShopInsightsView } from "../../../../../../api/src/types/shopInsights";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;

export function DailyInsightChart({
	daily,
}: {
	daily: ShopInsightsView["daily"];
}) {
	const t = useTranslations("SellerInsights");
	const locale = useLocale();
	const views = daily.map((item) => item.views);
	const orders = daily.map((item) => item.ordersPlaced);
	const gmv = daily.map((item) => item.gmvDelivered);
	const dateFormatter = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
	});
	const dates = [
		daily[0],
		daily[Math.floor((daily.length - 1) / 2)],
		daily.at(-1),
	]
		.filter((item) => item !== undefined)
		.map((item) => dateFormatter.format(new Date(`${item.date}T12:00:00`)));

	return (
		<div>
			<div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
				<Legend color="bg-blue-600" label={t("chartViews")} />
				<Legend color="bg-amber-500" label={t("chartOrders")} />
				<Legend color="bg-emerald-600" label={t("chartGmvAxis")} />
			</div>
			<svg
				aria-label={t("chartDescription")}
				className="h-52 w-full overflow-visible"
				preserveAspectRatio="none"
				role="img"
				viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
			>
				{[0, 0.5, 1].map((fraction) => (
					<line
						key={fraction}
						x1="0"
						x2={CHART_WIDTH}
						y1={fraction * CHART_HEIGHT}
						y2={fraction * CHART_HEIGHT}
						stroke="#E2E8F0"
						strokeDasharray="4 6"
						vectorEffect="non-scaling-stroke"
					/>
				))}
				<polyline
					fill="none"
					points={insightPolyline(views, CHART_WIDTH, CHART_HEIGHT)}
					stroke="#2563EB"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="3"
					vectorEffect="non-scaling-stroke"
				/>
				<polyline
					fill="none"
					points={insightPolyline(orders, CHART_WIDTH, CHART_HEIGHT)}
					stroke="#F59E0B"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="3"
					vectorEffect="non-scaling-stroke"
				/>
				<polyline
					fill="none"
					points={insightPolyline(gmv, CHART_WIDTH, CHART_HEIGHT)}
					stroke="#059669"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="3"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<div className="mt-2 flex justify-between text-[#64748B] text-xs">
				{dates.map((date, index) => (
					<span key={`${date}-${index}`}>{date}</span>
				))}
			</div>
		</div>
	);
}

function Legend({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-2 text-[#475569]">
			<span
				aria-hidden="true"
				className={`h-2.5 w-2.5 rounded-full ${color}`}
			/>
			{label}
		</span>
	);
}
