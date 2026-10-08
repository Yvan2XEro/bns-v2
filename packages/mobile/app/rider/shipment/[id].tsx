import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { usePickUp } from "@/src/hooks/useRiderShipments";
import { useShipment } from "@/src/hooks/useShipmentActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { tryCurrentGps } from "@/src/lib/currentPosition";
import { useTranslation } from "@/src/lib/i18n";
import { destinationMapsUrl, riderButtons } from "@/src/lib/riderShipment";
import { shipmentStatusLabel } from "@/src/lib/shipmentStatus";
import { telHref } from "@/src/lib/shipmentTracking";

export default function RiderShipmentScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { id } = useLocalSearchParams<{ id: string }>();
	const query = useShipment(id);
	const pickUp = usePickUp(id);
	const view = query.data && "allowedActions" in query.data ? query.data : null;
	const maps = view ? destinationMapsUrl(view.destination) : null;
	const buttons = view ? riderButtons(view.allowedActions) : [];
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
				<ScrollView contentContainerStyle={styles.content}>
					<Text style={{ color: c.text, fontSize: 18 }}>
						{t(shipmentStatusLabel("seller", view.status))}
					</Text>
					<Text style={{ color: c.body }}>
						{[
							view.destination.landmark,
							view.destination.district,
							view.destination.city,
						]
							.filter(Boolean)
							.join(", ")}
					</Text>
					{view.expectedCod != null ? (
						<Text style={{ color: c.text }}>
							{t("shipmentPanel.cashToCollect", { amount: view.expectedCod })}
						</Text>
					) : null}
					{view.destination.phone ? (
						<SheetButton
							tone="secondary"
							label={t("shipmentPanel.callBuyer")}
							onPress={() =>
								void Linking.openURL(telHref(view.destination.phone ?? ""))
							}
						/>
					) : null}
					{maps ? (
						<SheetButton
							tone="secondary"
							label={t("shipmentPanel.openInMaps")}
							onPress={() => void Linking.openURL(maps)}
						/>
					) : null}
					{buttons.includes("pick_up") ? (
						<SheetButton
							label={t("shipmentPanel.pickUp")}
							pending={pickUp.isPending}
							onPress={async () =>
								pickUp.mutate((await tryCurrentGps()) ?? undefined)
							}
						/>
					) : null}
					{view.allowedActions.some(
						(a) => a === "attempt" || a === "handover",
					) ? (
						<Text style={{ color: c.muted }}>
							{t("shipmentPanel.useLinkForDelivery")}
						</Text>
					) : null}
					{pickUp.error ? (
						<Text accessibilityRole="alert" style={{ color: c.danger }}>
							{resolveErrorMessage(pickUp.error, t)}
						</Text>
					) : null}
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, gap: 12, paddingBottom: 48 },
});
