import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { canCheckout, cartTotals } from "@/src/lib/cartLines";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
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
	const { withdrawalDays } = useAppConfig();
	const totals = cartTotals(cart.lines);

	return (
		<View style={styles.wrap}>
			<View
				style={[
					styles.card,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<View style={styles.row}>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("cart.subtotal")} ·{" "}
						{t("cart.itemCount", { count: totals.itemCount })}
					</Text>
					<Text style={[styles.amount, { color: c.text }]}>
						{formatPrice(cart.subtotal, locale)}
					</Text>
				</View>
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("cart.deliveryNext")}
				</Text>
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
			</View>
			<View style={[styles.note, { backgroundColor: c.primarySoft }]}>
				<Ionicons name="cash-outline" size={16} color={c.primary} />
				<Text style={[styles.noteText, { color: c.primary }]}>
					{t("cart.codNote", { days: withdrawalDays })}
				</Text>
			</View>
		</View>
	);
}

/** The total and the checkout button, pinned under the cart. */
export function CartCheckoutBar({
	cart,
	locale,
}: {
	cart: CartView;
	locale: "fr" | "en";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const ready = canCheckout(cart);

	return (
		<View
			style={[
				styles.bar,
				{
					backgroundColor: c.card,
					borderTopColor: c.border,
					paddingBottom: insets.bottom + 12,
				},
			]}
		>
			<View>
				<Text style={[styles.meta, { color: c.muted }]}>
					{t("cart.subtotal")}
				</Text>
				<Text style={[styles.amount, { color: c.text }]}>
					{formatPrice(cart.subtotal, locale)}
				</Text>
			</View>
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
	wrap: { marginTop: 12, gap: 12 },
	card: { padding: 16, gap: 8, borderRadius: 16, borderWidth: 1 },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	meta: { fontSize: 13, fontFamily: Fonts.body },
	amount: { fontSize: 18, fontFamily: Fonts.displayBold },
	note: {
		flexDirection: "row",
		gap: 8,
		padding: 12,
		borderRadius: 14,
		alignItems: "flex-start",
	},
	noteText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: Fonts.body },
	bar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: 1,
	},
	cta: {
		flex: 1,
		maxWidth: 240,
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
