import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

interface FavoriteButtonProps {
	isFavorite: boolean;
	onToggle: () => void;
	size?: number;
	color?: string;
}

export function FavoriteButton({
	isFavorite,
	onToggle,
	size = 24,
	color = "#dc2626",
}: FavoriteButtonProps) {
	const scale = useSharedValue(1);
	const animStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const handlePress = () => {
		scale.value = withSpring(1.4, { duration: 150 }, () => {
			scale.value = withSpring(1, { duration: 150 });
		});
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onToggle();
	};

	return (
		<Pressable onPress={handlePress} hitSlop={8}>
			<Animated.View style={animStyle}>
				<Ionicons
					name={isFavorite ? "heart" : "heart-outline"}
					size={size}
					color={isFavorite ? color : "#94a3b8"}
				/>
			</Animated.View>
		</Pressable>
	);
}
