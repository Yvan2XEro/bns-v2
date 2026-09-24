import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { shopUrlLabel } from "@/src/lib/shopHandle";
import type { PublicShop } from "@/src/types/api";
import { LevelBadge } from "./LevelBadge";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

export function ShopHeader({
	shop,
	onShare,
}: {
	shop: PublicShop;
	onShare: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { webUrl } = useAppConfig();
	const banner = resolveImageUrl(shop.banner?.url ?? null);
	const place = [shop.location.city, shop.location.region]
		.filter(Boolean)
		.join(", ");

	return (
		<View>
			<View style={[styles.banner, { backgroundColor: c.primary }]}>
				{banner ? (
					<Image
						source={{ uri: banner }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
					/>
				) : null}
			</View>
			<View style={styles.body}>
				<View style={[styles.logoRing, { borderColor: c.bg }]}>
					<ShopAvatar
						name={shop.name}
						logo={shop.logo?.url}
						size={72}
						radius={18}
					/>
				</View>
				<Text style={[styles.name, { color: c.text }]}>{shop.name}</Text>
				<View style={styles.row}>
					<LevelBadge level={shop.level} />
					<Pressable
						onPress={onShare}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={t("shop.shareLabel", { name: shop.name })}
					>
						<Text style={[styles.link, { color: c.primary }]}>
							{shopUrlLabel(shop.handle, webUrl)}
						</Text>
					</Pressable>
				</View>
				{shop.description ? (
					<Text style={[styles.description, { color: c.body }]}>
						{shop.description}
					</Text>
				) : null}
				<View style={styles.stats}>
					<Stat
						icon="star"
						iconColor="#f59e0b"
						value={
							shop.owner.totalReviews > 0
								? shop.owner.rating.toFixed(1).replace(".", ",")
								: "—"
						}
						label={t("shop.reviewsCount", { count: shop.owner.totalReviews })}
					/>
					<Stat
						icon="cube-outline"
						iconColor={c.muted}
						value={String(shop.publishedListingCount)}
						label={t("shop.productsLabel")}
					/>
					{place ? (
						<Stat
							icon="location-outline"
							iconColor={c.muted}
							value={shop.location.city ?? ""}
							label={shop.location.region ?? ""}
						/>
					) : null}
				</View>
			</View>
		</View>
	);
}

function Stat({
	icon,
	iconColor,
	value,
	label,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	iconColor: string;
	value: string;
	label: string;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.stat}>
			<View style={styles.statTop}>
				<Ionicons name={icon} size={14} color={iconColor} />
				<Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
			</View>
			<Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={1}>
				{label}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	banner: { height: 140, overflow: "hidden" },
	body: { paddingHorizontal: 16, marginTop: -36, gap: 8 },
	logoRing: { alignSelf: "flex-start", borderWidth: 4, borderRadius: 22 },
	name: { fontSize: 24, fontFamily: Fonts.displayExtrabold },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		flexWrap: "wrap",
	},
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold, paddingVertical: 4 },
	description: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 21 },
	stats: { flexDirection: "row", gap: 12, marginTop: 4 },
	stat: { flex: 1 },
	statTop: { flexDirection: "row", alignItems: "center", gap: 4 },
	statValue: { fontSize: 16, fontFamily: Fonts.displayBold },
	statLabel: { fontSize: 12, fontFamily: Fonts.body },
});
