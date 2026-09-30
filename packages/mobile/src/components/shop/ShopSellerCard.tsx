import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { badgeForLevel } from "@/src/lib/verification";
import type { ListingShopRef, UserDoc } from "@/src/types/api";
import { LevelBadge } from "./LevelBadge";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

/** Replaces the personal seller card on a shop-backed listing. */
export function ShopSellerCard({
	shop,
	owner,
}: {
	shop: ListingShopRef;
	owner: UserDoc | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const logoUrl =
		typeof shop.logo === "object" && shop.logo
			? shop.logo.url
			: typeof shop.logo === "string"
				? shop.logo
				: null;
	const rating =
		owner && owner.totalReviews > 0
			? owner.rating.toFixed(1).replace(".", ",")
			: null;
	const meta = [
		rating
			? `${rating} · ${t("shop.reviewsCount", { count: owner?.totalReviews ?? 0 })}`
			: null,
		shop.publishedListingCount !== undefined
			? `${shop.publishedListingCount} ${t("shop.productsLabel")}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<Pressable
			onPress={() => router.push(`/s/${shop.handle}` as never)}
			accessibilityRole="button"
			accessibilityLabel={t("shop.viewShopLabel", { name: shop.name })}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<ShopAvatar name={shop.name} logo={logoUrl} size={48} radius={12} />
			<View style={{ flex: 1, gap: 3 }}>
				<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
					{shop.name}
				</Text>
				<LevelBadge badge={badgeForLevel(shop.level)} size="sm" />
				{meta ? (
					<Text style={[styles.meta, { color: c.muted }]}>{meta}</Text>
				) : null}
				{owner?.name ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("shop.managedBy", { name: owner.name })}
					</Text>
				) : null}
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		marginBottom: 12,
		minHeight: 44,
	},
	name: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
});
