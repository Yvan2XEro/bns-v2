import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { pickupHours } from "../../../../api/src/contracts/publicPickupPoint";
import { LAUNCH_CITIES } from "../../../../api/src/lib/launchCities";
import { useAppConfig } from "../../contexts/AppConfigContext";
import { usePickupPoints } from "../../hooks/usePickupPoints";
import { googleMapsUrl } from "../../lib/checkoutForm";
import { useTranslation } from "../../lib/i18n";
import { formatXaf } from "../../lib/orderMoney";
import { SkeletonRow } from "../SkeletonCard";
import { useShopTheme } from "./theme";

export function PickupPoints({ handle }: { handle: string }) {
	const { t, i18n } = useTranslation();
	const c = useShopTheme();
	const locale = i18n.language.startsWith("fr") ? "fr" : "en";
	const { ordersEnabled, deliveryZonesEnabled } = useAppConfig();
	const query = usePickupPoints(handle);
	if (!ordersEnabled || !deliveryZonesEnabled) return null;
	if (query.isPending)
		return (
			<View accessibilityLabel={t("shop.pickupLoading")}>
				<SkeletonRow />
			</View>
		);
	if (query.isError)
		return (
			<Text style={[styles.copy, { color: c.muted }]}>
				{t("shop.pickupUnavailable")}
			</Text>
		);
	if (!query.data?.length) return null;
	return (
		<View
			style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("shop.pickupTitle")}
			</Text>
			{query.data.map((point) => (
				<View key={point.id} style={[styles.point, { borderColor: c.border }]}>
					<Text style={[styles.title, { color: c.text }]}>{point.name}</Text>
					<Text style={[styles.copy, { color: c.body }]}>
						{LAUNCH_CITIES[point.city].label} · {point.district}
					</Text>
					{point.address && (
						<Text style={[styles.copy, { color: c.body }]}>
							{point.address}
						</Text>
					)}
					<Text style={[styles.copy, { color: c.body }]}>{point.landmark}</Text>
					{pickupHours(point.openingHours, locale).map((hours) => (
						<Text key={hours} style={[styles.copy, { color: c.muted }]}>
							{hours}
						</Text>
					))}
					{point.openingHoursNote && (
						<Text style={[styles.copy, { color: c.muted }]}>
							{point.openingHoursNote}
						</Text>
					)}
					<Text style={[styles.copy, { color: c.body }]}>
						{t("shop.pickupFee", {
							fee:
								point.pickupFee === 0
									? t("shop.pickupFree")
									: formatXaf(point.pickupFee, locale),
						})}
					</Text>
					<Text style={[styles.copy, { color: c.muted }]}>
						{t("shop.pickupPreparation", {
							hours: point.preparationHours,
							days: point.holdDays,
						})}
					</Text>
					<Pressable
						accessibilityRole="link"
						accessibilityLabel={t("shop.pickupMaps", { name: point.name })}
						style={styles.link}
						onPress={() =>
							Linking.openURL(googleMapsUrl(point.gps.lat, point.gps.lng))
						}
					>
						<Text style={[styles.copy, { color: c.primary }]}>
							{t("shop.pickupMaps", { name: point.name })}
						</Text>
					</Pressable>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 16,
		gap: 12,
	},
	point: { gap: 5, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
	title: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	copy: { fontFamily: Fonts.body, fontSize: 13 },
	link: { minHeight: 44, justifyContent: "center" },
});
