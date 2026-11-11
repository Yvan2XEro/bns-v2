import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TouchableWithoutFeedback,
	View,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

export interface MessageAction {
	key: string;
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
	onPress: () => void;
}

interface MessageActionSheetProps {
	/** The message the actions apply to; null closes the sheet. */
	preview: string | null;
	actions: MessageAction[];
	onClose: () => void;
}

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Long enough for the sheet to leave before the action runs (a toast, a resend). */
const EXIT_DELAY = 200;

/**
 * What a long press on a message offers: copy it, resend it when it failed.
 * The same sheet geometry and motion as the alert sheet (`CustomAlert`), so
 * the thread has one way of asking — without its icon and headline, which
 * would make two plain actions read like a warning.
 */
export function MessageActionSheet({
	preview,
	actions,
	onClose,
}: MessageActionSheetProps) {
	const isDark = useColorScheme() === "dark";
	const C = Colors[isDark ? "dark" : "light"];
	const { t } = useTranslation();
	const reduced = useReducedMotion();
	const insets = useSafeAreaInsets();
	const { isTablet, width, dialogMaxWidth } = useResponsive();
	const visible = preview !== null;

	// The text stays on screen while the sheet slides away.
	const [shown, setShown] = useState<string | null>(preview);
	const [modalOpen, setModalOpen] = useState(false);
	const sheetY = useSharedValue(400);
	const fade = useSharedValue(0);
	const pending = useRef<(() => void) | null>(null);
	// Likewise its rows: the caller clears them as soon as it closes.
	const lastActions = useRef(actions);
	if (visible) lastActions.current = actions;
	const rows = visible ? actions : lastActions.current;

	useEffect(() => {
		if (visible) {
			setShown(preview);
			setModalOpen(true);
			sheetY.value = reduced ? 0 : 400;
			fade.value = 0;
			sheetY.value = withTiming(0, {
				duration: reduced ? 0 : 320,
				easing: EASE_OUT,
			});
			fade.value = withTiming(1, { duration: 220 });
			return;
		}
		sheetY.value = reduced
			? 0
			: withTiming(400, { duration: 180, easing: Easing.in(Easing.quad) });
		fade.value = withTiming(0, { duration: 180 });
		const id = setTimeout(() => {
			setModalOpen(false);
			const run = pending.current;
			pending.current = null;
			run?.();
		}, EXIT_DELAY);
		return () => clearTimeout(id);
	}, [visible, preview, reduced, sheetY, fade]);

	const sheetAnim = useAnimatedStyle(() => ({
		transform: [{ translateY: sheetY.value }],
		// With Reduce Motion the sheet fades in place instead of rising.
		opacity: reduced ? fade.value : 1,
	}));
	const backdropAnim = useAnimatedStyle(() => ({ opacity: fade.value }));

	const choose = (action: MessageAction) => {
		pending.current = action.onPress;
		onClose();
	};

	const tabletSheetStyle = isTablet
		? {
				left: Math.max(0, (width - dialogMaxWidth) / 2),
				right: Math.max(0, (width - dialogMaxWidth) / 2),
				borderBottomLeftRadius: 28,
				borderBottomRightRadius: 28,
				marginBottom: 24,
			}
		: null;

	return (
		<Modal
			visible={modalOpen}
			transparent
			animationType="none"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<TouchableWithoutFeedback onPress={onClose} accessible={false}>
				<Animated.View
					style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnim]}
				/>
			</TouchableWithoutFeedback>

			<Animated.View
				accessibilityViewIsModal
				style={[
					styles.sheet,
					{
						backgroundColor: C.card,
						paddingBottom: Math.max(insets.bottom + 12, 24),
					},
					tabletSheetStyle,
					sheetAnim,
				]}
			>
				<View style={[styles.handle, { backgroundColor: C.border }]} />

				{shown ? (
					<View style={[styles.preview, { backgroundColor: C.well }]}>
						<Text
							style={[styles.previewText, { color: C.mutedForeground }]}
							numberOfLines={3}
						>
							{shown}
						</Text>
					</View>
				) : null}

				<View style={styles.actions}>
					{rows.map((action) => (
						<Pressable
							key={action.key}
							onPress={() => choose(action)}
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.action,
								{ backgroundColor: pressed ? C.well : "transparent" },
							]}
						>
							<Ionicons name={action.icon} size={22} color={C.foreground} />
							<Text style={[styles.actionText, { color: C.foreground }]}>
								{action.label}
							</Text>
						</Pressable>
					))}
				</View>

				<Pressable
					onPress={onClose}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.cancel,
						{ borderColor: C.border, opacity: pressed ? 0.7 : 1 },
					]}
				>
					<Text style={[styles.cancelText, { color: C.foreground }]}>
						{t("common.cancel")}
					</Text>
				</Pressable>
			</Animated.View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { backgroundColor: "rgba(12, 16, 48, 0.6)" },
	sheet: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingHorizontal: 16,
		paddingTop: 8,
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: -6 },
		shadowOpacity: 0.14,
		shadowRadius: 20,
		elevation: 24,
	},
	handle: {
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: 2,
		marginTop: 4,
		marginBottom: 16,
	},
	preview: {
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 10,
		marginBottom: 8,
	},
	previewText: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	actions: { paddingVertical: 4 },
	action: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		minHeight: 52,
		paddingHorizontal: 12,
		borderRadius: 12,
	},
	actionText: { fontSize: 16, fontFamily: Fonts.bodySemibold },
	cancel: {
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 8,
	},
	cancelText: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
