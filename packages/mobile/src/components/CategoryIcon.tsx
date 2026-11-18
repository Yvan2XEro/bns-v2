import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useDiscoveryPalette } from "@/src/components/search/palette";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

interface Category {
	id: string;
	name: string;
	icon?: string;
	image?: { url: string };
}

interface CategoryIconProps {
	category: Category;
	onPress: (id: string) => void;
	size?: number;
}

export function CategoryIcon({
	category,
	onPress,
	size = 56,
}: CategoryIconProps) {
	const c = useDiscoveryPalette();
	const reducedMotion = useReducedMotion();
	const scale = useSharedValue(1);

	const animStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	// A tap opens a screen: the press confirms with a small dip, no haptic
	// (feedback is kept for meaningful moments, never per tap).
	const handlePress = () => {
		if (!reducedMotion) {
			scale.value = withSequence(
				withSpring(0.95, { damping: 14, stiffness: 500 }),
				withSpring(1, { damping: 14, stiffness: 300 }),
			);
		}
		onPress(category.id);
	};

	const tint = { bg: c.card, icon: c.link, border: c.border };

	return (
		<TouchableOpacity
			onPress={handlePress}
			activeOpacity={1}
			style={styles.container}
			accessibilityRole="button"
			accessibilityLabel={category.name}
		>
			<Animated.View
				style={[
					styles.circle,
					{
						width: size,
						height: size,
						borderRadius: size * 0.3,
						backgroundColor: tint.bg,
						borderColor: tint.border,
					},
					animStyle,
				]}
			>
				{category.image?.url ? (
					<Image
						source={{
							uri:
								resolveListingImageUrl(category.image, "thumbnail") ??
								category.image.url,
						}}
						// Category pictures are photos: they fill the tile.
						style={StyleSheet.absoluteFill}
						contentFit="cover"
					/>
				) : (
					<Ionicons name="cube-outline" size={size * 0.4} color={tint.icon} />
				)}
			</Animated.View>
			<Text
				style={[styles.label, { color: c.body }]}
				numberOfLines={2}
				// Android otherwise breaks a long word anywhere ("par / apharmacie").
				android_hyphenationFrequency="normal"
				textBreakStrategy="balanced"
			>
				{category.name}
			</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		width: "100%",
		minHeight: 48,
		paddingHorizontal: 4,
	},
	circle: {
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		marginBottom: 6,
	},
	label: {
		fontSize: 12,
		lineHeight: 15,
		textAlign: "center",
		fontFamily: Fonts.bodySemibold,
	},
});
