import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

function formatTime(dateStr: string): string {
	const d = new Date(dateStr);
	const now = new Date();
	const diff = now.getTime() - d.getTime();
	if (diff < 60000) return "maintenant";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
	if (diff < 604800000) return `${Math.floor(diff / 86400000)}j`;
	return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function MessagesScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["conversations"],
		queryFn: () =>
			api.get<{ docs: any[] }>("/api/conversations?depth=2&sort=-updatedAt"),
		enabled: !!user,
	});

	const conversations = data?.docs ?? [];
	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	if (!user) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
				<View style={[styles.header, { borderBottomColor: borderColor }]}>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						Messages
					</Text>
				</View>
				<EmptyState
					emoji="💬"
					title="Connexion requise"
					subtitle="Connectez-vous pour accéder à vos messages"
					ctaLabel="Se connecter"
					onCta={() => router.push("/auth/login")}
				/>
			</SafeAreaView>
		);
	}

	const renderConversation = ({ item }: { item: any }) => {
		const other =
			item.participants?.find((p: any) => p.id !== user.id) ??
			item.participants?.[0];
		const lastMsg = item.lastMessage;
		const unread = (item.unreadCount ?? 0) > 0;

		return (
			<Pressable
				onPress={() => router.push(`/messages/${item.id}`)}
				style={({ pressed }) => [
					styles.convItem,
					{
						backgroundColor: pressed
							? isDark
								? "#162032"
								: "#f8fafc"
							: cardBg,
						borderBottomColor: borderColor,
					},
				]}
			>
				{/* Avatar */}
				<View style={styles.avatarContainer}>
					{other?.avatar?.url ? (
						<Image
							source={{ uri: other.avatar.url }}
							style={styles.avatar}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.avatarPlaceholder,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text style={[styles.avatarLetter, { color: primaryColor }]}>
								{other?.name?.[0]?.toUpperCase() ?? "?"}
							</Text>
						</View>
					)}
					{unread && <View style={styles.unreadDot} />}
				</View>

				{/* Content */}
				<View style={styles.convContent}>
					<View style={styles.convTop}>
						<Text
							style={[
								styles.convName,
								{ color: textColor, fontWeight: unread ? "700" : "500" },
							]}
							numberOfLines={1}
						>
							{other?.name ?? "Utilisateur"}
						</Text>
						<Text style={[styles.convTime, { color: mutedColor }]}>
							{item.updatedAt ? formatTime(item.updatedAt) : ""}
						</Text>
					</View>
					{item.listing?.title && (
						<Text
							style={[styles.convListing, { color: primaryColor }]}
							numberOfLines={1}
						>
							{item.listing.title}
						</Text>
					)}
					<Text
						style={[
							styles.convLastMsg,
							{ color: mutedColor, fontWeight: unread ? "600" : "400" },
						]}
						numberOfLines={1}
					>
						{lastMsg?.content ?? "Aucun message"}
					</Text>
				</View>

				<Ionicons name="chevron-forward" size={16} color={mutedColor} />
			</Pressable>
		);
	};

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Text style={[styles.headerTitle, { color: textColor }]}>Messages</Text>
				{conversations.length > 0 && (
					<View
						style={[
							styles.countBadge,
							{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
						]}
					>
						<Text
							style={{ color: primaryColor, fontSize: 12, fontWeight: "700" }}
						>
							{conversations.length}
						</Text>
					</View>
				)}
			</View>

			{conversations.length === 0 && !isLoading ? (
				<EmptyState
					emoji="💬"
					title="Aucune conversation"
					subtitle="Contactez un vendeur pour commencer une discussion"
					ctaLabel="Parcourir les annonces"
					onCta={() => router.push("/(tabs)/search")}
				/>
			) : (
				<FlatList
					data={conversations}
					renderItem={renderConversation}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={primaryColor}
						/>
					}
					showsVerticalScrollIndicator={false}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 16,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 22, fontWeight: "800", flex: 1 },
	countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
	convItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	avatarContainer: { position: "relative", marginRight: 12 },
	avatar: { width: 50, height: 50, borderRadius: 25 },
	avatarPlaceholder: {
		width: 50,
		height: 50,
		borderRadius: 25,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: { fontSize: 20, fontWeight: "700" },
	unreadDot: {
		position: "absolute",
		bottom: 1,
		right: 1,
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: "#dc2626",
		borderWidth: 2,
		borderColor: "white",
	},
	convContent: { flex: 1 },
	convTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 2,
	},
	convName: { fontSize: 15, flex: 1 },
	convTime: { fontSize: 12 },
	convListing: { fontSize: 12, marginBottom: 2 },
	convLastMsg: { fontSize: 13 },
});
