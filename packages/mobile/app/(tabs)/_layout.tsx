import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

function MessagesBadge({ count }: { count: number }) {
	if (count === 0) return null;
	return (
		<View style={styles.badge}>
			<Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
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
	color: string;
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
	return (
		<View style={styles.sellWrap}>
			<View style={styles.sellBtn}>
				<Ionicons name="add" size={28} color="#0f172a" />
			</View>
		</View>
	);
}

export default function TabLayout() {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const { user } = useAuth();
	const insets = useSafeAreaInsets();

	const { data: unreadData } = useQuery({
		queryKey: ["unread-messages"],
		queryFn: () => api.get<{ count: number }>("/api/public/messages/unread"),
		enabled: !!user,
		refetchInterval: 30000,
	});

	const unreadCount = unreadData?.count ?? 0;

	const activeColor = isDark ? "#3b82f6" : "#1e40af";
	const inactiveColor = "#94a3b8";
	const bgColor = isDark ? "#0b1120" : "#ffffff";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: activeColor,
				tabBarInactiveTintColor: inactiveColor,
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
				name="home/index"
				options={{
					title: "Accueil",
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
					title: "Favoris",
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
					title: "Vendre",
					tabBarIcon: () => <SellButton />,
					tabBarLabel: () => null,
				}}
			/>
			<Tabs.Screen
				name="messages/index"
				options={{
					title: "Messages",
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
					title: "Compte",
					tabBarIcon: ({ color, focused }) => (
						<AnimatedTabIcon
							name="person-outline"
							focusedName="person"
							color={color}
							focused={focused}
						/>
					),
				}}
			/>
			{/* Routes cachées — pas dans la tab bar */}
			<Tabs.Screen name="index" options={{ href: null }} />
			<Tabs.Screen name="explore" options={{ href: null }} />
			<Tabs.Screen name="search/index" options={{ href: null }} />
			<Tabs.Screen
				name="messages/[conversationId]"
				options={{ href: null, tabBarStyle: { display: "none" } }}
			/>
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
