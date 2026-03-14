import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
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

export default function TabLayout() {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const { user } = useAuth();

	const { data: unreadData } = useQuery({
		queryKey: ["unread-messages"],
		queryFn: () => api.get<{ count: number }>("/api/public/messages/unread"),
		enabled: !!user,
		refetchInterval: 30000,
	});

	const unreadCount = unreadData?.count ?? 0;

	const activeColor = isDark ? "#3b82f6" : "#1e40af";
	const inactiveColor = isDark ? "#94a3b8" : "#94a3b8";
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
					paddingTop: 8,
					paddingBottom: 4,
					height: 60,
				},
				tabBarLabelStyle: {
					fontSize: 11,
					fontWeight: "600",
					marginBottom: 4,
				},
			}}
		>
			<Tabs.Screen
				name="home"
				options={{
					title: "Accueil",
					tabBarIcon: ({ color, focused }) => (
						<Ionicons
							name={focused ? "home" : "home-outline"}
							size={24}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="search"
				options={{
					title: "Rechercher",
					tabBarIcon: ({ color, focused }) => (
						<Ionicons
							name={focused ? "search" : "search-outline"}
							size={24}
							color={color}
						/>
					),
				}}
			/>
			<Tabs.Screen
				name="create"
				options={{
					title: "Vendre",
					tabBarIcon: ({ color }) => (
						<View
							style={[
								styles.sellBtn,
								{ backgroundColor: isDark ? "#3b82f6" : "#1e40af" },
							]}
						>
							<Ionicons name="add" size={28} color="#fff" />
						</View>
					),
					tabBarLabel: () => null,
				}}
			/>
			<Tabs.Screen
				name="messages"
				options={{
					title: "Messages",
					tabBarIcon: ({ color, focused }) => (
						<View>
							<Ionicons
								name={focused ? "chatbubbles" : "chatbubbles-outline"}
								size={24}
								color={color}
							/>
							<MessagesBadge count={unreadCount} />
						</View>
					),
				}}
			/>
			<Tabs.Screen
				name="account"
				options={{
					title: "Compte",
					tabBarIcon: ({ color, focused }) => (
						<Ionicons
							name={focused ? "person" : "person-outline"}
							size={24}
							color={color}
						/>
					),
				}}
			/>
		</Tabs>
	);
}

const styles = StyleSheet.create({
	sellBtn: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
		marginTop: -16,
		shadowColor: "#1e40af",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
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
	badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
