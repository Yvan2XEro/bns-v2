import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { SettingsShell } from "@/src/components/delivery/SettingsShell";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { ListSkeleton } from "@/src/components/shop/ListSkeleton";
import { StatusTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useDeliveryLocations } from "@/src/hooks/useDeliverySettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";

function LocationsList({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locations = useDeliveryLocations(shopId);
	if (locations.isPending)
		return (
			<View style={{ paddingTop: 16 }}>
				<ListSkeleton rows={3} />
			</View>
		);
	if (locations.isError)
		return (
			<EmptyState
				illustration="notFound"
				title={t("deliverySettings.locationsTitle")}
				subtitle={resolveErrorMessage(locations.error, t)}
				ctaLabel={t("common.retry")}
				onCta={() => locations.refetch()}
			/>
		);
	return (
		<ScreenColumn width="wide">
			<FlashList
				data={locations.data}
				keyExtractor={(row) => String(row.id)}
				contentContainerStyle={styles.content}
				ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
				ListEmptyComponent={
					<View
						style={[
							styles.empty,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Ionicons name="storefront-outline" size={28} color={c.link} />
						<Text style={[styles.body, styles.center, { color: c.body }]}>
							{t("deliverySettings.locationsEmpty")}
						</Text>
					</View>
				}
				renderItem={({ item }) => {
					const inactive = item.active === false;
					return (
						<Pressable
							onPress={() =>
								router.push({
									pathname: "/seller/delivery/location/[id]",
									params: { id: String(item.id) },
								})
							}
							accessibilityRole="button"
							accessibilityLabel={item.name}
							style={({ pressed }) => [
								styles.row,
								{ borderColor: c.border, backgroundColor: c.card },
								pressed && styles.pressed,
							]}
						>
							<View style={styles.rowBody}>
								<Text
									style={[styles.title, { color: inactive ? c.muted : c.text }]}
									numberOfLines={1}
								>
									{item.name}
								</Text>
								{item.landmark ? (
									<Text
										style={[styles.body, { color: c.body }]}
										numberOfLines={2}
									>
										{item.landmark}
									</Text>
								) : null}
								{item.pickupEnabled || item.isDefaultOrigin || inactive ? (
									<View style={styles.tags}>
										{item.isDefaultOrigin ? (
											<StatusTag
												label={t("deliverySettings.originBadge")}
												tone="info"
											/>
										) : null}
										{item.pickupEnabled ? (
											<StatusTag
												label={t("deliverySettings.pickupBadge")}
												tone="success"
											/>
										) : null}
										{inactive ? (
											<StatusTag
												label={t("deliverySettings.inactive")}
												tone="neutral"
											/>
										) : null}
									</View>
								) : null}
							</View>
							<Ionicons name="chevron-forward" size={18} color={c.muted} />
						</Pressable>
					);
				}}
				ListFooterComponent={
					<View style={styles.footer}>
						<SheetButton
							label={t("deliverySettings.addLocation")}
							onPress={() =>
								router.push({
									pathname: "/seller/delivery/location/[id]",
									params: { id: "new" },
								})
							}
						/>
					</View>
				}
			/>
		</ScreenColumn>
	);
}

export default function LocationsScreen() {
	const { t } = useTranslation();
	return (
		<SettingsShell title={t("deliverySettings.locationsTitle")}>
			{(shopId) => <LocationsList shopId={shopId} />}
		</SettingsShell>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, paddingBottom: 48 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		minHeight: 48,
	},
	pressed: { opacity: 0.7 },
	rowBody: { flex: 1, gap: 6 },
	title: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.displayBold },
	body: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	center: { textAlign: "center" },
	tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	footer: { marginTop: 24 },
	empty: {
		alignItems: "center",
		gap: 10,
		padding: 24,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
});
