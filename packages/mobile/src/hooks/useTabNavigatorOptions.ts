import type { Tabs } from "expo-router";
import { type ComponentProps, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useResponsive } from "@/src/hooks/useResponsive";

/** Expo Router's own tab options type (it vendors React Navigation's). */
type BottomTabNavigationOptions = Exclude<
	NonNullable<ComponentProps<typeof Tabs>["screenOptions"]>,
	(...args: never[]) => unknown
>;

const INACTIVE_TINT = "#94a3b8";
/** Width of the navigation rail on a tablet in landscape. */
export const RAIL_WIDTH = 88;

/**
 * The tab bar every tab navigator shares — buyer and seller alike. At the
 * bottom on phones and tablets in portrait; a navigation rail on the left in
 * expanded, where five icons spread across 1,200 dp read as nothing.
 */
export function useTabNavigatorOptions(
	activeTint: string,
): BottomTabNavigationOptions {
	const isDark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();
	const { isExpanded } = useResponsive();

	return useMemo<BottomTabNavigationOptions>(() => {
		const background = isDark ? "#0b1120" : "#ffffff";
		const border = isDark ? "#1e3a5f" : "#e2e8f0";
		const shared: BottomTabNavigationOptions = {
			tabBarActiveTintColor: activeTint,
			tabBarInactiveTintColor: INACTIVE_TINT,
			headerShown: false,
			tabBarButton: HapticTab,
			tabBarLabelStyle: {
				fontSize: 10,
				fontFamily: Fonts.bodySemibold,
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
				paddingTop: 10,
				paddingBottom: Math.max(insets.bottom, 6),
				height: 68 + insets.bottom,
			},
		};
	}, [activeTint, isDark, insets, isExpanded]);
}
