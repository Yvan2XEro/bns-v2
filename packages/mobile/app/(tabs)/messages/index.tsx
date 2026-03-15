import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { useAlert } from "@/src/contexts/AlertContext";
import { useChatClient } from "@/src/contexts/ChatContext";
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

type FilterTab = "all" | "unread";

export default function MessagesScreen() {
	const { showError, showConfirm } = useAlert();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const { onlineUsers, chatClient } = useChatClient();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterTab>("all");
	const [markingAllRead, setMarkingAllRead] = useState(false);
	const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["conversations"],
		queryFn: () =>
			api.get<{ docs: any[] }>("/api/conversations?depth=2&sort=-updatedAt"),
		enabled: !!user,
	});

	// Refresh conversation list on any incoming message (including brand-new
	// conversations where the recipient hasn't joined the room yet).
	useEffect(() => {
		if (!chatClient) return;
		const handler = () => {
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
		};
		chatClient.on("message:new", handler);
		return () => {
			chatClient.off("message:new", handler);
		};
	}, [chatClient, queryClient]);

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
	const accentBg = isDark ? "#111827" : "#eef2ff";
	const inputBg = isDark ? "#1e293b" : "#ffffff";

	const unreadCount = useMemo(
		() => conversations.filter((c) => (c.unreadCount ?? 0) > 0).length,
		[conversations],
	);

	const filtered = useMemo(() => {
		let list = conversations;
		if (filter === "unread")
			list = list.filter((c) => (c.unreadCount ?? 0) > 0);
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			list = list.filter((c) => {
				const other =
					c.participants?.find((p: any) => p.id !== user?.id) ??
					c.participants?.[0];
				const name = (other?.name ?? "").toLowerCase();
				const lastMsg = (c.lastMessage?.content ?? "").toLowerCase();
				const listing = (c.listing?.title ?? "").toLowerCase();
				return name.includes(q) || lastMsg.includes(q) || listing.includes(q);
			});
		}
		return list;
	}, [conversations, filter, search, user]);

	// Mark all conversations as read
	const handleMarkAllRead = async () => {
		if (!user || markingAllRead) return;
		setMarkingAllRead(true);
		try {
			// Fetch all unread messages for this user
			const res = await api.get<{ docs: any[] }>(
				`/api/messages?where[read][equals]=false&where[sender][not_equals]=${user.id}&limit=100`,
			);
			const unreadMessages = res.docs ?? [];
			if (unreadMessages.length === 0) return;

			// Group by conversation and mark via socket
			const byConv: Record<string, string[]> = {};
			for (const m of unreadMessages) {
				const convId = m.conversation?.id ?? m.conversation;
				if (!byConv[convId]) byConv[convId] = [];
				byConv[convId].push(m.id);
			}

			if (chatClient) {
				for (const [convId, ids] of Object.entries(byConv)) {
					await chatClient.joinConversation(convId);
					chatClient.markRead(convId, ids);
				}
			} else {
				// Fallback: REST PATCH
				await Promise.all(
					unreadMessages.map((m) =>
						api.patch(`/api/messages/${m.id}`, { read: true }),
					),
				);
			}

			queryClient.invalidateQueries({ queryKey: ["conversations"] });
		} catch {
			// silently fail
		} finally {
			setMarkingAllRead(false);
		}
	};

	// Delete a conversation
	const handleDelete = (convId: string) => {
		swipeableRefs.current.get(convId)?.close();
		showConfirm(
			"Supprimer la conversation",
			"Cette action est irréversible.",
			async () => {
				try {
					await api.delete(`/api/conversations/${convId}`);
					queryClient.invalidateQueries({ queryKey: ["conversations"] });
				} catch {
					showError("Erreur", "Impossible de supprimer la conversation.");
				}
			},
		);
	};

	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={[styles.noUserHeader, { backgroundColor: accentBg }]}>
					<View
						style={[
							styles.msgIconWrap,
							{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
						]}
					>
						<Ionicons name="chatbubbles" size={22} color={primaryColor} />
					</View>
					<Text style={[styles.headerTitle, { color: textColor }]}>
						Messages
					</Text>
				</View>
				<View style={[styles.contentWrap, { backgroundColor: bg }]}>
					<EmptyState
						icon="chatbubbles-outline"
						title="Connexion requise"
						subtitle="Connectez-vous pour accéder à vos messages"
						ctaLabel="Se connecter"
						onCta={() => router.push("/auth/login")}
					/>
				</View>
			</SafeAreaView>
		);
	}

	const renderRightActions = (convId: string) => (
		<Pressable onPress={() => handleDelete(convId)} style={styles.deleteAction}>
			<Ionicons name="trash-outline" size={22} color="#fff" />
			<Text style={styles.deleteActionText}>Supprimer</Text>
		</Pressable>
	);

	const renderConversation = ({ item }: { item: any }) => {
		const other =
			item.participants?.find((p: any) => p.id !== user.id) ??
			item.participants?.[0];
		const lastMsg = item.lastMessage;
		const unread = (item.unreadCount ?? 0) > 0;
		const isOnline = other?.id ? onlineUsers.has(other.id) : false;

		return (
			<Swipeable
				ref={(ref) => swipeableRefs.current.set(item.id, ref)}
				renderRightActions={() => renderRightActions(item.id)}
				rightThreshold={60}
				overshootRight={false}
			>
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
						{unread && !isOnline && <View style={styles.unreadDot} />}
						{isOnline && (
							<View style={[styles.onlineDot, { borderColor: cardBg }]} />
						)}
					</View>

					{/* Content */}
					<View style={styles.convContent}>
						<View style={styles.convTop}>
							<Text
								style={[
									styles.convName,
									{
										color: textColor,
										fontFamily: unread
											? Fonts.displayBold
											: Fonts.displayMedium,
									},
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
								{
									color: mutedColor,
									fontFamily: unread ? Fonts.bodySemibold : Fonts.body,
								},
							]}
							numberOfLines={1}
						>
							{lastMsg?.content ?? "Aucun message"}
						</Text>
					</View>

					{unread ? (
						<View
							style={[styles.unreadBadge, { backgroundColor: primaryColor }]}
						>
							<Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
						</View>
					) : (
						<Ionicons name="chevron-forward" size={16} color={mutedColor} />
					)}
				</Pressable>
			</Swipeable>
		);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Text style={[styles.headerTitle, { color: textColor }]}>Messages</Text>
				<View style={styles.headerActions}>
					{unreadCount > 0 && (
						<Pressable
							onPress={handleMarkAllRead}
							disabled={markingAllRead}
							style={[
								styles.markReadBtn,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							{markingAllRead ? (
								<ActivityIndicator size="small" color={primaryColor} />
							) : (
								<>
									<Ionicons
										name="checkmark-done-outline"
										size={16}
										color={primaryColor}
									/>
									<Text style={[styles.markReadText, { color: primaryColor }]}>
										Tout lire
									</Text>
								</>
							)}
						</Pressable>
					)}
					{conversations.length > 0 && (
						<View
							style={[
								styles.countBadge,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text
								style={{
									color: primaryColor,
									fontSize: 12,
									fontFamily: Fonts.displayBold,
								}}
							>
								{conversations.length}
							</Text>
						</View>
					)}
				</View>
			</View>

			{/* Search bar */}
			<View style={[styles.searchRow, { backgroundColor: bg }]}>
				<View
					style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}
				>
					<Ionicons
						name="search-outline"
						size={18}
						color={mutedColor}
						style={{ marginRight: 8 }}
					/>
					<TextInput
						value={search}
						onChangeText={setSearch}
						placeholder="Rechercher une conversation..."
						placeholderTextColor={mutedColor}
						style={[styles.searchInput, { color: textColor }]}
						returnKeyType="search"
						clearButtonMode="while-editing"
					/>
					{search.length > 0 && (
						<Pressable onPress={() => setSearch("")} hitSlop={8}>
							<Ionicons name="close-circle" size={18} color={mutedColor} />
						</Pressable>
					)}
				</View>
			</View>

			{/* Filter tabs */}
			<View style={[styles.filterRow, { borderBottomColor: borderColor }]}>
				{(["all", "unread"] as FilterTab[]).map((tab) => {
					const active = filter === tab;
					const label =
						tab === "all"
							? "Tous"
							: `Non lus${unreadCount > 0 ? ` (${unreadCount})` : ""}`;
					return (
						<Pressable
							key={tab}
							onPress={() => setFilter(tab)}
							style={[
								styles.filterTab,
								active && {
									borderBottomColor: primaryColor,
									borderBottomWidth: 2,
								},
							]}
						>
							<Text
								style={[
									styles.filterTabText,
									{
										color: active ? primaryColor : mutedColor,
										fontFamily: active ? Fonts.displayBold : Fonts.body,
									},
								]}
							>
								{label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			{/* List */}
			{filtered.length === 0 && !isLoading ? (
				<EmptyState
					icon="chatbubbles-outline"
					title={
						search
							? "Aucun résultat"
							: filter === "unread"
								? "Aucun message non lu"
								: "Aucune conversation"
					}
					subtitle={
						search
							? `Aucune conversation pour "${search}"`
							: filter === "unread"
								? "Vous avez tout lu !"
								: "Contactez un vendeur pour commencer une discussion"
					}
					ctaLabel={
						search || filter !== "all" ? undefined : "Parcourir les annonces"
					}
					onCta={
						search || filter !== "all"
							? undefined
							: () => router.push("/(tabs)/search")
					}
				/>
			) : (
				<FlatList
					data={filtered}
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
	noUserHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 6,
		paddingBottom: 14,
	},
	msgIconWrap: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	contentWrap: {
		flex: 1,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		overflow: "hidden",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 16,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 24, fontFamily: Fonts.displayExtrabold, flex: 1 },
	headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
	markReadBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	markReadText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
	searchRow: {
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	searchBox: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	searchInput: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	filterRow: {
		flexDirection: "row",
		borderBottomWidth: 1,
		paddingHorizontal: 16,
	},
	filterTab: {
		paddingVertical: 10,
		paddingHorizontal: 4,
		marginRight: 20,
	},
	filterTabText: { fontSize: 14 },
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
	avatarLetter: { fontSize: 20, fontFamily: Fonts.displayBold },
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
	onlineDot: {
		position: "absolute",
		bottom: 1,
		right: 1,
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: "#22c55e",
		borderWidth: 2,
	},
	convContent: { flex: 1 },
	convTop: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 2,
	},
	convName: { fontSize: 15, flex: 1, fontFamily: Fonts.displayMedium },
	convTime: { fontSize: 12, fontFamily: Fonts.body },
	convListing: {
		fontSize: 12,
		marginBottom: 2,
		fontFamily: Fonts.bodySemibold,
	},
	convLastMsg: { fontSize: 13, fontFamily: Fonts.body },
	unreadBadge: {
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 5,
	},
	unreadBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.displayBold,
	},
	deleteAction: {
		backgroundColor: "#dc2626",
		justifyContent: "center",
		alignItems: "center",
		width: 80,
		gap: 4,
	},
	deleteActionText: {
		color: "#fff",
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
	},
});
