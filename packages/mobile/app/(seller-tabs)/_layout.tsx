import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useEffect } from "react";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LoadingScreen } from "@/src/components/LoadingScreen";
import { QuietTabBar, TabGlyph } from "@/src/components/navigation/QuietTabBar";
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
import { useResponsive } from "@/src/hooks/useResponsive";
import { useSellerOrders } from "@/src/hooks/useSellerOrders";
import { shopKeys } from "@/src/hooks/useShops";
import { useTabNavigatorOptions } from "@/src/hooks/useTabNavigatorOptions";
import { ordersToHandle, resolveAppMode } from "@/src/lib/appMode";
import { useTranslation } from "@/src/lib/i18n";
import { shopProfileRules } from "@/src/lib/listingKind";
import { showsOrdersTile } from "@/src/lib/sellerTiles";
import { can } from "@/src/lib/shopRoles";

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
	const { isExpanded } = useResponsive();
	// The counts are drawn inside the icons; screen readers get them here.
	const ordersBadge = useOrdersBadge();
	const inboxBadge = useInboxBadge();

	if (resolved === "pending") return <LoadingScreen />;
	if (resolved === "buyer") return <Redirect href="/(tabs)/home" />;

	return (
		<SellerAreaContext.Provider value={true}>
			<Tabs
				screenOptions={tabOptions}
				// The quiet bar at the bottom, its mark in the shop's colour; the
				// tablet rail keeps the navigator's own bar.
				tabBar={
					isExpanded
						? undefined
						: (props) => <QuietTabBar {...props} markColor={activeColor} />
				}
			>
				<Tabs.Screen
					name="sell/dashboard"
					options={{
						title: t("sellerMode.tabs.dashboard"),
						tabBarIcon: ({ color, focused }) => (
							<TabGlyph name="grid" color={color as string} focused={focused} />
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
							<TabGlyph
								name="receipt"
								color={color as string}
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
							<TabGlyph
								name={retail ? "cube" : "megaphone"}
								color={color as string}
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
							<TabGlyph
								name="chatbubbles"
								color={color as string}
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
							<TabGlyph
								name="storefront"
								color={color as string}
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
