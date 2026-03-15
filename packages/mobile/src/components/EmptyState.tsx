import type { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "./AnimatedPressable";
import {
	Auth,
	Boost,
	Empty,
	Favorites,
	NoListings,
	NoMessages,
	Searching,
	Sell,
} from "./illustrations";

const ILLUSTRATION_MAP = {
	empty: Empty,
	searching: Searching,
	favorites: Favorites,
	messages: NoMessages,
	sell: Sell,
	auth: Auth,
	boost: Boost,
	listings: NoListings,
} as const;

export type EmptyStateIllustration = keyof typeof ILLUSTRATION_MAP;

// Map legacy Ionicons names → illustration keys
const ICON_TO_ILLUSTRATION: Record<string, EmptyStateIllustration> = {
	"cube-outline": "empty",
	cube: "empty",
	search: "searching",
	"search-outline": "searching",
	"bookmark-outline": "favorites",
	bookmark: "favorites",
	"heart-outline": "favorites",
	heart: "favorites",
	"chatbubbles-outline": "messages",
	chatbubbles: "messages",
	"chatbubble-outline": "messages",
	"add-circle-outline": "sell",
	"storefront-outline": "listings",
	storefront: "listings",
	"rocket-outline": "boost",
	rocket: "boost",
	"lock-closed-outline": "auth",
	"person-outline": "auth",
};

interface EmptyStateProps {
	/** SVG illustration to display */
	illustration?: EmptyStateIllustration;
	/** @deprecated use illustration instead */
	icon?: keyof typeof Ionicons.glyphMap;
	/** Custom illustration component (overrides `illustration`) */
	illustrationNode?: ReactNode;
	title: string;
	subtitle?: string;
	ctaLabel?: string;
	onCta?: () => void;
	size?: number;
}

export function EmptyState({
	illustration,
	icon,
	illustrationNode,
	title,
	subtitle,
	ctaLabel,
	onCta,
	size = 220,
}: EmptyStateProps) {
	// Resolve illustration: explicit > icon mapping > default
	const resolvedIllustration: EmptyStateIllustration =
		illustration ?? (icon ? (ICON_TO_ILLUSTRATION[icon] ?? "empty") : "empty");
	const isDark = useColorScheme() === "dark";
	const color = isDark ? "#3b82f6" : "#1e40af";

	const opacity = useSharedValue(0);
	const translateY = useSharedValue(20);
	const illustrationScale = useSharedValue(0.7);

	useEffect(() => {
		opacity.value = withTiming(1, { duration: 400 });
		translateY.value = withSpring(0, { damping: 16, stiffness: 160 });
		illustrationScale.value = withDelay(
			80,
			withSpring(1, { damping: 10, stiffness: 200 }),
		);
	}, [illustrationScale, opacity, translateY]);

	const containerStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateY: translateY.value }],
	}));

	const illustrationStyle = useAnimatedStyle(() => ({
		transform: [{ scale: illustrationScale.value }],
	}));

	const IllustrationComponent = ILLUSTRATION_MAP[resolvedIllustration];

	return (
		<Animated.View style={[styles.container, containerStyle]}>
			<Animated.View style={[styles.illustrationWrap, illustrationStyle]}>
				{illustrationNode ?? (
					<IllustrationComponent color={color} size={size} />
				)}
			</Animated.View>

			<Text style={[styles.title, { color: isDark ? "#e2e8f0" : "#0f172a" }]}>
				{title}
			</Text>

			{subtitle && (
				<Text
					style={[styles.subtitle, { color: isDark ? "#94a3b8" : "#64748b" }]}
				>
					{subtitle}
				</Text>
			)}

			{ctaLabel && onCta && (
				<AnimatedPressable
					onPress={onCta}
					animationType="lift"
					haptic="light"
					style={[
						styles.cta,
						{ backgroundColor: isDark ? "#3b82f6" : "#1e40af" },
					]}
				>
					<Text style={styles.ctaText}>{ctaLabel}</Text>
				</AnimatedPressable>
			)}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
	},
	illustrationWrap: {
		marginBottom: 20,
	},
	title: {
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 14,
		textAlign: "center",
		marginBottom: 24,
		lineHeight: 20,
	},
	cta: {
		borderRadius: 12,
		paddingHorizontal: 28,
		paddingVertical: 13,
	},
	ctaText: {
		color: "#fff",
		fontFamily: Fonts.displayBold,
		fontSize: 15,
	},
});
