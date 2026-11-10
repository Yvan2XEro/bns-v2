import { Ionicons } from "@expo/vector-icons";
import { useCounts } from "@novu/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import {
	Animated,
	type ColorValue,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
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

function MessagesBadge({ count }: { count: number }) {
	if (count === 0) return null;
	return (
		<View style={styles.badge}>
			<Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
		</View>
	);
}

function NotificationsCount() {
	const { counts } = useCounts({ filters: [{ read: false }] });
	const count = counts?.[0]?.count ?? 0;
	if (count === 0) return null;
	return (
		<View style={styles.badge}>
			<Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
		</View>
	);
}

function AccountTabIcon({
	color,
	focused,
}: {
	color: ColorValue;
	focused: boolean;
}) {
	const notificationReady = useNotificationReady();
	return (
		<View>
			<AnimatedTabIcon
				name="person-outline"
				focusedName="person"
				color={color}
				focused={focused}
			/>
			{notificationReady && <NotificationsCount />}
		</View>
	);
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

/** Tab icon with bounce animation using React Native Animated (more reliable in tab bar) */
function AnimatedTabIcon({
	name,
	focusedName,
	color,
	focused,
	size = 24,
}: {
	name: IoniconsName;
	focusedName: IoniconsName;
	color: ColorValue;
	focused: boolean;
	size?: number;
}) {
	const scale = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		if (focused) {
			Animated.sequence([
				Animated.timing(scale, {
					toValue: 0.86,
					duration: 90,
					useNativeDriver: true,
				}),
				Animated.spring(scale, {
					toValue: 1,
					useNativeDriver: true,
					speed: 24,
					bounciness: 6,
				}),
			]).start();
		}
	}, [focused, scale]);

	return (
		<Animated.View
			style={{
				width: size + 4,
				height: size + 4,
				alignItems: "center",
				justifyContent: "center",
				transform: [{ scale }],
			}}
		>
			<Ionicons name={focused ? focusedName : name} size={size} color={color} />
		</Animated.View>
	);
}

function SellButton() {
	// Raised above the bottom bar; in line with the others on the rail.
	const { isExpanded } = useResponsive();
	return (
		<View style={[styles.sellWrap, isExpanded && styles.sellWrapRail]}>
			<View style={styles.sellBtn}>
				<Ionicons name="add" size={26} color="#12163a" />
			</View>
		</View>
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

	const tabOptions = useTabNavigatorOptions(isDark ? "#ffc94a" : "#23338f");

	return (
		<Tabs screenOptions={tabOptions}>
			<Tabs.Screen
				name="home/index"
				options={{
					title: t("navigation.home"),
					tabBarIcon: ({ color, focused }) => (
						<AnimatedTabIcon
							name="home-outline"
							focusedName="home"
							color={color}
							focused={focused}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="favorites/index"
				options={{
					title: t("navigation.favorites"),
					tabBarIcon: ({ color, focused }) => (
						<AnimatedTabIcon
							name="heart-outline"
							focusedName="heart"
							color={color}
							focused={focused}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="create/index"
				options={{
					title: t("navigation.sell"),
					tabBarIcon: () => <SellButton />,
					tabBarLabel: () => null,
				}}
			/>
			<Tabs.Screen
				name="messages/index"
				options={{
					title: t("navigation.messages"),
					tabBarIcon: ({ color, focused }) => (
						<View>
							<AnimatedTabIcon
								name="chatbubbles-outline"
								focusedName="chatbubbles"
								color={color}
								focused={focused}
							/>
							<MessagesBadge count={unreadCount} />
						</View>
					),
				}}
			/>
			<Tabs.Screen
				name="account/index"
				options={{
					title: t("navigation.account"),
					tabBarIcon: ({ color, focused }) => (
						<AccountTabIcon color={color} focused={focused} />
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

const styles = StyleSheet.create({
	sellWrap: {
		width: 56,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
		marginTop: -6,
	},
	sellWrapRail: { marginTop: 0 },
	// A painted sign plaque: yellow, squared, an ink edge along its foot.
	sellBtn: {
		width: 56,
		height: 42,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#ffb81c",
		borderBottomWidth: 3,
		borderBottomColor: "#9a6a00",
	},
	badge: {
		position: "absolute",
		top: -4,
		right: -9,
		backgroundColor: "#d23a2e",
		borderWidth: 2,
		borderColor: "#ffffff",
		borderRadius: 10,
		minWidth: 18,
		height: 18,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 4,
	},
	badgeText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.displayExtrabold,
	},
});
