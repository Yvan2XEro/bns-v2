import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { districtName } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { QuoteResponse } from "@/src/types/order";
import { Changed, LinkButton, Row } from "./SummaryParts";

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
	const money = (amount: number) => formatXaf(amount, locale);
	const { lines, amounts, delivery } = quote.summary;
	const address = delivery.address;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<Text style={[styles.heading, { color: c.text }]}>
					{t("checkout.summary")}
				</Text>
				<LinkButton
					label={t("checkout.editCart")}
					onPress={() => router.navigate("/cart")}
				/>
			</View>
			{lines.map((line, i) => (
				<View key={`${line.title}-${line.variantLabel}`} style={styles.row}>
					<View style={{ flex: 1 }}>
						<Text
							style={[
								styles.meta,
								{ color: c.text, fontFamily: Fonts.bodySemibold },
							]}
						>
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
					<Text style={[styles.meta, { color: c.text }]}>
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
			<Row label={t("checkout.total")} strong>
				<Changed on={changed.has("total")}>{money(amounts.total)}</Changed>
			</Row>
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
				{`${t("checkout.paymentMethod")} · ${t("checkout.paymentCod")}`}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 14,
		gap: 8,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	heading: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 2 },
});
