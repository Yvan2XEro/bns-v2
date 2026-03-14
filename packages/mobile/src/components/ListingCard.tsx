import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2; // 2 columns with 16px margins + 16px gap

interface Listing {
	id: string;
	title: string;
	price?: number;
	location?: string;
	createdAt: string;
	images?: Array<{ url: string }>;
	isBoosted?: boolean;
	condition?: string;
	_status?: string;
}

interface ListingCardProps {
	listing: Listing;
	isFavorite: boolean;
	onToggleFavorite: (id: string) => void;
	onPress: (id: string) => void;
	width?: number;
}

export function ListingCard({
	listing,
	isFavorite,
	onToggleFavorite,
	onPress,
	width: cardWidth,
}: ListingCardProps) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const heartScale = useSharedValue(1);

	const imageUrl = listing.images?.[0]?.url;
	const photoCount = listing.images?.length ?? 0;

	const timeAgo = getTimeAgo(listing.createdAt);

	const heartStyle = useAnimatedStyle(() => ({
		transform: [{ scale: heartScale.value }],
	}));

	const handleFavorite = () => {
		heartScale.value = withSpring(1.4, { duration: 150 }, () => {
			heartScale.value = withSpring(1, { duration: 150 });
		});
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onToggleFavorite(listing.id);
	};

	const w = cardWidth ?? CARD_WIDTH;

	return (
		<Pressable
			onPress={() => onPress(listing.id)}
			style={({ pressed }) => [
				styles.card,
				{ width: w, backgroundColor: isDark ? "#1e293b" : "#ffffff" },
				pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] },
			]}
		>
			{/* Image */}
			<View style={[styles.imageContainer, { width: w }]}>
				<Image
					source={{ uri: imageUrl }}
					style={[styles.image, { width: w, height: w * 0.75 }]}
					contentFit="cover"
					placeholder={{ blurhash: "LGF5?xYk^6#M@-5c,1J5@[or[Q6." }}
					transition={200}
				/>

				{/* Featured badge */}
				{listing.isBoosted && (
					<View style={styles.featuredBadge}>
						<Text style={styles.featuredText}>⭐ Featured</Text>
					</View>
				)}

				{/* Photo count */}
				{photoCount > 1 && (
					<View
						style={[styles.photoCount, { backgroundColor: "rgba(0,0,0,0.6)" }]}
					>
						<Text style={styles.photoCountText}>📷 {photoCount}</Text>
					</View>
				)}

				{/* Favorite button */}
				<Animated.View style={[styles.heartContainer, heartStyle]}>
					<Pressable onPress={handleFavorite} hitSlop={8}>
						<Text style={styles.heart}>{isFavorite ? "❤️" : "🤍"}</Text>
					</Pressable>
				</Animated.View>
			</View>

			{/* Content */}
			<View style={styles.content}>
				<Text style={[styles.price, { color: isDark ? "#3b82f6" : "#1e40af" }]}>
					{listing.price
						? `${listing.price.toLocaleString()} XAF`
						: "Prix sur demande"}
				</Text>
				<Text
					style={[styles.title, { color: isDark ? "#e2e8f0" : "#0f172a" }]}
					numberOfLines={2}
				>
					{listing.title}
				</Text>
				<Text
					style={[styles.meta, { color: isDark ? "#94a3b8" : "#64748b" }]}
					numberOfLines={1}
				>
					📍 {listing.location ?? "—"} · {timeAgo}
				</Text>
			</View>
		</Pressable>
	);
}

function getTimeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 60) return `${mins}min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}j`;
	return `${Math.floor(days / 30)}mois`;
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 12,
		overflow: "hidden",
		marginBottom: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 3,
	},
	imageContainer: { position: "relative" },
	image: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
	featuredBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		backgroundColor: "#f59e0b",
		borderRadius: 6,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	featuredText: { color: "#fff", fontSize: 10, fontWeight: "700" },
	photoCount: {
		position: "absolute",
		bottom: 8,
		right: 8,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 3,
	},
	photoCountText: { color: "#fff", fontSize: 10 },
	heartContainer: { position: "absolute", top: 8, right: 8 },
	heart: { fontSize: 22 },
	content: { padding: 10 },
	price: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
	title: { fontSize: 13, fontWeight: "500", lineHeight: 18, marginBottom: 4 },
	meta: { fontSize: 11 },
});
