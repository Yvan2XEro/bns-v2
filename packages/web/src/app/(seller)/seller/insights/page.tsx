import { redirect } from "next/navigation";
import { serverGet } from "~/lib/server-api";
import { getMyShop } from "~/lib/server-shop";
import type { InsightsPeriod } from "../../../../../../api/src/types/shopInsights";
import { SellerInsightsClient } from "./seller-insights-client";

const VALID_PERIODS = new Set<InsightsPeriod>(["7d", "30d", "90d"]);

export default async function SellerInsightsPage({
	searchParams,
}: {
	searchParams: Promise<{ period?: string }>;
}) {
	const [mine, config, params] = await Promise.all([
		getMyShop(),
		serverGet<{ insightsEnabled?: boolean }>("/api/public/config"),
		searchParams,
	]);
	if (!mine?.shop || (mine.role !== "owner" && mine.role !== "manager")) {
		redirect("/seller");
	}
	if (config?.insightsEnabled !== true) redirect("/seller");
	const period = VALID_PERIODS.has(params.period as InsightsPeriod)
		? (params.period as InsightsPeriod)
		: "7d";
	return <SellerInsightsClient shopId={mine.shop.id} initialPeriod={period} />;
}
