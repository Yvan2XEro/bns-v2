import type { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { AnimatedPressable } from "./AnimatedPressable";
import {
	Auth,
	Boost,
	Empty,
	Favorites,
	NoListings,
	NoMessages,
	NotFound,
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
	notFound: NotFound,
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
	"alert-circle-outline": "notFound",
	"help-circle-outline": "notFound",
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
	/** A quieter way out beside the CTA, e.g. "Back" under "Retry". */
	secondaryLabel?: string;
	onSecondary?: () => void;
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
	secondaryLabel,
	onSecondary,
	size = 220,
}: EmptyStateProps) {
	// Resolve illustration: explicit > icon mapping > default
	const resolvedIllustration: EmptyStateIllustration =
		illustration ?? (icon ? (ICON_TO_ILLUSTRATION[icon] ?? "empty") : "empty");
	const c = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	const reducedMotion = useReducedMotion();
	const color = c.primary;

	const opacity = useSharedValue(0);
	const translateY = useSharedValue(reducedMotion ? 0 : 20);
	const illustrationScale = useSharedValue(reducedMotion ? 1 : 0.7);

	useEffect(() => {
		opacity.value = withTiming(1, { duration: reducedMotion ? 200 : 400 });
		if (reducedMotion) {
			translateY.value = 0;
			illustrationScale.value = 1;
			return;
		}
		translateY.value = withSpring(0, { damping: 16, stiffness: 160 });
		illustrationScale.value = withDelay(
			80,
			withSpring(1, { damping: 10, stiffness: 200 }),
		);
	}, [illustrationScale, opacity, translateY, reducedMotion]);

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

			<Text
				style={[styles.title, { color: c.foreground }]}
				accessibilityRole="header"
			>
				{title}
			</Text>

			{subtitle && (
				<Text style={[styles.subtitle, { color: c.body }]}>{subtitle}</Text>
			)}

			{ctaLabel && onCta && (
				<AnimatedPressable
					onPress={onCta}
					animationType="scale"
					accessibilityRole="button"
					accessibilityLabel={ctaLabel}
					style={[styles.cta, { backgroundColor: c.primaryFill }]}
				>
					<Text style={styles.ctaText}>{ctaLabel}</Text>
				</AnimatedPressable>
			)}

			{secondaryLabel && onSecondary && (
				<Pressable
					onPress={onSecondary}
					accessibilityRole="button"
					accessibilityLabel={secondaryLabel}
					style={({ pressed }) => [
						styles.secondary,
						pressed && { opacity: 0.6 },
					]}
				>
					<Text style={[styles.secondaryText, { color: c.link }]}>
						{secondaryLabel}
					</Text>
				</Pressable>
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
		lineHeight: 24,
		textAlign: "center",
		marginBottom: 8,
		// Caps the line length on iPad; wider than any phone content box so
		// phone rendering is untouched.
		maxWidth: 420,
	},
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 15,
		textAlign: "center",
		marginBottom: 24,
		lineHeight: 22,
		maxWidth: 420,
	},
	cta: {
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	secondary: {
		minHeight: 48,
		marginTop: 4,
		paddingHorizontal: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	secondaryText: { fontFamily: Fonts.bodyBold, fontSize: 16, lineHeight: 22 },
	ctaText: {
		color: "#ffffff",
		fontFamily: Fonts.bodyBold,
		fontSize: 16,
		lineHeight: 22,
	},
});
