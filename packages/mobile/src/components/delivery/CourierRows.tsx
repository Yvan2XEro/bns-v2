import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { CourierShipmentRow } from "@/src/hooks/useRiderShipments";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { type RiderGroup, readDestination } from "@/src/lib/riderShipment";
import { courierStatusLabel } from "@/src/lib/shipmentStatus";

export const GROUP_LABEL: Record<RiderGroup, string> = {
	today: "shipmentPanel.groupToday",
	retake: "shipmentPanel.groupRetake",
	done: "shipmentPanel.groupDone",
};

export type CourierListItem =
	| { kind: "header"; key: string; group: RiderGroup }
	| { kind: "row"; key: string; row: CourierShipmentRow };

export function CourierRow({
	row,
	onPress,
	children,
}: {
	row: CourierShipmentRow;
	onPress?: () => void;
	children?: ReactNode;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const destination = readDestination(row.destination);
	const address = [destination.landmark, destination.district, destination.city]
		.filter(Boolean)
		.join(", ");
	const status = t(courierStatusLabel(row.status));
	// Failed and delivered must not look alike: the colour follows the
	// outcome, the words stay (same rule as the rider list's own row).
	const tone =
		row.status === "failed"
			? { bg: c.dangerSoft, fg: c.dangerText }
			: row.status === "delivered"
				? { bg: c.successSoft, fg: c.successText }
				: { bg: c.neutralSoft, fg: c.neutralText };
	const cash = row.codCollection?.expectedAmount ?? 0;
	const cashLabel =
		cash > 0
			? t("shipmentPanel.cashTag", {
					amount: formatPrice(cash, i18n.language),
				})
			: null;
	return (
		<View
			style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
		>
			<Pressable
				onPress={onPress}
				disabled={!onPress}
				accessibilityRole={onPress ? "button" : "text"}
				accessibilityLabel={[row.shipmentNumber, status, cashLabel, address]
					.filter(Boolean)
					.join(", ")}
				style={({ pressed }) => [
					styles.press,
					{ opacity: pressed && onPress ? 0.7 : 1 },
				]}
			>
				<View style={styles.body}>
					<Text style={[styles.number, { color: c.text }]}>
						{row.shipmentNumber}
					</Text>
					{address ? (
						<Text style={[styles.address, { color: c.text }]}>{address}</Text>
					) : null}
					<View style={styles.metaRow}>
						<View style={[styles.pill, { backgroundColor: tone.bg }]}>
							<Text style={[styles.pillText, { color: tone.fg }]}>
								{status}
							</Text>
						</View>
						{cashLabel ? (
							<View
								style={[
									styles.pill,
									{
										backgroundColor: c.isDark
											? Colors.dark.sun
											: Colors.light.sun,
									},
								]}
							>
								<Text style={styles.cashText}>{cashLabel}</Text>
							</View>
						) : null}
						{row.rider?.name ? (
							<Text
								style={[styles.rider, { color: c.muted }]}
								numberOfLines={1}
							>
								{row.rider.name}
							</Text>
						) : null}
					</View>
				</View>
				{onPress ? (
					<Ionicons name="chevron-forward" size={20} color={c.muted} />
				) : null}
			</Pressable>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 8,
	},
	press: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	body: { flex: 1, gap: 4 },
	number: { fontFamily: Fonts.displayBold, fontSize: 17 },
	address: { fontFamily: Fonts.bodySemibold, fontSize: 16, lineHeight: 22 },
	metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
	pillText: { fontFamily: Fonts.bodySemibold, fontSize: 12 },
	cashText: {
		color: Colors.light.sunForeground,
		fontFamily: Fonts.displayExtrabold,
		fontSize: 13,
		fontVariant: ["tabular-nums"],
	},
	rider: { flexShrink: 1, fontFamily: Fonts.body, fontSize: 13 },
});
