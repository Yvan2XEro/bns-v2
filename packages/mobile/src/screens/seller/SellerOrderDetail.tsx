import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailSkeleton } from "@/src/components/checkout/DetailSkeleton";
import { OrderShipmentsLinks } from "@/src/components/delivery/OrderShipmentsLinks";
import { EmptyState } from "@/src/components/EmptyState";
import { OrderProgress } from "@/src/components/purchases/OrderProgress";
import { ActionBar } from "@/src/components/sellerOrders/ActionBar";
import { BuyerCard } from "@/src/components/sellerOrders/BuyerCard";
import { OrderItemsCard } from "@/src/components/sellerOrders/OrderItemsCard";
import { orderStatusTone } from "@/src/components/sellerOrders/statusTone";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { StatusTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useSellerOrder } from "@/src/hooks/useSellerOrders";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate } from "@/src/lib/orderMoney";
import { statusLabelKey } from "@/src/lib/orderStatus";

/** One order of the shop: its own screen on a phone, the detail pane on a tablet. */
export function SellerOrderDetail({ id }: { id: string }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
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
				<DetailSkeleton cards={2} />
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
				<StatusTag
					label={t(`orderStatus.${statusLabelKey(order.status, "seller")}`)}
					tone={orderStatusTone(order.status)}
				/>
				<OrderProgress status={order.status} timestamps={order.timestamps} />
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
	content: { padding: 16, paddingBottom: 40, gap: 14 },
});
