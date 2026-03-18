import { Ionicons } from "@expo/vector-icons";
import type { Notification } from "@novu/js";
import { useNotifications } from "@novu/react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Linking,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SharedValue } from "react-native-reanimated";
import Reanimated, {
	interpolate,
	useAnimatedStyle,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { EmptyState } from "@/src/components/EmptyState";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";
import { registerForPushNotificationsAsync } from "@/src/lib/notifications";

const SWIPE_BTN_WIDTH = 72;

function timeAgo(date: string, t: (key: string) => string): string {
	const diff = Date.now() - new Date(date).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return t("time.justNow");
	if (minutes < 60) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}j`;
	return new Date(date).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});
}

function notificationIcon(tags: string[]): {
	name: keyof typeof Ionicons.glyphMap;
	color: string;
	bg: string;
} {
	const tag = tags.join(" ");
	if (tag.includes("approved") || tag.includes("published"))
		return {
			name: "checkmark-circle-outline",
			color: "#16a34a",
			bg: "#dcfce7",
		};
	if (tag.includes("rejected"))
		return { name: "close-circle-outline", color: "#dc2626", bg: "#fee2e2" };
	if (tag.includes("message"))
		return { name: "chatbubble-outline", color: "#1e40af", bg: "#dbeafe" };
	if (tag.includes("boost"))
		return { name: "rocket-outline", color: "#d97706", bg: "#fef3c7" };
	if (tag.includes("alert") || tag.includes("search"))
		return { name: "bookmark-outline", color: "#7c3aed", bg: "#ede9fe" };
	if (tag.includes("sold"))
		return { name: "cash-outline", color: "#16a34a", bg: "#dcfce7" };
	if (tag.includes("expired"))
		return { name: "time-outline", color: "#dc2626", bg: "#fee2e2" };
	if (tag.includes("verified"))
		return {
			name: "shield-checkmark-outline",
			color: "#16a34a",
			bg: "#dcfce7",
		};
	if (tag.includes("review"))
		return { name: "star-outline", color: "#d97706", bg: "#fef3c7" };
	return { name: "notifications-outline", color: "#1e40af", bg: "#dbeafe" };
}

function navigate(url: string) {
	if (url.startsWith("/")) {
		router.push(url as Parameters<typeof router.push>[0]);
	} else {
		Linking.openURL(url);
	}
}

// ─── Swipe action button ──────────────────────────────────────────────────────
// Each button slides in independently with a staggered interpolation so the
// reveal feels natural rather than all buttons snapping in at once.

function SwipeActionButton({
	label,
	icon,
	color,
	onPress,
	progress,
	index,
	total,
}: {
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
	color: string;
	onPress: () => void;
	progress: SharedValue<number>;
	index: number;
	total: number;
}) {
	const animStyle = useAnimatedStyle(() => ({
		transform: [
			{
				translateX: interpolate(
					progress.value,
					[0, 1],
					[(total - index) * SWIPE_BTN_WIDTH, 0],
				),
			},
		],
	}));

	return (
		<Reanimated.View style={[{ width: SWIPE_BTN_WIDTH }, animStyle]}>
			<Pressable
				onPress={onPress}
				style={[styles.swipeBtn, { backgroundColor: color }]}
			>
				<Ionicons name={icon} size={20} color="#fff" />
				<Text style={styles.swipeBtnLabel}>{label}</Text>
			</Pressable>
		</Reanimated.View>
	);
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({
	item,
	isDark,
	borderColor,
	textColor,
	mutedColor,
	primaryColor,
	cardBg,
}: {
	item: Notification;
	isDark: boolean;
	borderColor: string;
	textColor: string;
	mutedColor: string;
	primaryColor: string;
	cardBg: string;
}) {
	const { t } = useTranslation();
	const icon = notificationIcon(item.tags ?? []);
	const unreadBg = isDark ? "rgba(30,58,95,0.4)" : "#eff6ff";
	const rowBg = item.isRead ? cardBg : unreadBg;
	const data = item.data as Record<string, unknown> | undefined;
	const listingId = data?.listingId as string | undefined;
	const hasActions = !!(item.primaryAction || item.secondaryAction);

	const conversationId = data?.conversationId as string | undefined;

	const handleRowPress = async () => {
		if (!item.isRead) await item.read();
		const url = item.redirect?.url;
		if (url) {
			navigate(url);
			return;
		}
		if (conversationId) {
			router.push(`/messages/${conversationId}`);
			return;
		}
		if (listingId) router.push(`/listing/${listingId}`);
	};

	const handlePrimaryAction = async () => {
		await item.completePrimary();
		const url = item.primaryAction?.redirect?.url;
		if (url) navigate(url);
	};

	const handleSecondaryAction = async () => {
		await item.completeSecondary();
		const url = item.secondaryAction?.redirect?.url;
		if (url) navigate(url);
	};

	const renderRightActions = (
		progress: SharedValue<number>,
		_translation: SharedValue<number>,
		methods: SwipeableMethods,
	) => {
		const actions: {
			label: string;
			icon: keyof typeof Ionicons.glyphMap;
			color: string;
			onPress: () => void;
		}[] = [
			{
				label: item.isRead
					? t("notifications.unread")
					: t("notifications.read"),
				icon: item.isRead ? "mail-unread-outline" : "mail-open-outline",
				color: "#3b82f6",
				onPress: async () => {
					methods.close();
					if (item.isRead) await item.unread();
					else await item.read();
				},
			},
			{
				label: item.isArchived
					? t("notifications.restore")
					: t("notifications.archive"),
				icon: item.isArchived ? "arrow-undo-outline" : "archive-outline",
				color: "#f59e0b",
				onPress: async () => {
					methods.close();
					if (item.isArchived) await item.unarchive();
					else await item.archive();
				},
			},
		];

		return (
			<View style={{ flexDirection: "row" }}>
				{actions.map((action, i) => (
					<SwipeActionButton
						key={action.label}
						label={action.label}
						icon={action.icon}
						color={action.color}
						onPress={action.onPress}
						progress={progress}
						index={i}
						total={actions.length}
					/>
				))}
			</View>
		);
	};

	return (
		<ReanimatedSwipeable
			friction={2}
			overshootRight={false}
			rightThreshold={SWIPE_BTN_WIDTH}
			renderRightActions={renderRightActions}
			containerStyle={{ backgroundColor: cardBg }}
		>
			<AnimatedPressable
				onPress={handleRowPress}
				scaleTo={0.985}
				style={[
					styles.item,
					{ borderBottomColor: borderColor, backgroundColor: rowBg },
					!item.isRead && styles.itemUnread,
				]}
			>
				{/* Unread indicator bar */}
				{!item.isRead && (
					<View style={[styles.unreadBar, { backgroundColor: primaryColor }]} />
				)}

				<View style={[styles.iconBox, { backgroundColor: icon.bg }]}>
					<Ionicons name={icon.name} size={18} color={icon.color} />
				</View>

				<View style={{ flex: 1, gap: 3 }}>
					{item.subject ? (
						<Text
							style={[
								styles.itemSubject,
								{ color: textColor },
								!item.isRead && { fontFamily: Fonts.bodySemibold },
							]}
							numberOfLines={1}
						>
							{item.subject}
						</Text>
					) : null}
					<Text
						style={[
							styles.itemBody,
							{ color: item.subject ? mutedColor : textColor },
							!item.isRead &&
								!item.subject && { fontFamily: Fonts.bodySemibold },
						]}
						numberOfLines={hasActions ? 2 : 3}
					>
						{item.body}
					</Text>
					<Text style={[styles.itemTime, { color: mutedColor }]}>
						{timeAgo(item.createdAt, t)}
					</Text>

					{hasActions && (
						<View style={styles.inlineActions}>
							{item.primaryAction && (
								<Pressable
									onPress={handlePrimaryAction}
									style={[
										styles.actionBtn,
										item.primaryAction.isCompleted
											? [styles.actionBtnDone, { borderColor }]
											: [
													styles.actionBtnPrimary,
													{ borderColor: primaryColor },
												],
									]}
								>
									{item.primaryAction.isCompleted && (
										<Ionicons name="checkmark" size={11} color={mutedColor} />
									)}
									<Text
										style={[
											styles.actionBtnText,
											{
												color: item.primaryAction.isCompleted
													? mutedColor
													: primaryColor,
											},
										]}
									>
										{item.primaryAction.label}
									</Text>
								</Pressable>
							)}
							{item.secondaryAction && (
								<Pressable
									onPress={handleSecondaryAction}
									style={[
										styles.actionBtn,
										item.secondaryAction.isCompleted
											? [styles.actionBtnDone, { borderColor }]
											: [styles.actionBtnSecondary, { borderColor }],
									]}
								>
									{item.secondaryAction.isCompleted && (
										<Ionicons name="checkmark" size={11} color={mutedColor} />
									)}
									<Text style={[styles.actionBtnText, { color: mutedColor }]}>
										{item.secondaryAction.label}
									</Text>
								</Pressable>
							)}
						</View>
					)}
				</View>

				{!item.isRead && <View style={styles.unreadDot} />}
			</AnimatedPressable>
		</ReanimatedSwipeable>
	);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
	const notificationReady = useNotificationReady();
	const isDark = useColorScheme() === "dark";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const accentBg = isDark ? "#111827" : "#eef2ff";

	if (!notificationReady) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<View style={styles.center}>
					<ActivityIndicator color={primaryColor} />
				</View>
			</SafeAreaView>
		);
	}

	return (
		<NotificationsContent
			isDark={isDark}
			primaryColor={primaryColor}
			accentBg={accentBg}
		/>
	);
}

function NotificationsContent({
	isDark,
	primaryColor,
	accentBg,
}: {
	isDark: boolean;
	primaryColor: string;
	accentBg: string;
}) {
	const { t } = useTranslation();
	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const borderColor = isDark ? "#1e293b" : "#f1f5f9";

	const { notifications, isLoading, hasMore, fetchMore, readAll, refetch } =
		useNotifications();

	const [isMarkingRead, setIsMarkingRead] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [permissionStatus, setPermissionStatus] = useState<
		"granted" | "denied" | "undetermined" | null
	>(null);

	const items = notifications ?? [];
	const unreadCount = items.filter((n) => !n.isRead).length;

	useEffect(() => {
		Notifications.setBadgeCountAsync(0);
	}, []);

	useEffect(() => {
		Notifications.getPermissionsAsync().then((perm) => {
			setPermissionStatus(perm.status as "granted" | "denied" | "undetermined");
		});
	}, []);

	const handleMarkAllRead = async () => {
		setIsMarkingRead(true);
		try {
			await readAll();
		} finally {
			setIsMarkingRead(false);
		}
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await refetch();
		setIsRefreshing(false);
	};

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
				<Text style={[styles.title, { color: textColor }]}>
					{t("notifications.title")}
				</Text>
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
								{t("notifications.markAllRead")}
							</Text>
						)}
					</AnimatedPressable>
				)}
			</View>

			{/* Push permission banners */}
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
						{t("notifications.deniedBannerText")}
					</Text>
					<Pressable onPress={handleEnablePush}>
						<Text style={[styles.permLink, { color: primaryColor }]}>
							{t("notifications.enablePush")}
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
						{t("notifications.undeterminedBannerText")}
					</Text>
					<Pressable onPress={handleEnablePush}>
						<Text style={[styles.permLink, { color: primaryColor }]}>
							{t("notifications.enablePush")}
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
				) : items.length === 0 ? (
					<EmptyState
						icon="notifications-outline"
						title={t("notifications.noNotifications")}
						subtitle={t("notifications.noNotificationsSub")}
					/>
				) : (
					<FlatList
						data={items}
						keyExtractor={(item) => item.id}
						renderItem={({ item }) => (
							<NotificationRow
								item={item}
								isDark={isDark}
								borderColor={borderColor}
								textColor={textColor}
								mutedColor={mutedColor}
								primaryColor={primaryColor}
								cardBg={cardBg}
							/>
						)}
						contentContainerStyle={[styles.list, { backgroundColor: cardBg }]}
						style={styles.flatList}
						onEndReached={() => hasMore && fetchMore()}
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

	// ── Row ──────────────────────────────────────────────────────
	item: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
		gap: 12,
	},
	itemUnread: {
		paddingLeft: 12, // compensate for the 4px unread bar
	},
	unreadBar: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		width: 4,
		borderTopRightRadius: 2,
		borderBottomRightRadius: 2,
	},
	iconBox: {
		width: 38,
		height: 38,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
	},
	itemSubject: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 20,
	},
	itemBody: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 18,
	},
	itemTime: { fontSize: 12, fontFamily: Fonts.body },
	unreadDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#3b82f6",
		marginTop: 6,
	},

	// ── Swipe actions ─────────────────────────────────────────────
	swipeBtn: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
	},
	swipeBtnLabel: {
		fontSize: 11,
		fontFamily: Fonts.bodySemibold,
		color: "#fff",
	},

	// ── Inline Novu actions (primary / secondary) ─────────────────
	inlineActions: {
		flexDirection: "row",
		gap: 8,
		marginTop: 6,
	},
	actionBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 12,
		paddingVertical: 5,
		borderRadius: 20,
		borderWidth: 1,
	},
	actionBtnPrimary: { backgroundColor: "transparent" },
	actionBtnSecondary: { backgroundColor: "transparent" },
	actionBtnDone: { backgroundColor: "transparent", opacity: 0.5 },
	actionBtnText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
});
