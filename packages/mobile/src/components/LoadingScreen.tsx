import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";

/** Drives both the logo box and the position of everything anchored to it. */
const LOGO_SIZE = 150;

export function LoadingScreen() {
	const isDark = useColorScheme() === "dark";
	const colors = isDark ? Colors.dark : Colors.light;
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();

	// Logo entrance
	const logoScale = useSharedValue(0.7);
	const logoOpacity = useSharedValue(0);

	// Pulsing ring
	const ringScale = useSharedValue(1);
	const ringOpacity = useSharedValue(0.5);

	// Loading dots
	const dot1 = useSharedValue(0);
	const dot2 = useSharedValue(0);
	const dot3 = useSharedValue(0);

	useEffect(() => {
		logoOpacity.value = withTiming(1, { duration: 500 });
		logoScale.value = withTiming(1, {
			duration: 600,
			easing: Easing.out(Easing.back(1.5)),
		});

		ringScale.value = withRepeat(
			withSequence(
				withTiming(1.5, { duration: 1200, easing: Easing.out(Easing.ease) }),
				withTiming(1, { duration: 0 }),
			),
			-1,
			false,
		);
		ringOpacity.value = withRepeat(
			withSequence(
				withTiming(0, { duration: 1200 }),
				withTiming(0.5, { duration: 0 }),
			),
			-1,
			false,
		);

		// Reanimated 4 moved SharedValue out of the `Animated` namespace.
		const dotAnim = (sv: SharedValue<number>, delay: number) => {
			sv.value = withDelay(
				delay,
				withRepeat(
					withSequence(
						withTiming(1, { duration: 350 }),
						withTiming(0, { duration: 350 }),
					),
					-1,
				),
			);
		};
		dotAnim(dot1, 0);
		dotAnim(dot2, 180);
		dotAnim(dot3, 360);
	}, [dot1, dot2, dot3, logoOpacity, logoScale, ringOpacity, ringScale]);

	const logoAnimStyle = useAnimatedStyle(() => ({
		opacity: logoOpacity.value,
		transform: [{ scale: logoScale.value }],
	}));

	const ringAnimStyle = useAnimatedStyle(() => ({
		opacity: ringOpacity.value,
		transform: [{ scale: ringScale.value }],
	}));

	const dot1Style = useAnimatedStyle(() => ({
		opacity: 0.3 + dot1.value * 0.7,
		transform: [{ translateY: -(dot1.value * 6) }],
	}));
	const dot2Style = useAnimatedStyle(() => ({
		opacity: 0.3 + dot2.value * 0.7,
		transform: [{ translateY: -(dot2.value * 6) }],
	}));
	const dot3Style = useAnimatedStyle(() => ({
		opacity: 0.3 + dot3.value * 0.7,
		transform: [{ translateY: -(dot3.value * 6) }],
	}));

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			{/* Logo zone */}
			<View style={styles.logoWrapper}>
				<Animated.View
					style={[styles.ring, { borderColor: colors.primary }, ringAnimStyle]}
				/>
				<Animated.View
					style={[
						styles.logoCard,
						{
							backgroundColor: colors.card,
							shadowColor: colors.primary,
						},
						logoAnimStyle,
					]}
				>
					<Image
						source={require("@/assets/icon2.png")}
						style={styles.logo}
						contentFit="contain"
					/>
				</Animated.View>
			</View>

			{/* App name */}
			<Animated.View style={[styles.textBlock, logoAnimStyle]}>
				<Text style={[styles.appName, { color: colors.foreground }]}>
					Buy
					<Text style={{ color: "#f59e0b" }}>'</Text>
					<Text style={{ color: "#f59e0b" }}>N</Text>
					<Text style={{ color: "#f59e0b" }}>'</Text>Sellem
				</Text>
				<Text style={[styles.tagline, { color: colors.mutedForeground }]}>
					{t("common.tagline")}
				</Text>
			</Animated.View>

			{/* Loading dots */}
			<View style={[styles.dotsRow, { bottom: insets.bottom + 64 }]}>
				<Animated.View
					style={[styles.dot, { backgroundColor: colors.primary }, dot1Style]}
				/>
				<Animated.View
					style={[styles.dot, { backgroundColor: colors.primary }, dot2Style]}
				/>
				<Animated.View
					style={[styles.dot, { backgroundColor: colors.primary }, dot3Style]}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		// React Native 0.86 (Expo 57) removed `StyleSheet.absoluteFillObject`;
		// only `absoluteFill` remains. Spreading the missing export silently
		// yielded nothing, so this box lost its absolute positioning and its
		// size, collapsed to fit its content, and the whole splash ended up
		// squeezed against the top of the screen. Written out explicitly so it
		// cannot break that way again.
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 9999,
	},
	logoWrapper: {
		width: LOGO_SIZE,
		height: LOGO_SIZE,
		alignItems: "center",
		justifyContent: "center",
	},
	ring: {
		position: "absolute",
		width: LOGO_SIZE,
		height: LOGO_SIZE,
		borderRadius: LOGO_SIZE / 2,
		borderWidth: 2,
	},
	logoCard: {
		width: 110,
		height: 110,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.2,
		shadowRadius: 20,
		elevation: 10,
	},
	logo: {
		width: 80,
		height: 80,
	},
	textBlock: {
		// Anchored below the centred logo rather than stacked after it in the
		// flow: keeping it in the flow pushed the logo above the screen centre
		// and broke the handover from the native splash, which centres its icon.
		position: "absolute",
		top: "50%",
		marginTop: LOGO_SIZE / 2 + 32,
		// left/right are required: an absolutely positioned box no longer
		// inherits the container's alignItems, so without them it would hug its
		// content and sit against the left edge.
		left: 0,
		right: 0,
		alignItems: "center",
	},
	appName: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 32,
		letterSpacing: -0.5,
	},
	tagline: {
		fontFamily: Fonts.body,
		fontSize: 14,
		marginTop: 6,
	},
	dotsRow: {
		// Pinned near the bottom: a progress indicator does not belong in the
		// vertical centring of the logo.
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "center",
		gap: 8,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
});
