/**
 * Reusable animation components — entrance effects, stagger, transitions.
 * All respect the system Reduce Motion setting.
 */

import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Animated, {
	Easing,
	FadeIn,
	FadeInDown,
	FadeInUp,
	FadeOut,
	interpolate,
	Layout,
	SlideInDown,
	SlideInRight,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { SpringPresets } from "@/constants/theme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

// ─── 1. FadeInView ────────────────────────────────────────────────────────────

interface FadeInViewProps {
	children: React.ReactNode;
	delay?: number;
	duration?: number;
	translateY?: number;
	style?: StyleProp<ViewStyle>;
}

export function FadeInView({
	children,
	delay = 0,
	duration = 400,
	translateY = 16,
	style,
}: FadeInViewProps) {
	const reduced = useReducedMotion();
	const progress = useSharedValue(reduced ? 1 : 0);

	useEffect(() => {
		if (reduced) return;
		progress.value = withDelay(
			delay,
			withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
		);
	}, [delay, duration, progress, reduced]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [
			{ translateY: interpolate(progress.value, [0, 1], [translateY, 0]) },
		],
	}));

	if (reduced) return <View style={style}>{children}</View>;

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── 2. StaggeredItem ─────────────────────────────────────────────────────────

interface StaggeredItemProps {
	children: React.ReactNode;
	index: number;
	staggerDelay?: number;
	style?: StyleProp<ViewStyle>;
}

export function StaggeredItem({
	children,
	index,
	staggerDelay = 60,
	style,
}: StaggeredItemProps) {
	const reduced = useReducedMotion();
	const progress = useSharedValue(reduced ? 1 : 0);

	useEffect(() => {
		if (reduced) return;
		progress.value = withDelay(
			index * staggerDelay,
			withSpring(1, { damping: 18, stiffness: 200 }),
		);
	}, [index, progress, reduced, staggerDelay]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0, 1], [0, 1]),
		transform: [
			{ translateY: interpolate(progress.value, [0, 1], [20, 0]) },
			{ scale: interpolate(progress.value, [0, 1], [0.95, 1]) },
		],
	}));

	if (reduced) return <View style={style}>{children}</View>;

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── 3. ScaleOnMount ──────────────────────────────────────────────────────────

interface ScaleOnMountProps {
	children: React.ReactNode;
	delay?: number;
	style?: StyleProp<ViewStyle>;
}

export function ScaleOnMount({
	children,
	delay = 0,
	style,
}: ScaleOnMountProps) {
	const scale = useSharedValue(0.8);
	const opacity = useSharedValue(0);

	useEffect(() => {
		scale.value = withDelay(delay, withSpring(1, SpringPresets.bouncy));
		opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
	}, [delay, opacity, scale]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── 4. PulsingBadge ──────────────────────────────────────────────────────────

interface PulsingBadgeProps {
	children: React.ReactNode;
	active?: boolean;
	style?: StyleProp<ViewStyle>;
}

export function PulsingBadge({
	children,
	active = true,
	style,
}: PulsingBadgeProps) {
	const scale = useSharedValue(1);

	useEffect(() => {
		if (active) {
			scale.value = withRepeat(
				withSequence(
					withTiming(1.15, {
						duration: 600,
						easing: Easing.inOut(Easing.ease),
					}),
					withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
				),
				-1,
				true,
			);
		} else {
			scale.value = withTiming(1, { duration: 200 });
		}
	}, [active, scale]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── 5. AnimatedBookmark (bounce toggle) ─────────────────────────────────────

interface AnimatedBookmarkProps {
	children: React.ReactNode;
	isActive: boolean;
	style?: StyleProp<ViewStyle>;
}

export function AnimatedBookmark({
	children,
	isActive,
	style,
}: AnimatedBookmarkProps) {
	const scale = useSharedValue(1);

	useEffect(() => {
		if (isActive) {
			scale.value = withSequence(
				withTiming(0.6, { duration: 80 }),
				withSpring(1.2, { damping: 8, stiffness: 400 }),
				withSpring(1, { damping: 12, stiffness: 300 }),
			);
		}
	}, [isActive, scale]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── 6. ContentTransition (skeleton → content) ───────────────────────────────

interface ContentTransitionProps {
	children: React.ReactNode;
	isLoading: boolean;
	skeleton: React.ReactNode;
	style?: StyleProp<ViewStyle>;
}

export function ContentTransition({
	children,
	isLoading,
	skeleton,
	style,
}: ContentTransitionProps) {
	if (isLoading) {
		return (
			<Animated.View exiting={FadeOut.duration(200)} style={style}>
				{skeleton}
			</Animated.View>
		);
	}
	return (
		<Animated.View entering={FadeIn.duration(250)} style={style}>
			{children}
		</Animated.View>
	);
}

// ─── 7. SectionEntrance ───────────────────────────────────────────────────────

interface SectionEntranceProps {
	children: React.ReactNode;
	delay?: number;
	style?: StyleProp<ViewStyle>;
}

export function SectionEntrance({
	children,
	delay = 0,
	style,
}: SectionEntranceProps) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = withDelay(
			delay,
			withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
		);
	}, [delay, progress]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ translateY: interpolate(progress.value, [0, 1], [24, 0]) }],
	}));

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── 8. SlideIn (horizontal entrance) ────────────────────────────────────────

interface SlideInProps {
	children: React.ReactNode;
	delay?: number;
	style?: StyleProp<ViewStyle>;
}

export function SlideIn({ children, delay = 0, style }: SlideInProps) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = withDelay(delay, withSpring(1, SpringPresets.gentle));
	}, [delay, progress]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ translateX: interpolate(progress.value, [0, 1], [40, 0]) }],
	}));

	return (
		<Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
	);
}

// ─── Re-exports (layout animations) ──────────────────────────────────────────
export {
	FadeIn,
	FadeOut,
	FadeInDown,
	FadeInUp,
	SlideInDown,
	SlideInRight,
	Layout,
};
