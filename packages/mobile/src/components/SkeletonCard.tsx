import { useEffect } from "react";
import {
	type DimensionValue,
	type StyleProp,
	StyleSheet,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

/**
 * The one skeleton primitive. It breathes slowly while content loads (the one
 * loop DESIGN.md allows) and holds still under Reduce Motion.
 */
export function SkeletonBlock({
	width: w,
	height: h,
	borderRadius = 6,
	style,
}: {
	width: DimensionValue;
	height: number;
	borderRadius?: number;
	style?: StyleProp<ViewStyle>;
}) {
	const isDark = useColorScheme() === "dark";
	const reduced = useReducedMotion();
	const opacity = useSharedValue(1);

	useEffect(() => {
		if (reduced) {
			opacity.value = 0.7;
			return;
		}
		opacity.value = withRepeat(
			withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
			-1,
			true,
		);
	}, [opacity, reduced]);

	const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

	return (
		<Animated.View
			style={[
				{
					width: w,
					height: h,
					borderRadius,
					backgroundColor: isDark ? Colors.dark.border : Colors.light.border,
				},
				animStyle,
				style,
			]}
		/>
	);
}

export function SkeletonCard({ cardWidth }: { cardWidth?: number }) {
	// Live width — keeps the placeholder in sync with ListingCard on rotation.
	const { width } = useWindowDimensions();
	const w = cardWidth ?? (width - 48) / 2;

	return (
		<View style={[styles.card, { width: w }]}>
			<SkeletonBlock
				width={w}
				height={Math.round(w * 0.75)}
				borderRadius={14}
			/>
			<View style={styles.content}>
				<SkeletonBlock width="85%" height={13} />
				<SkeletonBlock width="55%" height={13} style={{ marginTop: 5 }} />
				<SkeletonBlock width="45%" height={10} style={{ marginTop: 7 }} />
			</View>
		</View>
	);
}

export function SkeletonRow() {
	const isDark = useColorScheme() === "dark";
	const c = isDark ? Colors.dark : Colors.light;
	return (
		<View
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<SkeletonBlock width={70} height={70} borderRadius={10} />
			<View style={styles.rowContent}>
				<SkeletonBlock width="70%" height={13} />
				<SkeletonBlock width="40%" height={12} style={{ marginTop: 6 }} />
				<SkeletonBlock
					width="30%"
					height={18}
					borderRadius={8}
					style={{ marginTop: 6 }}
				/>
			</View>
		</View>
	);
}

/**
 * Matches the inbox row: 52pt avatar, name and time, context, preview, and the
 * listing photo on the right. The hairline starts under the name (80pt inset),
 * as the loaded list draws it.
 */
export function SkeletonConversationRow() {
	const isDark = useColorScheme() === "dark";
	const c = isDark ? Colors.dark : Colors.light;
	return (
		<View style={{ backgroundColor: c.card }}>
			<View style={convStyles.row}>
				<SkeletonBlock width={52} height={52} borderRadius={26} />
				<View style={convStyles.content}>
					<View style={convStyles.topRow}>
						<SkeletonBlock width="52%" height={14} />
						<SkeletonBlock width={34} height={10} borderRadius={4} />
					</View>
					<SkeletonBlock width="40%" height={11} style={{ marginTop: 7 }} />
					<SkeletonBlock width="72%" height={12} style={{ marginTop: 7 }} />
				</View>
				<SkeletonBlock width={48} height={48} borderRadius={10} />
			</View>
			<View style={[convStyles.separator, { backgroundColor: c.border }]} />
		</View>
	);
}

export function SkeletonMessageBubbles() {
	const bubbles = [
		{ isMe: false, widthPct: "58%", height: 40 },
		{ isMe: true, widthPct: "44%", height: 40 },
		{ isMe: false, widthPct: "68%", height: 58 },
		{ isMe: true, widthPct: "52%", height: 40 },
		{ isMe: false, widthPct: "40%", height: 40 },
		{ isMe: true, widthPct: "62%", height: 58 },
	];
	// Anchored to the composer, as the thread itself opens on its latest
	// message: the swap to real bubbles happens where the eye already is.
	return (
		<View
			style={{
				flex: 1,
				justifyContent: "flex-end",
				paddingHorizontal: 12,
				paddingVertical: 16,
				gap: 8,
			}}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			{bubbles.map((b, i) => (
				<View
					key={i}
					style={{
						flexDirection: "row",
						justifyContent: b.isMe ? "flex-end" : "flex-start",
						alignItems: "flex-end",
						gap: 6,
					}}
				>
					{!b.isMe && (
						<SkeletonBlock width={28} height={28} borderRadius={14} />
					)}
					{/* The thread's own geometry: radius 20, the tail corner squared
					    toward the sender, so the swap to real messages holds still. */}
					<SkeletonBlock
						width={b.widthPct as DimensionValue}
						height={b.height}
						borderRadius={20}
						style={
							b.isMe
								? { borderBottomRightRadius: 6 }
								: { borderBottomLeftRadius: 6 }
						}
					/>
				</View>
			))}
		</View>
	);
}

const convStyles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 76,
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 12,
	},
	content: { flex: 1 },
	topRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	separator: { height: StyleSheet.hairlineWidth, marginLeft: 80 },
});

const styles = StyleSheet.create({
	card: {},
	content: { paddingTop: 8, paddingHorizontal: 2, paddingBottom: 4 },
	row: {
		flexDirection: "row",
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
		gap: 12,
		alignItems: "center",
	},
	rowContent: { flex: 1, gap: 0 },
});
