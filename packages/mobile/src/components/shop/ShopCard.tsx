import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { badgeForLevel } from "@/src/lib/verification";
import type { ShopSearchHit } from "@/src/types/api";
import { LevelBadge } from "./LevelBadge";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

export function ShopCard({ hit }: { hit: ShopSearchHit }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const open = () => router.push(`/s/${hit.handle}` as never);
	const rating =
		hit.ownerReviews > 0
			? `${hit.ownerRating.toFixed(1).replace(".", ",")} (${hit.ownerReviews})`
			: t("shop.newShop");

	return (
		<Pressable
			onPress={open}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
			accessibilityRole="button"
			accessibilityLabel={t("shop.viewShopLabel", { name: hit.name })}
		>
			<ShopAvatar name={hit.name} logo={hit.logoUrl} size={52} radius={14} />
			<View style={{ flex: 1, gap: 4 }}>
				<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
					{hit.name}
				</Text>
				<View style={styles.row}>
					<LevelBadge badge={badgeForLevel(hit.level)} size="sm" />
					<View style={styles.row}>
						<Ionicons name="star" size={12} color="#f59e0b" />
						<Text style={[styles.meta, { color: c.body }]}>{rating}</Text>
					</View>
				</View>
				<Text style={[styles.meta, { color: c.muted }]}>
					{[
						hit.city,
						t("shop.productsCount", { count: hit.publishedListingCount }),
					]
						.filter(Boolean)
						.join(" · ")}
				</Text>
				{hit.description ? (
					<Text style={[styles.meta, { color: c.body }]} numberOfLines={2}>
						{hit.description}
					</Text>
				) : null}
			</View>
			<View style={[styles.view, { borderColor: c.primary }]}>
				<Text style={[styles.viewText, { color: c.primary }]}>
					{t("shop.view")}
				</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		gap: 12,
		padding: 14,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		minHeight: 44,
	},
	name: { fontSize: 16, fontFamily: Fonts.displayBold },
	row: { flexDirection: "row", alignItems: "center", gap: 6 },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	view: {
		alignSelf: "center",
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	viewText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
