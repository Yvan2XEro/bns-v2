import { Ionicons } from "@expo/vector-icons";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Keyboard,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts, SpringPresets } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { SkeletonMessageBubbles } from "@/src/components/SkeletonCard";
import { useAlert } from "@/src/contexts/AlertContext";
import { useChatClient } from "@/src/contexts/ChatContext";
import { useIsBlocked, useToggleBlock } from "@/src/hooks/useBlockedUsers";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import {
	conversationHeader,
	messageAuthorLabel,
} from "@/src/lib/conversationView";
import { feedback } from "@/src/lib/feedback";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { track } from "@/src/lib/monitoring";
import { askForPushInContext } from "@/src/lib/notifications";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { isSystemMessage } from "@/src/lib/systemMessage";
import type {
	Conversation,
	ConversationShop,
	PayloadDoc,
	UserDoc,
} from "@/src/types/api";
import { ANALYTICS_EVENTS } from "../../../../api/src/contracts/monitoring";
import {
	type AttachedListing,
	attachedListingOf,
	ComposerListingChip,
	MessageListingCard,
} from "./ListingAttachment";
import { type MessageAction, MessageActionSheet } from "./MessageActionSheet";
import {
	fetchLatestMessages,
	fetchOlderMessages,
	type MessagePage,
	messagesKey,
} from "./messageHistory";
import { SystemChip } from "./SystemChip";
import { TypingIndicator } from "./TypingIndicator";

function unwrapDoc<T>(value: PayloadDoc<T> | T): T {
	return value && typeof value === "object" && "doc" in value
		? (value as PayloadDoc<T>).doc
		: (value as T);
}

/** Null for a classic conversation or an unpopulated `shop` id. */
function shopOf(conv: Conversation | undefined): ConversationShop | null {
	return conv?.shop && typeof conv.shop === "object" ? conv.shop : null;
}

function buyerIdOf(conv: Conversation | undefined): string | null {
	if (!conv?.buyer) return null;
	return typeof conv.buyer === "string" ? conv.buyer : conv.buyer.id;
}

export function buyerNameOf(conv: Conversation | undefined): string | null {
	return conv?.buyer && typeof conv.buyer === "object" ? conv.buyer.name : null;
}

/**
 * The only two participants of a shop conversation are the buyer and the
 * shop's owner (see `Conversations.beforeChange` on the API), so whoever is
 * signed in here and is not the buyer is looking at it from the shop's side.
 * Mirrors `isViewerShopSide` in `packages/web/src/app/messages/messages-client.tsx`.
 */
function isViewerShopSide(
	conv: Conversation | undefined,
	userId: string,
): boolean {
	if (!shopOf(conv)) return false;
	const buyerId = buyerIdOf(conv);
	return buyerId !== null && buyerId !== userId;
}

export interface ConversationScreenProps {
	conversationId: string;
	listingParam?: string;
	/** A drafted first message (a visit, an application, a quote), never sent for the buyer. */
	initialDraft?: string;
	/**
	 * Replaces the default buyer-facing header entirely — the shop inbox
	 * screen renders its own (buyer, listing, assignee chip, status) instead
	 * of this one, which assumes a 1:1 personal chat.
	 */
	/** Gets the conversation once loaded, so a custom header reads the same data. */
	renderHeader?: (conv: Conversation | undefined) => ReactNode;
	/**
	 * Fired whenever the loaded message list's last item changes, so a caller
	 * tracking the shop inbox's `lastReadAt` can mark the conversation read
	 * through the HTTP contract without this component knowing that concept
	 * exists.
	 */
	onLatestMessage?: (messageId: string) => void;
}

/**
 * Shared by `app/messages/[conversationId].tsx` (buyer/seller personal chat)
 * and `app/seller/inbox/[conversationId].tsx` (shop inbox) — extracted here
 * so the shop screen reuses this instead of a second copy of the same
 * socket wiring, message list and composer.
 */
export function ConversationScreen({
	conversationId,
	listingParam,
	initialDraft = "",
	renderHeader,
	onLatestMessage,
}: ConversationScreenProps) {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const reducedMotion = useReducedMotion();
	const { t } = useTranslation();
	const { user } = useAuth();
	const { chatClient, onlineUsers } = useChatClient();
	const { showAlert, showSuccess } = useAlert();
	const queryClient = useQueryClient();
	const [text, setText] = useState(initialDraft);
	const [isOtherTyping, setIsOtherTyping] = useState(false);
	const [readByOther, setReadByOther] = useState<Set<string>>(new Set());
	const listRef = useRef<FlashListRef<any>>(null);
	const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	/** Whether the reader sits at the latest message — set by scrolling, read on events. */
	const nearBottomRef = useRef(true);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const loadingOlderRef = useRef(false);
	/** The message whose long-press sheet is open. */
	const [actionTarget, setActionTarget] = useState<any | null>(null);

	const C = Colors[isDark ? "dark" : "light"];
	// Links and initials: the contrast-safe brand word tone in both themes.
	const link = C.link;

	const { data: convData } = useQuery({
		queryKey: ["conversation", conversationId],
		queryFn: () =>
			api.get<Conversation | PayloadDoc<Conversation>>(
				`/api/conversations/${conversationId}?depth=2`,
			),
		enabled: !!conversationId,
	});

	const { data: contextListingData } = useQuery({
		queryKey: ["listing", listingParam],
		queryFn: () => api.get<any>(`/api/listings/${listingParam}?depth=1`),
		enabled: !!listingParam,
	});

	const {
		data: messagesData,
		isLoading,
		isError,
		refetch,
	} = useQuery<MessagePage>({
		queryKey: messagesKey(conversationId),
		// The newest page first; older history loads as the reader scrolls up.
		queryFn: () => fetchLatestMessages(queryClient, conversationId),
		enabled: !!conversationId,
	});

	const messages = messagesData?.docs ?? EMPTY;
	const hasOlder = messagesData?.hasOlder ?? false;

	async function loadOlder() {
		const oldest = messages[0]?.createdAt;
		if (!hasOlder || !oldest || loadingOlderRef.current) return;
		loadingOlderRef.current = true;
		setLoadingOlder(true);
		try {
			const page = await fetchOlderMessages(conversationId, oldest);
			queryClient.setQueryData<MessagePage>(
				messagesKey(conversationId),
				(old) => {
					if (!old) return old;
					const held = new Set(old.docs.map((m) => m.id));
					return {
						docs: [...page.docs.filter((m) => !held.has(m.id)), ...old.docs],
						hasOlder: page.hasOlder,
					};
				},
			);
		} catch {
			// The top of the thread stays where it is; scrolling up again retries.
		} finally {
			loadingOlderRef.current = false;
			setLoadingOlder(false);
		}
	}
	const conv = convData ? unwrapDoc(convData) : undefined;
	const otherUser = conv?.participants?.find(
		(p): p is UserDoc => typeof p === "object" && p.id !== user?.id,
	);
	const shop = shopOf(conv);
	const viewerIsShopSide =
		Boolean(user) && isViewerShopSide(conv, user?.id ?? "");
	const header = conv
		? conversationHeader({
				shop: shop
					? { name: shop.name, logoUrl: shop.logo?.url ?? null }
					: null,
				other: otherUser
					? { name: otherUser.name, avatarUrl: otherUser.avatar?.url ?? null }
					: null,
				viewerIsShopSide,
				buyerName: buyerNameOf(conv),
			})
		: null;
	const contextListingRaw =
		contextListingData?.doc ?? contextListingData ?? null;
	const [attachedListing, setAttachedListing] =
		useState<AttachedListing | null>(null);
	const isOtherOnline = otherUser?.id ? onlineUsers.has(otherUser.id) : false;

	const { isBlocked, blockId } = useIsBlocked(otherUser?.id);
	const { block, unblock } = useToggleBlock();

	function confirmToggleBlock() {
		if (!otherUser?.id) return;

		if (isBlocked) {
			if (blockId) unblock.mutate(blockId);
			return;
		}

		showAlert(
			t("messages.blockConfirmTitle"),
			t("messages.blockConfirmBody"),
			[
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: t("messages.block"),
					style: "destructive",
					onPress: () => block.mutate(otherUser.id),
				},
			],
			"warning",
		);
	}

	// Init listing attachment from URL param once data loads
	useEffect(() => {
		if (contextListingRaw && listingParam) {
			setAttachedListing(attachedListingOf(contextListingRaw));
		}
	}, [contextListingRaw, listingParam]);

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

	// Tell the caller about the latest message — the shop inbox uses this to
	// mark the conversation read through its own HTTP contract.
	// Keyed on the last message id alone: a caller passing a fresh callback
	// each render (and re-rendering from what the callback does) must not
	// re-fire it — that looped into "Maximum update depth exceeded".
	const onLatestRef = useRef(onLatestMessage);
	onLatestRef.current = onLatestMessage;
	const lastMessageId = messages.at(-1)?.id;
	useEffect(() => {
		if (lastMessageId) onLatestRef.current?.(lastMessageId);
	}, [lastMessageId]);

	// Socket: join conversation, listen for events
	useEffect(() => {
		if (!chatClient || !conversationId) return;

		chatClient.joinConversation(conversationId);

		const onNewMessage = (msg: any) => {
			queryClient.setQueryData(["messages", conversationId], (old: any) => {
				if (!old) return old;
				// Replace optimistic message by tempId if present
				if (msg.tempId) {
					const idx = old.docs.findIndex((m: any) => m.id === msg.tempId);
					if (idx !== -1) {
						const next = [...old.docs];
						next[idx] = msg;
						return { ...old, docs: next };
					}
				}
				const exists = old.docs.some((m: any) => m.id === msg.id);
				if (exists) return old;
				return { ...old, docs: [...old.docs, msg] };
			});
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
			// The other person's words arrive with a soft two-note strike; our
			// own echo (it carries the tempId) and system notes stay silent.
			const senderId = msg.sender?.id ?? msg.sender;
			if (
				!msg.tempId &&
				senderId &&
				senderId !== user?.id &&
				!isSystemMessage(msg)
			)
				feedback("receive");
			// Mark as read immediately since we're viewing the conversation
			chatClient.markRead(conversationId, [msg.id]);
			chatClient.markDelivered(conversationId, msg.id);
		};

		const onConfirmed = ({ tempId, message }: any) => {
			queryClient.setQueryData(["messages", conversationId], (old: any) => {
				if (!old) return old;
				return {
					...old,
					docs: old.docs.map((m: any) => (m.id === tempId ? message : m)),
				};
			});
		};

		// Kept on screen, marked as not sent, so the text can be retried.
		const onFailed = ({ tempId, error }: { tempId: string; error: string }) => {
			feedback("error", { sound: false });
			track(ANALYTICS_EVENTS.messageFailed, {
				platform: "mobile",
				reason: error,
			});
			queryClient.setQueryData(["messages", conversationId], (old: any) => {
				if (!old) return old;
				return {
					...old,
					docs: old.docs.map((m: any) =>
						m.id === tempId ? { ...m, failed: true } : m,
					),
				};
			});
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
		chatClient.on("message:confirmed", onConfirmed);
		chatClient.on("message:failed", onFailed);
		chatClient.on("typing", onTyping);
		chatClient.on("message:read", onMessageRead);

		return () => {
			chatClient.off("message:new", onNewMessage);
			chatClient.off("message:confirmed", onConfirmed);
			chatClient.off("message:failed", onFailed);
			chatClient.off("typing", onTyping);
			chatClient.off("message:read", onMessageRead);
			chatClient.leaveConversation(conversationId);
		};
	}, [
		chatClient,
		conversationId,
		queryClient.invalidateQueries,
		queryClient.setQueryData,
		user?.id,
	]);

	// Mark the other side's unread messages read once they are loaded — the
	// socket effect above runs before the history arrives, so it cannot.
	const messagesRef = useRef(messages);
	messagesRef.current = messages;
	const markedReadRef = useRef(new Set<string>());
	useEffect(() => {
		if (!chatClient || !conversationId || !lastMessageId) return;
		const unreadIds = messagesRef.current
			.filter((m: any) => {
				const senderId = m.sender?.id ?? m.sender;
				return (
					senderId !== user?.id && !m.read && !markedReadRef.current.has(m.id)
				);
			})
			.map((m: any) => m.id as string);
		if (unreadIds.length === 0) return;
		for (const id of unreadIds) markedReadRef.current.add(id);
		chatClient.markRead(conversationId, unreadIds);
		queryClient.invalidateQueries({ queryKey: ["conversations"] });
	}, [chatClient, conversationId, lastMessageId, queryClient, user?.id]);

	// New messages land at the bottom through the list's own
	// `maintainVisibleContentPosition`; the keyboard and the typing bubble
	// change the space without adding a message, so they bring the reader
	// back down here — only when they were already reading the latest.
	useEffect(() => {
		const sub = Keyboard.addListener("keyboardDidShow", () => {
			if (nearBottomRef.current)
				listRef.current?.scrollToEnd({ animated: true });
		});
		return () => sub.remove();
	}, []);
	useEffect(() => {
		if (isOtherTyping && nearBottomRef.current)
			listRef.current?.scrollToEnd({ animated: true });
	}, [isOtherTyping]);

	const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
		nearBottomRef.current =
			contentOffset.y + layoutMeasurement.height >=
			contentSize.height - Math.max(80, layoutMeasurement.height * 0.2);
	};

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

	const [sending, setSending] = useState(false);
	const [chatConnected, setChatConnected] = useState(
		() => chatClient?.isConnected() ?? false,
	);
	useEffect(() => {
		if (!chatClient) return;
		setChatConnected(chatClient.isConnected());
		const onChange = (state: string) => setChatConnected(state === "connected");
		chatClient.on("connection:change", onChange);
		return () => {
			chatClient.off("connection:change", onChange);
		};
	}, [chatClient]);

	function sendMessage() {
		const content = text.trim();
		if (!content || !chatClient || !conversationId || !user) return;

		const listing = attachedListing;
		setSending(true);
		setText("");
		setAttachedListing(null);
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		chatClient.stopTyping(conversationId);

		// Offline, the chat client keeps the message and sends it on reconnect.
		const tempId = chatClient.sendMessage({
			conversationId,
			content,
			...(listing ? { listing: listing.id } : {}),
		});
		queryClient.setQueryData(["messages", conversationId], (old: any) => {
			if (!old) return old;
			return {
				...old,
				docs: [
					...old.docs,
					{
						id: tempId,
						conversationId,
						sender: user.id,
						content,
						createdAt: new Date().toISOString(),
						...(listing ? { listing } : {}),
					},
				],
			};
		});
		queryClient.invalidateQueries({ queryKey: ["conversations"] });
		setSending(false);
		// Read further up, the reader is brought to what they just sent; at the
		// bottom already, the list's own autoscroll does it.
		if (!nearBottomRef.current) {
			nearBottomRef.current = true;
			requestAnimationFrame(() =>
				listRef.current?.scrollToEnd({ animated: true }),
			);
		}
		feedback("send");
		// The answer comes by push: a first message sent is when to ask.
		void askForPushInContext();
	}

	function retryMessage(item: {
		id: string;
		content: string;
		listing?: { id: string };
	}) {
		if (!chatClient || !conversationId) return;
		queryClient.setQueryData(["messages", conversationId], (old: any) => {
			if (!old) return old;
			return {
				...old,
				docs: old.docs.map((m: any) =>
					m.id === item.id ? { ...m, failed: false } : m,
				),
			};
		});
		chatClient.sendMessage({
			conversationId,
			content: item.content,
			tempId: item.id,
			...(item.listing ? { listing: item.listing.id } : {}),
		});
	}

	function openMessageActions(item: any) {
		if (!item?.content) return;
		feedback("tap");
		setActionTarget(item);
	}

	const messageActions: MessageAction[] = actionTarget
		? [
				{
					key: "copy",
					label: t("messages.copy"),
					icon: "copy-outline",
					onPress: () => {
						const content = String(actionTarget.content);
						void Clipboard.setStringAsync(content).then(() =>
							showSuccess(t("messages.copied")),
						);
					},
				},
				...(actionTarget.failed && senderIdOf(actionTarget) === user?.id
					? [
							{
								key: "retry",
								label: t("common.retry"),
								icon: "refresh" as const,
								onPress: () => retryMessage(actionTarget),
							},
						]
					: []),
			]
		: [];

	const formatTime = (dateStr: string) =>
		new Date(dateStr).toLocaleTimeString(i18n.language, {
			hour: "2-digit",
			minute: "2-digit",
		});

	const peerLogo = resolveImageUrl(header?.logoUrl ?? null);
	const peerName = header?.title || t("messages.user");
	const peerAvatar: PeerAvatar = {
		uri: peerLogo,
		initial: peerName.charAt(0).toUpperCase() || "?",
		square: Boolean(header?.isShop),
	};

	/**
	 * Who to draw beside a message that is not ours: the other side of the
	 * thread, or — in a shop thread read from the shop — a teammate, by name.
	 */
	function avatarFor(item: any): PeerAvatar {
		const senderObj = typeof item.sender === "object" ? item.sender : null;
		if (viewerIsShopSide && item.senderSide === "shop") {
			return {
				uri: resolveImageUrl(senderObj?.avatar?.url ?? null),
				initial: senderObj?.name?.[0]?.toUpperCase() ?? "?",
				square: false,
			};
		}
		return peerAvatar;
	}

	function renderAvatar(avatar: PeerAvatar, size = 28) {
		return (
			<View
				style={[
					styles.msgAvatar,
					{
						width: size,
						height: size,
						borderRadius: avatar.square ? Math.round(size * 0.28) : size / 2,
						backgroundColor: C.primaryTint,
					},
				]}
				importantForAccessibility="no-hide-descendants"
				accessibilityElementsHidden
			>
				{avatar.uri ? (
					<Image
						source={{ uri: avatar.uri }}
						style={{ width: size, height: size }}
						contentFit="cover"
					/>
				) : (
					<Text
						style={{
							color: link,
							fontFamily: Fonts.displayBold,
							fontSize: Math.round(size * 0.43),
						}}
					>
						{avatar.initial}
					</Text>
				)}
			</View>
		);
	}

	const renderMessage = ({ item, index }: { item: any; index: number }) => {
		const isMe = senderIdOf(item) === user?.id;
		const prev = messages[index - 1];
		const next = messages[index + 1];
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
					: new Date(item.createdAt).toLocaleDateString(i18n.language, {
							weekday: "long",
							day: "numeric",
							month: "long",
						});

		const dateSeparator = showDate ? (
			<View style={styles.dateSep}>
				<Text
					accessibilityRole="header"
					style={[
						styles.dateLabel,
						{ color: C.mutedForeground, backgroundColor: C.well },
					]}
				>
					{dateLabel}
				</Text>
			</View>
		) : null;

		if (isSystemMessage(item)) {
			return (
				<>
					{dateSeparator}
					<SystemChip
						message={item}
						side={viewerIsShopSide ? "shop" : "buyer"}
					/>
				</>
			);
		}

		// Consecutive messages from one sender read as one block: the tail,
		// the avatar and the wider gap only close the run.
		const startsRun = showDate || !sameRun(prev, item);
		const endsRun = !sameRun(item, next);

		const isRead = readByOther.has(item.id) || item.read;
		const isPending =
			isMe && !item.failed && Boolean(chatClient?.isPending(String(item.id)));
		// Only a shop conversation needs attribution per message — more than
		// one person can answer from that side. A classic 1:1 thread has
		// exactly one "other" person, already named in the header.
		const senderObj = typeof item.sender === "object" ? item.sender : null;
		const authorLabel =
			!isMe && shop && startsRun
				? messageAuthorLabel({
						senderSide: item.senderSide ?? null,
						shopName: shop.name,
						senderFirstName: senderObj?.name?.split(" ")[0] ?? null,
						formerMemberAuthor: Boolean(item.formerMemberAuthor),
						viewerIsShopSide,
					})
				: null;
		const listing = attachedListingOf(item.listing);

		return (
			<>
				{dateSeparator}
				{authorLabel ? (
					<Text style={[styles.authorLabel, { color: C.mutedForeground }]}>
						{authorLabel.primary}
						{authorLabel.secondary ? (
							<Text style={{ color: C.mutedForeground }}>
								{" "}
								{authorLabel.secondary === "formerMember"
									? t("messages.formerMember")
									: authorLabel.secondary}
							</Text>
						) : null}
					</Text>
				) : null}
				<View
					style={[
						styles.msgRow,
						isMe ? styles.msgRight : styles.msgLeft,
						{ marginBottom: endsRun ? 10 : 2 },
					]}
				>
					{isMe ? null : endsRun ? (
						renderAvatar(avatarFor(item))
					) : (
						<View style={styles.avatarSpacer} />
					)}
					<Pressable
						onLongPress={() => openMessageActions(item)}
						delayLongPress={350}
						// A bubble holding a listing card stays a group, so the card
						// keeps its own button for a screen reader; a plain bubble
						// reads as one element that offers the same menu.
						accessible={!listing}
						accessibilityHint={listing ? undefined : t("messages.actionsHint")}
						accessibilityActions={
							listing
								? undefined
								: [{ name: "longpress", label: t("messages.actions") }]
						}
						onAccessibilityAction={(e) => {
							if (e.nativeEvent.actionName === "longpress")
								openMessageActions(item);
						}}
						style={[
							styles.bubble,
							{
								// Own messages in deep indigo in both themes: white text
								// keeps its contrast where the dark primary would not.
								backgroundColor: isMe ? FILLED : C.card,
								borderColor: isMe ? FILLED : C.border,
								opacity:
									actionTarget?.id === item.id ? 0.6 : item.failed ? 0.72 : 1,
							},
							endsRun ? (isMe ? styles.bubbleMine : styles.bubbleTheirs) : null,
							listing ? styles.bubbleWithListing : null,
						]}
					>
						{listing ? (
							<MessageListingCard
								listing={listing}
								mine={isMe}
								onPress={() => router.push(`/listing/${listing.id}` as never)}
							/>
						) : null}
						<Text
							style={[
								styles.bubbleText,
								listing ? styles.bubbleTextUnderCard : null,
								{ color: isMe ? "#ffffff" : C.foreground },
							]}
						>
							{item.content}
						</Text>
						<View
							style={[
								styles.bubbleMeta,
								listing ? styles.bubbleTextUnderCard : null,
							]}
						>
							<Text
								style={[
									styles.bubbleTime,
									{ color: isMe ? OWN_META : C.mutedForeground },
								]}
							>
								{formatTime(item.createdAt)}
							</Text>
							{isMe && item.failed ? (
								<Ionicons
									name="alert-circle"
									size={15}
									color="#ffffff"
									accessibilityLabel={t("messages.notSent")}
								/>
							) : null}
							{isMe && !item.failed ? (
								<Ionicons
									name={
										isPending
											? "time-outline"
											: isRead
												? "checkmark-done"
												: "checkmark"
									}
									size={15}
									color={isRead && !isPending ? "#ffffff" : OWN_META}
									accessibilityLabel={
										isPending
											? t("messages.sending")
											: isRead
												? t("messages.messageRead")
												: t("messages.messageSent")
									}
								/>
							) : null}
						</View>
					</Pressable>
				</View>
				{isMe && item.failed ? (
					<Pressable
						onPress={() => retryMessage(item)}
						accessibilityRole="button"
						accessibilityLabel={t("messages.notSent")}
						hitSlop={8}
						style={({ pressed }) => [
							styles.failedRow,
							{ opacity: pressed ? 0.6 : 1 },
						]}
					>
						<Ionicons name="refresh" size={15} color={C.dangerText} />
						<Text style={[styles.failedText, { color: C.dangerText }]}>
							{t("messages.notSent")}
						</Text>
					</Pressable>
				) : null}
			</>
		);
	};

	if (!user) {
		return (
			<View style={[styles.safe, { backgroundColor: C.background }]}>
				<EmptyState illustration="auth" title={t("auth.loginRequired")} />
			</View>
		);
	}

	const typingBubble = isOtherTyping ? (
		<View style={[styles.msgRow, styles.msgLeft, { marginTop: 2 }]}>
			{renderAvatar(peerAvatar)}
			<View
				style={[
					styles.bubble,
					styles.bubbleTheirs,
					styles.typingBubble,
					{ backgroundColor: C.card, borderColor: C.border },
				]}
				// The dots say it to the eye; this says it aloud, once.
				accessible
				accessibilityLabel={t("messages.typing", {
					name: peerName,
				})}
				accessibilityLiveRegion="polite"
			>
				<TypingIndicator color={C.mutedForeground} />
			</View>
		</View>
	) : null;

	const canSend = text.trim().length > 0 && !sending;
	const nearLimit = text.length >= MAX_LENGTH - 100;

	return (
		<SafeAreaView
			edges={renderHeader ? ["bottom"] : ["top", "bottom"]}
			style={[styles.safe, { backgroundColor: C.background }]}
		>
			{renderHeader ? (
				renderHeader(conv)
			) : (
				<View
					style={[
						styles.header,
						{ backgroundColor: C.card, borderBottomColor: C.border },
					]}
				>
					<HeaderBackButton
						color={C.foreground}
						fallback="/(tabs)/messages"
						style={styles.backBtn}
					/>
					<View style={styles.headerInfo}>
						<View style={styles.avatarWrapper}>
							{renderAvatar(peerAvatar, 40)}
							{!header?.isShop && isOtherOnline ? (
								<View
									style={[
										styles.onlineDotHeader,
										{ backgroundColor: C.success, borderColor: C.card },
									]}
								/>
							) : null}
						</View>
						<View style={styles.headerText}>
							<Text
								style={[styles.headerName, { color: C.foreground }]}
								numberOfLines={1}
								accessibilityRole="header"
							>
								{peerName}
							</Text>
							{!header?.isShop && isOtherOnline ? (
								<Text style={[styles.headerSub, { color: C.success }]}>
									{t("messages.online")}
								</Text>
							) : header?.subtitle ? (
								<Text
									style={[styles.headerSub, { color: C.mutedForeground }]}
									numberOfLines={1}
								>
									{header.subtitle}
								</Text>
							) : attachedListing ? (
								<Pressable
									onPress={() =>
										router.push(`/listing/${attachedListing.id}` as never)
									}
									accessibilityRole="link"
									hitSlop={{ top: 6, bottom: 6 }}
								>
									<Text
										style={[styles.headerSub, { color: link }]}
										numberOfLines={1}
									>
										{attachedListing.title}
									</Text>
								</Pressable>
							) : null}
						</View>
					</View>
					{otherUser?.id ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("messages.options")}
							style={({ pressed }) => [
								styles.optionsBtn,
								{ opacity: pressed ? 0.6 : 1 },
							]}
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
													params: {
														targetType: "user",
														targetId: otherUser?.id,
													},
												}),
										},
										{
											text: isBlocked
												? t("messages.unblock")
												: t("messages.block"),
											style: isBlocked ? "default" : "destructive",
											onPress: confirmToggleBlock,
										},
										{ text: t("common.cancel"), style: "cancel" },
									],
									"info",
								)
							}
						>
							<Ionicons
								name={
									Platform.OS === "ios"
										? "ellipsis-horizontal-circle-outline"
										: "ellipsis-vertical"
								}
								size={Platform.OS === "ios" ? 24 : 20}
								color={C.foreground}
							/>
						</Pressable>
					) : null}
				</View>
			)}

			<KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
				{isLoading ? (
					<SkeletonMessageBubbles />
				) : isError ? (
					// A failed history fetch used to leave a permanently blank thread.
					<EmptyState
						icon="cloud-offline-outline"
						title={t("common.error")}
						subtitle={t("home.errorSub")}
						ctaLabel={t("common.retry")}
						onCta={() => refetch()}
					/>
				) : messages.length === 0 ? (
					<View style={[styles.threadEmptyWrap, centeredContent]}>
						<View style={styles.threadEmpty}>
							{renderAvatar(peerAvatar, 64)}
							<Text
								style={[styles.threadEmptyName, { color: C.foreground }]}
								numberOfLines={1}
							>
								{peerName}
							</Text>
							<Text
								style={[styles.threadEmptyText, { color: C.mutedForeground }]}
							>
								{t("inbox.noMessages")}
							</Text>
						</View>
						{typingBubble}
					</View>
				) : (
					<View style={[styles.listColumn, centeredContent]}>
						<FlashList
							ref={listRef}
							data={messages}
							renderItem={renderMessage}
							keyExtractor={(item) => String(item.id)}
							getItemType={(item) =>
								isSystemMessage(item)
									? "system"
									: item.listing
										? "listing"
										: senderIdOf(item) === user.id
											? "mine"
											: "theirs"
							}
							extraData={{ readByOther, actionTarget }}
							// A chat: the first frame opens on the latest message,
							// history loaded above keeps the reader where they were,
							// and what arrives while they sit at the bottom slides in.
							maintainVisibleContentPosition={{
								startRenderingFromBottom: true,
								autoscrollToBottomThreshold: 0.2,
								animateAutoScrollToBottom: !reducedMotion,
							}}
							onStartReached={loadOlder}
							onStartReachedThreshold={0.5}
							onScroll={onListScroll}
							scrollEventThrottle={64}
							contentContainerStyle={styles.msgList}
							showsVerticalScrollIndicator={false}
							keyboardDismissMode="interactive"
							keyboardShouldPersistTaps="handled"
							ListHeaderComponent={
								loadingOlder ? (
									<ActivityIndicator
										style={styles.olderSpinner}
										color={C.mutedForeground}
										accessibilityLabel={t("common.loading")}
									/>
								) : null
							}
							ListFooterComponent={typingBubble}
						/>
					</View>
				)}

				{/* Composer */}
				<View
					style={[
						styles.inputWrapper,
						{ backgroundColor: C.card, borderTopColor: C.border },
					]}
				>
					{attachedListing ? (
						<View style={centeredContent}>
							<ComposerListingChip
								listing={attachedListing}
								onRemove={() => setAttachedListing(null)}
							/>
						</View>
					) : null}
					{isBlocked ? (
						<View style={[styles.blockedBar, centeredContent]}>
							<Ionicons
								name="ban-outline"
								size={18}
								color={C.mutedForeground}
							/>
							<Text
								style={[styles.blockedNotice, { color: C.mutedForeground }]}
							>
								{t("messages.blockedNotice")}
							</Text>
							<Pressable
								onPress={confirmToggleBlock}
								accessibilityRole="button"
								style={({ pressed }) => [
									styles.blockedActionBtn,
									{ opacity: pressed ? 0.6 : 1 },
								]}
							>
								<Text style={[styles.blockedAction, { color: link }]}>
									{t("messages.unblock")}
								</Text>
							</Pressable>
						</View>
					) : (
						<View style={centeredContent}>
							{!chatConnected ? (
								<View
									style={styles.offlineHint}
									accessibilityLiveRegion="polite"
								>
									<Ionicons
										name="cloud-offline-outline"
										size={14}
										color={C.mutedForeground}
									/>
									<Text
										style={[
											styles.offlineHintText,
											{ color: C.mutedForeground },
										]}
									>
										{t("messages.queuedOffline")}
									</Text>
								</View>
							) : null}
							<View style={styles.inputBar}>
								<View style={styles.inputCol}>
									<TextInput
										value={text}
										onChangeText={handleTextChange}
										placeholder={t("messages.writePlaceholder")}
										placeholderTextColor={C.mutedForeground}
										accessibilityLabel={t("messages.writePlaceholder")}
										selectionColor={link}
										cursorColor={link}
										style={[
											styles.msgInput,
											{
												color: C.foreground,
												backgroundColor: C.well,
												borderColor: C.border,
											},
										]}
										multiline
										maxLength={MAX_LENGTH}
									/>
									{nearLimit ? (
										<Text
											style={[
												styles.counter,
												{
													color:
														text.length >= MAX_LENGTH
															? C.destructive
															: C.mutedForeground,
												},
											]}
										>
											{text.length}/{MAX_LENGTH}
										</Text>
									) : null}
								</View>
								<SendButton
									onPress={() => text.trim() && sendMessage()}
									label={t("messages.send")}
									canSend={canSend}
									sending={sending}
									idleBackground={C.well}
									idleIcon={C.faint}
									reducedMotion={reducedMotion}
								/>
							</View>
						</View>
					)}
				</View>
			</KeyboardAvoidingView>
			<MessageActionSheet
				preview={actionTarget ? String(actionTarget.content ?? "") : null}
				actions={messageActions}
				onClose={() => setActionTarget(null)}
			/>
		</SafeAreaView>
	);
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The composer's send button: it gives under the thumb on a spring and
 * springs back as the message leaves. Scale only, so it stays on the UI
 * thread; still under Reduce Motion.
 */
function SendButton({
	onPress,
	label,
	canSend,
	sending,
	idleBackground,
	idleIcon,
	reducedMotion,
}: {
	onPress: () => void;
	label: string;
	canSend: boolean;
	sending: boolean;
	idleBackground: string;
	idleIcon: string;
	reducedMotion: boolean;
}) {
	const scale = useSharedValue(1);
	const pressStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));
	const springTo = (to: number) => {
		if (reducedMotion) return;
		scale.value = withSpring(to, SpringPresets.micro);
	};
	// Sending empties the composer and disables the button mid-press, which
	// can swallow the press-out: settle back whenever that state flips.
	useEffect(() => {
		if (!canSend) scale.value = withSpring(1, SpringPresets.micro);
	}, [canSend, scale]);

	return (
		<AnimatedPressable
			onPress={onPress}
			onPressIn={() => springTo(0.88)}
			onPressOut={() => springTo(1)}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: !canSend }}
			disabled={!canSend}
			style={[
				styles.sendBtn,
				{ backgroundColor: canSend ? FILLED : idleBackground },
				pressStyle,
			]}
		>
			{sending ? (
				<ActivityIndicator size="small" color="#ffffff" />
			) : (
				<Ionicons
					name="send"
					size={19}
					color={canSend ? "#ffffff" : idleIcon}
					style={styles.sendIcon}
				/>
			)}
		</AnimatedPressable>
	);
}

interface PeerAvatar {
	uri: string | null;
	initial: string;
	/** A shop is a squared plaque, a person a circle. */
	square: boolean;
}

/** Own bubbles and the send button: deep indigo in both themes, so white stays legible. */
const FILLED = Colors.light.ownBubble;
/** Time and ticks on an own bubble: white at 80% keeps 4.5:1 on `FILLED`. */
const OWN_META = "rgba(255,255,255,0.8)";
const MAX_LENGTH = 1000;
/** A stable empty thread, so effects keyed on the list do not re-run every render. */
const EMPTY: any[] = [];
/** Messages closer than this from one sender stack as a run. */
const RUN_GAP_MS = 5 * 60_000;

function senderIdOf(m: any): string | undefined {
	return m?.sender?.id ?? m?.sender;
}

function sameRun(a: any, b: any): boolean {
	if (!a || !b) return false;
	if (isSystemMessage(a) || isSystemMessage(b)) return false;
	if (senderIdOf(a) !== senderIdOf(b)) return false;
	const ta = new Date(a.createdAt);
	const tb = new Date(b.createdAt);
	if (ta.toDateString() !== tb.toDateString()) return false;
	return Math.abs(tb.getTime() - ta.getTime()) < RUN_GAP_MS;
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 4,
		paddingVertical: 6,
		minHeight: 56,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	backBtn: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
	headerText: { flex: 1 },
	avatarWrapper: { position: "relative" },
	onlineDotHeader: {
		position: "absolute",
		bottom: 0,
		right: 0,
		width: 12,
		height: 12,
		borderRadius: 6,
		borderWidth: 2,
	},
	headerName: {
		fontSize: 17,
		lineHeight: 22,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	headerSub: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.bodySemibold },
	optionsBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	listColumn: { flex: 1 },
	msgList: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
	olderSpinner: { paddingVertical: 12 },
	threadEmptyWrap: {
		flex: 1,
		justifyContent: "center",
		paddingHorizontal: 12,
		paddingBottom: 8,
	},
	threadEmpty: { alignItems: "center", gap: 8, paddingHorizontal: 32 },
	threadEmptyName: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
		marginTop: 4,
	},
	threadEmptyText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	dateSep: { alignItems: "center", marginTop: 14, marginBottom: 12 },
	dateLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		paddingHorizontal: 12,
		paddingVertical: 4,
		borderRadius: 10,
		overflow: "hidden",
	},
	authorLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		// Avatar 28 + its 6pt gap + the bubble's own 14pt inset.
		marginLeft: 48,
		marginBottom: 3,
	},
	msgRow: { flexDirection: "row", alignItems: "flex-end" },
	msgLeft: { justifyContent: "flex-start" },
	msgRight: { justifyContent: "flex-end" },
	msgAvatar: {
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		marginRight: 6,
	},
	avatarSpacer: { width: 28, marginRight: 6 },
	bubble: {
		borderRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		paddingTop: 9,
		paddingBottom: 7,
		maxWidth: "78%",
		gap: 2,
	},
	// A shared listing fills the bubble edge to edge, with a 6pt frame.
	bubbleWithListing: {
		width: "82%",
		maxWidth: 340,
		paddingHorizontal: 6,
		paddingTop: 6,
	},
	bubbleTextUnderCard: { paddingHorizontal: 8 },
	typingBubble: { paddingHorizontal: 16, paddingVertical: 10 },
	bubbleMine: { borderBottomRightRadius: 6 },
	bubbleTheirs: { borderBottomLeftRadius: 6 },
	bubbleText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.body },
	bubbleMeta: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 3,
	},
	bubbleTime: { fontSize: 11, lineHeight: 14, fontFamily: Fonts.body },
	failedRow: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-end",
		gap: 5,
		minHeight: 32,
		marginTop: -4,
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	failedText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	offlineHint: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	offlineHintText: {
		flex: 1,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
	},
	inputWrapper: { borderTopWidth: StyleSheet.hairlineWidth },
	inputBar: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	inputCol: { flex: 1 },
	blockedBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingLeft: 16,
		paddingRight: 8,
		paddingVertical: 4,
	},
	blockedNotice: {
		flex: 1,
		fontSize: 14,
		lineHeight: 19,
		fontFamily: Fonts.body,
	},
	blockedActionBtn: {
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	blockedAction: { fontSize: 15, fontFamily: Fonts.bodyBold },
	msgInput: {
		minHeight: 48,
		maxHeight: 132,
		borderRadius: 24,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 16,
		paddingTop: 13,
		paddingBottom: 13,
		fontSize: 16,
		lineHeight: 21,
		fontFamily: Fonts.body,
		textAlignVertical: "center",
	},
	counter: {
		alignSelf: "flex-end",
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.bodyMedium,
		marginTop: 4,
		marginRight: 12,
	},
	sendBtn: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	// The paper plane's visual centre sits left of its box.
	sendIcon: { marginLeft: 3 },
});
