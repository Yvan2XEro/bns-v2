import { useCounts } from "@novu/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
	QuietTabBar,
	SellPlaque,
	TabGlyph,
} from "@/src/components/navigation/QuietTabBar";
import { useChatClient } from "@/src/contexts/ChatContext";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTabNavigatorOptions } from "@/src/hooks/useTabNavigatorOptions";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

/**
 * The tabs open on home. A link that starts the app (a shared listing) mounts
 * them under its screen; opening on `index`, whose only job is to redirect
 * `/` to home, would fire that redirect underneath and replace the linked
 * screen with home.
 */
export const unstable_settings = { initialRouteName: "home/index" };

function AccountGlyph({ color, focused }: { color: string; focused: boolean }) {
	const notificationReady = useNotificationReady();
	return notificationReady ? (
		<AccountGlyphWithNotifications color={color} focused={focused} />
	) : (
		<TabGlyph name="person" focused={focused} color={color} />
	);
}

/** Novu's hook only works under its provider, hence the split. */
function AccountGlyphWithNotifications({
	color,
	focused,
}: {
	color: string;
	focused: boolean;
}) {
	const { counts } = useCounts({ filters: [{ read: false }] });
	const unseen = (counts?.[0]?.count ?? 0) > 0;
	return (
		<TabGlyph name="person" focused={focused} color={color} dot={unseen} />
	);
}

export default function TabLayout() {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const { t } = useTranslation();
	const { user } = useAuth();
	const { chatClient } = useChatClient();
	const queryClient = useQueryClient();

	const { data: unreadData } = useQuery({
		queryKey: ["unread-messages"],
		queryFn: () => api.get<{ count: number }>("/api/public/messages/unread"),
		enabled: !!user,
		refetchInterval: 1200000,
	});

	// Refresh unread count instantly when a new message arrives via socket
	useEffect(() => {
		if (!chatClient) return;
		const onNewMessage = () => {
			queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
		};
		chatClient.on("message:new", onNewMessage);
		return () => {
			chatClient.off("message:new", onNewMessage);
		};
	}, [chatClient, queryClient]);

	const unreadCount = unreadData?.count ?? 0;

	const c = Colors[isDark ? "dark" : "light"];
	const tabOptions = useTabNavigatorOptions(c.primary);
	const { isExpanded } = useResponsive();

	return (
		<Tabs
			screenOptions={tabOptions}
			// The quiet bar at the bottom; the tablet rail keeps the navigator's.
			tabBar={
				isExpanded
					? undefined
					: (props) => <QuietTabBar {...props} actionRoute="create/index" />
			}
		>
			<Tabs.Screen
				name="home/index"
				options={{
					title: t("navigation.home"),
					tabBarIcon: ({ color, focused }) => (
						<TabGlyph name="home" focused={focused} color={color as string} />
					),
				}}
			/>
			<Tabs.Screen
				name="favorites/index"
				options={{
					title: t("navigation.favorites"),
					tabBarIcon: ({ color, focused }) => (
						<TabGlyph name="heart" focused={focused} color={color as string} />
					),
				}}
			/>
			<Tabs.Screen
				name="create/index"
				options={{
					title: t("navigation.sell"),
					tabBarAccessibilityLabel: t("navigation.sellA11y"),
					// Drawn by the rail only; the quiet bar draws its own plaque.
					tabBarIcon: () => <SellPlaque />,
				}}
			/>
			<Tabs.Screen
				name="messages/index"
				options={{
					title: t("navigation.messages"),
					tabBarAccessibilityLabel:
						unreadCount > 0
							? t("navigation.messagesWithCount", { count: unreadCount })
							: undefined,
					tabBarIcon: ({ color, focused }) => (
						<TabGlyph
							name="chatbubbles"
							focused={focused}
							color={color as string}
							badge={unreadCount}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="account/index"
				options={{
					title: t("navigation.account"),
					tabBarIcon: ({ color, focused }) => (
						<AccountGlyph color={color as string} focused={focused} />
					),
				}}
			/>
			{/* Routes cachées — pas dans la tab bar */}
			<Tabs.Screen name="index" options={{ href: null }} />
			<Tabs.Screen name="explore" options={{ href: null }} />
			<Tabs.Screen name="search/index" options={{ href: null }} />
		</Tabs>
	);
}
