import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useChatClient } from "@/src/contexts/ChatContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

export default function ConversationScreen() {
	const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const { user } = useAuth();
	const { chatClient, onlineUsers } = useChatClient();
	const { showError, showAlert } = useAlert();
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [isOtherTyping, setIsOtherTyping] = useState(false);
	const [readByOther, setReadByOther] = useState<Set<string>>(new Set());
	const listRef = useRef<FlatList>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data: convData } = useQuery({
		queryKey: ["conversation", conversationId],
		queryFn: () => api.get<any>(`/api/conversations/${conversationId}?depth=2`),
		enabled: !!conversationId,
	});

	const { data: messagesData, isLoading } = useQuery({
		queryKey: ["messages", conversationId],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&limit=100`,
			),
		enabled: !!conversationId,
	});

	const messages = messagesData?.docs ?? [];
	const conv = convData?.doc ?? convData;
	const otherUser = conv?.participants?.find((p: any) => p.id !== user?.id);
	const listing = conv?.listing;
	const isOtherOnline = otherUser?.id ? onlineUsers.has(otherUser.id) : false;

	// Initialise readByOther from loaded messages
	useEffect(() => {
		if (!user || messages.length === 0) return;
		const ids = new Set<string>();
		for (const m of messages) {
			const senderId = m.sender?.id ?? m.sender;
			if (senderId === user.id && m.read) ids.add(m.id);
		}
		setReadByOther(ids);
	}, [messages, user]);

	// Socket: join conversation, listen for events
	useEffect(() => {
		if (!chatClient || !conversationId) return;

		chatClient.joinConversation(conversationId);

		const onNewMessage = (msg: any) => {
			queryClient.setQueryData(["messages", conversationId], (old: any) => {
				if (!old) return old;
				const exists = old.docs.some((m: any) => m.id === msg.id);
				if (exists) return old;
				return { ...old, docs: [...old.docs, msg] };
			});
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
			// Mark as read immediately since we're viewing the conversation
			chatClient.markRead(conversationId, [msg.id]);
			chatClient.markDelivered(conversationId, msg.id);
		};

		const onTyping = (event: any) => {
			if (event.conversationId !== conversationId) return;
			if (event.userId === user?.id) return;
			setIsOtherTyping(event.isTyping);
		};

		const onMessageRead = (payload: any) => {
			setReadByOther((prev) => {
				const next = new Set(prev);
				for (const id of payload.messageIds) next.add(id);
				return next;
			});
		};

		chatClient.on("message:new", onNewMessage);
		chatClient.on("typing", onTyping);
		chatClient.on("message:read", onMessageRead);

		// Mark existing unread messages as read
		const unreadIds = messages
			.filter((m: any) => {
				const senderId = m.sender?.id ?? m.sender;
				return senderId !== user?.id && !m.read;
			})
			.map((m: any) => m.id);
		if (unreadIds.length > 0) {
			chatClient.markRead(conversationId, unreadIds);
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
		}

		return () => {
			chatClient.off("message:new", onNewMessage);
			chatClient.off("typing", onTyping);
			chatClient.off("message:read", onMessageRead);
			chatClient.leaveConversation(conversationId);
		};
	}, [
		chatClient,
		conversationId,
		messages.filter,
		queryClient.invalidateQueries,
		queryClient.setQueryData,
		user?.id,
	]);

	// Scroll to bottom when messages change
	useEffect(() => {
		if (messages.length > 0) {
			setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
		}
	}, [messages.length]);

	// Typing indicator: emit start/stop as user types
	const handleTextChange = (val: string) => {
		setText(val);
		if (!chatClient || !conversationId) return;

		if (val.length > 0) {
			chatClient.startTyping(conversationId);
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			typingTimeoutRef.current = setTimeout(() => {
				chatClient.stopTyping(conversationId);
			}, 3000);
		} else {
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			chatClient.stopTyping(conversationId);
		}
	};

	const { mutate: sendMessage, isPending: sending } = useMutation({
		mutationFn: () =>
			api.post("/api/messages", {
				conversation: conversationId,
				content: text.trim(),
				sender: user?.id,
			}),
		onSuccess: () => {
			setText("");
			if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
			chatClient?.stopTyping(conversationId!);
			queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
		},
		onError: (err: any) => showError(t("common.error"), err.message),
	});

	const formatTime = (dateStr: string) =>
		new Date(dateStr).toLocaleTimeString("fr-FR", {
			hour: "2-digit",
			minute: "2-digit",
		});

	const renderMessage = ({ item, index }: { item: any; index: number }) => {
		const isMe = item.sender?.id === user?.id || item.sender === user?.id;
		const prev = messages[index - 1];
		const showDate =
			!prev ||
			new Date(item.createdAt).toDateString() !==
				new Date(prev.createdAt).toDateString();
		const today = new Date().toDateString();
		const yesterday = new Date(Date.now() - 86400000).toDateString();
		const msgDate = new Date(item.createdAt).toDateString();
		const dateLabel =
			msgDate === today
				? t("messages.today")
				: msgDate === yesterday
					? t("messages.yesterday")
					: new Date(item.createdAt).toLocaleDateString("fr-FR");

		const isRead = readByOther.has(item.id) || item.read;

		return (
			<>
				{showDate && (
					<View style={styles.dateSep}>
						<Text
							style={[
								styles.dateLabel,
								{ color: mutedColor, backgroundColor: bg },
							]}
						>
							{dateLabel}
						</Text>
					</View>
				)}
				<View style={[styles.msgRow, isMe ? styles.msgRight : styles.msgLeft]}>
					{!isMe && (
						<View
							style={[
								styles.msgAvatar,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text
								style={{
									color: primaryColor,
									fontFamily: Fonts.displayBold,
									fontSize: 12,
								}}
							>
								{otherUser?.name?.[0]?.toUpperCase() ?? "?"}
							</Text>
						</View>
					)}
					<View
						style={[
							styles.bubble,
							{
								backgroundColor: isMe ? primaryColor : cardBg,
								borderColor: isMe ? primaryColor : borderColor,
							},
						]}
					>
						<Text
							style={[styles.bubbleText, { color: isMe ? "#fff" : textColor }]}
						>
							{item.content}
						</Text>
						<View style={styles.bubbleMeta}>
							<Text
								style={[
									styles.bubbleTime,
									{ color: isMe ? "rgba(255,255,255,0.7)" : mutedColor },
								]}
							>
								{formatTime(item.createdAt)}
							</Text>
							{isMe && (
								<Text
									style={[
										styles.readTick,
										{
											color: isRead ? "#60a5fa" : "rgba(255,255,255,0.5)",
										},
									]}
								>
									{isRead ? " ✓✓" : " ✓"}
								</Text>
							)}
						</View>
					</View>
				</View>
			</>
		);
	};

	if (!user) {
		return (
			<View
				style={[
					styles.safe,
					{
						backgroundColor: bg,
						alignItems: "center",
						justifyContent: "center",
					},
				]}
			>
				<Text style={{ color: textColor }}>{t("auth.loginRequired")}</Text>
			</View>
		);
	}

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View
				style={[
					styles.header,
					{ backgroundColor: cardBg, borderBottomColor: borderColor },
				]}
			>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<View style={styles.headerInfo}>
					<View style={styles.avatarWrapper}>
						<View
							style={[
								styles.headerAvatar,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							{otherUser?.avatar?.url ? (
								<Image
									source={{ uri: otherUser.avatar.url }}
									style={styles.headerAvatarImg}
									contentFit="cover"
								/>
							) : (
								<Text
									style={{
										color: primaryColor,
										fontFamily: Fonts.displayBold,
										fontSize: 16,
									}}
								>
									{otherUser?.name?.[0]?.toUpperCase() ?? "?"}
								</Text>
							)}
						</View>
						{isOtherOnline && <View style={styles.onlineDotHeader} />}
					</View>
					<View>
						<Text style={[styles.headerName, { color: textColor }]}>
							{otherUser?.name ?? t("messages.user")}
						</Text>
						{isOtherOnline ? (
							<Text style={[styles.onlineLabel, { color: "#22c55e" }]}>
								{t("messages.online")}
							</Text>
						) : listing ? (
							<Pressable
								onPress={() => router.push(`/listing/${listing.id ?? listing}`)}
							>
								<Text
									style={[styles.headerListing, { color: primaryColor }]}
									numberOfLines={1}
								>
									{listing.title ?? t("messages.viewListing")}
								</Text>
							</Pressable>
						) : null}
					</View>
				</View>
				<Pressable
					onPress={() =>
						showAlert(
							t("messages.options"),
							"",
							[
								{
									text: t("messages.viewProfile"),
									onPress: () => router.push(`/profile/${otherUser?.id}`),
								},
								{
									text: t("messages.report"),
									onPress: () =>
										router.push({
											pathname: "/report",
											params: { targetType: "user", targetId: otherUser?.id },
										}),
								},
								{ text: t("common.cancel"), style: "cancel" },
							],
							"info",
						)
					}
				>
					<Ionicons name="ellipsis-vertical" size={20} color={textColor} />
				</Pressable>
			</View>

			<KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
				{isLoading ? (
					<ActivityIndicator style={{ margin: 32 }} color={primaryColor} />
				) : (
					<FlatList
						ref={listRef}
						data={messages}
						renderItem={renderMessage}
						keyExtractor={(item) => item.id}
						contentContainerStyle={styles.msgList}
						showsVerticalScrollIndicator={false}
						keyboardDismissMode="interactive"
						onContentSizeChange={() =>
							listRef.current?.scrollToEnd({ animated: false })
						}
						ListFooterComponent={
							isOtherTyping ? (
								<View style={[styles.msgRow, styles.msgLeft, { marginTop: 4 }]}>
									<View
										style={[
											styles.msgAvatar,
											{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
										]}
									>
										<Text
											style={{
												color: primaryColor,
												fontFamily: Fonts.displayBold,
												fontSize: 12,
											}}
										>
											{otherUser?.name?.[0]?.toUpperCase() ?? "?"}
										</Text>
									</View>
									<View
										style={[
											styles.bubble,
											styles.typingBubble,
											{ backgroundColor: cardBg, borderColor },
										]}
									>
										<Text style={[styles.typingDots, { color: mutedColor }]}>
											• • •
										</Text>
									</View>
								</View>
							) : null
						}
					/>
				)}

				{/* Input bar */}
				<View
					style={[
						styles.inputBar,
						{ backgroundColor: cardBg, borderTopColor: borderColor },
					]}
				>
					<TextInput
						value={text}
						onChangeText={handleTextChange}
						placeholder={t("messages.writePlaceholder")}
						placeholderTextColor={mutedColor}
						style={[
							styles.msgInput,
							{
								color: textColor,
								backgroundColor: isDark ? "#0b1120" : "#f1f5f9",
								borderColor,
							},
						]}
						multiline
						maxLength={1000}
					/>
					<Pressable
						onPress={() => text.trim() && sendMessage()}
						disabled={!text.trim() || sending}
						style={[
							styles.sendBtn,
							{
								backgroundColor: text.trim()
									? primaryColor
									: isDark
										? "#1e293b"
										: "#e2e8f0",
							},
						]}
					>
						{sending ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<Ionicons
								name="send"
								size={18}
								color={text.trim() ? "#fff" : mutedColor}
							/>
						)}
					</Pressable>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderBottomWidth: 1,
	},
	backBtn: { width: 40, alignItems: "center", justifyContent: "center" },
	headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
	avatarWrapper: { position: "relative" },
	headerAvatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	headerAvatarImg: { width: 40, height: 40 },
	onlineDotHeader: {
		position: "absolute",
		bottom: 1,
		right: 1,
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#22c55e",
		borderWidth: 2,
		borderColor: "white",
	},
	headerName: { fontSize: 15, fontFamily: Fonts.displayBold },
	headerListing: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	onlineLabel: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	msgList: { padding: 12, paddingBottom: 8 },
	dateSep: { alignItems: "center", marginVertical: 12 },
	dateLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		paddingHorizontal: 10,
		paddingVertical: 3,
		borderRadius: 10,
		overflow: "hidden",
	},
	msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6 },
	msgLeft: { justifyContent: "flex-start" },
	msgRight: { justifyContent: "flex-end" },
	msgAvatar: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 6,
		marginBottom: 2,
	},
	bubble: {
		borderRadius: 18,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 10,
		maxWidth: "75%",
		gap: 2,
	},
	typingBubble: {
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	bubbleText: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.body },
	bubbleMeta: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 2,
	},
	bubbleTime: { fontSize: 10, fontFamily: Fonts.body },
	readTick: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	typingDots: { fontSize: 18, letterSpacing: 4 },
	inputBar: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		padding: 10,
		borderTopWidth: 1,
	},
	msgInput: {
		flex: 1,
		borderRadius: 22,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 10,
		fontSize: 15,
		fontFamily: Fonts.body,
		maxHeight: 100,
	},
	sendBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
});
