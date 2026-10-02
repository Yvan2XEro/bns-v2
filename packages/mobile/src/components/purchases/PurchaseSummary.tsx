import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { OrderView } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { Card, purchaseText } from "./ui";

/** Items, amounts and delivery details: everything here is read, nothing acts. */
export function PurchaseSummary({ order }: { order: OrderView }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const { launchCities } = useAppConfig();
	const money = (amount: number) => formatXaf(amount, lang);
	const { delivery } = order;
	const city =
		launchCities.find((option) => option.key === delivery.city)?.label ??
		delivery.city;

	const row = (label: string, value: string, strong = false) => (
		<View style={styles.amount}>
			<Text style={[purchaseText.muted, { color: c.muted }]}>{label}</Text>
			<Text
				style={[
					strong ? purchaseText.strong : purchaseText.body,
					{ color: c.text },
				]}
			>
				{value}
			</Text>
		</View>
	);

	return (
		<>
			<Card title={t("purchases.items")}>
				{order.items.map((item) => (
					<View key={item.id} style={styles.item}>
						{item.imageUrl ? (
							<Image
								source={{ uri: item.imageUrl }}
								style={styles.thumb}
								contentFit="cover"
							/>
						) : (
							<View
								style={[styles.thumb, { backgroundColor: c.neutralSoft }]}
							/>
						)}
						<View style={styles.itemMain}>
							<Text style={[purchaseText.strong, { color: c.text }]}>
								{item.title}
							</Text>
							{item.variantLabel ? (
								<Text style={[purchaseText.muted, { color: c.muted }]}>
									{item.variantLabel}
								</Text>
							) : null}
							<Text style={[purchaseText.muted, { color: c.muted }]}>
								{t("purchases.lineQuantity", {
									quantity: item.quantity,
									price: money(item.unitPrice),
								})}
							</Text>
						</View>
						<Text style={[purchaseText.strong, { color: c.text }]}>
							{money(item.lineSubtotal)}
						</Text>
					</View>
				))}
			</Card>

			<Card title={t("purchases.amounts")}>
				{row(t("purchases.subtotal"), money(order.amounts.subtotal))}
				{row(t("purchases.deliveryFee"), money(order.amounts.deliveryFee))}
				{row(t("purchases.total"), money(order.amounts.total), true)}
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{order.paymentMethod === "cod"
						? t("purchases.paymentCod")
						: t("purchases.paymentMobileMoney")}
				</Text>
			</Card>

			<Card title={t("purchases.deliveryDetails")}>
				<Text style={[purchaseText.body, { color: c.text }]}>
					{delivery.method === "pickup"
						? t("purchases.deliveryPickup")
						: t("purchases.deliverySeller")}
				</Text>
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{t("purchases.deliveryEta", { eta: delivery.etaText })}
				</Text>
				{row(
					t("purchases.deliveryRecipient"),
					`${delivery.recipientName}, ${delivery.phone}`,
				)}
				{delivery.pickupPoint
					? row(
							t("purchases.pickupPoint"),
							[delivery.pickupPoint.address, delivery.pickupPoint.landmark]
								.filter(Boolean)
								.join(", "),
						)
					: row(
							t("purchases.deliveryAddress"),
							[city, delivery.districtOther, delivery.landmark]
								.filter(Boolean)
								.join(", "),
						)}
				{delivery.instructions ? (
					<Text style={[purchaseText.muted, { color: c.muted }]}>
						{delivery.instructions}
					</Text>
				) : null}
			</Card>
		</>
	);
}

const styles = StyleSheet.create({
	item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	thumb: { width: 52, height: 52, borderRadius: 10 },
	itemMain: { flex: 1, minWidth: 0, gap: 2 },
	amount: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
