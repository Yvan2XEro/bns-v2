import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
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
import { getAuthModalParams } from "@/src/lib/authRedirect";
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
	ThreadListingStrip,
} from "./ListingAttachment";
import { type MessageAction, MessageActionSheet } from "./MessageActionSheet";
import {
	fetchLatestMessages,
	fetchOlderMessages,
	lastStoredMessageId,
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
	const { showAlert, showSuccess, showError, confirm } = useAlert();
	const queryClient = useQueryClient();
	const pathname = usePathname();
	const [text, setText] = useState(initialDraft);
	/** Messages sent over HTTP while the chat socket does not exist yet; their bubbles show as sending. */
	const restInFlightRef = useRef(new Set<string>());
	/** Replies that arrived while the reader was up in the history. */
	const [unseenBelow, setUnseenBelow] = useState(0);
	/** The thread menu (⋯), in the same sheet as a message's actions. */
	const [optionsOpen, setOptionsOpen] = useState(false);
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
	/** A buyer talking to a shop: the thread menu acts on the shop, never on the person who owns it. */
	const buyerSeesShop = Boolean(shop) && !viewerIsShopSide;

	function confirmToggleBlock() {
		if (!otherUser?.id) return;
		const name = header?.title || t("messages.user");

		if (isBlocked) {
			if (!blockId) return;
			void confirm(t("messages.unblockUserConfirm", { name }), undefined, {
				confirmText: buyerSeesShop
					? t("messages.unblockShop")
					: t("messages.unblock"),
			}).then((ok) => {
				if (!ok) return;
				unblock.mutate(blockId, {
					onSuccess: () => showSuccess(t("messages.unblockedToast", { name })),
					onError: () => showError(t("common.error")),
				});
			});
			return;
		}

		showAlert(
			buyerSeesShop
				? t("messages.blockShopConfirmTitle", { name })
				: t("messages.blockConfirmTitle"),
			buyerSeesShop
				? t("messages.blockShopConfirmBody")
				: t("messages.blockConfirmBody"),
			[
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: buyerSeesShop ? t("messages.blockShop") : t("messages.block"),
					style: "destructive",
					onPress: () =>
						block.mutate(otherUser.id, {
							onSuccess: () =>
								showSuccess(t("messages.blockedToast", { name })),
							onError: () => showError(t("common.error")),
						}),
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
	const lastMessageId = lastStoredMessageId(messages);
	useEffect(() => {
		if (lastMessageId) onLatestRef.current?.(lastMessageId);
	}, [lastMessageId]);

	// Socket: join conversation, listen for events
	useEffect(() => {
		if (!chatClient || !conversationId) return;

		chatClient.joinConversation(conversationId);

		const onNewMessage = (msg: any) => {
			// Socket events are not scoped to this thread: the list screen hears
			// every conversation's messages through the same client.
			if (msg.conversationId && msg.conversationId !== conversationId) return;
			queryClient.setQueryData(["messages", conversationId], (old: any) =>
				placeMessage(old, msg, msg.tempId),
			);
			// The list patches its own row from this same event; no refetch.
			// The other person's words arrive with a soft two-note strike; our
			// own echo (it carries the tempId) and system notes stay silent.
			const senderId = msg.sender?.id ?? msg.sender;
			const fromOther =
				!msg.tempId &&
				Boolean(senderId) &&
				senderId !== user?.id &&
				!isSystemMessage(msg);
			if (fromOther) {
				feedback("receive");
				// Read further up, the reader would not see it land: count it
				// for the "new message" pill instead.
				if (!nearBottomRef.current) setUnseenBelow((n) => n + 1);
			}
			// Mark as read immediately since we're viewing the conversation
			chatClient.markRead(conversationId, [msg.id]);
			chatClient.markDelivered(conversationId, msg.id);
		};

		const onConfirmed = ({ tempId, message }: any) => {
			queryClient.setQueryData(["messages", conversationId], (old: any) =>
				placeMessage(old, message, tempId),
			);
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
	}, [chatClient, conversationId, queryClient.setQueryData, user?.id]);

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
		// Only the list's unread counts change; its rows do not.
		queryClient.invalidateQueries({ queryKey: ["conversations", "unread"] });
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
		if (nearBottomRef.current) setUnseenBelow(0);
	};

	function jumpToLatest() {
		nearBottomRef.current = true;
		setUnseenBelow(0);
		listRef.current?.scrollToEnd({ animated: !reducedMotion });
	}

	// The half-typed message survives leaving the thread (a call, the ad, the
	// app killed in the background): kept per conversation on the phone.
	const draftKey = `bns.messageDraft.v1.${conversationId}`;
	const draftLoadedRef = useRef(false);
	useEffect(() => {
		draftLoadedRef.current = false;
		if (!conversationId) return;
		let cancelled = false;
		AsyncStorage.getItem(draftKey)
			.then((saved) => {
				if (cancelled) return;
				// A draft handed in by "contact the seller" wins over an old one.
				if (saved && !initialDraft) setText((current) => current || saved);
			})
			.catch(() => {
				// A draft is a convenience: storage failing loses only the draft.
			})
			.finally(() => {
				if (!cancelled) draftLoadedRef.current = true;
			});
		return () => {
			cancelled = true;
		};
	}, [conversationId, draftKey, initialDraft]);
	useEffect(() => {
		if (!conversationId || !draftLoadedRef.current) return;
		const id = setTimeout(() => {
			const write = text.trim()
				? AsyncStorage.setItem(draftKey, text)
				: AsyncStorage.removeItem(draftKey);
			write.catch(() => {
				// As above: a draft that cannot be kept is not an error to show.
			});
		}, 300);
		return () => clearTimeout(id);
	}, [text, conversationId, draftKey]);

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
	// The socket handshake takes a moment on every open: "offline" only after
	// a sustained loss, so a slow network does not flash an error each visit.
	const [showOfflineHint, setShowOfflineHint] = useState(false);
	useEffect(() => {
		if (!chatClient || chatConnected) {
			setShowOfflineHint(false);
			return;
		}
		const id = setTimeout(() => setShowOfflineHint(true), OFFLINE_HINT_DELAY);
		return () => clearTimeout(id);
	}, [chatClient, chatConnected]);

	/**
	 * With no chat client yet (a cold start before the chat address is known,
	 * or that request failed), the message goes over HTTP: the send button
	 * used to look active and do nothing.
	 */
	function sendOverHttp(doc: {
		id: string;
		content: string;
		listing?: { id: string } | null;
	}) {
		restInFlightRef.current.add(doc.id);
		api
			.post<{ doc?: any }>("/api/messages", {
				conversation: conversationId,
				content: doc.content,
				...(doc.listing ? { listing: doc.listing.id } : {}),
			})
			.then((res) => {
				const saved = res?.doc;
				if (saved)
					queryClient.setQueryData(["messages", conversationId], (old: any) =>
						placeMessage(
							old,
							{ ...saved, listing: doc.listing ?? null },
							doc.id,
						),
					);
				// No document in the answer: the stored copy comes with a refetch,
				// which drops the local one.
				else
					queryClient.invalidateQueries({
						queryKey: messagesKey(conversationId),
					});
				queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
			})
			.catch((error: unknown) => {
				feedback("error", { sound: false });
				track(ANALYTICS_EVENTS.messageFailed, {
					platform: "mobile",
					reason: error instanceof Error ? error.message : "http",
				});
				queryClient.setQueryData(["messages", conversationId], (old: any) =>
					old
						? {
								...old,
								docs: old.docs.map((m: any) =>
									m.id === doc.id ? { ...m, failed: true } : m,
								),
							}
						: old,
				);
			})
			.finally(() => {
				restInFlightRef.current.delete(doc.id);
			});
	}

	function sendMessage() {
		const content = text.trim();
		if (!content || !conversationId || !user) return;

		const listing = attachedListing;
		setSending(true);
		setText("");
		setAttachedListing(null);
		if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
		chatClient?.stopTyping(conversationId);

		// Offline, the chat client keeps the message and sends it on reconnect;
		// with no client at all, it goes over HTTP.
		const tempId = chatClient
			? chatClient.sendMessage({
					conversationId,
					content,
					...(listing ? { listing: listing.id } : {}),
				})
			: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
						// Not stored yet: kept through a refetch, and shown as
						// not sent if the app restarts before it leaves.
						optimistic: true,
						...(listing ? { listing } : {}),
					},
				],
			};
		});
		if (!chatClient) sendOverHttp({ id: tempId, content, listing });
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
		if (!conversationId) return;
		queryClient.setQueryData(["messages", conversationId], (old: any) => {
			if (!old) return old;
			return {
				...old,
				docs: old.docs.map((m: any) =>
					m.id === item.id ? { ...m, failed: false, optimistic: true } : m,
				),
			};
		});
		if (!chatClient) {
			sendOverHttp(item);
			return;
		}
		chatClient.sendMessage({
			conversationId,
			content: item.content,
			tempId: item.id,
			...(item.listing ? { listing: item.listing.id } : {}),
		});
	}

	/** A message that never left: removed from the thread for good. */
	function discardMessage(id: string) {
		queryClient.setQueryData(["messages", conversationId], (old: any) =>
			old ? { ...old, docs: old.docs.filter((m: any) => m.id !== id) } : old,
		);
	}

	/**
	 * Not stored by the server, and not on its way: sent from an earlier run
	 * of the app (the queue lived in memory and died with it) or by a client
	 * that has since been replaced. It reads as not sent, with a retry.
	 */
	function isStranded(item: any): boolean {
		if (!item?.optimistic || item.failed) return false;
		const id = String(item.id);
		if (restInFlightRef.current.has(id)) return false;
		return !chatClient?.isPending(id);
	}

	function openMessageActions(item: any) {
		if (!item?.content) return;
		feedback("tap");
		setActionTarget(item);
	}

	const targetIsMine = actionTarget
		? senderIdOf(actionTarget) === user?.id
		: false;
	const targetNotSent = actionTarget
		? Boolean(actionTarget.failed) || isStranded(actionTarget)
		: false;
	const messageActions: MessageAction[] = actionTarget
		? [
				{
					key: "copy",
					label: t("messages.copy"),
					icon: "copy-outline",
					onPress: () => {
						const content = String(actionTarget.content);
						void Clipboard.setStringAsync(content).then(() => {
							// Android 13 and later show their own "copied" chip.
							if (Platform.OS === "android" && Number(Platform.Version) >= 33)
								return;
							showSuccess(t("messages.copied"));
						});
					},
				},
				...(targetNotSent && targetIsMine
					? [
							{
								key: "retry",
								label: t("common.retry"),
								icon: "refresh" as const,
								onPress: () => retryMessage(actionTarget),
							},
							{
								key: "discard",
								label: t("common.delete"),
								icon: "trash-outline" as const,
								tone: "danger" as const,
								onPress: () => discardMessage(String(actionTarget.id)),
							},
						]
					: []),
				// Moderators need the message itself as evidence, not just the
				// account: offered on the other side's words only.
				...(!targetIsMine && !isSystemMessage(actionTarget)
					? [
							{
								key: "report",
								label: t("messages.reportMessage"),
								icon: "flag-outline" as const,
								onPress: () =>
									router.push({
										pathname: "/report",
										params: {
											targetType: "message",
											targetId: String(actionTarget.id),
										},
									}),
							},
						]
					: []),
			]
		: [];

	// The thread menu: for a buyer in a shop thread it names and acts on the
	// shop — the owner's own profile and account stay out of it, since a
	// buyer is never told which member answers.
	const shopHandle = (shop as { handle?: string } | null)?.handle ?? null;
	const threadActions: MessageAction[] = otherUser?.id
		? [
				buyerSeesShop
					? {
							key: "view",
							label: t("messages.viewShop"),
							icon: "storefront-outline" as const,
							onPress: () => {
								if (shopHandle) router.push(`/s/${shopHandle}` as never);
							},
						}
					: {
							key: "view",
							label: t("messages.viewProfile"),
							icon: "person-outline" as const,
							onPress: () => router.push(`/profile/${otherUser.id}`),
						},
				{
					key: "report",
					label: buyerSeesShop
						? t("messages.reportShop")
						: t("messages.report"),
					icon: "flag-outline" as const,
					onPress: () =>
						router.push({
							pathname: "/report",
							params:
								buyerSeesShop && shop
									? { targetType: "shop", targetId: shop.id }
									: { targetType: "user", targetId: otherUser.id },
						}),
				},
				{
					key: "block",
					label: isBlocked
						? buyerSeesShop
							? t("messages.unblockShop")
							: t("messages.unblock")
						: buyerSeesShop
							? t("messages.blockShop")
							: t("messages.block"),
					icon: isBlocked
						? ("lock-open-outline" as const)
						: ("ban-outline" as const),
					tone: isBlocked ? undefined : ("danger" as const),
					onPress: confirmToggleBlock,
				},
			].filter(
				(action) => action.key !== "view" || !buyerSeesShop || shopHandle,
			)
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

	/** Read from the shop, every shop-side message is "ours": the team on the right, the buyer alone on the left. */
	function isOwnSide(item: any): boolean {
		if (senderIdOf(item) === user?.id) return true;
		return viewerIsShopSide && item?.senderSide === "shop";
	}

	const renderMessage = ({ item, index }: { item: any; index: number }) => {
		const isMe = senderIdOf(item) === user?.id;
		const ownSide = isOwnSide(item);
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
		const notSent = isMe && (Boolean(item.failed) || isStranded(item));
		const isPending =
			isMe &&
			!notSent &&
			(restInFlightRef.current.has(String(item.id)) ||
				Boolean(chatClient?.isPending(String(item.id))));
		// Only a shop conversation needs attribution per message — more than
		// one person can answer from that side. A classic 1:1 thread has
		// exactly one "other" person, already named in the header.
		const senderObj = typeof item.sender === "object" ? item.sender : null;
		const senderFirstName: string | null =
			senderObj?.name?.split(" ")[0] ?? null;
		const authorLabel =
			!ownSide && shop && startsRun
				? messageAuthorLabel({
						senderSide: item.senderSide ?? null,
						shopName: shop.name,
						senderFirstName,
						formerMemberAuthor: Boolean(item.formerMemberAuthor),
						viewerIsShopSide,
					})
				: null;
		// A teammate's run, on the shop's side of the thread: their first name
		// above it, so the team can tell who answered.
		const teammateName =
			ownSide && !isMe
				? item.formerMemberAuthor
					? `${senderFirstName ?? shop?.name ?? ""} ${t("messages.formerMember")}`.trim()
					: (senderFirstName ?? shop?.name ?? "")
				: null;
		const listing = attachedListingOf(item.listing);
		const time = formatTime(item.createdAt);
		const status = isMe
			? notSent
				? t("messages.notSent")
				: isPending
					? t("messages.sending")
					: isRead
						? t("messages.messageRead")
						: t("messages.messageSent")
			: null;
		// Who wrote it, aloud: position and colour say it only to the eye.
		const bubbleLabel = isMe
			? `${t("messages.bubbleMine", { time, text: item.content })}${status ? `, ${status}` : ""}`
			: t("messages.bubbleFrom", {
					name: teammateName || authorLabel?.primary || peerName,
					time,
					text: item.content,
				});

		return (
			<>
				{dateSeparator}
				{authorLabel ? (
					<Text
						style={[styles.authorLabel, { color: C.mutedForeground }]}
						importantForAccessibility="no"
						accessibilityElementsHidden
					>
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
				{teammateName && startsRun ? (
					<Text
						style={[styles.teammateLabel, { color: C.mutedForeground }]}
						importantForAccessibility="no"
						accessibilityElementsHidden
						numberOfLines={1}
					>
						{teammateName}
					</Text>
				) : null}
				<View
					style={[
						styles.msgRow,
						ownSide ? styles.msgRight : styles.msgLeft,
						{ marginBottom: endsRun ? 10 : 2 },
					]}
				>
					{ownSide ? null : endsRun ? (
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
						accessibilityLabel={listing ? undefined : bubbleLabel}
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
								backgroundColor: ownSide ? FILLED : C.card,
								borderColor: ownSide ? FILLED : C.border,
								opacity:
									actionTarget?.id === item.id ? 0.6 : notSent ? 0.72 : 1,
							},
							endsRun
								? ownSide
									? styles.bubbleMine
									: styles.bubbleTheirs
								: null,
							listing ? styles.bubbleWithListing : null,
						]}
					>
						{listing ? (
							<MessageListingCard
								listing={listing}
								mine={ownSide}
								onPress={() => router.push(`/listing/${listing.id}` as never)}
							/>
						) : null}
						<Text
							style={[
								styles.bubbleText,
								listing ? styles.bubbleTextUnderCard : null,
								{ color: ownSide ? "#ffffff" : C.foreground },
							]}
						>
							{item.content}
						</Text>
						<View
							style={[
								styles.bubbleMeta,
								listing ? styles.bubbleTextUnderCard : null,
							]}
							// The bubble's own label already says the time and status.
							importantForAccessibility={
								listing ? "auto" : "no-hide-descendants"
							}
							accessibilityElementsHidden={!listing}
						>
							<Text
								style={[
									styles.bubbleTime,
									{ color: ownSide ? OWN_META : C.mutedForeground },
								]}
							>
								{time}
							</Text>
							{notSent ? (
								<Ionicons
									name="alert-circle"
									size={15}
									color="#ffffff"
									accessibilityLabel={t("messages.notSent")}
								/>
							) : null}
							{isMe && !notSent ? (
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
									accessibilityLabel={status ?? undefined}
								/>
							) : null}
						</View>
					</Pressable>
				</View>
				{notSent ? (
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
		// An expired session on a deep-linked thread: a way back, and a way in.
		return (
			<SafeAreaView
				edges={["top", "bottom"]}
				style={[styles.safe, { backgroundColor: C.background }]}
			>
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
				</View>
				<EmptyState
					illustration="auth"
					title={t("auth.loginRequired")}
					subtitle={t("auth.loginToAccess")}
					ctaLabel={t("auth.signIn")}
					onCta={() =>
						router.push({
							pathname: "/auth/login",
							params: getAuthModalParams(pathname),
						})
					}
				/>
			</SafeAreaView>
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

	const threadListing = attachedListingOf(conv?.listing);
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
							onPress={() => setOptionsOpen(true)}
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
			{/* What this chat is about stays in view after the first message
			    goes: the buyer comparing sellers sees which ad and which price. */}
			{!renderHeader && threadListing ? (
				<ThreadListingStrip
					listing={threadListing}
					onPress={() => router.push(`/listing/${threadListing.id}` as never)}
				/>
			) : null}

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
										: isOwnSide(item)
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
						{/* A reply landed while the reader was up in the history. */}
						{unseenBelow > 0 ? (
							<Pressable
								onPress={jumpToLatest}
								accessibilityRole="button"
								accessibilityLabel={t("messages.newMessage")}
								accessibilityLiveRegion="polite"
								style={({ pressed }) => [
									styles.newPill,
									{
										backgroundColor: C.card,
										borderColor: C.border,
										opacity: pressed ? 0.85 : 1,
									},
								]}
							>
								<Ionicons name="arrow-down" size={16} color={link} />
								<Text style={[styles.newPillText, { color: link }]}>
									{t("messages.newMessage")}
								</Text>
							</Pressable>
						) : null}
					</View>
				)}

				{/* Composer */}
				<View
					style={[
						styles.inputWrapper,
						{ backgroundColor: C.card, borderTopColor: C.border },
					]}
				>
					{attachedListing && !isBlocked ? (
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
									{buyerSeesShop
										? t("messages.unblockShop")
										: t("messages.unblock")}
								</Text>
							</Pressable>
						</View>
					) : (
						<View style={centeredContent}>
							{showOfflineHint ? (
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
			{/* The thread menu: same sheet, no preview, so the screen has one
			    way to offer choices; the alert sheet stays for the block
			    decision itself. */}
			<MessageActionSheet
				visible={optionsOpen}
				preview={null}
				actions={threadActions}
				onClose={() => setOptionsOpen(false)}
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
			// DESIGN's 0.97 press, a touch deeper for a 48pt target.
			onPressIn={() => springTo(0.94)}
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
/** Time and ticks on an own bubble: white at 85%, readable on `FILLED` in daylight. */
const OWN_META = "rgba(255,255,255,0.85)";
/** How long the socket may be down before the composer says so. */
const OFFLINE_HINT_DELAY = 1500;

/**
 * Puts a stored message in the thread: in place of its temporary copy when
 * there is one, never twice — a refetch can bring the stored copy in before
 * the socket confirms the temporary one.
 */
function placeMessage(old: any, msg: any, tempId?: string): any {
	if (!old) return old;
	const docs: any[] = old.docs ?? [];
	const already = docs.some((m) => m.id === msg.id);
	if (tempId && docs.some((m) => m.id === tempId)) {
		return {
			...old,
			docs: already
				? docs.filter((m) => m.id !== tempId)
				: docs.map((m) => (m.id === tempId ? msg : m)),
		};
	}
	if (already) return old;
	return { ...old, docs: [...docs, msg] };
}
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
		fontSize: 18,
		lineHeight: 26,
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
		lineHeight: 28,
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
	bubbleTime: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	teammateLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		alignSelf: "flex-end",
		marginRight: 14,
		marginBottom: 3,
		maxWidth: "70%",
	},
	newPill: {
		position: "absolute",
		bottom: 12,
		alignSelf: "center",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44,
		paddingHorizontal: 16,
		borderRadius: 22,
		borderWidth: StyleSheet.hairlineWidth,
		shadowColor: "#12163a",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 12,
		elevation: 4,
	},
	newPillText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
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
	failedText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
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
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
	},
	blockedActionBtn: {
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 8,
	},
	blockedAction: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodyBold },
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
