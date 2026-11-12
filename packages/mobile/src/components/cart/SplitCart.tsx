import { FlashList } from "@shopify/flash-list";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { splitCanCheckout } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type { SplitCartGroup, SplitCartView } from "@/src/types/order";
import { CartLineRow } from "./CartLineRow";
import { CheckoutBar } from "./CartSummary";

/** The multi-shop cart: one card per (storefront, fulfilling) group, totals as the server states them. */
export function SplitCart({
	cart,
	locale,
	busy,
	onQuantity,
	onRemoveLine,
	onRemoveGroup,
	aboveBar,
}: {
	cart: SplitCartView;
	locale: "fr" | "en";
	busy: boolean;
	onQuantity: (lineId: string, quantity: number) => void;
	onRemoveLine: (lineId: string) => void;
	onRemoveGroup: (group: SplitCartGroup) => void;
	/** Sits right above the pinned bar (the cart's undo bar). */
	aboveBar?: ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { confirm } = useAlert();
	const ready = splitCanCheckout(cart);
	const grand = formatPrice(cart.grandSubtotal, locale);
	// A whole shop's lines go at once and the undo bar only covers one line,
	// so the buyer confirms first.
	const confirmRemoveGroup = async (group: SplitCartGroup) => {
		const count = group.items.length;
		const shop = group.storefrontShop.name;
		const ok = await confirm(
			t("checkoutGroup.groupRemoveTitle", { shop }),
			t("checkoutGroup.groupRemoveBody", { count, shop }),
			{ confirmText: t("cart.remove"), destructive: true },
		);
		if (ok) onRemoveGroup(group);
	};

	return (
		<View style={styles.wrap}>
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
								onPress={() => void confirmRemoveGroup(group)}
								disabled={busy}
								accessibilityRole="button"
								accessibilityLabel={t("checkoutGroup.groupRemove", {
									shop: group.storefrontShop.name,
								})}
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
			/>
			{aboveBar}
			<CheckoutBar
				total={grand}
				label={t("checkoutGroup.grandSubtotal")}
				ready={ready}
				note={t("cart.unavailableBlocking")}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { flex: 1 },
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
	remove: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	amount: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
});
