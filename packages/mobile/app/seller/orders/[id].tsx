import { useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { OrderShipmentsLinks } from "@/src/components/delivery/OrderShipmentsLinks";
import { EmptyState } from "@/src/components/EmptyState";
import { ActionBar } from "@/src/components/sellerOrders/ActionBar";
import { BuyerCard } from "@/src/components/sellerOrders/BuyerCard";
import { OrderItemsCard } from "@/src/components/sellerOrders/OrderItemsCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useSellerOrder } from "@/src/hooks/useSellerOrders";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { statusLabelKey } from "@/src/lib/orderStatus";

export default function SellerOrderScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const { id } = useLocalSearchParams<{ id: string }>();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const query = useSellerOrder(shop?.shopId, id);
	const order = query.data;

	const header = (
		<SellerHeader
			title={
				order
					? t("sellerOrders.orderTitle", { number: order.orderNumber })
					: t("sellerOrders.title")
			}
			subtitle={
				order
					? t("sellerOrders.placedOn", {
							date: formatOrderDate(order.timestamps.placedAt, lang),
						})
					: null
			}
		/>
	);

	if (shopLoading || query.isLoading) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				{header}
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			</SafeAreaView>
		);
	}

	if (!shop || !order) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.bg }]}
			>
				{header}
				<EmptyState
					illustration="notFound"
					title={t("sellerOrders.orderLoadError")}
					subtitle={
						query.error ? resolveErrorMessage(query.error, t) : undefined
					}
					ctaLabel={query.error ? t("common.retry") : undefined}
					onCta={query.error ? () => query.refetch() : undefined}
				/>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			{header}
			<ScrollView
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl
						refreshing={query.isRefetching}
						onRefresh={() => query.refetch()}
						tintColor={c.primary}
					/>
				}
			>
				<View style={[styles.status, { backgroundColor: c.primarySoft }]}>
					<Text style={[styles.statusText, { color: c.primary }]}>
						{t(`orderStatus.${statusLabelKey(order.status, "seller")}`)}
					</Text>
				</View>
				<ActionBar order={order} shopId={shop.shopId} role={shop.role} />
				<OrderShipmentsLinks orderId={String(order.id)} />
				<BuyerCard order={order} />
				<OrderItemsCard order={order} />
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 40, gap: 14 },
	status: {
		alignSelf: "flex-start",
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	statusText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
