import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { OrderView } from "@/src/types/order";

export function OrderItemsCard({ order }: { order: OrderView }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const money = (amount: number) => formatXaf(amount, lang);
	const { amounts, commission } = order;

	const totals: [string, number][] = [
		[t("sellerOrders.subtotal"), amounts.subtotal],
		[t("sellerOrders.deliveryFee"), amounts.deliveryFee],
	];

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
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
			<View style={styles.line}>
				<Text style={[styles.total, styles.flex, { color: c.text }]}>
					{t("sellerOrders.total")}
				</Text>
				<Text style={[styles.total, { color: c.text }]}>
					{money(amounts.total)}
				</Text>
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
	card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
	title: { fontSize: 16, fontFamily: Fonts.displayBold },
	line: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
	flex: { flex: 1 },
	itemTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	amount: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	divider: { height: StyleSheet.hairlineWidth },
	total: { fontSize: 15, fontFamily: Fonts.bodyBold },
});
