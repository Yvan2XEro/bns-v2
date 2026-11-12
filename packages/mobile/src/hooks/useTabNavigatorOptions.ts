import type { Tabs } from "expo-router";
import { type ComponentProps, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";

/** Expo Router's own tab options type (it vendors React Navigation's). */
type BottomTabNavigationOptions = Exclude<
	NonNullable<ComponentProps<typeof Tabs>["screenOptions"]>,
	(...args: never[]) => unknown
>;

/** Width of the navigation rail on a tablet in landscape. */
export const RAIL_WIDTH = 88;

/**
 * The options every tab navigator shares — buyer and seller alike. At the
 * bottom the layouts draw the QuietTabBar (src/components/navigation); in
 * expanded, a navigation rail on the left, where five icons spread across
 * 1,200 dp read as nothing.
 */
export function useTabNavigatorOptions(
	activeTint: string,
): BottomTabNavigationOptions {
	const isDark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();
	const { isTablet, isExpanded } = useResponsive();

	return useMemo<BottomTabNavigationOptions>(() => {
		const c = Colors[isDark ? "dark" : "light"];
		const background = c.background;
		const border = c.border;
		const shared: BottomTabNavigationOptions = {
			tabBarActiveTintColor: activeTint,
			// #777ca3 read at ~4.2:1: too pale for a label in daylight.
			tabBarInactiveTintColor: c.mutedForeground,
			headerShown: false,
			tabBarButton: HapticTab,
			// On a tablet a tab change redraws whole panes: shift them in rather
			// than cut. Phones keep their instant switch.
			animation: isTablet ? "shift" : "none",
			tabBarLabelStyle: {
				fontSize: 11,
				lineHeight: 14,
				fontFamily: Fonts.bodySemibold,
				letterSpacing: 0.1,
				marginBottom: isExpanded ? 0 : 4,
			},
		};
		if (isExpanded) {
			return {
				...shared,
				tabBarPosition: "left",
				tabBarVariant: "material",
				tabBarStyle: {
					backgroundColor: background,
					borderRightColor: border,
					borderRightWidth: 1,
					width: RAIL_WIDTH + insets.left,
					paddingTop: insets.top + 12,
					paddingLeft: insets.left,
				},
			};
		}
		return {
			...shared,
			tabBarPosition: "bottom",
			tabBarStyle: {
				backgroundColor: background,
				borderTopColor: border,
				borderTopWidth: 1,
				paddingTop: 8,
				paddingBottom: Math.max(insets.bottom, 8),
				height: 64 + insets.bottom,
				elevation: 0,
			},
		};
	}, [activeTint, isDark, insets, isTablet, isExpanded]);
}
