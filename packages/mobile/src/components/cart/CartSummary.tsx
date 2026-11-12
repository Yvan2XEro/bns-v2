import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { fillOf } from "@/src/components/checkout/fill";
import { TotalTag } from "@/src/components/checkout/TotalTag";
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
	const { withdrawalDays, protectedPaymentEnabled } = useAppConfig();
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
					<Text style={[styles.label, { color: c.body }]}>
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
					<Notice
						icon="pricetag-outline"
						color={c.warningText}
						text={t("cart.priceChangedNotice", {
							count: totals.priceChangedCount,
						})}
					/>
				) : null}
				{totals.unavailableCount > 0 ? (
					<Notice
						icon="alert-circle-outline"
						color={c.dangerText}
						text={t("cart.unavailableBlocking")}
					/>
				) : null}
				{cart.shopOrderable ? null : (
					<Notice
						icon="alert-circle-outline"
						color={c.dangerText}
						text={t("cart.shopNotOrderable")}
					/>
				)}
			</View>
			<View style={[styles.note, { backgroundColor: c.primarySoft }]}>
				<Ionicons
					name="cash-outline"
					size={18}
					color={c.link}
					style={styles.noteIcon}
				/>
				<Text style={[styles.noteText, { color: c.link }]}>
					{t(
						protectedPaymentEnabled ? "cart.codNoteProtected" : "cart.codNote",
						{ days: withdrawalDays },
					)}
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
	return (
		<CheckoutBar
			total={formatPrice(cart.subtotal, locale)}
			ready={canCheckout(cart)}
		/>
	);
}

/**
 * The pinned total and checkout button, shared by the one-shop and the
 * multi-shop cart. `note` says why the button is off when it is.
 */
export function CheckoutBar({
	total,
	ready,
	label,
	note,
}: {
	total: string;
	ready: boolean;
	label?: string;
	note?: string | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const fill = fillOf(c);
	const totalLabel = label ?? t("cart.subtotal");

	return (
		<View
			style={[
				styles.barWrap,
				{
					backgroundColor: c.card,
					borderTopColor: c.border,
					paddingBottom: insets.bottom + 12,
				},
			]}
		>
			{note && !ready ? (
				<View style={styles.notice} accessibilityLiveRegion="polite">
					<Ionicons
						name="alert-circle-outline"
						size={16}
						color={c.dangerText}
						style={styles.noteIcon}
					/>
					<Text style={[styles.noticeText, { color: c.dangerText }]}>
						{note}
					</Text>
				</View>
			) : null}
			<View style={styles.bar}>
				<View style={styles.barTotal}>
					<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
						{totalLabel}
					</Text>
					<TotalTag
						amount={total}
						size="md"
						accessibilityLabel={`${totalLabel} ${total}`}
					/>
				</View>
				<Pressable
					onPress={() => router.push("/checkout/address")}
					disabled={!ready}
					accessibilityRole="button"
					accessibilityLabel={t("cart.checkout")}
					accessibilityState={{ disabled: !ready }}
					style={({ pressed }) => [
						styles.cta,
						{
							backgroundColor: fill.bg,
							opacity: ready ? (pressed ? 0.85 : 1) : 0.45,
						},
					]}
				>
					<Text style={[styles.ctaText, { color: fill.fg }]}>
						{t("cart.checkout")}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

function Notice({
	icon,
	color,
	text,
}: {
	icon: "pricetag-outline" | "alert-circle-outline";
	color: string;
	text: string;
}) {
	return (
		<View style={styles.notice}>
			<Ionicons name={icon} size={16} color={color} style={styles.noteIcon} />
			<Text style={[styles.noticeText, { color }]}>{text}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { marginTop: 12, gap: 12 },
	card: {
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
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	label: {
		flex: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	amount: {
		fontSize: 18,
		lineHeight: 24,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
	notice: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
	noticeText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 19,
		fontFamily: Fonts.bodyMedium,
	},
	noteIcon: { marginTop: 1 },
	note: {
		flexDirection: "row",
		gap: 8,
		padding: 12,
		borderRadius: 14,
		alignItems: "flex-start",
	},
	noteText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.body },
	barTotal: { gap: 4, flexShrink: 1 },
	barWrap: {
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: 1,
	},
	bar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 16,
	},
	cta: {
		flex: 1,
		maxWidth: 240,
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
});
