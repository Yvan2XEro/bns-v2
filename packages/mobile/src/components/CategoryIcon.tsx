import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const TINT_LIGHT = { bg: "#f1f5f9", icon: "#475569" };
const TINT_DARK = { bg: "#1e293b", icon: "#94a3b8" };

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
	const isDark = useColorScheme() === "dark";
	const scale = useSharedValue(1);

	const animStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const handlePress = () => {
		scale.value = withSequence(
			withSpring(0.85, { damping: 8, stiffness: 400 }),
			withSpring(1.08, { damping: 6, stiffness: 300 }),
			withSpring(1, { damping: 12 }),
		);
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onPress(category.id);
	};

	const tint = isDark ? TINT_DARK : TINT_LIGHT;

	return (
		<TouchableOpacity
			onPress={handlePress}
			activeOpacity={1}
			style={styles.container}
		>
			<Animated.View
				style={[
					styles.circle,
					{
						width: size,
						height: size,
						borderRadius: size * 0.3,
						backgroundColor: tint.bg,
					},
					animStyle,
				]}
			>
				{category.image?.url ? (
					<Image
						source={{ uri: category.image.url }}
						style={{ width: size * 0.55, height: size * 0.55 }}
						contentFit="contain"
					/>
				) : (
					<Ionicons name="cube-outline" size={size * 0.42} color={tint.icon} />
				)}
			</Animated.View>
			<Text
				style={[styles.label, { color: isDark ? "#94a3b8" : "#334155" }]}
				numberOfLines={2}
			>
				{category.name}
			</Text>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	container: { alignItems: "center", width: 72, marginRight: 4 },
	circle: {
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 6,
	},
	label: { fontSize: 11, textAlign: "center", fontFamily: Fonts.bodySemibold },
});
