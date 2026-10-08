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
import { useDeliveryZones } from "@/src/hooks/useDeliverySettings";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { districtLabel, groupZonesByCity } from "@/src/lib/deliveryZoneForm";
import { useTranslation } from "@/src/lib/i18n";
import type { DeliveryZone } from "../../../../api/src/payload-types";

type Row =
	| { kind: "city"; key: string; city: string }
	| { kind: "zone"; key: string; zone: DeliveryZone };

function ZoneRow({ zone }: { zone: DeliveryZone }) {
	const c = useShopTheme();
	const { t } = useTranslation();
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
			style={[styles.row, { borderColor: c.border, backgroundColor: c.card }]}
		>
			<Text style={[styles.rowTitle, { color: c.text }]}>{zone.name}</Text>
			<Text style={{ color: c.body, fontFamily: Fonts.body }}>
				{districts.length
					? districts.join(", ")
					: t("deliverySettings.wholeCity")}
			</Text>
			<Text style={{ color: c.muted, fontFamily: Fonts.body, fontSize: 13 }}>
				{[
					t("deliverySettings.zoneFee", { fee: zone.fee }),
					t("deliverySettings.zoneEta", {
						min: zone.etaMinHours,
						max: zone.etaMaxHours,
					}),
					zone.method === "courier"
						? t("deliverySettings.methodCourier")
						: t("deliverySettings.methodSeller"),
					zone.codAllowed === false ? t("deliverySettings.codOff") : null,
					zone.active === false ? t("deliverySettings.inactive") : null,
				]
					.filter(Boolean)
					.join(" · ")}
			</Text>
		</Pressable>
	);
}

function ZonesList({ shopId }: { shopId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const zones = useDeliveryZones(shopId);
	if (zones.isPending)
		return <ActivityIndicator style={styles.spinner} color={c.primary} />;
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
		<FlashList
			data={rows}
			keyExtractor={(row) => row.key}
			getItemType={(row) => row.kind}
			contentContainerStyle={styles.content}
			ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
			ListEmptyComponent={
				<Text style={{ color: c.muted, fontFamily: Fonts.body }}>
					{t("deliverySettings.zonesEmpty")}
				</Text>
			}
			renderItem={({ item }) =>
				item.kind === "city" ? (
					<Text style={[styles.city, { color: c.text }]}>
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
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 48 },
	city: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		marginTop: 8,
		marginBottom: 4,
	},
	row: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4, minHeight: 44 },
	rowTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
