import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { shopUrlLabel } from "@/src/lib/shopHandle";
import type { MyShop } from "@/src/types/api";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

/**
 * Rich top section of the seller hub — avatar, shop name, a link to the
 * public page and a share action. Distinct from the generic `SellerHeader`
 * every other seller screen uses: the hub carries shop identity rather than
 * just a screen title, so it keeps its own back button instead of composing
 * `SellerHeader`.
 */
export function SellerHubHeader({
	shop,
	webUrl,
	onShare,
}: {
	shop: MyShop;
	webUrl: string | null;
	onShare: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={[styles.top, { backgroundColor: c.header }]}>
			<View style={styles.topRow}>
				<Pressable
					onPress={() =>
						router.canGoBack()
							? router.back()
							: router.replace("/(tabs)/account")
					}
					style={styles.iconHit}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
				>
					<Ionicons name="arrow-back" size={22} color={c.text} />
				</Pressable>
				<ShopAvatar
					name={shop.name}
					logo={shop.logo?.url}
					size={44}
					radius={12}
				/>
				<View style={{ flex: 1 }}>
					<Text style={[styles.shopName, { color: c.text }]} numberOfLines={1}>
						{shop.name}
					</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("seller.space")}
					</Text>
				</View>
				<Pressable
					onPress={() => router.push(`/s/${shop.handle}` as never)}
					style={styles.iconHit}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("seller.publicPage")}
				>
					<Ionicons name="storefront-outline" size={22} color={c.primary} />
				</Pressable>
			</View>

			<View
				style={[
					styles.linkCard,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<View style={{ flex: 1 }}>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("seller.publicPage")}
					</Text>
					<Text style={[styles.link, { color: c.primary }]} numberOfLines={1}>
						{shopUrlLabel(shop.handle, webUrl)}
					</Text>
				</View>
				<Pressable
					onPress={onShare}
					style={[styles.shareBtn, { backgroundColor: c.primary }]}
					accessibilityRole="button"
					accessibilityLabel={t("shop.shareLabel", { name: shop.name })}
				>
					<Ionicons name="share-social-outline" size={16} color="#fff" />
					<Text style={styles.shareText}>{t("seller.share")}</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	top: { padding: 16, gap: 14 },
	topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	iconHit: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	shopName: { fontSize: 18, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	linkCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	link: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	shareBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
		minHeight: 44,
	},
	shareText: { color: "#fff", fontSize: 13, fontFamily: Fonts.bodySemibold },
});
