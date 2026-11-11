import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { districtName } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { QuoteResponse } from "@/src/types/order";
import { Changed, LinkButton, Row } from "./SummaryParts";
import { TotalTag } from "./TotalTag";

/** The art. 17 summary. `changed` holds `quoteDifferences`' keys. */
export function OrderSummaryCard({
	quote,
	changed,
	locale,
}: {
	quote: QuoteResponse;
	changed: Set<string>;
	locale: "fr" | "en";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const money = (amount: number) => formatPrice(amount, locale);
	const { lines, amounts, delivery, paymentMethod } = quote.summary;
	const address = delivery.address;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<Text
					style={[styles.heading, { color: c.text }]}
					accessibilityRole="header"
				>
					{t("checkout.summary")}
				</Text>
				<LinkButton
					label={t("checkout.editCart")}
					onPress={() => router.navigate("/cart")}
				/>
			</View>
			{lines.map((line, i) => (
				<View key={`${line.title}-${line.variantLabel}`} style={styles.lineRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.lineTitle, { color: c.text }]}>
							{line.title}
						</Text>
						{line.variantLabel ? (
							<Text style={[styles.meta, { color: c.muted }]}>
								{line.variantLabel}
							</Text>
						) : null}
						<Text style={[styles.meta, { color: c.muted }]}>
							<Changed on={changed.has(`line:${i}`)}>
								{`${t("checkout.quantity", { quantity: line.quantity })} × ${money(line.unitPrice)}`}
							</Changed>
						</Text>
					</View>
					<Text style={[styles.lineAmount, { color: c.text }]}>
						{money(line.lineSubtotal)}
					</Text>
				</View>
			))}
			<View style={[styles.divider, { borderTopColor: c.border }]} />
			<Row label={t("checkout.subtotal")}>
				<Changed on={changed.has("subtotal")}>
					{money(amounts.subtotal)}
				</Changed>
			</Row>
			<Row label={t("checkout.fee")}>
				<Changed on={changed.has("deliveryFee")}>
					{amounts.deliveryFee === 0
						? t("checkout.free")
						: money(amounts.deliveryFee)}
				</Changed>
			</Row>
			{paymentMethod === "mobile_money" && amounts.buyerProtectionFee > 0 ? (
				<Row label={t("payments.summary_protectionFee")}>
					{money(amounts.buyerProtectionFee)}
				</Row>
			) : null}
			<View
				style={[styles.totalRow, { borderTopColor: c.border }]}
				accessible
				accessibilityLabel={`${t("checkout.total")} ${money(amounts.total)}${
					changed.has("total") ? ` (${t("checkout.changed")})` : ""
				}`}
			>
				<Text style={[styles.totalLabel, { color: c.text }]}>
					{t("checkout.total")}
				</Text>
				<View style={styles.totalValue}>
					<TotalTag amount={money(amounts.total)} />
					{changed.has("total") ? (
						<Text style={[styles.changed, { color: c.warningText }]}>
							{t("checkout.changed")}
						</Text>
					) : null}
				</View>
			</View>
			<View style={[styles.divider, { borderTopColor: c.border }]} />
			<View style={styles.row}>
				<Text
					style={[
						styles.meta,
						{ color: c.text, fontFamily: Fonts.bodySemibold },
					]}
				>
					{t("checkout.deliverTo")}
				</Text>
				<LinkButton
					label={t("checkout.editAddress")}
					onPress={() => router.dismissTo("/checkout/address")}
				/>
			</View>
			<Text
				style={[styles.meta, { color: c.body }]}
			>{`${address.recipientName} · ${address.phone}`}</Text>
			<Text style={[styles.meta, { color: c.muted }]}>
				{address.landmark
					? `${districtName(address)} — ${address.landmark}`
					: districtName(address)}
			</Text>
			<View style={styles.row}>
				<Text
					style={[
						styles.meta,
						{ color: c.text, fontFamily: Fonts.bodySemibold },
					]}
				>
					{delivery.method === "pickup"
						? t("checkout.pickupAtShop")
						: t("checkout.sellerDelivery")}
				</Text>
				<LinkButton
					label={t("checkout.editDelivery")}
					onPress={() => router.dismissTo("/checkout/delivery")}
				/>
			</View>
			<Text style={[styles.meta, { color: c.muted }]}>
				<Changed on={changed.has("etaText")}>
					{t("checkout.eta", { eta: delivery.etaText })}
				</Changed>
			</Text>
			{delivery.pickupPoint ? (
				<Text style={[styles.meta, { color: c.muted }]}>
					{delivery.pickupPoint.address}
				</Text>
			) : null}
			<Text style={[styles.meta, { color: c.body }]}>
				{`${t("checkout.paymentMethod")} · ${
					paymentMethod === "mobile_money"
						? t("payments.method_protected")
						: t("checkout.paymentCod")
				}`}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 16,
		gap: 10,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	lineRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	heading: { fontSize: 18, lineHeight: 23, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
	lineTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	lineAmount: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
	totalRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingTop: 10,
		marginTop: 2,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	totalLabel: { fontSize: 17, fontFamily: Fonts.displayBold },
	totalValue: { alignItems: "flex-end", gap: 2, flexShrink: 1 },
	changed: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 2 },
});
