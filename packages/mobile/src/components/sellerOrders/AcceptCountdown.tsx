import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { acceptCountdown } from "@/src/lib/sellerOrders";
import { useMinuteClock } from "./useClock";

export function AcceptCountdown({ acceptBy }: { acceptBy: string | null }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const countdown = acceptCountdown(acceptBy, useMinuteClock());
	if (!countdown) return null;

	const color = countdown.expired
		? c.danger
		: countdown.urgent
			? c.warningText
			: c.muted;
	return (
		<View style={styles.row}>
			<Ionicons name="time-outline" size={14} color={color} />
			<Text style={[styles.text, { color }]}>
				{countdown.expired
					? t("sellerOrders.countdownExpired")
					: t("sellerOrders.countdown", {
							hours: countdown.hours,
							minutes: countdown.minutes,
						})}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", alignItems: "center", gap: 4 },
	text: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
