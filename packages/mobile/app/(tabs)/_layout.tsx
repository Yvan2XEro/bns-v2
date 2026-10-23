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
	size = 26,
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
				Animated.spring(scale, {
					toValue: 1.22,
					useNativeDriver: true,
					speed: 50,
					bounciness: 14,
				}),
				Animated.spring(scale, {
					toValue: 1,
					useNativeDriver: true,
					speed: 20,
					bounciness: 8,
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
				<Ionicons name="add" size={28} color="#0f172a" />
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

	const tabOptions = useTabNavigatorOptions(isDark ? "#3b82f6" : "#1e40af");

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
		width: 52,
		height: 52,
		alignItems: "center",
		justifyContent: "center",
		marginTop: -16,
	},
	sellWrapRail: { marginTop: 0 },
	sellBtn: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#f59e0b",
		shadowColor: "#f59e0b",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.4,
		shadowRadius: 8,
		elevation: 8,
	},
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
