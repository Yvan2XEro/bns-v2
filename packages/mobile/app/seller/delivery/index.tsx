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
import { AmountTag, StatusTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useDeliveryZones } from "@/src/hooks/useDeliverySettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { districtLabel, groupZonesByCity } from "@/src/lib/deliveryZoneForm";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { DeliveryZone } from "../../../../api/src/payload-types";

type Row =
	| { kind: "city"; key: string; city: string }
	| { kind: "zone"; key: string; zone: DeliveryZone };

function ZoneRow({ zone }: { zone: DeliveryZone }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const districts = (zone.districts ?? []).map(
		(d) => districtLabel(d.key) ?? d.key,
	);
	return (
		<Pressable
			onPress={() =>
				router.push({
					pathname: "/seller/delivery/zone/[id]",
					params: { id: String(zone.id) },
				})
			}
			accessibilityRole="button"
			accessibilityLabel={zone.name}
			style={({ pressed }) => [
				styles.row,
				{ borderColor: c.border, backgroundColor: c.card },
				pressed && styles.pressed,
			]}
		>
			<View style={styles.rowBody}>
				<View style={styles.rowHead}>
					<Text
						style={[
							styles.rowTitle,
							{ color: zone.active === false ? c.muted : c.text },
						]}
						numberOfLines={1}
					>
						{zone.name}
					</Text>
					{zone.active === false ? (
						<StatusTag label={t("deliverySettings.inactive")} tone="neutral" />
					) : null}
				</View>
				<Text style={[styles.rowText, { color: c.body }]} numberOfLines={2}>
					{districts.length
						? districts.join(", ")
						: t("deliverySettings.wholeCity")}
				</Text>
				<View style={styles.rowFoot}>
					<AmountTag
						label={t("deliverySettings.zoneFee", {
							fee: formatPrice(zone.fee, i18n.language),
						})}
						size="sm"
					/>
					<Text style={[styles.rowMeta, { color: c.muted }]} numberOfLines={2}>
						{[
							t("deliverySettings.zoneEta", {
								min: zone.etaMinHours,
								max: zone.etaMaxHours,
							}),
							zone.method === "courier"
								? t("deliverySettings.methodCourier")
								: t("deliverySettings.methodSeller"),
							zone.codAllowed === false ? t("deliverySettings.codOff") : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
				</View>
			</View>
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
		</Pressable>
	);
}

function ZonesList({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const zones = useDeliveryZones(shopId);
	if (zones.isPending)
		return (
			<View style={styles.loading}>
				<ListSkeleton rows={4} />
			</View>
		);
	if (zones.isError)
		return (
			<EmptyState
				illustration="notFound"
				title={t("deliverySettings.zonesTitle")}
				subtitle={resolveErrorMessage(zones.error, t)}
				ctaLabel={t("common.retry")}
				onCta={() => zones.refetch()}
			/>
		);
	const rows: Row[] = groupZonesByCity(zones.data).flatMap((group) => [
		{ kind: "city" as const, key: group.city, city: group.city },
		...group.zones.map((zone) => ({
			kind: "zone" as const,
			key: String(zone.id),
			zone,
		})),
	]);
	return (
		<ScreenColumn width="wide">
			<FlashList
				data={rows}
				keyExtractor={(row) => row.key}
				getItemType={(row) => row.kind}
				contentContainerStyle={styles.content}
				ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
				ListEmptyComponent={
					<View
						style={[
							styles.empty,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						<Ionicons name="bicycle-outline" size={28} color={c.link} />
						<Text style={[styles.rowText, { color: c.body }]}>
							{t("deliverySettings.zonesEmpty")}
						</Text>
					</View>
				}
				renderItem={({ item }) =>
					item.kind === "city" ? (
						<Text
							accessibilityRole="header"
							style={[styles.city, { color: c.text }]}
						>
							{item.city === "douala" ? "Douala" : "Yaoundé"}
						</Text>
					) : (
						<ZoneRow zone={item.zone} />
					)
				}
				ListFooterComponent={
					<View style={{ gap: 10, marginTop: 16 }}>
						<SheetButton
							label={t("deliverySettings.addZone")}
							onPress={() =>
								router.push({
									pathname: "/seller/delivery/zone/[id]",
									params: { id: "new" },
								})
							}
						/>
						<SheetButton
							label={t("deliverySettings.pickupPoints")}
							tone="secondary"
							onPress={() => router.push("/seller/delivery/locations")}
						/>
					</View>
				}
			/>
		</ScreenColumn>
	);
}

export default function DeliveryZonesScreen() {
	const { t } = useTranslation();
	return (
		<SettingsShell title={t("deliverySettings.zonesTitle")}>
			{(shopId) => <ZonesList shopId={shopId} />}
		</SettingsShell>
	);
}

const styles = StyleSheet.create({
	loading: { paddingTop: 16 },
	content: { padding: 16, paddingBottom: 48 },
	city: {
		fontSize: 19,
		lineHeight: 24,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.3,
		marginTop: 12,
		marginBottom: 4,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		minHeight: 48,
	},
	pressed: { opacity: 0.85 },
	rowBody: { flex: 1, gap: 6 },
	rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
	rowTitle: { flexShrink: 1, fontSize: 16, fontFamily: Fonts.displayBold },
	rowText: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.body },
	rowFoot: { flexDirection: "row", alignItems: "center", gap: 10 },
	rowMeta: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	empty: {
		alignItems: "center",
		gap: 10,
		padding: 24,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
});
