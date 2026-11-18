import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import {
	InsightProductRow,
	InsightsActions,
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
	// Switching 7 j / 30 j keeps the last figures on screen, dimmed, while the
	// new period loads (the hook keeps the previous period as placeholder),
	// instead of blanking the screen and its period tabs.
	const shown = insights.data;
	const switching = insights.isPlaceholderData;

	if (mine.isLoading || (allowed && insights.isLoading && !shown)) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				<SellerHeader title={t("sellerInsights.title")} />
				<DetailSkeleton cards={3} />
			</SafeAreaView>
		);
	}

	if (!shop || !allowed || (insights.isError && !insights.data) || !shown) {
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

	const view = shown;
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
			<ScreenColumn
				width="wide"
				style={switching ? styles.switching : undefined}
			>
				<FlashList
					refreshControl={
						<RefreshControl
							refreshing={insights.isRefetching && !switching}
							onRefresh={() => void insights.refetch()}
							tintColor={c.primary}
							colors={[c.primary]}
							progressBackgroundColor={c.card}
						/>
					}
					data={view.topProducts}
					keyExtractor={(item) => item.productId}
					contentContainerStyle={styles.list}
					ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
					ListHeaderComponent={
						<InsightsHeader
							view={view}
							period={period}
							onPeriod={setPeriod}
							actions={
								<View style={styles.actions}>
									<InsightsActions view={view} onAction={handleAction} />
								</View>
							}
						/>
					}
					ListEmptyComponent={
						<View style={styles.emptyProducts}>
							<EmptyState
								illustration="listings"
								size={140}
								title={t("sellerInsights.noProducts")}
								subtitle={t("sellerInsights.noProductsHint")}
							/>
						</View>
					}
					ListFooterComponent={
						<InsightsFooter
							view={view}
							onAction={handleAction}
							showActions={false}
						/>
					}
					renderItem={({ item }) => <InsightProductRow product={item} />}
				/>
			</ScreenColumn>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	list: { paddingBottom: 20 },
	emptyProducts: { paddingVertical: 8 },
	switching: { opacity: 0.55 },
	actions: { marginTop: 4 },
});
