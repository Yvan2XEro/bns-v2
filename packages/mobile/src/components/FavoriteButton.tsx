import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { feedback } from "@/src/lib/feedback";

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
	color = "#d23a2e",
}: FavoriteButtonProps) {
	const scale = useSharedValue(1);
	const animStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const handlePress = () => {
		scale.value = withSpring(1.25, { duration: 140 }, () => {
			scale.value = withSpring(1, { duration: 180 });
		});
		feedback(isFavorite ? "tap" : "pop");
		onToggle();
	};

	return (
		<Pressable
			onPress={handlePress}
			hitSlop={8}
			accessibilityRole="button"
			accessibilityState={{ selected: isFavorite }}
		>
			<Animated.View style={animStyle}>
				<Ionicons
					name={isFavorite ? "heart" : "heart-outline"}
					size={size}
					color={isFavorite ? color : "#777ca3"}
				/>
			</Animated.View>
		</Pressable>
	);
}
