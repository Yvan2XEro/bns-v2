import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { useTranslation } from "@/src/lib/i18n";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

/**
 * Only renders once the caller belongs to more than one shop — a single-shop
 * seller never sees a switch they have nothing to switch between.
 */
export function ShopSwitcher() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { shop, shops, setActiveShop } = useActiveShop();
	const [open, setOpen] = useState(false);

	if (!shop || shops.length <= 1) return null;

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={[
					styles.trigger,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
				accessibilityRole="button"
				accessibilityLabel={t("inbox.switchShop")}
			>
				<ShopAvatar name={shop.name} logo={shop.logoUrl} size={28} radius={8} />
				<Text
					style={[styles.triggerLabel, { color: c.text }]}
					numberOfLines={1}
				>
					{shop.name}
				</Text>
				<Ionicons name="chevron-down" size={16} color={c.muted} />
			</Pressable>

			<Modal
				visible={open}
				transparent
				animationType="fade"
				onRequestClose={() => setOpen(false)}
			>
				<Pressable
					style={[
						styles.backdrop,
						{
							backgroundColor: c.isDark
								? "rgba(0,0,0,0.6)"
								: "rgba(15,23,42,0.4)",
						},
					]}
					onPress={() => setOpen(false)}
				/>
				<View
					style={[
						styles.menu,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Text style={[styles.menuTitle, { color: c.muted }]}>
						{t("inbox.switchShop")}
					</Text>
					<ScrollView style={styles.menuList}>
						{shops.map((entry) => {
							const selected = entry.shopId === shop.shopId;
							return (
								<Pressable
									key={entry.shopId}
									onPress={() => {
										setActiveShop(entry.shopId);
										setOpen(false);
									}}
									style={[
										styles.row,
										selected ? { backgroundColor: c.primarySoft } : null,
									]}
									accessibilityRole="button"
									accessibilityLabel={entry.name}
									accessibilityState={{ selected }}
								>
									<ShopAvatar
										name={entry.name}
										logo={entry.logoUrl}
										size={32}
										radius={10}
									/>
									<View style={{ flex: 1 }}>
										<Text
											style={[styles.rowName, { color: c.text }]}
											numberOfLines={1}
										>
											{entry.name}
										</Text>
										{entry.inboxUnread > 0 ? (
											<Text style={[styles.rowMeta, { color: c.sell }]}>
												{t("inbox.unreadCount", { count: entry.inboxUnread })}
											</Text>
										) : null}
									</View>
									{selected ? (
										<Ionicons name="checkmark" size={18} color={c.primary} />
									) : null}
								</Pressable>
							);
						})}
					</ScrollView>
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 6,
		minHeight: 44,
		maxWidth: 220,
	},
	triggerLabel: { flex: 1, fontSize: 13, fontFamily: Fonts.bodySemibold },
	backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	menu: {
		position: "absolute",
		top: 90,
		left: 16,
		right: 16,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		paddingVertical: 10,
	},
	menuTitle: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
		paddingHorizontal: 16,
		paddingBottom: 6,
	},
	menuList: { maxHeight: 320 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingVertical: 10,
		minHeight: 48,
	},
	rowName: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	rowMeta: { fontSize: 11, fontFamily: Fonts.body, marginTop: 1 },
});
