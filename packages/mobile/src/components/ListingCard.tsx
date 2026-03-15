import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;

const PRESS_SPRING = { damping: 18, stiffness: 300, mass: 0.6 };

/** Labels for condition values that get a badge (only "new" and "like_new") */
const CONDITION_LABELS: Record<string, string> = {
	new: "Neuf",
	like_new: "Très bon état",
};

interface Listing {
	id: string;
	title: string;
	price?: number;
	location?: string;
	createdAt: string;
	images?: Array<any>;
	isBoosted?: boolean;
	condition?: string;
	status?: string;
}

interface ListingCardProps {
	listing: Listing;
	isFavorite: boolean;
	onToggleFavorite: (id: string) => void;
	onPress: (id: string) => void;
	width?: number;
}

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "À l'instant";
	if (mins < 60) return `${mins}min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}j`;
	return `${Math.floor(days / 30)}mois`;
}

export function ListingCard({
	listing,
	isFavorite,
	onToggleFavorite,
	onPress,
	width: cardWidth,
}: ListingCardProps) {
	const isDark = useColorScheme() === "dark";
	const w = cardWidth ?? CARD_WIDTH;
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
	const imageUrl = resolveListingImageUrl(listing.images?.[0]);
	const photoCount = listing.images?.length ?? 0;
	const conditionLabel = listing.condition
		? (CONDITION_LABELS[listing.condition] ?? null)
		: null;

	// Colors — matches web palette exactly
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textPrimary = isDark ? "#e2e8f0" : "#0f172a";
	const textTitle = isDark ? "#cbd5e1" : "#334155";
	const textMuted = "#94a3b8";
	const borderNormal = isDark ? "#1e3a5f" : "#e2e8f0";
	const placeholderBg = isDark ? "#0f172a" : "#f1f5f9";

	const handleFavorite = () => {
		heartScale.value = withSequence(
			withSpring(1.5, { damping: 5, stiffness: 400 }),
			withSpring(0.85, { damping: 8 }),
			withSpring(1, { damping: 10 }),
		);
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		onToggleFavorite(listing.id);
	};

	return (
		<Pressable
			onPress={() => onPress(listing.id)}
			onPressIn={() => {
				cardScale.value = withSpring(0.97, PRESS_SPRING);
			}}
			onPressOut={() => {
				cardScale.value = withSpring(1, PRESS_SPRING);
			}}
		>
			<Animated.View
				style={[
					styles.card,
					{
						width: w,
						backgroundColor: cardBg,
						// Boosted → amber ring, normal → slate border (mirrors web)
						borderColor: listing.isBoosted
							? "rgba(245,158,11,0.5)"
							: borderNormal,
						borderWidth: listing.isBoosted ? 1.5 : 1,
					},
					cardStyle,
				]}
			>
				{/* ── Image ── */}
				<View>
					{imageUrl ? (
						<Image
							source={{ uri: imageUrl }}
							style={{ width: w, height: imageH }}
							contentFit="cover"
							placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
							transition={200}
						/>
					) : (
						<View
							style={[
								styles.imagePlaceholder,
								{ width: w, height: imageH, backgroundColor: placeholderBg },
							]}
						>
							<Ionicons name="image-outline" size={28} color={textMuted} />
						</View>
					)}

					{/* Top-left — boost badge + condition badge */}
					<View style={styles.topLeft}>
						{listing.isBoosted && (
							<View style={styles.boostBadge}>
								<Ionicons name="flash" size={9} color="#fff" />
								<Text style={styles.boostText}>À LA UNE</Text>
							</View>
						)}
						{conditionLabel && (
							<View
								style={[
									styles.conditionBadge,
									{
										backgroundColor: isDark
											? "rgba(30,41,59,0.92)"
											: "rgba(255,255,255,0.92)",
									},
								]}
							>
								<Text style={[styles.conditionText, { color: textPrimary }]}>
									{conditionLabel}
								</Text>
							</View>
						)}
					</View>

					{/* Top-right — favorite button */}
					<Pressable
						onPress={handleFavorite}
						hitSlop={10}
						style={styles.favWrap}
					>
						<Animated.View
							style={[
								styles.favBtn,
								{
									backgroundColor: isFavorite
										? "#ef4444"
										: isDark
											? "rgba(15,23,42,0.72)"
											: "rgba(255,255,255,0.82)",
								},
								heartStyle,
							]}
						>
							<Ionicons
								name={isFavorite ? "heart" : "heart-outline"}
								size={15}
								color={isFavorite ? "#fff" : textMuted}
							/>
						</Animated.View>
					</Pressable>

					{/* Bottom-right — photo count */}
					{photoCount > 1 && (
						<View style={styles.photoBadge}>
							<Ionicons name="camera-outline" size={10} color="#fff" />
							<Text style={styles.photoText}>{photoCount}</Text>
						</View>
					)}
				</View>

				{/* ── Content ── */}
				<View style={styles.content}>
					{/* Price — prominent, same as web (bold lg + muted "XAF") */}
					<Text
						style={[styles.price, { color: textPrimary }]}
						numberOfLines={1}
					>
						{listing.price ? listing.price.toLocaleString() : "Sur demande"}
						{listing.price ? (
							<Text style={[styles.priceCurrency, { color: textMuted }]}>
								{" "}
								XAF
							</Text>
						) : null}
					</Text>

					{/* Title — 2-line clamp */}
					<Text style={[styles.title, { color: textTitle }]} numberOfLines={2}>
						{listing.title}
					</Text>

					{/* Meta row: location (left) + time (right) */}
					<View style={styles.metaRow}>
						<View style={styles.metaLeft}>
							<Ionicons name="location-outline" size={11} color={textMuted} />
							<Text
								style={[styles.metaText, { color: textMuted }]}
								numberOfLines={1}
							>
								{listing.location ?? "—"}
							</Text>
						</View>
						<View style={styles.metaRight}>
							<Ionicons name="time-outline" size={11} color={textMuted} />
							<Text style={[styles.metaText, { color: textMuted }]}>
								{timeAgo(listing.createdAt)}
							</Text>
						</View>
					</View>
				</View>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.07,
		shadowRadius: 8,
		elevation: 2,
	},
	imagePlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Badges ──
	topLeft: {
		position: "absolute",
		top: 7,
		left: 7,
		flexDirection: "column",
		gap: 4,
	},
	boostBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "#f59e0b",
		borderRadius: 4,
		paddingHorizontal: 5,
		paddingVertical: 2,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.2,
		shadowRadius: 2,
		elevation: 2,
	},
	boostText: {
		color: "#fff",
		fontSize: 9,
		fontFamily: Fonts.displayBold,
		letterSpacing: 0.4,
	},
	conditionBadge: {
		borderRadius: 4,
		paddingHorizontal: 5,
		paddingVertical: 2,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.12,
		shadowRadius: 2,
		elevation: 1,
	},
	conditionText: {
		fontSize: 9,
		fontFamily: Fonts.bodySemibold,
	},

	// ── Favorite ──
	favWrap: {
		position: "absolute",
		top: 7,
		right: 7,
	},
	favBtn: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.15,
		shadowRadius: 3,
		elevation: 2,
	},

	// ── Photo count ──
	photoBadge: {
		position: "absolute",
		bottom: 7,
		right: 7,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "rgba(0,0,0,0.6)",
		borderRadius: 5,
		paddingHorizontal: 5,
		paddingVertical: 2,
	},
	photoText: {
		color: "#fff",
		fontSize: 10,
		fontFamily: Fonts.body,
	},

	// ── Content ──
	content: {
		padding: 10,
		gap: 2,
	},
	price: {
		fontFamily: Fonts.displayBold,
		fontSize: 17,
		lineHeight: 22,
	},
	priceCurrency: {
		fontFamily: Fonts.body,
		fontSize: 11,
	},
	title: {
		fontFamily: Fonts.body,
		fontSize: 13,
		lineHeight: 18,
		marginTop: 1,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 5,
	},
	metaLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		flex: 1,
		minWidth: 0,
	},
	metaRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		flexShrink: 0,
		marginLeft: 6,
	},
	metaText: {
		fontFamily: Fonts.body,
		fontSize: 11,
		flexShrink: 1,
	},
});
