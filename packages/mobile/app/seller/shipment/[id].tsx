import { useLocalSearchParams } from "expo-router";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SellerShipmentActions } from "@/src/components/delivery/SellerShipmentActions";
import { ShipmentSummary } from "@/src/components/delivery/ShipmentSummary";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { isShopView, useShipment } from "@/src/hooks/useShipmentActions";
import { useMyShop } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";

export default function SellerShipmentScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const query = useShipment(id);
	const role = useMyShop().data?.role ?? null;
	const view = query.data && isShopView(query.data) ? query.data : null;
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={
					view
						? t("tracking.title", { number: view.shipmentNumber })
						: t("shipmentPanel.title")
				}
			/>
			{query.isPending ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : !view ? (
				<EmptyState
					illustration="notFound"
					title={t("shipmentPanel.loadError")}
					subtitle={
						query.error ? resolveErrorMessage(query.error, t) : undefined
					}
					ctaLabel={t("common.retry")}
					onCta={() => query.refetch()}
				/>
			) : (
				<ScrollView
					contentContainerStyle={styles.content}
					refreshControl={
						<RefreshControl
							refreshing={query.isRefetching}
							onRefresh={() => void query.refetch()}
							tintColor={c.primary}
						/>
					}
				>
					<ShipmentSummary view={view} />
					<SellerShipmentActions
						view={view}
						canProcess={can(role, "orders.process")}
						canSeeCosts={can(role, "costs.view")}
					/>
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, gap: 16, paddingBottom: 48 },
});
