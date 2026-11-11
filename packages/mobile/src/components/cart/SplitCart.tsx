import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { fillOf } from "@/src/components/checkout/fill";
import { TotalTag } from "@/src/components/checkout/TotalTag";
import { useShopTheme } from "@/src/components/shop/theme";
import { splitCanCheckout } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { SplitCartGroup, SplitCartView } from "@/src/types/order";
import { CartLineRow } from "./CartLineRow";

/** The multi-shop cart: one card per (storefront, fulfilling) group, totals as the server states them. */
export function SplitCart({
	cart,
	locale,
	busy,
	onQuantity,
	onRemoveLine,
	onRemoveGroup,
}: {
	cart: SplitCartView;
	locale: "fr" | "en";
	busy: boolean;
	onQuantity: (lineId: string, quantity: number) => void;
	onRemoveLine: (lineId: string) => void;
	onRemoveGroup: (group: SplitCartGroup) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const ready = splitCanCheckout(cart);
	const fill = fillOf(c);
	const grand = formatPrice(cart.grandSubtotal, locale);

	return (
		<FlashList<SplitCartGroup>
			data={cart.groups}
			keyExtractor={(group) => group.groupKey}
			contentContainerStyle={styles.list}
			ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
			renderItem={({ item: group }) => (
				<View style={{ gap: 10 }}>
					<View style={styles.head}>
						<Text
							style={[styles.shop, { color: c.text }]}
							accessibilityRole="header"
						>
							{t("checkoutGroup.cartGroupHeading", {
								shop: group.storefrontShop.name,
							})}
						</Text>
						<Pressable
							onPress={() => onRemoveGroup(group)}
							disabled={busy}
							accessibilityRole="button"
							accessibilityLabel={t("checkoutGroup.groupRemove")}
							accessibilityState={{ disabled: busy }}
							style={styles.target}
						>
							<Text style={[styles.remove, { color: c.dangerText }]}>
								{t("cart.remove")}
							</Text>
						</Pressable>
					</View>
					{group.items.map((line) => (
						<CartLineRow
							key={line.id}
							line={line}
							locale={locale}
							busy={busy}
							onQuantity={(quantity) => onQuantity(line.id, quantity)}
							onRemove={() => onRemoveLine(line.id)}
						/>
					))}
					<View style={styles.row}>
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("checkoutGroup.groupSubtotal")}
						</Text>
						<Text style={[styles.amount, { color: c.text }]}>
							{formatPrice(group.subtotal, locale)}
						</Text>
					</View>
				</View>
			)}
			ListFooterComponent={
				<View
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<View style={styles.row}>
						<Text style={[styles.totalLabel, { color: c.text }]}>
							{t("checkoutGroup.grandSubtotal")}
						</Text>
						<TotalTag
							amount={grand}
							accessibilityLabel={`${t("checkoutGroup.grandSubtotal")} ${grand}`}
						/>
					</View>
					{ready ? null : (
						<View style={styles.blocking} accessibilityRole="alert">
							<Ionicons name="alert-circle" size={16} color={c.dangerText} />
							<Text style={[styles.blockingText, { color: c.dangerText }]}>
								{t("cart.unavailableBlocking")}
							</Text>
						</View>
					)}
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
			}
		/>
	);
}

const styles = StyleSheet.create({
	list: { padding: 16 },
	head: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	shop: {
		flex: 1,
		fontSize: 18,
		lineHeight: 23,
		fontFamily: Fonts.displayBold,
	},
	target: { minHeight: 44, minWidth: 44, justifyContent: "center" },
	remove: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	meta: { fontSize: 13, fontFamily: Fonts.body },
	amount: {
		fontSize: 16,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
	totalLabel: { flex: 1, fontSize: 16, fontFamily: Fonts.bodySemibold },
	blocking: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
	blockingText: { flex: 1, fontSize: 13, fontFamily: Fonts.bodyMedium },
	card: {
		marginTop: 16,
		padding: 16,
		gap: 10,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	cta: {
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	ctaText: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
