import { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;

function SkeletonBlock({
	width: w,
	height: h,
	borderRadius = 6,
	style,
}: {
	width: number | string;
	height: number;
	borderRadius?: number;
	style?: object;
}) {
	const isDark = useColorScheme() === "dark";
	const opacity = useSharedValue(1);

	useEffect(() => {
		opacity.value = withRepeat(
			withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
			-1,
			true,
		);
	}, [opacity]);

	const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

	return (
		<Animated.View
			style={[
				{
					width: w as any,
					height: h,
					borderRadius,
					backgroundColor: isDark ? "#1e3a5f" : "#e2e8f0",
				},
				animStyle,
				style,
			]}
		/>
	);
}

export function SkeletonCard({ cardWidth }: { cardWidth?: number }) {
	const w = cardWidth ?? CARD_WIDTH;

	return (
		<View style={[styles.card, { width: w }]}>
			<SkeletonBlock width={w} height={w * 0.75} borderRadius={0} />
			<View style={styles.content}>
				<SkeletonBlock width="55%" height={14} />
				<SkeletonBlock width="80%" height={12} style={{ marginTop: 6 }} />
				<SkeletonBlock width="60%" height={10} style={{ marginTop: 6 }} />
			</View>
		</View>
	);
}

export function SkeletonRow() {
	const isDark = useColorScheme() === "dark";
	return (
		<View
			style={[styles.row, { backgroundColor: isDark ? "#1e293b" : "#fff" }]}
		>
			<SkeletonBlock width={70} height={70} borderRadius={8} />
			<View style={styles.rowContent}>
				<SkeletonBlock width="70%" height={13} />
				<SkeletonBlock width="40%" height={12} style={{ marginTop: 6 }} />
				<SkeletonBlock
					width="30%"
					height={18}
					borderRadius={12}
					style={{ marginTop: 6 }}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "#e2e8f0",
	},
	content: { padding: 10, gap: 0 },
	row: {
		flexDirection: "row",
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#e2e8f0",
		padding: 10,
		gap: 12,
		alignItems: "center",
	},
	rowContent: { flex: 1, gap: 0 },
});
