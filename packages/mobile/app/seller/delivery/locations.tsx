import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { SettingsShell } from "@/src/components/delivery/SettingsShell";
import { EmptyState } from "@/src/components/EmptyState";
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { useShopTheme } from "@/src/components/shop/theme";
import { useDeliveryLocations } from "@/src/hooks/useDeliverySettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";

function LocationsList({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locations = useDeliveryLocations(shopId);
	if (locations.isPending)
		return <ActivityIndicator style={styles.spinner} color={c.primary} />;
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
		<FlashList
			data={locations.data}
			keyExtractor={(row) => String(row.id)}
			contentContainerStyle={styles.content}
			ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
			ListEmptyComponent={
				<Text style={{ color: c.muted, fontFamily: Fonts.body }}>
					{t("deliverySettings.locationsEmpty")}
				</Text>
			}
			renderItem={({ item }) => (
				<Pressable
					onPress={() =>
						router.push({
							pathname: "/seller/delivery/location/[id]",
							params: { id: String(item.id) },
						})
					}
					accessibilityRole="button"
					accessibilityLabel={item.name}
					style={[
						styles.row,
						{ borderColor: c.border, backgroundColor: c.card },
					]}
				>
					<Text style={[styles.title, { color: c.text }]}>{item.name}</Text>
					<Text style={{ color: c.body, fontFamily: Fonts.body }}>
						{item.landmark}
					</Text>
					<Text
						style={{ color: c.muted, fontFamily: Fonts.body, fontSize: 13 }}
					>
						{[
							item.pickupEnabled ? t("deliverySettings.pickupBadge") : null,
							item.isDefaultOrigin ? t("deliverySettings.originBadge") : null,
							item.active === false ? t("deliverySettings.inactive") : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
				</Pressable>
			)}
			ListFooterComponent={
				<View style={{ marginTop: 16 }}>
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
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 48 },
	row: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4, minHeight: 44 },
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
