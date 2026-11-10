import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import {
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { useShopBrandIfAny } from "@/src/components/shop/brand";
import { parseDate } from "@/src/lib/formatDate";
import i18n from "@/src/lib/i18n";
import {
	conditionLabelKey,
	listingConditionValue,
} from "@/src/lib/listingCondition";
import { kindPriceText } from "@/src/lib/listingKind";
import { listingShopName } from "@/src/lib/listingShop";
import { formatPrice } from "@/src/lib/market";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { compactTimeAgo } from "@/src/lib/timeAgo";

const PRESS_SPRING = { damping: 18, stiffness: 300, mass: 0.6 };

/** Only the conditions worth a badge on a thumbnail. */
const BADGE_CONDITIONS = new Set(["new", "like_new"]);

interface Listing {
	id: string;
	title?: string;
	price?: number | null;
	location?: string;
	createdAt?: string;
	images?: Array<any>;
	isBoosted?: boolean;
	attributes?: Record<string, unknown> | null;
	status?: string;
	/** Bought on the platform (protected payment or cash on delivery). */
	orderable?: boolean | null;
	kind?: string | null;
	priceUnit?: string | null;
}

interface ListingCardProps {
	/** An unpopulated relation arrives as a raw ID string. */
	listing: Listing | string;
	isFavorite: boolean;
	onToggleFavorite: (id: string) => void;
	onPress: (id: string) => void;
	width?: number;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}

export function ListingCard({
	listing: listingProp,
	isFavorite,
	onToggleFavorite,
	onPress,
	width: cardWidth,
	selected,
}: ListingCardProps) {
	const selectedStyle = useSelectedRowStyle();
	// Favorites can hand us a bare listing ID when the relation was not
	// populated (or for an optimistic entry); render the card skeleton rather
	// than crashing on `.images` / `.createdAt`.
	const listing: Listing =
		typeof listingProp === "string"
			? { id: listingProp }
			: (listingProp ?? { id: "" });
	const isDark = useColorScheme() === "dark";
	// Live window width so the fallback card size follows rotation /
	// Stage Manager resizes instead of being frozen at first render.
	const { width } = useWindowDimensions();
	const w = cardWidth ?? (width - 48) / 2;
	const imageH = Math.round(w * 0.75); // 4:3 ratio, same as web

	// Card press
	const cardScale = useSharedValue(1);
	const cardStyle = useAnimatedStyle(() => ({
		transform: [{ scale: cardScale.value }],
	}));

	// Heart bounce
	const heartScale = useSharedValue(1);
	const heartStyle = useAnimatedStyle(() => ({
		transform: [{ scale: heartScale.value }],
	}));

	// Resolve image URL — handles both { url } and { image: { url } } shapes
	// and rewrites localhost origins to the configured API host
	const imageUrl = resolveListingImageUrl(listing.images?.[0], "thumbnail");
	const photoCount = listing.images?.length ?? 0;
	const conditionValue = listingConditionValue(listing.attributes);
	const conditionKey =
		conditionValue && BADGE_CONDITIONS.has(conditionValue)
			? conditionLabelKey(conditionValue)
			: null;
	const conditionLabel = conditionKey ? i18n.t(conditionKey) : null;
	const age = compactTimeAgo(listing.createdAt);
	const shopName = listingShopName(listing);
	// On a shop's page the card takes the shop's colour, as on web.
	const shopAccent =
		useShopBrandIfAny()?.accentText ?? (isDark ? "#9aa8f5" : "#23338f");

	const textPrimary = isDark ? "#e1e3ee" : "#12163a";
	const textMuted = isDark ? "#a3a7c8" : "#5b6088";
	const placeholderBg = isDark ? "#13183e" : "#e1e3ee";

	const handleFavorite = () => {
		heartScale.value = withSequence(
			withSpring(1.25, { damping: 8, stiffness: 500 }),
			withSpring(1, { damping: 12, stiffness: 300 }),
		);
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		onToggleFavorite(listing.id);
	};

	// "/ month" after a rent, "On quote" for a service without a price.
	const priceText = kindPriceText(
		listing.price ? formatPrice(listing.price, i18n.language) : null,
		listing,
		(key) => i18n.t(`listingKind.${key}`),
	);

	return (
		<Pressable
			onPress={() => onPress(listing.id)}
			// One summary instead of a dozen fragments read one by one.
			accessibilityRole="link"
			accessibilityLabel={[listing.title, priceText, listing.location, shopName]
				.filter(Boolean)
				.join(", ")}
			onPressIn={() => {
				cardScale.value = withSpring(0.97, PRESS_SPRING);
			}}
			onPressOut={() => {
				cardScale.value = withSpring(1, PRESS_SPRING);
			}}
		>
			<Animated.View
				style={[styles.card, { width: w }, selectedStyle(selected), cardStyle]}
			>
				{/* ── Photo, with the price painted on it ── */}
				<View
					style={[
						styles.photo,
						{ backgroundColor: placeholderBg },
						listing.isBoosted && styles.photoBoosted,
					]}
				>
					{imageUrl ? (
						<Image
							source={{ uri: imageUrl }}
							style={{ width: "100%", height: imageH }}
							contentFit="cover"
							placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
							transition={200}
							recyclingKey={listing.id}
						/>
					) : (
						<View style={[styles.imagePlaceholder, { height: imageH }]}>
							<Ionicons name="image-outline" size={28} color={textMuted} />
						</View>
					)}

					{/* Top-left — boosted, condition, protected purchase */}
					<View style={styles.topLeft}>
						{listing.isBoosted && (
							<View style={styles.boostBadge}>
								<Ionicons name="flash" size={10} color="#ffb81c" />
								<Text style={styles.boostText}>
									{i18n.t("home.featuredBadge")}
								</Text>
							</View>
						)}
						{conditionLabel && (
							<View style={styles.chip}>
								<Text style={styles.chipText}>{conditionLabel}</Text>
							</View>
						)}
						{listing.orderable && (
							// Bought on the platform, not arranged with a stranger.
							<View style={styles.chip}>
								<Ionicons name="shield-checkmark" size={11} color="#19733f" />
								<Text style={[styles.chipText, { color: "#155c35" }]}>
									{i18n.t("listing.orderableBadge")}
								</Text>
							</View>
						)}
					</View>

					{/* Top-right — favorite */}
					<Pressable
						onPress={handleFavorite}
						hitSlop={10}
						style={styles.favWrap}
						accessibilityRole="button"
						accessibilityLabel={
							isFavorite ? i18n.t("listing.saved") : i18n.t("listing.save")
						}
						accessibilityState={{ selected: isFavorite }}
					>
						<Animated.View
							style={[styles.favBtn, isFavorite && styles.favBtnOn, heartStyle]}
						>
							<Ionicons
								name={isFavorite ? "heart" : "heart-outline"}
								size={17}
								color={isFavorite ? "#ffffff" : "#12163a"}
							/>
						</Animated.View>
					</Pressable>

					{/* Bottom — the price tag, and the photo count */}
					<View style={styles.bottomRow} pointerEvents="none">
						<View style={styles.priceTag}>
							<Text
								style={styles.priceText}
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={0.8}
							>
								{priceText}
							</Text>
						</View>
						{photoCount > 1 && (
							<View style={styles.photoBadge}>
								<Ionicons name="images-outline" size={11} color="#fff" />
								<Text style={styles.photoText}>{photoCount}</Text>
							</View>
						)}
					</View>
				</View>

				{/* ── Words ── */}
				<View style={styles.content}>
					<Text
						style={[styles.title, { color: textPrimary }]}
						numberOfLines={2}
					>
						{listing.title ?? "—"}
					</Text>

					<Text
						style={[styles.metaText, { color: textMuted }]}
						numberOfLines={1}
					>
						{[listing.location, age].filter(Boolean).join(" · ") || "—"}
					</Text>

					{shopName ? (
						<View style={styles.shopRow}>
							<Ionicons name="storefront" size={11} color={shopAccent} />
							<Text
								style={[styles.shopText, { color: shopAccent }]}
								numberOfLines={1}
							>
								{shopName}
							</Text>
						</View>
					) : null}
				</View>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
	},
	photo: {
		borderRadius: 14,
		overflow: "hidden",
	},
	// Boosted listings carry a signage-yellow frame instead of a glow.
	photoBoosted: {
		borderWidth: 2,
		borderColor: "#ffb81c",
	},
	imagePlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Badges ──
	topLeft: {
		position: "absolute",
		top: 8,
		left: 8,
		right: 48,
		alignItems: "flex-start",
		gap: 4,
	},
	boostBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "#12163a",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
	},
	boostText: {
		color: "#ffffff",
		fontSize: 11,
		fontFamily: Fonts.bodyBold,
		letterSpacing: 0.2,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "rgba(255,255,255,0.94)",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
	},
	chipText: {
		fontSize: 11,
		fontFamily: Fonts.bodyBold,
		color: "#12163a",
	},

	// ── Favorite ──
	favWrap: {
		position: "absolute",
		top: 6,
		right: 6,
	},
	favBtn: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.94)",
	},
	favBtnOn: { backgroundColor: "#d23a2e" },

	// ── Price tag + photo count ──
	bottomRow: {
		position: "absolute",
		left: 8,
		right: 8,
		bottom: 8,
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: 6,
	},
	priceTag: {
		flexShrink: 1,
		backgroundColor: "#ffb81c",
		borderRadius: 7,
		paddingHorizontal: 8,
		paddingTop: 3,
		paddingBottom: 4,
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.18,
		shadowRadius: 4,
		elevation: 2,
	},
	priceText: {
		color: "#12163a",
		fontFamily: Fonts.displayExtrabold,
		fontSize: 15,
		lineHeight: 19,
		letterSpacing: -0.3,
	},
	photoBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "rgba(18, 22, 58,0.72)",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
	},
	photoText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},

	// ── Words ──
	content: {
		paddingTop: 8,
		paddingHorizontal: 2,
		paddingBottom: 4,
		gap: 3,
	},
	title: {
		fontFamily: Fonts.bodyMedium,
		fontSize: 14,
		lineHeight: 19,
	},
	metaText: {
		fontFamily: Fonts.body,
		fontSize: 12,
		lineHeight: 16,
	},
	shopRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
	shopText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
	},
});
