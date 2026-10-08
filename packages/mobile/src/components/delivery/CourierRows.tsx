import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
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
	return (
		<View
			style={{
				borderRadius: 14,
				borderWidth: 1,
				borderColor: c.border,
				backgroundColor: c.card,
				padding: 14,
				gap: 4,
			}}
		>
			<Pressable
				onPress={onPress}
				disabled={!onPress}
				accessibilityRole={onPress ? "button" : "text"}
				accessibilityLabel={row.shipmentNumber}
				style={{ minHeight: 44, gap: 4 }}
			>
				<Text style={{ color: c.text, fontFamily: Fonts.bodySemibold }}>
					{row.shipmentNumber}
				</Text>
				<Text style={{ color: c.body, fontFamily: Fonts.body }}>
					{[destination.landmark, destination.district, destination.city]
						.filter(Boolean)
						.join(", ")}
				</Text>
				<Text style={{ color: c.muted, fontFamily: Fonts.body, fontSize: 13 }}>
					{t(shipmentStatusLabel("seller", row.status))}
					{row.rider?.name ? ` · ${row.rider.name}` : ""}
				</Text>
			</Pressable>
			{children}
		</View>
	);
}
