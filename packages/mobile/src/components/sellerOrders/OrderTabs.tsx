import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
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
				return (
					<Pressable
						key={tab}
						onPress={() => onChange(tab)}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						accessibilityLabel={
							count === undefined ? label : `${label}, ${count}`
						}
						style={[
							styles.tab,
							{
								backgroundColor: selected ? c.primary : c.card,
								borderColor: selected ? c.primary : c.border,
							},
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
											: c.neutralSoft,
									},
								]}
							>
								<Text
									style={[
										styles.countText,
										{ color: selected ? "#fff" : c.neutralText },
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
		minHeight: 44,
	},
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	count: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
	countText: { fontSize: 12, fontFamily: Fonts.bodyBold },
});
