import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import {
	InsightProductRow,
	InsightsFooter,
	InsightsHeader,
} from "@/src/components/shop/SellerInsightsPanels";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useShopInsights } from "@/src/hooks/useShopInsights";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";
import type {
	InsightsPeriod,
	ShopInsightAction,
} from "../../../api/src/types/shopInsights";

export default function SellerInsightsScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { insightsEnabled } = useAppConfig();
	const mine = useMyShop();
	const [period, setPeriod] = useState<InsightsPeriod>("7d");
	const shop = mine.data?.shop;
	const role = mine.data?.role;
	const allowed = insightsEnabled && can(role, "costs.view");
	const insights = useShopInsights(allowed ? shop?.id : undefined, period);

	if (mine.isLoading || (allowed && insights.isLoading)) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerInsights.title")} />
				<ActivityIndicator color={c.primary} style={styles.spinner} />
			</SafeAreaView>
		);
	}

	if (!shop || !allowed || insights.isError || !insights.data) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerInsights.title")} />
				<EmptyState
					illustration="notFound"
					title={t("sellerInsights.error")}
					ctaLabel={insights.isError ? t("sellerInsights.retry") : undefined}
					onCta={insights.isError ? () => void insights.refetch() : undefined}
				/>
			</SafeAreaView>
		);
	}

	const view = insights.data;
	const handleAction = (action: ShopInsightAction) => {
		switch (action.type) {
			case "awaiting_reply":
				router.push("/seller/inbox");
				return;
			case "out_of_stock_views":
			case "restock":
				router.push({
					pathname: "/seller/catalogue",
					params: { filter: "out" },
				});
				return;
			case "cod_refusal_rate":
				router.push({ pathname: "/seller/orders", params: { tab: "shipped" } });
				return;
			case "seller_cancellation_rate":
				router.push("/seller/catalogue");
				return;
			case "low_conversion":
				if (action.productId) {
					router.push({
						pathname: "/seller/product/[id]",
						params: { id: action.productId },
					});
				} else {
					router.push("/seller/catalogue");
				}
				return;
			case "slow_response":
				router.push("/account/notifications");
				return;
		}
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("sellerInsights.title")} subtitle={shop.name} />
			<FlashList
				data={view.topProducts}
				keyExtractor={(item) => item.productId}
				contentContainerStyle={styles.list}
				ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
				ListHeaderComponent={
					<InsightsHeader view={view} period={period} onPeriod={setPeriod} />
				}
				ListEmptyComponent={
					<Text style={[styles.emptyProducts, { color: c.muted }]}>
						{t("sellerInsights.noProducts")}
					</Text>
				}
				ListFooterComponent={
					<InsightsFooter view={view} onAction={handleAction} />
				}
				renderItem={({ item }) => <InsightProductRow product={item} />}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 48 },
	list: { paddingBottom: 20 },
	emptyProducts: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 12 },
});
