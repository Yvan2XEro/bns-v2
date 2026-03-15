import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { SpringPresets } from "@/constants/theme";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
	scaleValue?: number;
	/** @deprecated use scaleValue */
	scaleTo?: number;
	/**
	 * - scale    : scale only
	 * - opacity  : opacity only
	 * - both     : scale + opacity (default)
	 * - lift     : scale + translateY up + opacity
	 * - editorial: scale 0.96 + translateY -3 + slight rotate
	 */
	animationType?: "scale" | "opacity" | "both" | "lift" | "editorial";
	haptic?: boolean | "light" | "medium" | "heavy";
	disabled?: boolean;
}

export function AnimatedPressable({
	children,
	style,
	scaleValue,
	scaleTo,
	animationType = "both",
	disabled = false,
	haptic = false,
	onPressIn,
	onPressOut,
	...props
}: AnimatedPressableProps) {
	const resolvedScale = scaleValue ?? scaleTo ?? 0.97;
	const pressed = useSharedValue(0);

	const triggerHaptic = useCallback(() => {
		if (!haptic) return;
		const feedbackStyle =
			haptic === "medium"
				? Haptics.ImpactFeedbackStyle.Medium
				: haptic === "heavy"
					? Haptics.ImpactFeedbackStyle.Heavy
					: Haptics.ImpactFeedbackStyle.Light;
		Haptics.impactAsync(feedbackStyle).catch(() => {});
	}, [haptic]);

	const handlePressIn = useCallback(
		(e: any) => {
			pressed.value = withSpring(1, SpringPresets.snappy);
			triggerHaptic();
			onPressIn?.(e);
		},
		[onPressIn, pressed, triggerHaptic],
	);

	const handlePressOut = useCallback(
		(e: any) => {
			pressed.value = withSpring(0, SpringPresets.snappy);
			onPressOut?.(e);
		},
		[onPressOut, pressed],
	);

	const animatedStyle = useAnimatedStyle(() => {
		const scale = interpolate(pressed.value, [0, 1], [1, resolvedScale]);
		const opacity = interpolate(pressed.value, [0, 1], [1, 0.88]);
		const translateY = interpolate(pressed.value, [0, 1], [0, -2]);

		switch (animationType) {
			case "scale":
				return { transform: [{ scale }] };
			case "opacity":
				return { opacity };
			case "lift":
				return { transform: [{ scale }, { translateY }], opacity };
			case "editorial": {
				const eScale = interpolate(pressed.value, [0, 1], [1, 0.96]);
				const eTY = interpolate(pressed.value, [0, 1], [0, -3]);
				const eRot = interpolate(pressed.value, [0, 1], [0, -0.5]);
				return {
					transform: [
						{ scale: eScale },
						{ translateY: eTY },
						{ rotate: `${eRot}deg` },
					],
					opacity: interpolate(pressed.value, [0, 1], [1, 0.95]),
				};
			}
			default:
				return { transform: [{ scale }], opacity };
		}
	});

	return (
		<AnimatedPressableBase
			style={[animatedStyle, style]}
			onPressIn={handlePressIn}
			onPressOut={handlePressOut}
			disabled={disabled}
			accessible
			accessibilityRole="button"
			{...props}
		>
			{children}
		</AnimatedPressableBase>
	);
}
