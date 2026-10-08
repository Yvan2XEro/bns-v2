import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useShopOrderShipments } from "@/src/hooks/useShipmentActions";
import { useTranslation } from "@/src/lib/i18n";
import { shopShipmentLinks } from "@/src/lib/shipmentActions";

/** One link per shipment of the order, to the screen a shop member acts on. */
export function OrderShipmentsLinks({ orderId }: { orderId: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const shipments = useShopOrderShipments(orderId).data ?? [];
	return (
		<>
			{shopShipmentLinks(shipments).map((link) => (
				<Pressable
					key={link.id}
					accessibilityRole="link"
					accessibilityLabel={t("shipmentPanel.openShipment", {
						number: link.number,
					})}
					onPress={() => router.push(link.href)}
					style={{ minHeight: 44, justifyContent: "center" }}
				>
					<Text style={{ color: c.primary, fontFamily: Fonts.bodySemibold }}>
						{t("shipmentPanel.openShipment", { number: link.number })}
					</Text>
				</Pressable>
			))}
		</>
	);
}
