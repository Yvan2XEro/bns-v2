/**
 * CustomAlert — the sheet for decisions and errors.
 *
 * Passing good news is a toast (see Toast.tsx); this sheet is for what needs
 * an answer or must not be missed. It rises from the bottom with a
 * decelerating ease, one tinted tile names the kind, and the actions sit
 * at its foot: side by side for two, stacked for more.
 */

import { Ionicons } from "@expo/vector-icons";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";
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
	withDelay,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useResponsive } from "@/src/hooks/useResponsive";
import { feedback } from "@/src/lib/feedback";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertType = "success" | "error" | "warning" | "info" | "confirm";

export interface AlertButton {
	text: string;
	onPress?: () => void;
	style?: "default" | "cancel" | "destructive";
}

interface CustomAlertProps {
	visible: boolean;
	type?: AlertType;
	title: string;
	message?: string;
	buttons?: AlertButton[];
	onClose: () => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** The tile's ink and its tinted ground, per kind and theme. */
const TONE: Record<
	AlertType,
	{ light: [string, string]; dark: [string, string] }
> = {
	success: {
		light: [Colors.light.success, Colors.light.successTint],
		dark: [Colors.dark.success, Colors.dark.successTint],
	},
	error: {
		light: [Colors.light.destructive, Colors.light.dangerTint],
		dark: [Colors.dark.dangerText, Colors.dark.dangerTint],
	},
	warning: {
		light: [Colors.light.warning, Colors.light.warningTint],
		dark: [Colors.dark.warning, Colors.dark.warningTint],
	},
	info: {
		light: [Colors.light.primary, Colors.light.primaryTint],
		dark: [Colors.dark.link, Colors.dark.primaryTint],
	},
	confirm: {
		light: [Colors.light.primary, Colors.light.primaryTint],
		dark: [Colors.dark.link, Colors.dark.primaryTint],
	},
};

const ICON: Record<AlertType, keyof typeof Ionicons.glyphMap> = {
	success: "checkmark",
	error: "close",
	warning: "alert",
	info: "information",
	confirm: "help",
};

/** Deep indigo in both themes, so white labels keep their contrast. */
const ACTION_BG = Colors.light.ownBubble;
const DESTRUCTIVE_BG = "#d23a2e";

// ─── Animation constants ──────────────────────────────────────────────────────

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const ALERT_EXIT_DELAY = 220;
const EXIT_DELAY = ALERT_EXIT_DELAY;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomAlert({
	visible,
	type = "info",
	title,
	message,
	buttons = [{ text: i18next.t("common.ok") }],
	onClose,
}: CustomAlertProps) {
	const isDark = useColorScheme() === "dark";
	const reduced = useReducedMotion();
	const insets = useSafeAreaInsets();
	const { isTablet, width, dialogMaxWidth } = useResponsive();
	// On iPad the full-bleed sheet becomes a centred, width-capped dialog.
	const tabletSheetStyle = isTablet
		? {
				left: Math.max(0, (width - dialogMaxWidth) / 2),
				right: Math.max(0, (width - dialogMaxWidth) / 2),
				borderBottomLeftRadius: 28,
				borderBottomRightRadius: 28,
				marginBottom: 24,
			}
		: null;

	const cardBg = isDark ? "#1a1f4a" : "#ffffff";
	const textColor = isDark ? "#e1e3ee" : "#12163a";
	const mutedColor = isDark ? "#a3a7c8" : "#5b6088";
	const dividerColor = isDark ? "#2a3170" : "#e1e3ee";
	const [ink, tint] = TONE[type][isDark ? "dark" : "light"];

	const [modalOpen, setModalOpen] = useState(false);

	const sheetY = useSharedValue(600);
	const backdropAlp = useSharedValue(0);
	const iconScale = useSharedValue(0.6);

	useEffect(() => {
		if (visible) {
			sheetY.value = reduced ? 0 : 600;
			backdropAlp.value = 0;
			iconScale.value = reduced ? 1 : 0.6;
			setModalOpen(true);
			// What the sheet says, felt as well as read. A confirm is routine:
			// a nudge, no sound.
			if (type === "error") feedback("error");
			else if (type === "warning") feedback("notice");
			else if (type === "confirm") feedback("notice", { sound: false });
			else if (type === "success") feedback("success");

			const id = setTimeout(() => {
				sheetY.value = withTiming(0, { duration: 380, easing: EASE_OUT });
				backdropAlp.value = withTiming(1, { duration: 260 });
				iconScale.value = withDelay(
					120,
					withTiming(1, { duration: 320, easing: EASE_OUT }),
				);
			}, 10);
			return () => clearTimeout(id);
		}
		sheetY.value = reduced
			? 0
			: withTiming(600, { duration: 200, easing: Easing.in(Easing.quad) });
		backdropAlp.value = withTiming(0, { duration: 200 });
		const id = setTimeout(() => setModalOpen(false), EXIT_DELAY);
		return () => clearTimeout(id);
	}, [visible, type, reduced, backdropAlp, iconScale, sheetY]);

	const sheetAnim = useAnimatedStyle(() => ({
		transform: [{ translateY: sheetY.value }],
		// With Reduce Motion the sheet fades in place instead of rising.
		opacity: reduced ? backdropAlp.value : 1,
	}));
	const backdropAnim = useAnimatedStyle(() => ({ opacity: backdropAlp.value }));
	const iconAnim = useAnimatedStyle(() => ({
		transform: [{ scale: iconScale.value }],
	}));

	const handlePress = useCallback(
		(btn: AlertButton) => {
			onClose();
			if (btn.onPress) {
				setTimeout(btn.onPress, EXIT_DELAY + 50);
			}
		},
		[onClose],
	);

	const actionBtns = buttons.filter((b) => b.style !== "cancel");
	const cancelBtns = buttons.filter((b) => b.style === "cancel");
	// In a row, cancel sits left and the action right, under the thumb; in a
	// stack, cancel comes last, under the actions.
	const isColumn = buttons.length > 2;
	const ordered = isColumn
		? [...actionBtns, ...cancelBtns]
		: [...cancelBtns, ...actionBtns];

	const renderButton = (btn: AlertButton, i: number) => {
		const isCancel = btn.style === "cancel";
		const isDestructive = btn.style === "destructive";

		return (
			<Pressable
				key={i}
				onPress={() => handlePress(btn)}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.button,
					isCancel
						? { borderWidth: 1, borderColor: dividerColor }
						: { backgroundColor: isDestructive ? DESTRUCTIVE_BG : ACTION_BG },
					!isColumn && { flex: 1 },
					isColumn && styles.buttonFull,
					{ opacity: pressed ? 0.82 : 1 },
				]}
			>
				<Text
					style={[
						styles.buttonText,
						{ color: isCancel ? textColor : "#ffffff" },
					]}
					numberOfLines={1}
				>
					{btn.text}
				</Text>
			</Pressable>
		);
	};

	return (
		<Modal
			visible={modalOpen}
			transparent
			animationType="none"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			{/* Backdrop */}
			<TouchableWithoutFeedback onPress={onClose} accessible={false}>
				<Animated.View
					style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnim]}
				/>
			</TouchableWithoutFeedback>

			{/* Sheet */}
			<Animated.View
				accessibilityViewIsModal
				style={[
					styles.sheet,
					{
						backgroundColor: cardBg,
						paddingBottom: Math.max(insets.bottom + 12, 24),
					},
					tabletSheetStyle,
					sheetAnim,
				]}
			>
				<View
					style={[
						styles.handle,
						{ backgroundColor: isDark ? "#3a4290" : "#c9cce0" },
					]}
				/>

				<Animated.View
					style={[styles.icon, { backgroundColor: tint }, iconAnim]}
				>
					<Ionicons name={ICON[type]} size={30} color={ink} />
				</Animated.View>

				<Text
					style={[styles.title, { color: textColor }]}
					accessibilityRole="header"
				>
					{title}
				</Text>

				{message ? (
					<Text style={[styles.message, { color: mutedColor }]}>{message}</Text>
				) : null}

				<View style={[styles.buttonsWrap, isColumn && styles.buttonsColumn]}>
					{ordered.map(renderButton)}
				</View>
			</Animated.View>
		</Modal>
	);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
	backdrop: {
		backgroundColor: "rgba(12, 16, 48, 0.6)",
	},
	sheet: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingHorizontal: 20,
		paddingTop: 8,
		alignItems: "center",
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: -6 },
		shadowOpacity: 0.14,
		shadowRadius: 20,
		elevation: 24,
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		marginBottom: 20,
		marginTop: 4,
	},
	icon: {
		width: 60,
		height: 60,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	title: {
		fontSize: 22,
		lineHeight: 27,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
		textAlign: "center",
		marginBottom: 8,
		maxWidth: 420,
	},
	message: {
		fontSize: 15,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 22,
		maxWidth: 420,
		paddingHorizontal: 4,
	},
	buttonsWrap: {
		flexDirection: "row",
		width: "100%",
		gap: 10,
		marginTop: 24,
	},
	buttonsColumn: {
		flexDirection: "column",
		gap: 8,
	},
	button: {
		minHeight: 52,
		paddingHorizontal: 12,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonFull: { width: "100%" },
	buttonText: {
		fontSize: 16,
		fontFamily: Fonts.bodyBold,
	},
});

// ─── Standalone hook (sans AlertContext) ─────────────────────────────────────

interface AlertState {
	visible: boolean;
	type: AlertType;
	title: string;
	message?: string;
	buttons: AlertButton[];
}

export function useCustomAlert() {
	const [alertState, setAlertState] = useState<AlertState>({
		visible: false,
		type: "info",
		title: "",
		message: undefined,
		buttons: [{ text: i18next.t("common.ok") }],
	});

	const showAlert = useCallback(
		(
			title: string,
			message?: string,
			type: AlertType = "info",
			buttons?: AlertButton[],
		) => {
			setAlertState({
				visible: true,
				type,
				title,
				message,
				buttons: buttons ?? [{ text: i18next.t("common.ok") }],
			});
		},
		[],
	);

	const hideAlert = useCallback(
		() => setAlertState((p) => ({ ...p, visible: false })),
		[],
	);
	const showSuccess = useCallback(
		(t: string, m?: string) => showAlert(t, m, "success"),
		[showAlert],
	);
	const showError = useCallback(
		(t: string, m?: string) => showAlert(t, m, "error"),
		[showAlert],
	);
	const showWarning = useCallback(
		(t: string, m?: string) => showAlert(t, m, "warning"),
		[showAlert],
	);

	const showConfirm = useCallback(
		(
			title: string,
			message: string,
			onConfirm: () => void,
			onCancel?: () => void,
		) => {
			showAlert(title, message, "confirm", [
				{
					text: i18next.t("common.cancel"),
					style: "cancel",
					onPress: onCancel,
				},
				{
					text: i18next.t("common.confirm"),
					style: "default",
					onPress: onConfirm,
				},
			]);
		},
		[showAlert],
	);

	const AlertComponent = useCallback(
		() => (
			<CustomAlert
				visible={alertState.visible}
				type={alertState.type}
				title={alertState.title}
				message={alertState.message}
				buttons={alertState.buttons}
				onClose={hideAlert}
			/>
		),
		[alertState, hideAlert],
	);

	return {
		alertState,
		showAlert,
		hideAlert,
		showSuccess,
		showError,
		showWarning,
		showConfirm,
		AlertComponent,
	};
}
