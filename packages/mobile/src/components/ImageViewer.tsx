import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
	FlatList,
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
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useTranslation } from "@/src/lib/i18n";

const MAX_SCALE = 4;
/** Dragged this far down at rest scale, the viewer closes. */
const CLOSE_DISTANCE = 120;

/**
 * Full-screen photos: swipe between them, pinch or double-tap to zoom (on
 * Android too, where a ScrollView cannot), drag down to close.
 */
export function ImageViewer({
	uris,
	index,
	visible,
	onClose,
}: {
	uris: string[];
	index: number;
	visible: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const { width, height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const [current, setCurrent] = useState(index);
	const [zoomed, setZoomed] = useState(false);
	const list = useRef<FlatList<string>>(null);

	useEffect(() => {
		if (visible) setCurrent(index);
	}, [visible, index]);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<GestureHandlerRootView style={styles.root}>
				<FlatList
					ref={list}
					data={uris}
					horizontal
					pagingEnabled
					scrollEnabled={!zoomed}
					initialScrollIndex={index}
					getItemLayout={(_, i) => ({
						length: width,
						offset: width * i,
						index: i,
					})}
					keyExtractor={(uri, i) => `${i}-${uri}`}
					showsHorizontalScrollIndicator={false}
					onMomentumScrollEnd={(e) =>
						setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))
					}
					renderItem={({ item }) => (
						<ZoomablePhoto
							uri={item}
							width={width}
							height={height}
							onZoomChange={setZoomed}
							onDismiss={onClose}
						/>
					)}
				/>
				<Pressable
					onPress={onClose}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
					hitSlop={8}
					style={[styles.close, { top: insets.top + 12 }]}
				>
					<Ionicons name="close" size={24} color="#fff" />
				</Pressable>
				{uris.length > 1 && (
					<Text
						style={[styles.counter, { bottom: insets.bottom + 20 }]}
						accessibilityLiveRegion="polite"
					>
						{current + 1} / {uris.length}
					</Text>
				)}
			</GestureHandlerRootView>
		</Modal>
	);
}

function ZoomablePhoto({
	uri,
	width,
	height,
	onZoomChange,
	onDismiss,
}: {
	uri: string;
	width: number;
	height: number;
	onZoomChange: (zoomed: boolean) => void;
	onDismiss: () => void;
}) {
	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const savedX = useSharedValue(0);
	const savedY = useSharedValue(0);

	const reset = () => {
		"worklet";
		scale.value = withTiming(1);
		savedScale.value = 1;
		x.value = withTiming(0);
		y.value = withTiming(0);
		savedX.value = 0;
		savedY.value = 0;
		scheduleOnRN(onZoomChange, false);
	};

	const pinch = Gesture.Pinch()
		.onUpdate((e) => {
			scale.value = Math.min(
				MAX_SCALE,
				Math.max(1, savedScale.value * e.scale),
			);
		})
		.onEnd(() => {
			savedScale.value = scale.value;
			if (scale.value <= 1.01) reset();
			else scheduleOnRN(onZoomChange, true);
		});

	const pan = Gesture.Pan()
		.averageTouches(true)
		.onUpdate((e) => {
			if (savedScale.value > 1) {
				x.value = savedX.value + e.translationX;
				y.value = savedY.value + e.translationY;
			} else if (e.translationY > 0) {
				// At rest scale only a downward drag moves the photo: sideways is
				// the list's swipe to the next one.
				y.value = e.translationY;
			}
		})
		.onEnd((e) => {
			if (savedScale.value > 1) {
				savedX.value = x.value;
				savedY.value = y.value;
				return;
			}
			if (e.translationY > CLOSE_DISTANCE) scheduleOnRN(onDismiss);
			y.value = withTiming(0);
		})
		// Horizontal drags at rest scale belong to the list.
		.activeOffsetY([-12, 12]);

	const doubleTap = Gesture.Tap()
		.numberOfTaps(2)
		.onEnd(() => {
			if (savedScale.value > 1) {
				reset();
				return;
			}
			scale.value = withTiming(2.5);
			savedScale.value = 2.5;
			scheduleOnRN(onZoomChange, true);
		});

	const style = useAnimatedStyle(() => ({
		transform: [
			{ translateX: x.value },
			{ translateY: y.value },
			{ scale: scale.value },
		],
		opacity: savedScale.value > 1 ? 1 : 1 - Math.min(0.6, y.value / 400),
	}));

	return (
		<GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
			<View style={{ width, height, justifyContent: "center" }}>
				<Animated.View style={style}>
					<Image
						source={{ uri }}
						style={{ width, height: height * 0.8 }}
						contentFit="contain"
					/>
				</Animated.View>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
	close: {
		position: "absolute",
		right: 16,
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(255,255,255,0.15)",
		alignItems: "center",
		justifyContent: "center",
	},
	counter: {
		position: "absolute",
		alignSelf: "center",
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
});
