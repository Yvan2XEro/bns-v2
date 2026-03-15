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
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function ConversationScreen() {
	const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const { showError, showAlert } = useAlert();
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const listRef = useRef<FlatList>(null);

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
				`/api/messages?where[conversation][equals]=${conversationId}&sort=createdAt&limit=50`,
			),
		enabled: !!conversationId,
		refetchInterval: 5000,
	});

	const messages = messagesData?.docs ?? [];
	const conv = convData?.doc ?? convData;
	const otherUser = conv?.participants?.find((p: any) => p.id !== user?.id);
	const listing = conv?.listing;

	const { mutate: sendMessage, isPending: sending } = useMutation({
		mutationFn: () =>
			api.post("/api/messages", {
				conversation: conversationId,
				content: text.trim(),
				sender: user?.id,
			}),
		onSuccess: () => {
			setText("");
			queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
		},
		onError: (err: any) => showError("Erreur", err.message),
	});

	useEffect(() => {
		if (messages.length > 0) {
			setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
		}
	}, [messages.length]);

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
				? "Aujourd'hui"
				: msgDate === yesterday
					? "Hier"
					: new Date(item.createdAt).toLocaleDateString("fr-FR");

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
						<Text
							style={[
								styles.bubbleTime,
								{ color: isMe ? "rgba(255,255,255,0.7)" : mutedColor },
							]}
						>
							{formatTime(item.createdAt)}
							{isMe && " ✓"}
						</Text>
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
				<Text style={{ color: textColor }}>Connexion requise</Text>
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
					<View>
						<Text style={[styles.headerName, { color: textColor }]}>
							{otherUser?.name ?? "Utilisateur"}
						</Text>
						{listing && (
							<Pressable
								onPress={() => router.push(`/listing/${listing.id ?? listing}`)}
							>
								<Text
									style={[styles.headerListing, { color: primaryColor }]}
									numberOfLines={1}
								>
									{listing.title ?? "Voir l'annonce"}
								</Text>
							</Pressable>
						)}
					</View>
				</View>
				<Pressable
					onPress={() =>
						showAlert(
							"Options",
							"",
							[
								{
									text: "Voir le profil",
									onPress: () => router.push(`/profile/${otherUser?.id}`),
								},
								{
									text: "Signaler",
									onPress: () =>
										router.push({
											pathname: "/report",
											params: { targetType: "user", targetId: otherUser?.id },
										}),
								},
								{ text: "Annuler", style: "cancel" },
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
						onChangeText={setText}
						placeholder="Écrivez un message..."
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
	headerAvatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	headerAvatarImg: { width: 40, height: 40 },
	headerName: { fontSize: 15, fontFamily: Fonts.displayBold },
	headerListing: { fontSize: 12, fontFamily: Fonts.bodySemibold },
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
		gap: 4,
	},
	bubbleText: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.body },
	bubbleTime: { fontSize: 10, alignSelf: "flex-end", fontFamily: Fonts.body },
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
