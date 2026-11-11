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
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { notificationRoute } from "@/src/lib/deepLinks";
import { useTranslation } from "@/src/lib/i18n";
import { registerForPushNotificationsAsync } from "@/src/lib/notifications";
import { compactTimeAgo } from "@/src/lib/timeAgo";

const SWIPE_BTN_WIDTH = 72;

function timeAgo(date: string, locale: string): string {
	const parsed = new Date(date);
	// A week on, the date reads better than "9 d".
	if (Date.now() - parsed.getTime() >= 7 * 86_400_000)
		return parsed.toLocaleDateString(locale, {
			day: "numeric",
			month: "short",
		});
	return compactTimeAgo(parsed) ?? "";
}

type Palette = (typeof Colors)["light" | "dark"];
type Tone = "success" | "danger" | "brand" | "sun";

/** The tile's tint and ink for a tone, legible in both themes. */
function toneOf(tone: Tone, c: Palette, isDark: boolean) {
	switch (tone) {
		case "success":
			return { bg: c.successTint, color: c.successText };
		case "danger":
			return {
				bg: c.dangerTint,
				color: isDark ? c.dangerText : c.destructive,
			};
		case "sun":
			return { bg: c.sunTint, color: c.warningText };
		default:
			return { bg: c.primaryTint, color: c.link };
	}
}

function notificationIcon(
	tags: string[],
	isDark: boolean,
): {
	name: keyof typeof Ionicons.glyphMap;
	color: string;
	bg: string;
} {
	const c = Colors[isDark ? "dark" : "light"];
	const tag = tags.join(" ");
	const pick = (name: keyof typeof Ionicons.glyphMap, tone: Tone) => ({
		name,
		...toneOf(tone, c, isDark),
	});
	if (tag.includes("approved") || tag.includes("published"))
		return pick("checkmark-circle-outline", "success");
	if (tag.includes("rejected")) return pick("close-circle-outline", "danger");
	if (tag.includes("message")) return pick("chatbubble-outline", "brand");
	if (tag.includes("boost")) return pick("rocket-outline", "sun");
	if (tag.includes("alert") || tag.includes("search"))
		return pick("bookmark-outline", "brand");
	if (tag.includes("sold")) return pick("cash-outline", "success");
	if (tag.includes("expired")) return pick("time-outline", "danger");
	if (tag.includes("verified"))
		return pick("shield-checkmark-outline", "success");
	if (tag.includes("review")) return pick("star-outline", "sun");
	return pick("notifications-outline", "brand");
}

function navigate(url: string) {
	// The website's page names its app screen (e.g. /seller/messages/… is
	// the app's /seller/inbox/…); a link outside the app opens outside it.
	const route = notificationRoute(url);
	if (route) {
		router.push(route as Parameters<typeof router.push>[0]);
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
	ink,
	onPress,
	progress,
	index,
	total,
}: {
	label: string;
	icon: keyof typeof Ionicons.glyphMap;
	color: string;
	/** The label's colour on `color`: ink on the yellow, white on indigo. */
	ink: string;
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
				accessibilityRole="button"
				accessibilityLabel={label}
				style={[styles.swipeBtn, { backgroundColor: color }]}
			>
				<Ionicons name={icon} size={20} color={ink} />
				<Text style={[styles.swipeBtnLabel, { color: ink }]}>{label}</Text>
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
	const { t, i18n } = useTranslation();
	const icon = notificationIcon(item.tags ?? [], isDark);
	const tokens = Colors[isDark ? "dark" : "light"];
	// Unread rows sit on the soft brand tint, with a dot; no side stripe.
	const unreadBg = tokens.primaryTint;
	const rowBg = item.isRead ? cardBg : unreadBg;
	const data = item.data as Record<string, unknown> | undefined;
	const listingId = data?.listingId as string | undefined;
	const hasActions = !!(item.primaryAction || item.secondaryAction);

	const conversationId = data?.conversationId as string | undefined;

	const handleRowPress = async () => {
		if (!item.isRead) await item.read();
		const url =
			item.redirect?.url ??
			(typeof data?.url === "string" ? data.url : undefined) ??
			(typeof data?.searchUrl === "string" ? data.searchUrl : undefined);
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
			ink: string;
			onPress: () => void;
		}[] = [
			{
				label: item.isRead
					? t("notifications.unread")
					: t("notifications.read"),
				icon: item.isRead ? "mail-unread-outline" : "mail-open-outline",
				color: tokens.primaryFill,
				ink: "#ffffff",
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
				color: tokens.sun,
				ink: tokens.sunForeground,
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
						ink={action.ink}
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
				accessibilityLabel={[
					item.isRead ? null : t("notifications.unread"),
					item.subject,
					item.body,
					timeAgo(item.createdAt, i18n.language),
				]
					.filter(Boolean)
					.join(", ")}
				style={[
					styles.item,
					{ borderBottomColor: borderColor, backgroundColor: rowBg },
				]}
			>
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
						{timeAgo(item.createdAt, i18n.language)}
					</Text>

					{hasActions && (
						<View style={styles.inlineActions}>
							{item.primaryAction && (
								<Pressable
									onPress={handlePrimaryAction}
									accessibilityRole="button"
									hitSlop={6}
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
									accessibilityRole="button"
									hitSlop={6}
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

				{!item.isRead && (
					<View
						style={[styles.unreadDot, { backgroundColor: tokens.primary }]}
					/>
				)}
			</AnimatedPressable>
		</ReanimatedSwipeable>
	);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function NotificationsScreen() {
	const notificationReady = useNotificationReady();
	const isDark = useColorScheme() === "dark";
	// Brand words: the contrast-safe link colour in both themes.
	const primaryColor = Colors[isDark ? "dark" : "light"].link;
	const accentBg = Colors[isDark ? "dark" : "light"].background;

	if (!notificationReady) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: accentBg }]}
			>
				<OrderListSkeleton rows={6} />
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
	const { centeredContent } = useResponsive();
	const c = Colors[isDark ? "dark" : "light"];
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	const borderColor = c.border;

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
				<HeaderBackButton color={textColor} fallback="/(tabs)/account" />
				<Text
					accessibilityRole="header"
					style={[styles.title, { color: textColor }]}
				>
					{t("notifications.title")}
				</Text>
				{unreadCount > 0 && (
					<AnimatedPressable
						onPress={handleMarkAllRead}
						scaleTo={0.95}
						disabled={isMarkingRead}
						accessibilityLabel={t("notifications.markAllRead")}
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
				<View style={[styles.permBanner, { backgroundColor: c.warningTint }]}>
					<Ionicons name="warning-outline" size={18} color={c.warningText} />
					<Text style={[styles.permText, { color: c.warningText }]}>
						{t("notifications.deniedBannerText")}
					</Text>
					<Pressable
						onPress={handleEnablePush}
						accessibilityRole="button"
						hitSlop={12}
						style={styles.permAction}
					>
						<Text style={[styles.permLink, { color: primaryColor }]}>
							{t("notifications.enablePush")}
						</Text>
					</Pressable>
				</View>
			)}
			{permissionStatus === "undetermined" && (
				<View style={[styles.permBanner, { backgroundColor: c.primaryTint }]}>
					<Ionicons
						name="notifications-outline"
						size={18}
						color={primaryColor}
					/>
					<Text style={[styles.permText, { color: c.foreground }]}>
						{t("notifications.undeterminedBannerText")}
					</Text>
					<Pressable
						onPress={handleEnablePush}
						accessibilityRole="button"
						hitSlop={12}
						style={styles.permAction}
					>
						<Text style={[styles.permLink, { color: primaryColor }]}>
							{t("notifications.enablePush")}
						</Text>
					</Pressable>
				</View>
			)}

			{/* Content */}
			<View style={[styles.body, { backgroundColor: bg }]}>
				{isLoading ? (
					<OrderListSkeleton rows={6} />
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
						contentContainerStyle={[
							styles.list,
							{ backgroundColor: cardBg },
							centeredContent,
						]}
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
	title: {
		flex: 1,
		fontSize: 23,
		lineHeight: 28,
		letterSpacing: -0.5,
		fontFamily: Fonts.displayBold,
	},
	markAllBtn: {
		minHeight: 44,
		paddingHorizontal: 8,
		justifyContent: "center",
	},
	markAllText: { fontSize: 14, fontFamily: Fonts.bodySemibold },

	permBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginHorizontal: 16,
		marginBottom: 8,
		padding: 12,
		borderRadius: 12,
	},
	permText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	permAction: { minHeight: 36, justifyContent: "center" },
	permLink: { fontSize: 14, fontFamily: Fonts.bodyBold },

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
		borderBottomWidth: StyleSheet.hairlineWidth,
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
	itemSubject: {
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
		lineHeight: 21,
	},
	itemBody: {
		fontSize: 14,
		fontFamily: Fonts.body,
		lineHeight: 20,
	},
	itemTime: { fontSize: 12, fontFamily: Fonts.body },
	unreadDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		marginTop: 7,
	},

	// ── Swipe actions ─────────────────────────────────────────────
	swipeBtn: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
	},
	swipeBtnLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
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
		paddingHorizontal: 14,
		minHeight: 36,
		borderRadius: 10,
		borderWidth: 1,
	},
	actionBtnPrimary: { backgroundColor: "transparent" },
	actionBtnSecondary: { backgroundColor: "transparent" },
	actionBtnDone: { backgroundColor: "transparent", opacity: 0.5 },
	actionBtnText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
});
