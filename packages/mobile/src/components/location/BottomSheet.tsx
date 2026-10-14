import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useCallback, useEffect } from "react";
import {
	Modal,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * A bottom sheet that slides over a dimmed screen and closes on a tap
 * outside, the close button, the back button or a downward drag on its
 * handle. Centred as a card on tablets, where a full-bleed sheet reads as
 * broken.
 */
export function BottomSheet({
	visible,
	title,
	onClose,
	heightRatio = 0.88,
	children,
}: {
	visible: boolean;
	title: string;
	onClose: () => void;
	/** Share of the window the sheet takes; content scrolls inside it. */
	heightRatio?: number;
	children: ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const { height } = useWindowDimensions();
	const { isTablet } = useResponsive();
	const reducedMotion = useReducedMotion();
	const offset = useSharedValue(height);

	useEffect(() => {
		if (!visible) {
			// Parked off-screen so the next open slides in again.
			offset.value = height;
			return;
		}
		offset.value = reducedMotion
			? 0
			: withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 });
	}, [visible, reducedMotion, offset, height]);

	const dismiss = useCallback(() => {
		if (reducedMotion) {
			onClose();
			return;
		}
		offset.value = withTiming(height, { duration: 200 }, (finished) => {
			if (finished) scheduleOnRN(onClose);
		});
	}, [height, offset, onClose, reducedMotion]);

	const drag = Gesture.Pan()
		.onUpdate((event) => {
			offset.value = Math.max(0, event.translationY);
		})
		.onEnd((event) => {
			if (
				event.translationY > DISMISS_DISTANCE ||
				event.velocityY > DISMISS_VELOCITY
			) {
				offset.value = withTiming(height, { duration: 180 }, (finished) => {
					if (finished) scheduleOnRN(onClose);
				});
			} else {
				offset.value = withSpring(0, { damping: 22, stiffness: 220 });
			}
		});

	const sheetStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.value }],
	}));
	const backdropStyle = useAnimatedStyle(() => ({
		opacity: 1 - Math.min(1, offset.value / height),
	}));

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			onRequestClose={dismiss}
			statusBarTranslucent
			navigationBarTranslucent
		>
			<GestureHandlerRootView style={styles.root}>
				<Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
					<Pressable
						style={[StyleSheet.absoluteFill, styles.backdrop]}
						onPress={dismiss}
						accessibilityRole="button"
						accessibilityLabel={t("common.close")}
					/>
				</Animated.View>
				<KeyboardAvoidingView
					behavior="padding"
					style={[styles.wrap, isTablet && styles.wrapTablet]}
					pointerEvents="box-none"
				>
					<Animated.View
						accessibilityViewIsModal
						style={[
							styles.sheet,
							{
								backgroundColor: c.bg,
								height: height * heightRatio,
								paddingBottom: insets.bottom,
							},
							isTablet && styles.sheetTablet,
							sheetStyle,
						]}
					>
						<GestureDetector gesture={drag}>
							<View style={styles.header}>
								<View style={[styles.grabber, { backgroundColor: c.border }]} />
								<View style={styles.titleRow}>
									<Text
										style={[styles.title, { color: c.text }]}
										accessibilityRole="header"
									>
										{title}
									</Text>
									<Pressable
										onPress={dismiss}
										style={[styles.close, { backgroundColor: c.neutralSoft }]}
										accessibilityRole="button"
										accessibilityLabel={t("common.close")}
									>
										<Ionicons name="close" size={20} color={c.text} />
									</Pressable>
								</View>
							</View>
						</GestureDetector>
						{children}
					</Animated.View>
				</KeyboardAvoidingView>
			</GestureHandlerRootView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	backdrop: { backgroundColor: "rgba(15, 23, 42, 0.55)" },
	wrap: { flex: 1, justifyContent: "flex-end" },
	wrapTablet: { justifyContent: "center", alignItems: "center" },
	sheet: {
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		overflow: "hidden",
	},
	sheetTablet: {
		width: "100%",
		maxWidth: 560,
		maxHeight: 720,
		borderRadius: 24,
	},
	header: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 4 },
	grabber: {
		alignSelf: "center",
		width: 40,
		height: 5,
		borderRadius: 3,
		marginBottom: 10,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	title: { flex: 1, fontSize: 20, fontFamily: Fonts.displayBold },
	close: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
});
