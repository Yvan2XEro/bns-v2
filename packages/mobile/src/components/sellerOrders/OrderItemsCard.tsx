import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { AmountTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { OrderView } from "@/src/types/order";

export function OrderItemsCard({ order }: { order: OrderView }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const money = (amount: number) => formatPrice(amount, lang);
	const { amounts, commission } = order;

	const totals: [string, number][] = [
		[t("sellerOrders.subtotal"), amounts.subtotal],
		[t("sellerOrders.deliveryFee"), amounts.deliveryFee],
	];

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text
				accessibilityRole="header"
				style={[styles.title, { color: c.text }]}
			>
				{t("sellerOrders.items")}
			</Text>
			{order.items.map((item) => (
				<View key={item.id} style={styles.line}>
					<View style={styles.flex}>
						<Text style={[styles.itemTitle, { color: c.text }]}>
							{item.title}
						</Text>
						{item.variantLabel ? (
							<Text style={[styles.meta, { color: c.muted }]}>
								{item.variantLabel}
							</Text>
						) : null}
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("sellerOrders.lineQuantity", {
								quantity: item.quantity,
								price: money(item.unitPrice),
							})}
						</Text>
					</View>
					<Text style={[styles.amount, { color: c.text }]}>
						{money(item.lineSubtotal)}
					</Text>
				</View>
			))}
			<View style={[styles.divider, { backgroundColor: c.border }]} />
			{totals.map(([label, amount]) => (
				<View key={label} style={styles.line}>
					<Text style={[styles.meta, styles.flex, { color: c.body }]}>
						{label}
					</Text>
					<Text style={[styles.meta, { color: c.body }]}>{money(amount)}</Text>
				</View>
			))}
			<View style={[styles.line, styles.totalLine]}>
				<Text style={[styles.total, styles.flex, { color: c.text }]}>
					{t("sellerOrders.total")}
				</Text>
				<AmountTag label={money(amounts.total)} />
			</View>
			{commission ? (
				<View style={styles.line}>
					<Text style={[styles.meta, styles.flex, { color: c.muted }]}>
						{t("sellerOrders.commissionRate", {
							rate: commission.rateBps / 100,
						})}
					</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{money(commission.amount)}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 10,
	},
	title: { fontSize: 18, lineHeight: 23, fontFamily: Fonts.displayBold },
	line: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
	totalLine: { alignItems: "center", marginTop: 2 },
	flex: { flex: 1 },
	itemTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	amount: { fontSize: 15, fontFamily: Fonts.displayBold },
	divider: { height: StyleSheet.hairlineWidth },
	total: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
