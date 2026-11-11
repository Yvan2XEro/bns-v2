import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { fillOf } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { SHOP_ORDER_TABS, type ShopOrderTab } from "@/src/lib/orderStatus";
import type { ShopOrderPage } from "@/src/types/order";

const TAB_KEYS: Record<ShopOrderTab, string> = {
	to_accept: "orderStatus.tab_to_accept",
	to_ship: "orderStatus.tab_to_ship",
	shipped: "orderStatus.tab_shipped",
	delivered: "orderStatus.tab_delivered",
	cancelled: "orderStatus.tab_cancelled",
	failed: "orderStatus.tab_failed",
};

/** Segmented tabs; the counts are the server's, from the open tab's response. */
export function OrderTabs({
	active,
	counts,
	onChange,
}: {
	active: ShopOrderTab;
	counts: ShopOrderPage["counts"] | undefined;
	onChange: (tab: ShopOrderTab) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={styles.scroll}
			contentContainerStyle={styles.tabs}
			accessibilityRole="tablist"
			accessibilityLabel={t("sellerOrders.tabsLabel")}
		>
			{SHOP_ORDER_TABS.map((tab) => {
				const selected = tab === active;
				const label = t(TAB_KEYS[tab]);
				const count = counts?.[tab];
				// Orders waiting on the seller keep their count lit on every tab.
				const pending = tab === "to_accept" && !selected && (count ?? 0) > 0;
				return (
					<Pressable
						key={tab}
						onPress={() => onChange(tab)}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						accessibilityLabel={
							count === undefined ? label : `${label}, ${count}`
						}
						style={({ pressed }) => [
							styles.tab,
							{
								backgroundColor: selected ? fillOf(c) : c.card,
								borderColor: selected ? fillOf(c) : c.border,
							},
							pressed && !selected && styles.pressed,
						]}
					>
						<Text style={[styles.label, { color: selected ? "#fff" : c.body }]}>
							{label}
						</Text>
						{count !== undefined ? (
							<View
								style={[
									styles.count,
									{
										backgroundColor: selected
											? "rgba(255,255,255,0.25)"
											: pending
												? c.warningSoft
												: c.neutralSoft,
									},
								]}
							>
								<Text
									style={[
										styles.countText,
										{
											color: selected
												? "#fff"
												: pending
													? c.warningText
													: c.neutralText,
										},
									]}
								>
									{count}
								</Text>
							</View>
						) : null}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: { flexGrow: 0 },
	tabs: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
	tab: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		borderWidth: 1,
		paddingHorizontal: 14,
		minHeight: 48,
	},
	pressed: { opacity: 0.7 },
	label: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	count: {
		minWidth: 22,
		alignItems: "center",
		borderRadius: 999,
		paddingHorizontal: 7,
		paddingVertical: 2,
	},
	countText: {
		fontSize: 12,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
});
