import { Ionicons } from "@expo/vector-icons";
import {
	type InfiniteData,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
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

/** Rows per page: a screen and a half on a phone, light on metered data. */
const PAGE_SIZE = 20;
/** The list's cache key; `["conversations"]` stays the prefix every invalidation already uses. */
const LIST_KEY = ["conversations", "list"] as const;
/** Up to this many unread messages are counted per load; a badge reads "99+" long before. */
const UNREAD_SCAN_LIMIT = 500;

interface ConversationPage {
	docs: any[];
	page?: number;
	hasNextPage?: boolean;
}

function idOf(value: unknown): string | null {
	if (!value) return null;
	if (typeof value === "string") return value;
	return typeof value === "object" && "id" in value
		? String((value as { id: unknown }).id)
		: null;
}

/** The account's conversations; one opens through `onOpen`. */
export function ConversationList({ selectedId, onOpen }: SplitListProps) {
	const selectedRowStyle = useSelectedRowStyle();
	const { showError, showSuccess, confirm } = useAlert();
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

	// Paged: Payload answers ten rows when no limit is given, which hid every
	// older thread from the list and from search.
	const {
		data,
		isLoading,
		isError,
		refetch,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		dataUpdatedAt,
	} = useInfiniteQuery({
		queryKey: LIST_KEY,
		queryFn: ({ pageParam }: { pageParam: number }) =>
			api.get<ConversationPage>(
				`/api/conversations?depth=2&sort=-updatedAt&limit=${PAGE_SIZE}&page=${pageParam}&where[participants][equals]=${user?.id ?? ""}`,
			),
		initialPageParam: 1,
		getNextPageParam: (last, pages) =>
			last.hasNextPage ? (last.page ?? pages.length) + 1 : undefined,
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

	// A new message moves its row to the top and updates its preview in the
	// cache, instead of refetching the whole list at depth 2 on every
	// message: a busy shop owner on metered data paid for that each time.
	// Only a conversation the list does not hold yet (a brand-new one)
	// costs a refetch.
	useEffect(() => {
		if (!chatClient || !user) return;
		const userId = user.id;
		const handler = (msg: {
			id: string;
			conversationId: string;
			sender?: string;
			content?: string;
			kind?: string;
			createdAt?: string;
		}) => {
			let found = false;
			queryClient.setQueryData<InfiniteData<ConversationPage, number>>(
				LIST_KEY,
				(old) => {
					if (!old?.pages?.length) return old;
					let row: any = null;
					const pages = old.pages.map((page) => ({
						...page,
						docs: (page.docs ?? []).filter((doc) => {
							if (doc?.id !== msg.conversationId) return true;
							row = doc;
							return false;
						}),
					}));
					if (!row) return old;
					found = true;
					const moved = {
						...row,
						updatedAt: msg.createdAt ?? new Date().toISOString(),
						lastMessage: {
							id: msg.id,
							content: msg.content ?? "",
							sender: msg.sender || null,
							kind: msg.kind ?? null,
						},
					};
					const [first, ...rest] = pages;
					return {
						...old,
						pages: [{ ...first, docs: [moved, ...first.docs] }, ...rest],
					};
				},
			);
			if (!found) {
				queryClient.invalidateQueries({ queryKey: LIST_KEY });
				return;
			}
			// The other side's words: the unread counts are worth one light read.
			if (msg.sender && msg.sender !== userId)
				queryClient.invalidateQueries({
					queryKey: ["conversations", "unread"],
				});
		};
		chatClient.on("message:new", handler);
		return () => {
			chatClient.off("message:new", handler);
		};
	}, [chatClient, queryClient, user]);

	// One null doc used to blow up every `c.unreadCount` read below and blank
	// the Messages tab; drop them (and any non-array payload) up front. Pages
	// are offset-based over a list that reorders as messages arrive, so a row
	// can turn up on two pages: the first one wins.
	const loadedRows = useMemo(() => {
		const seen = new Set<string>();
		const rows: any[] = [];
		for (const page of data?.pages ?? []) {
			for (const doc of Array.isArray(page?.docs) ? page.docs : []) {
				if (!doc?.id || seen.has(doc.id)) continue;
				seen.add(doc.id);
				rows.push(doc);
			}
		}
		return rows;
	}, [data]);
	const loadedIds = useMemo(
		() => loadedRows.map((row) => String(row.id)).sort(),
		[loadedRows],
	);

	// `/api/conversations` carries no per-viewer unread count, so every row
	// used to read as seen. One request counts the other side's unread
	// messages across the loaded threads; `messages.read` turns true once
	// this account reads them (`/api/conversations/{id}/read`).
	const unreadQuery = useQuery({
		queryKey: ["conversations", "unread", user?.id ?? "", loadedIds.join(",")],
		queryFn: async () => {
			const res = await api.get<{ docs: Array<{ conversation?: unknown }> }>(
				`/api/messages?depth=0&limit=${UNREAD_SCAN_LIMIT}&select[conversation]=true&where[read][equals]=false&where[sender][not_equals]=${user?.id ?? ""}&where[conversation][in]=${loadedIds.join(",")}`,
			);
			const counts: Record<string, number> = {};
			for (const m of res.docs ?? []) {
				const id = idOf(m.conversation);
				if (id) counts[id] = (counts[id] ?? 0) + 1;
			}
			return counts;
		},
		enabled: Boolean(user) && loadedIds.length > 0,
		// A new page changes the key: keep the counts on screen meanwhile.
		placeholderData: (previous) => previous,
	});
	const unreadByConversation = unreadQuery.data;
	const conversations = useMemo(
		() =>
			loadedRows.map((row) => ({
				...row,
				unreadCount: unreadByConversation?.[row.id] ?? 0,
			})),
		[loadedRows, unreadByConversation],
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

	// Marks every listed thread that has unread messages through the route
	// both clients use (`/api/conversations/{id}/read`): it works with the
	// socket down, which is when this button matters most, and has no cap on
	// how many messages it clears. A per-message PATCH is refused by the
	// collection's access control.
	const handleMarkAllRead = async () => {
		if (!user || markingAllRead) return;
		const targets = conversations
			.filter((c) => (c.unreadCount ?? 0) > 0)
			.map((c) => ({ id: String(c.id), lastMessageId: idOf(c.lastMessage) }))
			.filter((c): c is { id: string; lastMessageId: string } =>
				Boolean(c.lastMessageId),
			);
		if (targets.length === 0) return;
		setMarkingAllRead(true);
		try {
			const results = await Promise.allSettled(
				targets.map((c) =>
					api.post(`/api/conversations/${c.id}/read`, {
						lastMessageId: c.lastMessageId,
					}),
				),
			);
			queryClient.invalidateQueries({ queryKey: ["conversations", "unread"] });
			if (results.some((r) => r.status === "rejected"))
				showError(t("common.error"), t("messages.markAllReadError"));
			else showSuccess(t("messages.markAllReadDone"));
		} finally {
			setMarkingAllRead(false);
		}
	};

	// Deleting removes the conversation document itself, for both sides: the
	// confirm says so, in the destructive style. A thread tied to an order is
	// not offered for deletion — its order chips are the shop's record as
	// much as the buyer's.
	const handleDelete = async (convId: string, name: string) => {
		swipeableRefs.current.get(convId)?.close();
		const ok = await confirm(
			t("messages.deleteTitle"),
			t("messages.deleteBody", { name }),
			{ destructive: true, confirmText: t("common.delete") },
		);
		if (!ok) return;
		try {
			await api.delete(`/api/conversations/${convId}`);
			queryClient.invalidateQueries({ queryKey: ["conversations"] });
		} catch {
			showError(t("common.error"), t("messages.deleteError"));
		}
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

	const renderRightActions = (convId: string, name: string) => (
		<Pressable
			onPress={() => handleDelete(convId, name)}
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
		// An order thread holds the order's chips for both sides: not deletable.
		const deletable = !item.order;

		return (
			<ReanimatedSwipeable
				// Braces required: under React 19 a ref callback that returns a
				// value (here the Map from .set()) is an error.
				ref={(ref) => {
					swipeableRefs.current.set(item.id, ref);
				}}
				enabled={deletable}
				renderRightActions={() => renderRightActions(item.id, title)}
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
					accessibilityActions={
						deletable
							? [{ name: "delete", label: t("messages.deleteConversation") }]
							: undefined
					}
					onAccessibilityAction={(event) => {
						if (deletable && event.nativeEvent.actionName === "delete")
							void handleDelete(item.id, title);
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
				{/* "Unread" only once the counts are in: before that, or when they
				    failed, it would claim everything is read. */}
				{(unreadQuery.isSuccess
					? (["all", "unread", "orders"] as FilterTab[])
					: (["all", "orders"] as FilterTab[])
				).map((tab) => {
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

			{/* A failed refresh over rows already on screen: say they may be old. */}
			{isError && conversations.length > 0 ? (
				<View
					style={[styles.staleBar, { backgroundColor: C.well }]}
					accessibilityLiveRegion="polite"
				>
					<Ionicons
						name="cloud-offline-outline"
						size={16}
						color={C.mutedForeground}
					/>
					<Text style={[styles.staleText, { color: bodyText }]}>
						{t("messages.staleList", {
							time: new Date(dataUpdatedAt).toLocaleTimeString(
								appDateLocale(),
								{ hour: "2-digit", minute: "2-digit" },
							),
						})}
					</Text>
					<Pressable
						onPress={() => refetch()}
						accessibilityRole="button"
						hitSlop={8}
						style={({ pressed }) => [
							styles.staleRetry,
							{ opacity: pressed ? 0.6 : 1 },
						]}
					>
						<Text style={[styles.staleRetryText, { color: C.link }]}>
							{t("common.retry")}
						</Text>
					</Pressable>
				</View>
			) : null}

			{/* Search runs over the rows loaded so far: say so while more exist. */}
			{search.trim() && hasNextPage ? (
				<Text style={[styles.searchScope, { color: C.mutedForeground }]}>
					{t("messages.searchLoadedOnly")}
				</Text>
			) : null}

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
					onEndReached={() => {
						if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
					}}
					onEndReachedThreshold={0.5}
					ListFooterComponent={
						isFetchingNextPage ? (
							<ActivityIndicator
								style={styles.footerSpinner}
								color={C.mutedForeground}
								accessibilityLabel={t("common.loading")}
							/>
						) : null
					}
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
		lineHeight: 38,
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
	markReadText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
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
	filterPillText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	listContent: { paddingBottom: 24 },
	footerSpinner: { paddingVertical: 16 },
	staleBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginHorizontal: 16,
		marginBottom: 8,
		paddingLeft: 12,
		paddingRight: 4,
		borderRadius: 12,
		minHeight: 44,
	},
	staleText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	staleRetry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
	staleRetryText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodyBold },
	searchScope: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
		paddingHorizontal: 16,
		paddingBottom: 8,
	},
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
	convName: {
		fontFamily: Fonts.body,
		fontSize: 16,
		lineHeight: 21,
		flexShrink: 1,
	},
	shopChip: {
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	shopChipText: {
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.bodySemibold,
	},
	convTime: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	convContext: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	convBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
	convLastMsg: {
		flex: 1,
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
	},
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
		lineHeight: 16,
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
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
	},
});
