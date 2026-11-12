import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import {
	Animated,
	type ColorValue,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LoadingScreen } from "@/src/components/LoadingScreen";
import { sellerBrandPalette } from "@/src/components/shop/brandTones";
import {
	SellerAreaContext,
	useActiveShopBrandTheme,
} from "@/src/components/shop/sellerBrand";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useChatClient } from "@/src/contexts/ChatContext";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import {
	setAppMode,
	useHasShopMembership,
	useStoredAppMode,
} from "@/src/hooks/useAppMode";
import { useSellerOrders } from "@/src/hooks/useSellerOrders";
import { shopKeys } from "@/src/hooks/useShops";
import { useTabNavigatorOptions } from "@/src/hooks/useTabNavigatorOptions";
import { ordersToHandle, resolveAppMode } from "@/src/lib/appMode";
import { useTranslation } from "@/src/lib/i18n";
import { shopProfileRules } from "@/src/lib/listingKind";
import { showsOrdersTile } from "@/src/lib/sellerTiles";
import { can } from "@/src/lib/shopRoles";

type IoniconsName = keyof typeof Ionicons.glyphMap;

/**
 * Solid at every state, matching the buyer tabs. Selection reads from the
 * tinted plaque behind the glyph as well as the colour, since two solid
 * glyphs separated only by hue are hard to tell apart on either ground.
 */
function TabIcon({
	name,
	color,
	focused,
	badge = 0,
}: {
	name: IoniconsName;
	color: ColorValue;
	focused: boolean;
	badge?: number;
}) {
	const plaque = useRef(new Animated.Value(focused ? 1 : 0)).current;

	useEffect(() => {
		Animated.timing(plaque, {
			toValue: focused ? 1 : 0,
			duration: focused ? 180 : 120,
			useNativeDriver: true,
		}).start();
	}, [focused, plaque]);

	return (
		<View style={styles.icon}>
			<Animated.View
				pointerEvents="none"
				style={[
					styles.plaque,
					{
						backgroundColor: color as string,
						opacity: plaque.interpolate({
							inputRange: [0, 1],
							outputRange: [0, 0.14],
						}),
						transform: [
							{
								scale: plaque.interpolate({
									inputRange: [0, 1],
									outputRange: [0.7, 1],
								}),
							},
						],
					},
				]}
			/>
			<Ionicons name={name} size={26} color={color} />
			{badge > 0 ? (
				<View style={styles.badge}>
					<Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
				</View>
			) : null}
		</View>
	);
}

export default function SellerTabLayout() {
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const { mode, hydrated } = useStoredAppMode();
	const membership = useHasShopMembership();
	const resolved = hydrated ? resolveAppMode(mode, membership) : "pending";
	const brand = useActiveShopBrandTheme();
	// An agency, a recruiter or a provider has no orders, and its ads take
	// the catalogue's place.
	const { shop: activeShop } = useActiveShop();
	const retail = shopProfileRules(activeShop?.profile).retail;

	// Lost the last membership (or signed out): back to buyer mode for good.
	const lostMembership =
		mode === "seller" &&
		(!membership.signedIn || (membership.known && membership.shopCount === 0));
	useEffect(() => {
		if (lostMembership) setAppMode("buyer");
	}, [lostMembership]);

	const activeColor = brand
		? isDark
			? // The seller palette's dark primary is darkened for a white label,
				// which can sink below 3:1 on the night bar; the shop's text tone
				// is built to read on the night ground.
				brand.dark.accentText
			: sellerBrandPalette(brand, "light").primary
		: // The buyer tabs' own selection colour, so switching mode keeps the bar.
			Colors[isDark ? "dark" : "light"].tabIconSelected;
	const tabOptions = useTabNavigatorOptions(activeColor);
	// The counts are drawn inside the icons; screen readers get them here.
	const ordersBadge = useOrdersBadge();
	const inboxBadge = useInboxBadge();

	if (resolved === "pending") return <LoadingScreen />;
	if (resolved === "buyer") return <Redirect href="/(tabs)/home" />;

	return (
		<SellerAreaContext.Provider value={true}>
			<Tabs screenOptions={tabOptions}>
				<Tabs.Screen
					name="sell/dashboard"
					options={{
						title: t("sellerMode.tabs.dashboard"),
						tabBarIcon: ({ color, focused }) => (
							<TabIcon name="grid" color={color} focused={focused} />
						),
					}}
				/>
				<Tabs.Screen
					name="sell/orders"
					options={{
						href: retail ? undefined : null,
						title: t("sellerMode.tabs.orders"),
						tabBarAccessibilityLabel:
							ordersBadge > 0
								? t("sellerMode.tabs.ordersWithCount", { count: ordersBadge })
								: undefined,
						tabBarIcon: ({ color, focused }) => (
							<TabIcon
								name="receipt"
								color={color}
								focused={focused}
								badge={ordersBadge}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="sell/catalogue"
					options={{
						title: retail
							? t("sellerMode.tabs.catalogue")
							: t("sellerAds.title"),
						tabBarIcon: ({ color, focused }) => (
							<TabIcon
								name={retail ? "cube" : "megaphone"}
								color={color}
								focused={focused}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="sell/inbox"
					options={{
						title: t("sellerMode.tabs.messages"),
						tabBarAccessibilityLabel:
							inboxBadge > 0
								? t("sellerMode.tabs.messagesWithCount", { count: inboxBadge })
								: undefined,
						tabBarIcon: ({ color, focused }) => (
							<TabIcon
								name="chatbubbles"
								color={color}
								focused={focused}
								badge={inboxBadge}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="sell/shop"
					options={{
						title: t("sellerMode.tabs.shop"),
						tabBarIcon: ({ color, focused }) => (
							<TabIcon name="storefront" color={color} focused={focused} />
						),
					}}
				/>
			</Tabs>
		</SellerAreaContext.Provider>
	);
}

/** Same query (and cache entry) as the orders list's "to accept" tab. */
function useOrdersBadge(): number {
	const { ordersEnabled } = useAppConfig();
	const { shop } = useActiveShop();
	const reads = showsOrdersTile(shop?.role, ordersEnabled);
	const list = useSellerOrders(reads ? shop?.shopId : undefined, {
		tab: "to_accept",
	});
	return ordersToHandle(list.data?.pages[0]?.counts);
}

/** `inboxUnread` rides on the shop list; a new message refreshes it. */
function useInboxBadge(): number {
	const { shop } = useActiveShop();
	const { chatClient } = useChatClient();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!chatClient) return;
		const refresh = () =>
			queryClient.invalidateQueries({ queryKey: shopKeys.myShops });
		chatClient.on("message:new", refresh);
		return () => {
			chatClient.off("message:new", refresh);
		};
	}, [chatClient, queryClient]);

	return can(shop?.role, "inbox.reply") ? (shop?.inboxUnread ?? 0) : 0;
}

const styles = StyleSheet.create({
	icon: {
		width: 44,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	// Behind the selected glyph, tinted from the active colour.
	plaque: {
		position: "absolute",
		width: 44,
		height: 32,
		borderRadius: 11,
	},
	badge: {
		position: "absolute",
		// The glyph is 26 wide inside a 44x32 box, so the corner it wants is
		// inset from the box edge, not outside it.
		top: 0,
		right: 4,
		// The danger fill keeps its day value at night, as the shop palette's
		// `danger` does: the night red under white 11pt text falls below 4.5:1.
		backgroundColor: Colors.light.destructive,
		borderRadius: 10,
		minWidth: 18,
		height: 18,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	badgeText: {
		color: Colors.light.destructiveForeground,
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
});
