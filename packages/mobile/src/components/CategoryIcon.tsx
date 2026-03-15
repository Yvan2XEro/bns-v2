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

// Palette restreinte : bleu + ambre (cohérent avec la charte)
const TINTS = [
	{ bg: "#dbeafe", icon: "#1e40af" }, // bleu pâle
	{ bg: "#fef3c7", icon: "#b45309" }, // ambre pâle
	{ bg: "#bfdbfe", icon: "#1e3a8a" }, // bleu clair
	{ bg: "#fde68a", icon: "#92400e" }, // ambre clair
	{ bg: "#eff6ff", icon: "#2563eb" }, // bleu très pâle
	{ bg: "#fef9c3", icon: "#a16207" }, // jaune pâle
	{ bg: "#e0f2fe", icon: "#0369a1" }, // bleu ciel
	{ bg: "#fef3c7", icon: "#d97706" }, // ambre doux
	{ bg: "#dbeafe", icon: "#3b82f6" }, // bleu vif
	{ bg: "#fde68a", icon: "#b45309" }, // ambre foncé
];

// Variantes dark
const TINTS_DARK = [
	{ bg: "#1e3a5f", icon: "#93c5fd" },
	{ bg: "#451a03", icon: "#fcd34d" },
	{ bg: "#1e3a8a", icon: "#bfdbfe" },
	{ bg: "#78350f", icon: "#fde68a" },
	{ bg: "#172554", icon: "#93c5fd" },
	{ bg: "#422006", icon: "#fef08a" },
	{ bg: "#082f49", icon: "#7dd3fc" },
	{ bg: "#451a03", icon: "#fbbf24" },
	{ bg: "#1e3a5f", icon: "#60a5fa" },
	{ bg: "#78350f", icon: "#fcd34d" },
];

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
	colorIndex?: number;
}

export function CategoryIcon({
	category,
	onPress,
	size = 56,
	colorIndex = 0,
}: CategoryIconProps) {
	const scale = useSharedValue(1);

	// Pick a stable tint from the palette
	const idx = colorIndex % TINTS.length;

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

	// We embed both light/dark in inline style — simpler than a hook here
	// Use the same idx for dark
	const tint = TINTS[idx];
	const _tintDark = TINTS_DARK[idx];

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
			<Text style={[styles.label, { color: "#334155" }]} numberOfLines={2}>
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
