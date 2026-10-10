import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SectionTabs } from "~/components/seller/section-tabs";
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
	const [mine, config, params, t] = await Promise.all([
		getMyShop(),
		serverGet<{ insightsEnabled?: boolean }>("/api/public/config"),
		searchParams,
		getTranslations("Seller"),
	]);
	if (!mine?.shop || (mine.role !== "owner" && mine.role !== "manager")) {
		redirect("/seller");
	}
	if (config?.insightsEnabled !== true) redirect("/seller");
	const period = VALID_PERIODS.has(params.period as InsightsPeriod)
		? (params.period as InsightsPeriod)
		: "7d";
	return (
		<>
			<SectionTabs
				tabs={[
					{ href: "/seller", label: t("tabs.today"), exact: true },
					{ href: "/seller/insights", label: t("tabs.statistics") },
				]}
			/>
			<SellerInsightsClient shopId={mine.shop.id} initialPeriod={period} />
		</>
	);
}
