import { StyleSheet, Text, View } from "react-native";
import { billingStyles as s } from "@/src/components/billing/billingStyles";
import { useLocaleKey } from "@/src/components/billing/useLocaleKey";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatOrderDate, formatXaf } from "@/src/lib/orderMoney";
import { statusLabelKey } from "@/src/lib/orderStatus";
import type { SellerPaymentsOrderRow } from "@/src/types/order";

export function PaymentsOrderRow({ order }: { order: SellerPaymentsOrderRow }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useLocaleKey();
	const money = (value: number) => formatXaf(value, locale);

	return (
		<View
			style={[
				s.card,
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={styles.head}>
				<Text style={[s.cardTitle, { color: c.primary, fontSize: 14 }]}>
					{order.orderNumber}
				</Text>
				<Text style={[s.meta, { color: c.muted }]}>
					{t(statusLabelKey(order.status, "seller"))}
				</Text>
			</View>
			<Line
				label={t("payments.seller_colGoods")}
				value={money(order.goods)}
				c={c}
			/>
			<Line
				label={t("payments.seller_colDelivery")}
				value={money(order.delivery)}
				c={c}
			/>
			<Line
				label={t("payments.seller_colCommission")}
				value={money(order.commissionHt)}
				c={c}
			/>
			<Line
				label={t("payments.seller_colVat")}
				value={money(order.vat)}
				c={c}
			/>
			<Line
				label={t("payments.seller_colNet")}
				value={money(order.netToYou)}
				emphasis
				c={c}
			/>
			<Line
				label={t("payments.seller_colReleaseDate")}
				value={
					order.releaseDate ? formatOrderDate(order.releaseDate, locale) : "—"
				}
				c={c}
			/>
		</View>
	);
}

function Line({
	label,
	value,
	emphasis,
	c,
}: {
	label: string;
	value: string;
	emphasis?: boolean;
	c: ReturnType<typeof useShopTheme>;
}) {
	return (
		<View style={styles.row}>
			<Text style={[s.meta, { color: c.muted, flex: 1 }]}>{label}</Text>
			<Text
				style={[
					s.meta,
					{ color: c.text, fontWeight: emphasis ? "700" : "400" },
				]}
			>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: { gap: 6 },
	head: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 2,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
