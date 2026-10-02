import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { canCheckout, cartTotals } from "@/src/lib/cartLines";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type { CartView } from "@/src/types/order";

/** The server's subtotal is authoritative; the totals only count and warn. */
export function CartSummary({
	cart,
	locale,
}: {
	cart: CartView;
	locale: "fr" | "en";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const totals = cartTotals(cart.lines);
	const ready = canCheckout(cart);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("cart.subtotal")} ·{" "}
					{t("cart.itemCount", { count: totals.itemCount })}
				</Text>
				<Text style={[styles.total, { color: c.text }]}>
					{formatXaf(cart.subtotal, locale)}
				</Text>
			</View>
			{totals.priceChangedCount > 0 ? (
				<Text style={[styles.meta, { color: c.warningText }]}>
					{t("cart.priceChangedNotice", { count: totals.priceChangedCount })}
				</Text>
			) : null}
			{totals.unavailableCount > 0 ? (
				<Text style={[styles.meta, { color: c.dangerText }]}>
					{t("cart.unavailableBlocking")}
				</Text>
			) : null}
			{cart.shopOrderable ? null : (
				<Text style={[styles.meta, { color: c.dangerText }]}>
					{t("cart.shopNotOrderable")}
				</Text>
			)}
			<Pressable
				onPress={() => router.push("/checkout/address")}
				disabled={!ready}
				accessibilityRole="button"
				accessibilityLabel={t("cart.checkout")}
				accessibilityState={{ disabled: !ready }}
				style={[
					styles.cta,
					{ backgroundColor: c.primary, opacity: ready ? 1 : 0.5 },
				]}
			>
				<Text style={styles.ctaText}>{t("cart.checkout")}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		marginTop: 12,
		padding: 16,
		gap: 10,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	meta: { fontSize: 13, fontFamily: Fonts.body },
	total: { fontSize: 20, fontFamily: Fonts.displayBold },
	cta: {
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
