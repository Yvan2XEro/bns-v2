import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useResponsive } from "@/src/hooks/useResponsive";
import { type FeedbackKind, feedback } from "@/src/lib/feedback";

/**
 * Transient confirmation: "Saved", "Link copied", "Review published". It
 * never blocks the screen and leaves on its own — a dialog is for decisions,
 * not for news. Mounted once, by `AlertProvider`.
 */
export type ToastType = "success" | "info";

interface ToastRequest {
	type: ToastType;
	title: string;
	message?: string;
}

let listener: ((request: ToastRequest) => void) | null = null;

export const toast = {
	show(request: ToastRequest) {
		listener?.(request);
	},
};

const GLYPH: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
	success: "checkmark",
	info: "information",
};
const GLYPH_BG: Record<ToastType, string> = {
	success: "#34b26a",
	info: "#3b82f6",
};
const SOUND: Record<ToastType, FeedbackKind> = {
	success: "success",
	info: "pop",
};

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export function ToastHost() {
	const insets = useSafeAreaInsets();
	const reduced = useReducedMotion();
	const { dialogMaxWidth } = useResponsive();
	const [current, setCurrent] = useState<ToastRequest | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>(null);
	const shown = useSharedValue(0);

	const hide = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		shown.value = withTiming(0, { duration: 160 }, (done) => {
			if (done) runOnJS(setCurrent)(null);
		});
	}, [shown]);

	useEffect(() => {
		listener = (request) => {
			if (timer.current) clearTimeout(timer.current);
			setCurrent(request);
			shown.value = 0;
			shown.value = withTiming(1, { duration: 280, easing: EASE_OUT });
			feedback(SOUND[request.type]);
			AccessibilityInfo.announceForAccessibility(
				[request.title, request.message].filter(Boolean).join(". "),
			);
			// Three to five seconds: long enough to read, never in the way.
			const chars = `${request.title} ${request.message ?? ""}`.length;
			timer.current = setTimeout(
				hide,
				Math.max(3000, Math.min(5000, 2000 + chars * 30)),
			);
		};
		return () => {
			listener = null;
			if (timer.current) clearTimeout(timer.current);
		};
	}, [hide, shown]);

	const style = useAnimatedStyle(() => ({
		opacity: shown.value,
		transform: reduced
			? []
			: [
					{ translateY: (1 - shown.value) * -16 },
					{ scale: 0.96 + shown.value * 0.04 },
				],
	}));

	if (!current) return null;

	return (
		<View
			pointerEvents="box-none"
			style={[styles.host, { top: insets.top + 8 }]}
		>
			<Animated.View style={[styles.wrap, { maxWidth: dialogMaxWidth }, style]}>
				<Pressable onPress={hide} accessibilityRole="alert" style={styles.card}>
					<View
						style={[styles.glyph, { backgroundColor: GLYPH_BG[current.type] }]}
					>
						<Ionicons name={GLYPH[current.type]} size={16} color="#ffffff" />
					</View>
					<View style={styles.words}>
						<Text style={styles.title} numberOfLines={2}>
							{current.title}
						</Text>
						{current.message ? (
							<Text style={styles.message} numberOfLines={3}>
								{current.message}
							</Text>
						) : null}
					</View>
				</Pressable>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	host: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
		paddingHorizontal: 12,
		zIndex: 1000,
		elevation: 1000,
	},
	wrap: { width: "100%" },
	card: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		paddingLeft: 12,
		paddingRight: 16,
		borderRadius: 16,
		backgroundColor: "#12163a",
		borderWidth: 1,
		borderColor: "#2a3170",
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.28,
		shadowRadius: 18,
		elevation: 12,
	},
	glyph: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	words: { flex: 1, gap: 2 },
	title: { color: "#ffffff", fontSize: 15, fontFamily: Fonts.bodySemibold },
	message: {
		color: "#c5ccf0",
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
	},
});
