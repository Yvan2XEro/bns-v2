import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { cityLabel, districtLabel } from "@/src/lib/sellerOrders";
import type { OrderView } from "@/src/types/order";
import { inkOf } from "../checkout/fill";
import { TotalTag } from "../checkout/TotalTag";
import { useShopTheme } from "../shop/theme";
import { Card, purchaseText } from "./ui";

/** Items, amounts and delivery details: everything here is read, nothing acts. */
export function PurchaseSummary({ order }: { order: OrderView }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const money = (amount: number) => formatPrice(amount, lang);
	const { delivery } = order;

	const row = (label: string, value: string) => (
		<View style={styles.amount}>
			<Text style={[purchaseText.body, { color: c.body }]}>{label}</Text>
			<Text style={[styles.value, { color: c.text }]}>{value}</Text>
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
								style={[
									styles.thumb,
									styles.thumbEmpty,
									{ backgroundColor: c.primarySoft },
								]}
							>
								<Ionicons name="cube-outline" size={22} color={inkOf(c)} />
							</View>
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
						<Text style={[styles.price, { color: c.text }]}>
							{money(item.lineSubtotal)}
						</Text>
					</View>
				))}
			</Card>

			<Card title={t("purchases.amounts")}>
				{row(t("purchases.subtotal"), money(order.amounts.subtotal))}
				{row(t("purchases.deliveryFee"), money(order.amounts.deliveryFee))}
				<View
					style={[styles.total, { borderTopColor: c.border }]}
					accessible
					accessibilityLabel={`${t("purchases.total")} ${money(order.amounts.total)}`}
				>
					<Text style={[styles.totalLabel, { color: c.text }]}>
						{t("purchases.total")}
					</Text>
					<TotalTag amount={money(order.amounts.total)} />
				</View>
				<Text style={[purchaseText.muted, { color: c.muted }]}>
					{order.paymentMethod === "cod"
						? t("purchases.paymentCod")
						: t("purchases.paymentMobileMoney")}
				</Text>
			</Card>

			<Card title={t("purchases.deliveryDetails")}>
				<InfoLine
					icon={
						delivery.method === "pickup"
							? "storefront-outline"
							: "bicycle-outline"
					}
					title={
						delivery.method === "pickup"
							? t("purchases.deliveryPickup")
							: t("purchases.deliverySeller")
					}
					body={
						delivery.etaText
							? t("purchases.deliveryEta", { eta: delivery.etaText })
							: null
					}
				/>
				{delivery.pickupPoint ? (
					<InfoLine
						icon="location-outline"
						title={delivery.pickupPoint.address ?? t("purchases.pickupPoint")}
						body={delivery.pickupPoint.landmark}
					/>
				) : (
					<InfoLine
						icon="location-outline"
						title={[districtLabel(delivery), cityLabel(delivery.city)]
							.filter(Boolean)
							.join(", ")}
						body={delivery.landmark}
					/>
				)}
				<InfoLine
					icon="person-outline"
					title={delivery.recipientName}
					body={delivery.phone}
				/>
				{delivery.instructions ? (
					<InfoLine
						icon="chatbox-ellipses-outline"
						title={t("purchases.deliveryInstructions")}
						body={delivery.instructions}
					/>
				) : null}
			</Card>
		</>
	);
}

function InfoLine({
	icon,
	title,
	body,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	title: string;
	body?: string | null;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.infoLine}>
			<Ionicons
				name={icon}
				size={18}
				color={inkOf(c)}
				style={styles.infoIcon}
			/>
			<View style={styles.itemMain}>
				<Text style={[purchaseText.strong, { color: c.text }]}>{title}</Text>
				{body ? (
					<Text style={[purchaseText.muted, { color: c.muted }]}>{body}</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	infoLine: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	infoIcon: { marginTop: 1 },
	item: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
	thumb: { width: 52, height: 52, borderRadius: 12 },
	thumbEmpty: { alignItems: "center", justifyContent: "center" },
	itemMain: { flex: 1, minWidth: 0, gap: 2 },
	amount: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
	},
	value: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	price: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
	total: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	totalLabel: { fontSize: 18, lineHeight: 26, fontFamily: Fonts.displayBold },
});
