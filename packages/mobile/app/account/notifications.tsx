import { Ionicons } from "@expo/vector-icons";
import { useNotifications, useNovu } from "@novu/react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { EmptyState } from "@/src/components/EmptyState";
import { api } from "@/src/lib/api";
import { registerForPushNotificationsAsync } from "@/src/lib/notifications";

function timeAgo(date: Date | string): string {
	const diff = Date.now() - new Date(date).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "à l'instant";
	if (minutes < 60) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}j`;
	return new Date(date).toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "short",
	});
}

function notificationIcon(type: string): {
	name: keyof typeof Ionicons.glyphMap;
	color: string;
	bg: string;
} {
	if (type.includes("approved") || type.includes("published"))
		return {
			name: "checkmark-circle-outline",
			color: "#16a34a",
			bg: "#dcfce7",
		};
	if (type.includes("rejected"))
		return { name: "close-circle-outline", color: "#dc2626", bg: "#fee2e2" };
	if (type.includes("message"))
		return { name: "chatbubble-outline", color: "#1e40af", bg: "#dbeafe" };
	if (type.includes("boost"))
		return { name: "rocket-outline", color: "#d97706", bg: "#fef3c7" };
	if (type.includes("alert") || type.includes("search"))
		return { name: "bookmark-outline", color: "#7c3aed", bg: "#ede9fe" };
	if (type.includes("sold"))
		return { name: "cash-outline", color: "#16a34a", bg: "#dcfce7" };
	return { name: "notifications-outline", color: "#1e40af", bg: "#dbeafe" };
}

export default function NotificationsScreen() {
	const isDark = useColorScheme() === "dark";

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e293b" : "#f1f5f9";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	const { notifications, isLoading, hasMore, loadMore, refetch } =
		useNotifications();
	const { novu } = useNovu();

	const [isMarkingRead, setIsMarkingRead] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const unreadCount = notifications.filter((n) => !n.read).length;

	// Clear native badge count when screen opens
	useEffect(() => {
		Notifications.setBadgeCountAsync(0);
	}, []);

	const handleMarkAllRead = async () => {
		setIsMarkingRead(true);
		try {
			await novu.notifications.readAll();
			await refetch();
		} finally {
			setIsMarkingRead(false);
		}
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await refetch();
		setIsRefreshing(false);
	};

	const [permissionStatus, setPermissionStatus] = useState<
		"granted" | "denied" | "undetermined" | null
	>(null);

	useEffect(() => {
		Notifications.getPermissionsAsync().then((perm) => {
			setPermissionStatus(perm.status as "granted" | "denied" | "undetermined");
		});
	}, []);

	const handleEnablePush = async () => {
		const token = await registerForPushNotificationsAsync();
		const perm = await Notifications.getPermissionsAsync();
		setPermissionStatus(perm.status as "granted" | "denied" | "undetermined");
		if (token) {
			await api
				.post("/api/public/novu/register-token", { token })
				.catch(() => null);
		}
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: accentBg }]}
		>
			{/* Header */}
			<View style={[styles.header, { backgroundColor: accentBg }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons
						name="arrow-back"
						size={22}
						color={isDark ? "#e2e8f0" : "#0f172a"}
					/>
				</Pressable>
				<Text style={[styles.title, { color: textColor }]}>Notifications</Text>
				{unreadCount > 0 && (
					<AnimatedPressable
						onPress={handleMarkAllRead}
						scaleTo={0.95}
						style={styles.markAllBtn}
					>
						{isMarkingRead ? (
							<ActivityIndicator size="small" color={primaryColor} />
						) : (
							<Text style={[styles.markAllText, { color: primaryColor }]}>
								Tout lire
							</Text>
						)}
					</AnimatedPressable>
				)}
			</View>

			{/* Push permission banner */}
			{permissionStatus === "denied" && (
				<View
					style={[
						styles.permBanner,
						{ backgroundColor: isDark ? "#1e293b" : "#fefce8" },
					]}
				>
					<Ionicons name="warning-outline" size={18} color="#d97706" />
					<Text
						style={[styles.permText, { color: isDark ? "#fbbf24" : "#92400e" }]}
					>
						Activez les notifications pour ne rien manquer
					</Text>
					<Pressable onPress={handleEnablePush}>
						<Text style={[styles.permLink, { color: primaryColor }]}>
							Activer
						</Text>
					</Pressable>
				</View>
			)}
			{permissionStatus === "undetermined" && (
				<View
					style={[
						styles.permBanner,
						{ backgroundColor: isDark ? "#1e3a5f" : "#eff6ff" },
					]}
				>
					<Ionicons
						name="notifications-outline"
						size={18}
						color={primaryColor}
					/>
					<Text
						style={[styles.permText, { color: isDark ? "#93c5fd" : "#1e40af" }]}
					>
						Recevez des alertes pour vos annonces et messages
					</Text>
					<Pressable onPress={handleEnablePush}>
						<Text style={[styles.permLink, { color: primaryColor }]}>
							Activer
						</Text>
					</Pressable>
				</View>
			)}

			{/* Content */}
			<View style={[styles.body, { backgroundColor: bg }]}>
				{isLoading ? (
					<View style={styles.center}>
						<ActivityIndicator color={primaryColor} />
					</View>
				) : notifications.length === 0 ? (
					<EmptyState
						icon="notifications-outline"
						title="Aucune notification"
						subtitle="Vos alertes d'annonces et messages apparaîtront ici"
					/>
				) : (
					<FlatList
						data={notifications}
						keyExtractor={(item) => item.id}
						renderItem={({ item }) => {
							const type = (item as unknown as { type?: string }).type ?? "";
							const payload =
								(item as unknown as { payload?: Record<string, unknown> })
									.payload ?? {};
							const icon = notificationIcon(type);
							const unreadBg = isDark ? "rgba(30,58,95,0.35)" : "#eff6ff";

							return (
								<AnimatedPressable
									onPress={async () => {
										if (!item.read) {
											await novu.notifications.read(item.id);
										}
										if (payload.listingId) {
											router.push(`/listing/${payload.listingId}`);
										}
									}}
									scaleTo={0.985}
									style={[
										styles.item,
										{ borderBottomColor: borderColor },
										!item.read && { backgroundColor: unreadBg },
									]}
								>
									<View style={[styles.iconBox, { backgroundColor: icon.bg }]}>
										<Ionicons name={icon.name} size={18} color={icon.color} />
									</View>

									<View style={{ flex: 1, gap: 3 }}>
										<Text
											style={[
												styles.itemContent,
												{ color: textColor },
												!item.read && {
													fontFamily: Fonts.bodySemibold,
												},
											]}
											numberOfLines={3}
										>
											{item.content as string}
										</Text>
										<Text style={[styles.itemTime, { color: mutedColor }]}>
											{timeAgo(item.createdAt)}
										</Text>
									</View>

									{!item.read && <View style={styles.unreadDot} />}
								</AnimatedPressable>
							);
						}}
						contentContainerStyle={[styles.list, { backgroundColor: cardBg }]}
						style={styles.flatList}
						onEndReached={() => hasMore && loadMore()}
						onEndReachedThreshold={0.5}
						refreshControl={
							<RefreshControl
								refreshing={isRefreshing}
								onRefresh={handleRefresh}
								tintColor={primaryColor}
							/>
						}
						showsVerticalScrollIndicator={false}
					/>
				)}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },

	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingTop: 4,
		paddingBottom: 14,
		gap: 12,
	},
	backBtn: { padding: 4 },
	title: { flex: 1, fontSize: 20, fontFamily: Fonts.displayBold },
	markAllBtn: { paddingHorizontal: 10, paddingVertical: 6 },
	markAllText: { fontSize: 13, fontFamily: Fonts.bodySemibold },

	permBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginHorizontal: 16,
		marginBottom: 8,
		padding: 12,
		borderRadius: 12,
	},
	permText: { flex: 1, fontSize: 13, fontFamily: Fonts.body },
	permLink: { fontSize: 13, fontFamily: Fonts.bodySemibold },

	body: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingTop: 80,
	},
	flatList: { flex: 1 },
	list: { flexGrow: 1 },

	item: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
		gap: 12,
	},
	iconBox: {
		width: 38,
		height: 38,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
	},
	itemContent: {
		fontSize: 14,
		fontFamily: Fonts.body,
		lineHeight: 20,
	},
	itemTime: { fontSize: 12, fontFamily: Fonts.body },
	unreadDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#3b82f6",
		marginTop: 6,
	},
});
