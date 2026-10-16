import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { type ColorValue, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Fonts } from "@/constants/theme";
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
import { ordersToHandle, resolveAppMode } from "@/src/lib/appMode";
import { useTranslation } from "@/src/lib/i18n";
import { showsOrdersTile } from "@/src/lib/sellerTiles";
import { can } from "@/src/lib/shopRoles";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function TabIcon({
	name,
	focusedName,
	color,
	focused,
	badge = 0,
}: {
	name: IoniconsName;
	focusedName: IoniconsName;
	color: ColorValue;
	focused: boolean;
	badge?: number;
}) {
	return (
		<View>
			<Ionicons name={focused ? focusedName : name} size={26} color={color} />
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
	const insets = useSafeAreaInsets();
	const { mode, hydrated } = useStoredAppMode();
	const membership = useHasShopMembership();
	const resolved = hydrated ? resolveAppMode(mode, membership) : "pending";
	const brand = useActiveShopBrandTheme();

	// Lost the last membership (or signed out): back to buyer mode for good.
	const lostMembership =
		mode === "seller" &&
		(!membership.signedIn || (membership.known && membership.shopCount === 0));
	useEffect(() => {
		if (lostMembership) setAppMode("buyer");
	}, [lostMembership]);

	if (resolved === "pending") return <LoadingScreen />;
	if (resolved === "buyer") return <Redirect href="/(tabs)/home" />;

	const activeColor = brand
		? sellerBrandPalette(brand, isDark ? "dark" : "light").primary
		: isDark
			? "#3b82f6"
			: "#1e40af";
	const bgColor = isDark ? "#0b1120" : "#ffffff";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	return (
		<SellerAreaContext.Provider value={true}>
			<Tabs
				screenOptions={{
					tabBarActiveTintColor: activeColor,
					tabBarInactiveTintColor: "#94a3b8",
					headerShown: false,
					tabBarButton: HapticTab,
					tabBarStyle: {
						backgroundColor: bgColor,
						borderTopColor: borderColor,
						borderTopWidth: 1,
						paddingTop: 10,
						paddingBottom: Math.max(insets.bottom, 6),
						height: 68 + insets.bottom,
					},
					tabBarLabelStyle: {
						fontSize: 10,
						fontFamily: Fonts.bodySemibold,
						marginBottom: 4,
					},
				}}
			>
				<Tabs.Screen
					name="sell/dashboard"
					options={{
						title: t("sellerMode.tabs.dashboard"),
						tabBarIcon: ({ color, focused }) => (
							<TabIcon
								name="grid-outline"
								focusedName="grid"
								color={color}
								focused={focused}
							/>
						),
					}}
				/>
				<Tabs.Screen
					name="sell/orders"
					options={{
						title: t("sellerMode.tabs.orders"),
						tabBarIcon: ({ color, focused }) => (
							<OrdersTabIcon color={color} focused={focused} />
						),
					}}
				/>
				<Tabs.Screen
					name="sell/catalogue"
					options={{
						title: t("sellerMode.tabs.catalogue"),
						tabBarIcon: ({ color, focused }) => (
							<TabIcon
								name="cube-outline"
								focusedName="cube"
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
						tabBarIcon: ({ color, focused }) => (
							<InboxTabIcon color={color} focused={focused} />
						),
					}}
				/>
				<Tabs.Screen
					name="sell/shop"
					options={{
						title: t("sellerMode.tabs.shop"),
						tabBarIcon: ({ color, focused }) => (
							<TabIcon
								name="storefront-outline"
								focusedName="storefront"
								color={color}
								focused={focused}
							/>
						),
					}}
				/>
			</Tabs>
		</SellerAreaContext.Provider>
	);
}

/** Same query (and cache entry) as the orders list's "to accept" tab. */
function OrdersTabIcon({
	color,
	focused,
}: {
	color: ColorValue;
	focused: boolean;
}) {
	const { ordersEnabled } = useAppConfig();
	const { shop } = useActiveShop();
	const reads = showsOrdersTile(shop?.role, ordersEnabled);
	const list = useSellerOrders(reads ? shop?.shopId : undefined, {
		tab: "to_accept",
	});
	return (
		<TabIcon
			name="receipt-outline"
			focusedName="receipt"
			color={color}
			focused={focused}
			badge={ordersToHandle(list.data?.pages[0]?.counts)}
		/>
	);
}

/** `inboxUnread` rides on the shop list; a new message refreshes it. */
function InboxTabIcon({
	color,
	focused,
}: {
	color: ColorValue;
	focused: boolean;
}) {
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

	const unread = can(shop?.role, "inbox.reply") ? (shop?.inboxUnread ?? 0) : 0;
	return (
		<TabIcon
			name="chatbubbles-outline"
			focusedName="chatbubbles"
			color={color}
			focused={focused}
			badge={unread}
		/>
	);
}

const styles = StyleSheet.create({
	badge: {
		position: "absolute",
		top: -4,
		right: -8,
		backgroundColor: "#dc2626",
		borderRadius: 10,
		minWidth: 18,
		height: 18,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	badgeText: {
		color: "#fff",
		fontSize: 10,
		fontFamily: Fonts.displayExtrabold,
	},
});
