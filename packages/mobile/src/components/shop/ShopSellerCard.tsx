import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { BadgeLevel, ListingShopRef, UserDoc } from "@/src/types/api";
import { useBrandFor } from "./brand";
import { LevelBadge } from "./LevelBadge";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

/** Replaces the personal seller card on a shop-backed listing. */
export function ShopSellerCard({
	shop,
	badge,
	brandColor,
	owner,
}: {
	shop: ListingShopRef;
	/**
	 * The server's computed, expiry-aware badge — see `publicShopBadge` in
	 * `~/lib/verification`. Never derived from `shop.level` here: `shop` is a
	 * depth-populated relation off the listing, whose raw `level` field stays
	 * at 3 until the nightly job recomputes it, even once the level-3
	 * approval has expired.
	 */
	badge: BadgeLevel | null;
	/** From the public shop read; the populated relation may not carry it. */
	brandColor?: string | null;
	owner: UserDoc | null;
}) {
	const c = useShopTheme();
	const brand = useBrandFor(brandColor ?? shop.brandColor);
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
		shop.publishedListingCount !== undefined
			? `${shop.publishedListingCount} ${t("shop.productsLabel")}`
			: null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<Pressable
			onPress={() => router.push(`/s/${shop.handle}`)}
			accessibilityRole="button"
			accessibilityLabel={t("shop.viewShopLabel", { name: shop.name })}
			style={[
				styles.card,
				{
					backgroundColor: c.card,
					borderColor: c.border,
				},
			]}
		>
			<ShopAvatar name={shop.name} logo={logoUrl} size={48} radius={12} />
			<View style={{ flex: 1, gap: 3 }}>
				<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
					{shop.name}
				</Text>
				<LevelBadge badge={badge} size="sm" />
				{rating ? (
					<View style={styles.ratingRow}>
						<Ionicons name="star" size={14} color={c.sell} />
						<Text style={[styles.rating, { color: c.text }]}>{rating}</Text>
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("shop.reviewsCount", { count: owner?.totalReviews ?? 0 })}
						</Text>
					</View>
				) : null}
				{meta ? (
					<Text style={[styles.meta, { color: c.muted }]}>{meta}</Text>
				) : null}
				{owner?.name ? (
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("shop.managedBy", { name: owner.name })}
					</Text>
				) : null}
			</View>
			<Ionicons name="chevron-forward" size={20} color={brand.accentText} />
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
		minHeight: 48,
	},
	name: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
	rating: {
		fontSize: 14,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
});
