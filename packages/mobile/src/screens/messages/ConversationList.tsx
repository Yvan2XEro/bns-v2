import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
// The Reanimated swipeable, as on the notifications screen: the legacy one
// mounts its actions after measuring each row, which on Android's new
// renderer could remove a view in the middle of a layout pass and crash.
import ReanimatedSwipeable, {
	type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import type { SplitListProps } from "@/src/components/layout/SplitScreen";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { SearchBar } from "@/src/components/SearchBar";
import { SkeletonConversationRow } from "@/src/components/SkeletonCard";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useAlert } from "@/src/contexts/AlertContext";
import { useChatClient } from "@/src/contexts/ChatContext";
import { useMyShops } from "@/src/hooks/useMyShops";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { appDateLocale } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import {
	resolveImageUrl,
	resolveListingImageUrl,
} from "@/src/lib/resolveImageUrl";
import { can } from "@/src/lib/shopRoles";
import { compactTimeAgo } from "@/src/lib/timeAgo";

/** The shape this screen needs off a conversation row — a narrow, typed view over the loosely-typed `api.get` payload, not `any`. */
interface ConversationListRow {
	id: string;
	shop?:
		| { id: string; name: string; logo?: { url?: string | null } | null }
		| string
		| null;
	buyer?: { id: string } | string | null;
	participants?: Array<
		| { id: string; name?: string | null; avatar?: { url?: string } | null }
		| string
	>;
	lastMessage?: {
		content?: string | null;
		/** An id, or the user at depth 2. */
		sender?: { id: string } | string | null;
		kind?: string | null;
	} | null;
	listing?: { title?: string | null; images?: unknown[] | null } | null;
	order?: { orderNumber?: string | null } | string | null;
	updatedAt?: string;
	unreadCount?: number;
}

function shopOf(conv: ConversationListRow): {
	id: string;
	name: string;
	logo?: { url?: string | null } | null;
} | null {
	return conv.shop && typeof conv.shop === "object" ? conv.shop : null;
}

function buyerIdOf(conv: ConversationListRow): string | null {
	if (!conv.buyer) return null;
	return typeof conv.buyer === "string" ? conv.buyer : conv.buyer.id;
}

/**
 * The only two participants of a shop conversation are the buyer and the
 * shop's owner (see `Conversations.beforeChange` on the API) — so whoever is
 * signed in here and is not the buyer is looking at it from the shop's side.
 * Mirrors `isViewerShopSide` in `packages/web/src/app/messages/messages-client.tsx`.
 */
function isViewerShopSide(conv: ConversationListRow, userId: string): boolean {
	if (!shopOf(conv)) return false;
	const buyerId = buyerIdOf(conv);
	return buyerId !== null && buyerId !== userId;
}

function orderNumberOf(conv: ConversationListRow): string | null {
	return conv.order && typeof conv.order === "object"
		? (conv.order.orderNumber ?? null)
		: null;
}

function formatTime(dateStr: string): string {
	const d = new Date(dateStr);
	// A week on, the date reads better than "9 d".
	if (Date.now() - d.getTime() >= 604_800_000)
		return d.toLocaleDateString(appDateLocale(), {
			day: "2-digit",
			month: "short",
		});
	return compactTimeAgo(d) ?? "";
}

/** Own bubbles, the send button and the unread badge share one deep indigo: white stays legible on it in both themes. */
const FILLED = Colors.light.ownBubble;
/** The swipe-to-delete fill: the light red in both themes, since white on the night red falls to 3.6:1. */
const DELETE_FILL = Colors.light.destructive;
/** Avatar 52 + its 12pt gap + the row's 16pt inset: hairlines start under the name, as in a native inbox. */
const SEPARATOR_INSET = 80;

type FilterTab = "all" | "unread" | "orders";

/** The account's conversations; one opens through `onOpen`. */
export function ConversationList({ selectedId, onOpen }: SplitListProps) {
	const selectedRowStyle = useSelectedRowStyle();
	const { showError, showConfirm } = useAlert();
	const isDark = useColorScheme() === "dark";
	const C = Colors[isDark ? "dark" : "light"];
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const { user } = useAuth();
	const pathname = usePathname();
	const { onlineUsers, chatClient } = useChatClient();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterTab>("all");
	const [markingAllRead, setMarkingAllRead] = useState(false);
	const swipeableRefs = useRef<Map<string, SwipeableMethods | null>>(new Map());

	const myShops = useMyShops();

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["conversations"],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				`/api/conversations?depth=2&sort=-updatedAt&where[participants][equals]=${user?.id ?? ""}`,
			),
		enabled: !!user,
	});

	function roleInShop(shopId: string) {
		return myShops.data?.find((entry) => entry.shopId === shopId)?.role ?? null;
	}

	/**
	 * The "Shop" chip: shown only to whoever is looking, from their personal
	 * inbox, at a buyer conversation with their own shop — never to the
	 * buyer, and never for a permission the server would in fact refuse on
	 * the shop inbox side. Mirrors `showsShopChip` in
	 * `packages/web/src/app/messages/messages-client.tsx`.
	 */
	function showsShopChip(conv: ConversationListRow): boolean {
		if (!user) return false;
		const shop = shopOf(conv);
		if (!shop) return false;
		if (!isViewerShopSide(conv, user.id)) return false;
		return can(roleInShop(shop.id), "inbox.reply");
	}

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

	// One null doc used to blow up every `c.unreadCount` read below and blank
	// the Messages tab; drop them (and any non-array payload) up front.
	const conversations = (Array.isArray(data?.docs) ? data.docs : []).filter(
		Boolean,
	);
	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	// The unread time and "mark all read" in the contrast-safe brand tone.
	const unreadAccent = C.link;
	// DESIGN.md's "body" tone: secondary text with more weight than meta.
	const bodyText = C.body;

	const unreadCount = useMemo(
		() => conversations.filter((c) => (c.unreadCount ?? 0) > 0).length,
		[conversations],
	);

	const filtered = useMemo(() => {
		let list = conversations;
		if (filter === "unread")
			list = list.filter((c) => (c.unreadCount ?? 0) > 0);
		if (filter === "orders") list = list.filter((c) => Boolean(c.order));
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			list = list.filter((c) => {
				const other =
					c.participants?.find((p: any) => p.id !== user?.id) ??
					c.participants?.[0];
				const name =
					`${other?.name ?? ""} ${shopOf(c)?.name ?? ""}`.toLowerCase();
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
			showError(t("common.error"), t("messages.markAllReadError"));
		} finally {
			setMarkingAllRead(false);
		}
	};

	// Delete a conversation
	const handleDelete = (convId: string) => {
		swipeableRefs.current.get(convId)?.close();
		showConfirm(
			t("messages.deleteTitle"),
			t("messages.deleteConfirmText"),
			async () => {
				try {
					await api.delete(`/api/conversations/${convId}`);
					queryClient.invalidateQueries({ queryKey: ["conversations"] });
				} catch {
					showError(t("common.error"), t("messages.deleteError"));
				}
			},
		);
	};

	const header = (
		<View style={styles.header}>
			<Text
				style={[styles.headerTitle, { color: C.foreground }]}
				accessibilityRole="header"
			>
				{t("messages.title")}
			</Text>
			{user && unreadCount > 0 ? (
				<Pressable
					onPress={handleMarkAllRead}
					disabled={markingAllRead}
					accessibilityRole="button"
					accessibilityLabel={t("messages.markAllRead")}
					accessibilityState={{ busy: markingAllRead }}
					hitSlop={4}
					style={({ pressed }) => [
						styles.markReadBtn,
						{ opacity: pressed ? 0.6 : 1 },
					]}
				>
					{markingAllRead ? (
						<ActivityIndicator size="small" color={unreadAccent} />
					) : (
						<Ionicons
							name="checkmark-done-outline"
							size={18}
							color={unreadAccent}
						/>
					)}
					<Text style={[styles.markReadText, { color: unreadAccent }]}>
						{t("messages.markAllRead")}
					</Text>
				</Pressable>
			) : null}
		</View>
	);

	if (!user) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: C.background }]}
			>
				{header}
				<EmptyState
					illustration="messages"
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

	const renderRightActions = (convId: string) => (
		<Pressable
			onPress={() => handleDelete(convId)}
			accessibilityRole="button"
			accessibilityLabel={t("messages.deleteConversation")}
			style={[styles.deleteAction, { backgroundColor: DELETE_FILL }]}
		>
			<Ionicons name="trash-outline" size={22} color="#ffffff" />
			<Text style={styles.deleteActionText}>{t("common.delete")}</Text>
		</Pressable>
	);

	const renderConversation = ({ item }: { item: any }) => {
		const other =
			item.participants?.find((p: any) => p.id !== user.id) ??
			item.participants?.[0];
		const lastMsg = item.lastMessage;
		const count: number = item.unreadCount ?? 0;
		const unread = count > 0;
		const isOnline = other?.id ? onlineUsers.has(other.id) : false;
		const chip = showsShopChip(item);
		// The buyer talks to the shop, not to whoever owns it.
		const shop = shopOf(item);
		const talksToShop = Boolean(shop) && !isViewerShopSide(item, user.id);
		const title = talksToShop
			? (shop?.name ?? t("messages.user"))
			: (other?.name ?? t("messages.user"));
		const avatarUri = talksToShop
			? resolveImageUrl(shop?.logo?.url ?? null)
			: (other?.avatar?.url ?? null);
		const orderNumber = orderNumberOf(item);
		const listingTitle = item.listing?.title ?? null;
		const context = orderNumber
			? listingTitle
				? t("messages.orderContext", {
						number: orderNumber,
						title: listingTitle,
					})
				: t("messages.orderContextShort", { number: orderNumber })
			: listingTitle;
		const thumbUri = resolveListingImageUrl(
			item.listing?.images?.[0],
			"thumbnail",
		);
		const time = item.updatedAt ? formatTime(item.updatedAt) : "";
		const senderId =
			typeof lastMsg?.sender === "string"
				? lastMsg.sender
				: (lastMsg?.sender?.id ?? null);
		// Whose turn it is, at a glance: your own last word carries "You:".
		const mine =
			Boolean(lastMsg?.content) &&
			lastMsg?.kind !== "system" &&
			senderId === user.id;
		const preview = lastMsg?.content
			? mine
				? t("messages.you", { text: lastMsg.content })
				: lastMsg.content
			: t("messages.noMessages");
		const a11yLabel = [
			title,
			chip ? t("messages.shopChip") : null,
			unread ? t("inbox.unreadCount", { count }) : null,
			context,
			preview,
			time,
		]
			.filter(Boolean)
			.join(", ");

		return (
			<ReanimatedSwipeable
				// Braces required: under React 19 a ref callback that returns a
				// value (here the Map from .set()) is an error.
				ref={(ref) => {
					swipeableRefs.current.set(item.id, ref);
				}}
				renderRightActions={() => renderRightActions(item.id)}
				rightThreshold={60}
				overshootRight={false}
			>
				<Pressable
					onPress={() => onOpen(item.id)}
					accessibilityRole="button"
					accessibilityLabel={a11yLabel}
					accessibilityState={{ selected: item.id === selectedId }}
					// Swiping is invisible to a screen reader: the same delete is
					// offered as an action on the row.
					accessibilityActions={[
						{ name: "delete", label: t("messages.deleteConversation") },
					]}
					onAccessibilityAction={(event) => {
						if (event.nativeEvent.actionName === "delete")
							handleDelete(item.id);
					}}
					style={({ pressed }) => [
						styles.convItem,
						{ backgroundColor: pressed ? C.well : C.card },
						selectedRowStyle(item.id === selectedId),
					]}
				>
					<View style={styles.avatarContainer}>
						{/* A shop is a squared plaque, a person a circle: who you are
						    talking to reads before the name does. */}
						<ShopAvatar
							name={title}
							logo={avatarUri}
							size={52}
							radius={talksToShop ? 14 : 26}
						/>
						{isOnline && !talksToShop ? (
							<View
								style={[
									styles.onlineDot,
									{ backgroundColor: C.success, borderColor: C.card },
								]}
							/>
						) : null}
					</View>

					<View style={styles.convContent}>
						<View style={styles.convTop}>
							<View style={styles.convNameRow}>
								<Text
									style={[
										styles.convName,
										{
											color: C.foreground,
											fontFamily: unread
												? Fonts.displayBold
												: Fonts.displaySemibold,
										},
									]}
									numberOfLines={1}
								>
									{title}
								</Text>
								{chip ? (
									<View
										style={[
											styles.shopChip,
											{ backgroundColor: C.primaryTint },
										]}
									>
										<Text
											style={[styles.shopChipText, { color: unreadAccent }]}
										>
											{t("messages.shopChip")}
										</Text>
									</View>
								) : null}
							</View>
							<Text
								style={[
									styles.convTime,
									unread
										? { color: unreadAccent, fontFamily: Fonts.bodyBold }
										: { color: C.mutedForeground },
								]}
							>
								{time}
							</Text>
						</View>
						{context ? (
							<Text
								style={[styles.convContext, { color: C.mutedForeground }]}
								numberOfLines={1}
							>
								{context}
							</Text>
						) : null}
						<View style={styles.convBottom}>
							<Text
								style={[
									styles.convLastMsg,
									{
										color: unread ? C.foreground : C.mutedForeground,
										fontFamily: unread ? Fonts.bodySemibold : Fonts.body,
									},
								]}
								numberOfLines={1}
							>
								{preview}
							</Text>
							{unread ? (
								<View style={[styles.unreadBadge, { backgroundColor: FILLED }]}>
									<Text style={styles.unreadBadgeText}>
										{count > 99 ? "99+" : count}
									</Text>
								</View>
							) : null}
						</View>
					</View>

					{thumbUri ? (
						<Image
							source={{ uri: thumbUri }}
							style={[styles.thumb, { backgroundColor: C.well }]}
							contentFit="cover"
							recyclingKey={thumbUri}
							accessible={false}
						/>
					) : null}
				</Pressable>
			</ReanimatedSwipeable>
		);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: C.background }]}
		>
			{header}

			<SearchBar
				value={search}
				onChangeText={setSearch}
				placeholder={t("messages.searchPlaceholder")}
			/>

			{/* Filters */}
			<View style={styles.filterRow}>
				{(["all", "unread", "orders"] as FilterTab[]).map((tab) => {
					const active = filter === tab;
					const label =
						tab === "all"
							? t("common.all")
							: tab === "orders"
								? t("messages.filterOrders")
								: unreadCount > 0
									? t("messages.unreadWithCount", { count: unreadCount })
									: t("messages.unread");
					return (
						<Pressable
							key={tab}
							onPress={() => setFilter(tab)}
							accessibilityRole="button"
							accessibilityState={{ selected: active }}
							hitSlop={{ top: 6, bottom: 6 }}
							style={[
								styles.filterPill,
								active
									? {
											backgroundColor: C.primaryFill,
											borderColor: C.primaryFill,
										}
									: { backgroundColor: C.card, borderColor: C.border },
							]}
						>
							<Text
								style={[
									styles.filterPillText,
									{
										color: active ? "#ffffff" : bodyText,
										fontFamily: active ? Fonts.bodyBold : Fonts.bodySemibold,
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
			{isLoading ? (
				<View
					accessibilityLabel={t("common.loading")}
					accessibilityState={{ busy: true }}
				>
					{[...Array(7)].map((_, i) => (
						<SkeletonConversationRow key={i} />
					))}
				</View>
			) : isError && conversations.length === 0 ? (
				<EmptyState
					icon="cloud-offline-outline"
					title={t("home.errorTitle")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => refetch()}
				/>
			) : filtered.length === 0 ? (
				<EmptyState
					illustration={search ? "searching" : "messages"}
					title={
						search
							? t("search.noResults")
							: filter === "unread"
								? t("messages.noUnread")
								: t("messages.noConversations")
					}
					subtitle={
						search
							? t("messages.noConversationsForSearch", { query: search })
							: filter === "unread"
								? t("messages.allRead")
								: t("messages.contactSeller")
					}
					ctaLabel={
						search || filter !== "all"
							? undefined
							: t("messages.browseListings")
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
					extraData={selectedId}
					keyExtractor={(item) => item.id}
					contentContainerStyle={[styles.listContent, centeredContent]}
					ItemSeparatorComponent={() => (
						<View style={{ backgroundColor: C.card }}>
							<View style={[styles.separator, { backgroundColor: C.border }]} />
						</View>
					)}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={C.primary}
							colors={[C.primary]}
						/>
					}
					keyboardDismissMode="on-drag"
					keyboardShouldPersistTaps="handled"
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
		gap: 12,
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 8,
		minHeight: 60,
	},
	headerTitle: {
		flex: 1,
		fontSize: 30,
		lineHeight: 34,
		letterSpacing: -0.8,
		fontFamily: Fonts.displayExtrabold,
	},
	markReadBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 44,
		paddingHorizontal: 4,
	},
	markReadText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	filterRow: {
		flexDirection: "row",
		paddingHorizontal: 16,
		paddingTop: 2,
		paddingBottom: 12,
		gap: 8,
	},
	filterPill: {
		minHeight: 36,
		justifyContent: "center",
		paddingHorizontal: 16,
		borderRadius: 18,
		borderWidth: StyleSheet.hairlineWidth,
	},
	filterPillText: { fontSize: 14 },
	listContent: { paddingBottom: 24 },
	convItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 76,
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		marginLeft: SEPARATOR_INSET,
	},
	avatarContainer: { position: "relative" },
	onlineDot: {
		position: "absolute",
		bottom: 0,
		right: 0,
		width: 14,
		height: 14,
		borderRadius: 7,
		borderWidth: 2,
	},
	convContent: { flex: 1, gap: 2 },
	convTop: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 8,
	},
	convNameRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
	convName: { fontSize: 16, lineHeight: 21, flexShrink: 1 },
	shopChip: {
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	shopChipText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	convTime: { fontSize: 12, fontFamily: Fonts.body },
	convContext: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	convBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
	convLastMsg: { flex: 1, fontSize: 14, lineHeight: 19 },
	unreadBadge: {
		minWidth: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 6,
	},
	unreadBadgeText: {
		color: "#ffffff",
		fontSize: 12,
		fontFamily: Fonts.displayBold,
	},
	thumb: { width: 48, height: 48, borderRadius: 10 },
	deleteAction: {
		justifyContent: "center",
		alignItems: "center",
		width: 88,
		gap: 4,
	},
	deleteActionText: {
		color: "#ffffff",
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
});
