/**
 * CustomAlert — Bottom sheet animé
 *
 * Design :
 *  - Sheet ancré en bas, coins arrondis en haut
 *  - Handle bar + icône double ring animée
 *  - Backdrop foncé indépendant
 *  - Boutons : row si ≤2, colonne si >2
 *
 * Animations (Reanimated) :
 *  - Entrée  : sheet spring depuis bas + backdrop fade + icon rings en cascade
 *  - Sortie  : spring rapide vers bas, Modal masquée 290ms après
 */

import { Ionicons } from "@expo/vector-icons";
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
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

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

const ACCENT: Record<AlertType, string> = {
	success: "#10b981",
	error: "#ef4444",
	warning: "#f59e0b",
	info: "#1e40af", // overridden at runtime for dark mode
	confirm: "#1e40af",
};

const ACCENT_DARK: Record<AlertType, string> = {
	success: "#10b981",
	error: "#ef4444",
	warning: "#f59e0b",
	info: "#3b82f6",
	confirm: "#3b82f6",
};

const ICON: Record<AlertType, keyof typeof Ionicons.glyphMap> = {
	success: "checkmark-circle",
	error: "close-circle",
	warning: "warning",
	info: "information-circle",
	confirm: "help-circle",
};

// ─── Animation constants ──────────────────────────────────────────────────────

const SPRING_IN = { damping: 17, stiffness: 190, mass: 0.9 } as const;
const SPRING_OUT = { damping: 24, stiffness: 300, mass: 0.8 } as const;
const EXIT_DELAY = 300;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomAlert({
	visible,
	type = "info",
	title,
	message,
	buttons = [{ text: "OK" }],
	onClose,
}: CustomAlertProps) {
	const isDark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();

	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const dividerColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const accent = isDark ? ACCENT_DARK[type] : ACCENT[type];

	const [modalOpen, setModalOpen] = useState(false);

	const sheetY = useSharedValue(800);
	const sheetRotate = useSharedValue(-0.012);
	const backdropAlp = useSharedValue(0);
	const outerScale = useSharedValue(0);
	const innerScale = useSharedValue(0);

	useEffect(() => {
		if (visible) {
			sheetY.value = 800;
			sheetRotate.value = -0.012;
			backdropAlp.value = 0;
			outerScale.value = 0;
			innerScale.value = 0;
			setModalOpen(true);

			const id = setTimeout(() => {
				sheetY.value = withSpring(0, SPRING_IN);
				sheetRotate.value = withSpring(0, { damping: 14, stiffness: 180 });
				backdropAlp.value = withTiming(1, {
					duration: 300,
					easing: Easing.out(Easing.ease),
				});
				outerScale.value = withDelay(
					130,
					withSpring(1, { damping: 10, stiffness: 210 }),
				);
				innerScale.value = withDelay(
					185,
					withSpring(1, { damping: 8, stiffness: 230 }),
				);
			}, 10);
			return () => clearTimeout(id);
		}
		sheetY.value = withSpring(800, SPRING_OUT);
		sheetRotate.value = withTiming(-0.008, { duration: 220 });
		backdropAlp.value = withTiming(0, { duration: 220 });
		outerScale.value = withTiming(0, { duration: 180 });
		innerScale.value = withTiming(0, { duration: 140 });
		const id = setTimeout(() => setModalOpen(false), EXIT_DELAY);
		return () => clearTimeout(id);
	}, [visible, backdropAlp, innerScale, outerScale, sheetRotate, sheetY]);

	const sheetAnim = useAnimatedStyle(() => ({
		transform: [
			{ translateY: sheetY.value },
			{ rotate: `${sheetRotate.value}rad` },
		],
	}));
	const backdropAnim = useAnimatedStyle(() => ({ opacity: backdropAlp.value }));
	const outerAnim = useAnimatedStyle(() => ({
		transform: [{ scale: outerScale.value }],
	}));
	const innerAnim = useAnimatedStyle(() => ({
		transform: [{ scale: innerScale.value }],
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
	const ordered = [...actionBtns, ...cancelBtns];
	const isColumn = buttons.length > 2;

	const renderButton = (btn: AlertButton, i: number) => {
		const isCancel = btn.style === "cancel";
		const isDestructive = btn.style === "destructive";

		const bgColor = isCancel
			? "transparent"
			: isDestructive
				? "#ef4444"
				: accent;
		const txtColor = isCancel ? mutedColor : "#ffffff";

		return (
			<Pressable
				key={i}
				onPress={() => handlePress(btn)}
				style={[
					styles.button,
					{ backgroundColor: bgColor },
					isCancel && { borderWidth: 1, borderColor: dividerColor },
					!isColumn && { flex: 1 },
					isColumn && styles.buttonFull,
					isCancel && isColumn && styles.cancelColumnBtn,
				]}
			>
				<Text style={[styles.buttonText, { color: txtColor }]}>{btn.text}</Text>
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
			<TouchableWithoutFeedback onPress={onClose}>
				<Animated.View
					style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnim]}
				/>
			</TouchableWithoutFeedback>

			{/* Sheet */}
			<Animated.View
				style={[
					styles.sheet,
					{
						backgroundColor: cardBg,
						paddingBottom: Math.max(insets.bottom + 16, 32),
					},
					sheetAnim,
				]}
			>
				{/* Handle */}
				<View
					style={[
						styles.handle,
						{ backgroundColor: isDark ? "#334155" : "#cbd5e1" },
					]}
				/>

				{/* Double ring icon */}
				<Animated.View
					style={[
						styles.iconOuter,
						{ backgroundColor: `${accent}1a` },
						outerAnim,
					]}
				>
					<Animated.View
						style={[
							styles.iconInner,
							{ backgroundColor: `${accent}2e` },
							innerAnim,
						]}
					>
						<Ionicons name={ICON[type]} size={34} color={accent} />
					</Animated.View>
				</Animated.View>

				{/* Title */}
				<Text style={[styles.title, { color: textColor }]}>{title}</Text>

				{/* Message */}
				{message ? (
					<Text style={[styles.message, { color: mutedColor }]}>{message}</Text>
				) : null}

				{/* Divider */}
				<View style={[styles.divider, { backgroundColor: dividerColor }]} />

				{/* Buttons */}
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
		backgroundColor: "rgba(0,0,0,0.62)",
	},
	sheet: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingHorizontal: 24,
		paddingTop: 8,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -6 },
		shadowOpacity: 0.12,
		shadowRadius: 20,
		elevation: 24,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		marginBottom: 24,
		marginTop: 4,
	},
	iconOuter: {
		width: 88,
		height: 88,
		borderRadius: 44,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	iconInner: {
		width: 68,
		height: 68,
		borderRadius: 34,
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		fontSize: 20,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
		marginBottom: 8,
		lineHeight: 28,
	},
	message: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 22,
		marginBottom: 16,
		paddingHorizontal: 8,
	},
	divider: {
		height: 1,
		width: "100%",
		marginBottom: 16,
	},
	buttonsWrap: {
		flexDirection: "row",
		width: "100%",
		gap: 10,
	},
	buttonsColumn: {
		flexDirection: "column",
		gap: 8,
	},
	button: {
		paddingVertical: 14,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonFull: { width: "100%" },
	cancelColumnBtn: { marginTop: 4 },
	buttonText: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
		letterSpacing: 0.2,
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
		buttons: [{ text: "OK" }],
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
				buttons: buttons ?? [{ text: "OK" }],
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
				{ text: "Annuler", style: "cancel", onPress: onCancel },
				{ text: "Confirmer", style: "default", onPress: onConfirm },
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
