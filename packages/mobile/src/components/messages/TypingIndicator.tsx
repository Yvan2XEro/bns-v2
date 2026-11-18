import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

const STEP = 160;

function Dot({
	progress,
	color,
}: {
	progress: SharedValue<number>;
	color: string;
}) {
	const style = useAnimatedStyle(() => ({
		opacity: 0.3 + progress.value * 0.7,
		transform: [{ translateY: -2 * progress.value }],
	}));
	return (
		<Animated.View style={[styles.dot, { backgroundColor: color }, style]} />
	);
}

/**
 * The other person is writing: three dots that rise in turn, on the UI
 * thread. With Reduce Motion on they sit still, the bubble alone says it.
 */
export function TypingIndicator({ color }: { color: string }) {
	const reduced = useReducedMotion();
	const a = useSharedValue(0);
	const b = useSharedValue(0);
	const c = useSharedValue(0);

	useEffect(() => {
		const dots = [a, b, c];
		if (reduced) {
			for (const d of dots) {
				cancelAnimation(d);
				d.value = 0.4;
			}
			return;
		}
		dots.forEach((d, i) => {
			d.value = withDelay(
				i * STEP,
				withRepeat(
					withSequence(
						withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
						withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
						withTiming(0, { duration: STEP * 2 }),
					),
					-1,
				),
			);
		});
		return () => {
			for (const d of dots) cancelAnimation(d);
		};
	}, [reduced, a, b, c]);

	return (
		<View style={styles.row}>
			<Dot progress={a} color={color} />
			<Dot progress={b} color={color} />
			<Dot progress={c} color={color} />
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		gap: 5,
		alignItems: "center",
		height: 22,
	},
	dot: { width: 8, height: 8, borderRadius: 4 },
});
