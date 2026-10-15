import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { shopUrlLabel } from "@/src/lib/shopHandle";
import type { MyShop } from "@/src/types/api";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

/** The hub's header band: dark in both themes, like the design's seller space. */
export const HUB_HEADER_BG = "#0f172a";
const ON_DARK = "#ffffff";
const ON_DARK_MUTED = "#94a3b8";

/**
 * The seller hub's bar — back, avatar, shop name, public page. Distinct from
 * the generic `SellerHeader` every other seller screen uses: the hub carries
 * shop identity rather than just a screen title. Rendered outside the hub's
 * scroll view so it stays put while the content moves.
 */
export function SellerHubBar({ shop }: { shop: MyShop }) {
	const { t } = useTranslation();

	return (
		<View style={[styles.bar, { backgroundColor: HUB_HEADER_BG }]}>
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
					<Ionicons name="arrow-back" size={22} color={ON_DARK} />
				</Pressable>
				<ShopAvatar
					name={shop.name}
					logo={shop.logo?.url}
					size={44}
					radius={12}
				/>
				<View style={{ flex: 1 }}>
					<Text style={[styles.shopName, { color: ON_DARK }]} numberOfLines={1}>
						{shop.name}
					</Text>
					<Text style={[styles.meta, { color: ON_DARK_MUTED }]}>
						{t("seller.space")}
					</Text>
				</View>
				<Pressable
					onPress={() => router.push(`/s/${shop.handle}`)}
					style={styles.iconHit}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("seller.publicPage")}
				>
					<Ionicons name="storefront-outline" size={22} color={ON_DARK} />
				</Pressable>
			</View>
		</View>
	);
}

/** The public link and share action, on the dark band under the bar; scrolls away with the content. */
export function SellerHubLinkCard({
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
		<View style={[styles.band, { backgroundColor: HUB_HEADER_BG }]}>
			<View style={styles.linkCard}>
				<View style={{ flex: 1 }}>
					<Text style={[styles.meta, { color: ON_DARK_MUTED }]}>
						{t("seller.publicPage")}
					</Text>
					<Text style={[styles.link, { color: ON_DARK }]} numberOfLines={1}>
						{shopUrlLabel(shop.handle, webUrl)}
					</Text>
				</View>
				<Pressable
					onPress={onShare}
					style={[styles.shareBtn, { backgroundColor: c.sell }]}
					accessibilityRole="button"
					accessibilityLabel={t("shop.shareLabel", { name: shop.name })}
				>
					<Ionicons
						name="share-social-outline"
						size={16}
						color={HUB_HEADER_BG}
					/>
					<Text style={styles.shareText}>{t("seller.share")}</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	bar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
	band: { paddingHorizontal: 16, paddingBottom: 16 },
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
		backgroundColor: "rgba(255,255,255,0.08)",
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
	shareText: {
		color: HUB_HEADER_BG,
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
});
