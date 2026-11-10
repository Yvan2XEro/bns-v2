import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { feedback } from "@/src/lib/feedback";

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The moment a listing goes live: a yellow price tag is stamped onto the
 * screen, the way a trader paints a price on a sign, with the balafon's
 * three rising notes. With Reduce Motion it simply appears.
 */
export function PublishedStamp() {
	const reduced = useReducedMotion();
	const scale = useSharedValue(reduced ? 1 : 1.6);
	const opacity = useSharedValue(0);
	const rotate = useSharedValue(reduced ? -6 : 8);
	const ring = useSharedValue(0);

	// Once per stamp: the motion effect below re-runs when Reduce Motion is
	// read, the sound must not.
	useEffect(() => {
		feedback("success");
	}, []);

	useEffect(() => {
		opacity.value = withTiming(1, { duration: reduced ? 200 : 140 });
		if (reduced) return;
		scale.value = withTiming(1, { duration: 420, easing: EASE_OUT });
		rotate.value = withTiming(-6, { duration: 420, easing: EASE_OUT });
		// The ink spreading where the stamp landed.
		ring.value = withDelay(
			180,
			withTiming(1, { duration: 520, easing: EASE_OUT }),
		);
	}, [opacity, reduced, ring, rotate, scale]);

	const tagStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
	}));
	const ringStyle = useAnimatedStyle(() => ({
		opacity: (1 - ring.value) * 0.5,
		transform: [{ scale: 0.9 + ring.value * 0.6 }],
	}));

	return (
		<View style={styles.wrap} accessibilityElementsHidden>
			<Animated.View style={[styles.ring, ringStyle]} />
			<Animated.View style={[styles.tag, tagStyle]}>
				<View style={styles.hole} />
				<Ionicons name="checkmark" size={44} color="#12163a" />
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: 140,
		height: 120,
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "center",
		marginBottom: 20,
	},
	ring: {
		position: "absolute",
		width: 112,
		height: 84,
		borderRadius: 18,
		borderWidth: 3,
		borderColor: "#ffb81c",
	},
	tag: {
		width: 112,
		height: 84,
		borderRadius: 18,
		backgroundColor: "#ffb81c",
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: 4,
		borderBottomColor: "#9a6a00",
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.18,
		shadowRadius: 10,
		elevation: 6,
	},
	// The tag's string hole, so it reads as a price tag, not a button.
	hole: {
		position: "absolute",
		top: 10,
		left: 12,
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "#fff1c7",
		borderWidth: 2,
		borderColor: "#9a6a00",
	},
});
