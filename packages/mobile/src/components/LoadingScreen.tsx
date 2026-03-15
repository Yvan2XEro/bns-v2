import { Image } from "expo-image";
import { useEffect } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width } = Dimensions.get("window");

export function LoadingScreen() {
	const isDark = useColorScheme() === "dark";
	const colors = isDark ? Colors.dark : Colors.light;

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

		const dotAnim = (sv: Animated.SharedValue<number>, delay: number) => {
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
					Acheter & Vendre, Simplement.
				</Text>
			</Animated.View>

			{/* Loading dots */}
			<View style={styles.dotsRow}>
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
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 9999,
	},
	logoWrapper: {
		width: 150,
		height: 150,
		alignItems: "center",
		justifyContent: "center",
	},
	ring: {
		position: "absolute",
		width: 150,
		height: 150,
		borderRadius: 75,
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
		alignItems: "center",
		marginTop: 32,
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
		flexDirection: "row",
		gap: 8,
		marginTop: 60,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
});
