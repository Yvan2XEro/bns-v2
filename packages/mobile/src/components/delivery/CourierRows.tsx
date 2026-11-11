import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { CourierShipmentRow } from "@/src/hooks/useRiderShipments";
import { useTranslation } from "@/src/lib/i18n";
import { type RiderGroup, readDestination } from "@/src/lib/riderShipment";
import { shipmentStatusLabel } from "@/src/lib/shipmentStatus";

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
	const { t } = useTranslation();
	const destination = readDestination(row.destination);
	const address = [destination.landmark, destination.district, destination.city]
		.filter(Boolean)
		.join(", ");
	const status = t(shipmentStatusLabel("seller", row.status));
	return (
		<View
			style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}
		>
			<Pressable
				onPress={onPress}
				disabled={!onPress}
				accessibilityRole={onPress ? "button" : "text"}
				accessibilityLabel={[row.shipmentNumber, status, address]
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
						<View style={[styles.pill, { backgroundColor: c.neutralSoft }]}>
							<Text style={[styles.pillText, { color: c.neutralText }]}>
								{status}
							</Text>
						</View>
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
	rider: { flexShrink: 1, fontFamily: Fonts.body, fontSize: 13 },
});
