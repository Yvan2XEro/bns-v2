import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Tabs } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import {
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
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

/**
 * The quiet tab bar (DESIGN.md, "Tab bar"): no box and no shadow, it sits on
 * the screen's own ground under one hairline, 56dp tall, so the photos and
 * price tags keep the colour. Selection never rests on hue alone: a 3dp
 * primary mark slides under the hairline, the glyph turns from outline to
 * filled, and the label turns ink and bold. The sell action is the bar's only
 * saturated colour: a small yellow plaque, level with the other tabs.
 *
 * Used for the bottom position only; the tablet rail keeps the navigator's
 * own bar. Hidden routes (`href: null`) arrive as `display: "none"` items.
 */
type TabBarProps = Parameters<
	NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const MARK_WIDTH = 24;
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export function QuietTabBar({
	state,
	descriptors,
	navigation,
	actionRoute,
	markColor,
}: TabBarProps & {
	/** The route drawn as the yellow sell plaque, if any. */
	actionRoute?: string;
	/** The selection mark; the theme's primary unless a shop brand sets it. */
	markColor?: string;
}) {
	const scheme = useColorScheme() === "dark" ? "dark" : "light";
	const c = Colors[scheme];
	const insets = useSafeAreaInsets();
	const reduced = useReducedMotion();
	const [width, setWidth] = useState(0);

	const visible = state.routes.filter(
		(route) =>
			(
				StyleSheet.flatten(descriptors[route.key].options.tabBarItemStyle) as
					| ViewStyle
					| undefined
			)?.display !== "none",
	);
	const focusedKey = state.routes[state.index]?.key;
	const focusedIndex = visible.findIndex((route) => route.key === focusedKey);
	const cell = visible.length ? width / visible.length : 0;
	// The sell plaque is an action, never a place you stay: no mark under it.
	const markShown =
		focusedIndex >= 0 &&
		width > 0 &&
		visible[focusedIndex]?.name !== actionRoute;

	const markX = useSharedValue(0);
	useEffect(() => {
		if (!markShown) return;
		const target = cell * focusedIndex + cell / 2 - MARK_WIDTH / 2;
		markX.value = reduced
			? target
			: withTiming(target, { duration: 200, easing: EASE_OUT });
	}, [cell, focusedIndex, markShown, markX, reduced]);
	const markStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: markX.value }],
	}));

	return (
		<View
			accessibilityRole="tablist"
			onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
			style={[
				styles.bar,
				{
					backgroundColor: c.background,
					borderTopColor: c.border,
					paddingBottom: Math.max(insets.bottom, 4),
				},
			]}
		>
			{markShown ? (
				<Animated.View
					pointerEvents="none"
					style={[
						styles.mark,
						{ backgroundColor: markColor ?? c.primary },
						markStyle,
					]}
				/>
			) : null}
			{visible.map((route) => {
				const { options } = descriptors[route.key];
				const focused = route.key === focusedKey;
				const isAction = route.name === actionRoute;
				const label =
					typeof options.title === "string" ? options.title : route.name;
				const tint = focused || isAction ? c.foreground : c.mutedForeground;

				const onPress = () => {
					const event = navigation.emit({
						type: "tabPress",
						target: route.key,
						canPreventDefault: true,
					});
					if (focused || event.defaultPrevented) return;
					// A tick for a change of place; a firmer tap for the one action.
					(isAction
						? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
						: Haptics.selectionAsync()
					).catch(() => {});
					navigation.navigate(route.name, route.params);
				};

				return (
					<Pressable
						key={route.key}
						accessibilityRole={isAction ? "button" : "tab"}
						accessibilityState={isAction ? undefined : { selected: focused }}
						accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
						onPress={onPress}
						onLongPress={() =>
							navigation.emit({ type: "tabLongPress", target: route.key })
						}
						style={styles.cell}
					>
						{isAction ? (
							<SellPlaque />
						) : (
							options.tabBarIcon?.({ focused, color: tint, size: 24 })
						)}
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.3}
							style={[
								styles.label,
								{
									color: tint,
									fontFamily: focused ? Fonts.bodyBold : Fonts.bodySemibold,
								},
							]}
						>
							{label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

/**
 * A tab glyph: the outline at rest, the filled form when selected, so the
 * state reads by shape before colour. `name` is the filled glyph.
 */
export function TabGlyph({
	name,
	focused,
	color,
	badge = 0,
	dot = false,
}: {
	name: IoniconsName;
	focused: boolean;
	color: string;
	/** A count: unread messages, orders to handle. */
	badge?: number;
	/** A quieter signal with no number: new notifications. */
	dot?: boolean;
}) {
	const c = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	const outline = `${name}-outline` as IoniconsName;
	return (
		<View style={styles.glyph}>
			<Ionicons
				name={focused || !(outline in Ionicons.glyphMap) ? name : outline}
				size={24}
				color={color}
			/>
			{badge > 0 ? (
				<View
					style={[
						styles.badge,
						{ backgroundColor: c.ownBubble, borderColor: c.background },
					]}
				>
					<Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
						{badge > 9 ? "9+" : badge}
					</Text>
				</View>
			) : dot ? (
				<View
					style={[
						styles.dot,
						{ backgroundColor: c.primary, borderColor: c.background },
					]}
				/>
			) : null}
		</View>
	);
}

/** The sell action: signage yellow, ink plus, level with the other tabs. */
export function SellPlaque() {
	const c = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	return (
		<View style={[styles.plaque, { backgroundColor: c.sun }]}>
			<Ionicons name="add" size={20} color={c.sunForeground} />
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth * 2,
	},
	mark: {
		position: "absolute",
		top: -1,
		left: 0,
		width: MARK_WIDTH,
		height: 3,
		borderBottomLeftRadius: 3,
		borderBottomRightRadius: 3,
	},
	cell: {
		flex: 1,
		height: 56,
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
	},
	label: {
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.1,
	},
	glyph: { width: 24, height: 24 },
	badge: {
		position: "absolute",
		top: -4,
		right: -9,
		minWidth: 18,
		height: 18,
		paddingHorizontal: 4,
		borderRadius: 9,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	badgeText: {
		color: "#ffffff",
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.bodyBold,
	},
	dot: {
		position: "absolute",
		top: 0,
		right: 1,
		width: 10,
		height: 10,
		borderRadius: 5,
		borderWidth: 2,
	},
	plaque: {
		width: 44,
		height: 28,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: 2,
		borderBottomColor: "#9a6a00",
	},
});
