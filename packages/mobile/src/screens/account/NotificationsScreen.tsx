import { Ionicons } from "@expo/vector-icons";
import type { Notification } from "@novu/js";
import { useCounts, useNotifications } from "@novu/react-native";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Platform,
	Pressable,
	RefreshControl,
	SectionList,
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
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useNotificationReady } from "@/src/contexts/NotificationReadyContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { notificationRoute } from "@/src/lib/deepLinks";
import { appDateLocale, parseDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { registerForPushNotificationsAsync } from "@/src/lib/notifications";
import { compactTimeAgo } from "@/src/lib/timeAgo";

const SWIPE_BTN_WIDTH = 76;
/** The icon tile (36) and its gap (12) past the row's 16pt edge. */
const TEXT_INSET = 16 + 36 + 12;

type Palette = ReturnType<typeof useGroupedColors>;
type Tone = "success" | "danger" | "brand" | "sun";

function timeAgo(date: string, locale: string): string {
	const parsed = new Date(date);
	// A week on, the date reads better than "9 j".
	if (Date.now() - parsed.getTime() >= 7 * 86_400_000)
		return parsed.toLocaleDateString(locale, {
			day: "numeric",
			month: "short",
		});
	return compactTimeAgo(parsed) ?? "";
}

/** The tile's tint and ink for a tone, legible in both themes. */
function toneOf(tone: Tone, c: Palette) {
	switch (tone) {
		case "success":
			return { bg: c.successTint, color: c.successText };
		case "danger":
			return {
				bg: c.dangerTint,
				color: c.isDark ? c.dangerText : c.destructive,
			};
		case "sun":
			return { bg: c.sunTint, color: c.warningText };
		default:
			return { bg: c.primaryTint, color: c.link };
	}
}

function notificationIcon(
	tags: string[],
	c: Palette,
): {
	name: keyof typeof Ionicons.glyphMap;
	color: string;
	bg: string;
} {
	const tag = tags.join(" ");
	const pick = (name: keyof typeof Ionicons.glyphMap, tone: Tone) => ({
		name,
		...toneOf(tone, c),
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

/**
 * Notifications grouped the way a person remembers them: today, yesterday,
 * the rest of this week by day, then by month.
 */
function groupByDay(
	items: Notification[],
	t: (key: string) => string,
): { key: string; title: string; data: Notification[] }[] {
	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);
	const today = startOfToday.getTime();
	const day = 86_400_000;
	const locale = appDateLocale();
	const sections: { key: string; title: string; data: Notification[] }[] = [];
	const byKey = new Map<string, (typeof sections)[number]>();

	for (const item of items) {
		const date = parseDate(item.createdAt);
		let key: string;
		let title: string;
		if (!date) {
			key = "unknown";
			title = "";
		} else if (date.getTime() >= today) {
			key = "today";
			title = t("messages.today");
		} else if (date.getTime() >= today - day) {
			key = "yesterday";
			title = t("messages.yesterday");
		} else if (date.getTime() >= today - 6 * day) {
			key = `d:${date.toDateString()}`;
			const weekday = date.toLocaleDateString(locale, { weekday: "long" });
			title = weekday.charAt(0).toUpperCase() + weekday.slice(1);
		} else {
			key = `m:${date.getFullYear()}-${date.getMonth()}`;
			const month = date.toLocaleDateString(locale, {
				month: "long",
				year: "numeric",
			});
			title = month.charAt(0).toUpperCase() + month.slice(1);
		}
		let section = byKey.get(key);
		if (!section) {
			section = { key, title, data: [] };
			byKey.set(key, section);
			sections.push(section);
		}
		section.data.push(item);
	}
	return sections;
}

// ─── Swipe action button ──────────────────────────────────────────────────────
// Each button slides in on its own interpolation, so the reveal follows the
// finger instead of both buttons snapping in at once.

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
				<Text style={[styles.swipeBtnLabel, { color: ink }]} numberOfLines={1}>
					{label}
				</Text>
			</Pressable>
		</Reanimated.View>
	);
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({
	item,
	c,
	onArchived,
}: {
	item: Notification;
	c: Palette;
	/** Told after an archive, so the screen can offer it back. */
	onArchived?: (item: Notification) => void;
}) {
	const { t, i18n } = useTranslation();
	const icon = notificationIcon(item.tags ?? [], c);
	// Unread rows sit on the soft brand tint, with a dot; no side stripe.
	const rowBg = item.isRead ? c.card : c.primaryTint;
	const data = item.data as Record<string, unknown> | undefined;
	const listingId = data?.listingId as string | undefined;
	const conversationId = data?.conversationId as string | undefined;
	const hasActions = !!(item.primaryAction || item.secondaryAction);
	const when = timeAgo(item.createdAt, i18n.language);

	// The destination opens at once; marking read goes on in the background,
	// so a slow network never leaves the tap looking dead.
	const handleRowPress = () => {
		if (!item.isRead) void item.read();
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

	const handlePrimaryAction = () => {
		const url = item.primaryAction?.redirect?.url;
		if (url) navigate(url);
		void item.completePrimary();
	};

	const handleSecondaryAction = () => {
		const url = item.secondaryAction?.redirect?.url;
		if (url) navigate(url);
		void item.completeSecondary();
	};

	const toggleArchive = async () => {
		if (item.isArchived) {
			await item.unarchive();
			return;
		}
		const result = await item.archive();
		if (!result?.error) onArchived?.(item);
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
				color: c.primaryFill,
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
				// Archive is housekeeping, not signage: the quiet well, not yellow.
				color: c.well,
				ink: c.foreground,
				onPress: async () => {
					methods.close();
					await toggleArchive();
				},
			},
		];

		return (
			<View style={styles.swipeRow}>
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
			containerStyle={{ backgroundColor: c.card }}
		>
			<Pressable
				onPress={handleRowPress}
				accessibilityRole="button"
				accessibilityLabel={[
					item.isRead ? null : t("notifications.unread"),
					item.subject,
					item.body,
					when,
				]
					.filter(Boolean)
					.join(", ")}
				accessibilityActions={[
					// The inline buttons sit inside the row's one focus stop;
					// their actions are offered here so TalkBack can reach them.
					...(item.primaryAction
						? [{ name: "primary", label: item.primaryAction.label }]
						: []),
					...(item.secondaryAction
						? [{ name: "secondary", label: item.secondaryAction.label }]
						: []),
					{
						name: "toggleRead",
						label: item.isRead
							? t("notifications.unread")
							: t("notifications.read"),
					},
					{
						name: "archive",
						label: item.isArchived
							? t("notifications.restore")
							: t("notifications.archive"),
					},
				]}
				onAccessibilityAction={(event) => {
					if (event.nativeEvent.actionName === "toggleRead") {
						void (item.isRead ? item.unread() : item.read());
					} else if (event.nativeEvent.actionName === "archive") {
						void toggleArchive();
					} else if (event.nativeEvent.actionName === "primary") {
						handlePrimaryAction();
					} else if (event.nativeEvent.actionName === "secondary") {
						handleSecondaryAction();
					}
				}}
				android_ripple={{ color: c.well }}
				style={({ pressed }) => [
					styles.item,
					{ backgroundColor: rowBg },
					pressed && Platform.OS === "ios" ? { backgroundColor: c.well } : null,
				]}
			>
				<View style={[styles.iconBox, { backgroundColor: icon.bg }]}>
					<Ionicons name={icon.name} size={18} color={icon.color} />
				</View>

				<View style={styles.itemText}>
					<View style={styles.itemTop}>
						<Text
							style={[
								styles.itemSubject,
								{ color: c.foreground },
								!item.isRead && styles.itemUnread,
							]}
							numberOfLines={item.subject ? 1 : 3}
						>
							{item.subject || item.body}
						</Text>
						<Text style={[styles.itemTime, { color: c.mutedForeground }]}>
							{when}
						</Text>
						{!item.isRead ? (
							<View
								style={[styles.unreadDot, { backgroundColor: c.primary }]}
							/>
						) : null}
					</View>
					{item.subject ? (
						<Text
							style={[styles.itemBody, { color: c.body }]}
							numberOfLines={hasActions ? 2 : 3}
						>
							{item.body}
						</Text>
					) : null}

					{hasActions ? (
						<View style={styles.inlineActions}>
							{item.primaryAction ? (
								<Pressable
									onPress={handlePrimaryAction}
									accessibilityRole="button"
									accessibilityState={{
										disabled: Boolean(item.primaryAction.isCompleted),
									}}
									style={[
										styles.actionBtn,
										item.primaryAction.isCompleted
											? { borderColor: c.border, opacity: 0.6 }
											: {
													backgroundColor: c.primaryFill,
													borderColor: c.primaryFill,
												},
									]}
								>
									{item.primaryAction.isCompleted ? (
										<Ionicons
											name="checkmark"
											size={14}
											color={c.mutedForeground}
										/>
									) : null}
									<Text
										style={[
											styles.actionBtnText,
											{
												color: item.primaryAction.isCompleted
													? c.mutedForeground
													: "#ffffff",
											},
										]}
									>
										{item.primaryAction.label}
									</Text>
								</Pressable>
							) : null}
							{item.secondaryAction ? (
								<Pressable
									onPress={handleSecondaryAction}
									accessibilityRole="button"
									accessibilityState={{
										disabled: Boolean(item.secondaryAction.isCompleted),
									}}
									style={[
										styles.actionBtn,
										{
											backgroundColor: c.card,
											borderColor: c.borderStrong,
										},
										item.secondaryAction.isCompleted ? { opacity: 0.6 } : null,
									]}
								>
									{item.secondaryAction.isCompleted ? (
										<Ionicons
											name="checkmark"
											size={14}
											color={c.mutedForeground}
										/>
									) : null}
									<Text
										style={[
											styles.actionBtnText,
											{
												color: item.secondaryAction.isCompleted
													? c.mutedForeground
													: c.link,
											},
										]}
									>
										{item.secondaryAction.label}
									</Text>
								</Pressable>
							) : null}
						</View>
					) : null}
				</View>
			</Pressable>
		</ReanimatedSwipeable>
	);
}

// ─── Push permission card ─────────────────────────────────────────────────────

function PushPermissionCard({
	status,
	onEnable,
	c,
}: {
	status: "denied" | "undetermined";
	onEnable: () => void;
	c: Palette;
}) {
	const { t } = useTranslation();
	const denied = status === "denied";
	return (
		<View
			style={[
				styles.permCard,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View
				style={[
					styles.permIcon,
					{ backgroundColor: denied ? c.warningTint : c.primaryTint },
				]}
			>
				<Ionicons
					name={denied ? "notifications-off-outline" : "notifications-outline"}
					size={18}
					color={denied ? c.warningText : c.link}
				/>
			</View>
			<Text style={[styles.permText, { color: c.foreground }]}>
				{denied
					? t("notifications.deniedBannerText")
					: t("notifications.undeterminedBannerText")}
			</Text>
			<Pressable
				onPress={onEnable}
				accessibilityRole="button"
				accessibilityLabel={
					denied
						? t("settings.permissions.action.openSettings")
						: t("notifications.enablePush")
				}
				hitSlop={8}
				style={({ pressed }) => [
					styles.permAction,
					{ backgroundColor: c.primaryFill, opacity: pressed ? 0.88 : 1 },
				]}
			>
				<Text style={styles.permActionText}>
					{denied
						? t("settings.permissions.action.openSettings")
						: t("notifications.enablePush")}
				</Text>
			</Pressable>
		</View>
	);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function NotificationsScreen() {
	const notificationReady = useNotificationReady();
	const c = useGroupedColors();
	const { t } = useTranslation();

	if (!notificationReady) {
		return (
			<SafeAreaView
				edges={["top"]}
				style={[styles.safe, { backgroundColor: c.background }]}
			>
				<SettingsHeader title={t("notifications.title")} />
				<OrderListSkeleton rows={6} />
			</SafeAreaView>
		);
	}

	return <NotificationsContent c={c} />;
}

function NotificationsContent({ c }: { c: Palette }) {
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();
	// Archived notifications have their own view, so "Restore" is reachable.
	const [showArchived, setShowArchived] = useState(false);

	const {
		notifications,
		isLoading,
		error,
		hasMore,
		fetchMore,
		readAll,
		refetch,
	} = useNotifications({ archived: showArchived });
	const { counts } = useCounts({ filters: [{ read: false }] });
	const totalUnread = counts?.[0]?.count;

	// The notification just archived, offered back for five seconds.
	const [archived, setArchived] = useState<Notification | null>(null);
	useEffect(() => {
		if (!archived) return;
		const timer = setTimeout(() => setArchived(null), 5000);
		return () => clearTimeout(timer);
	}, [archived]);
	const undoArchive = () => {
		if (!archived) return;
		void archived.unarchive();
		setArchived(null);
	};

	const [isMarkingRead, setIsMarkingRead] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [permissionStatus, setPermissionStatus] = useState<
		"granted" | "denied" | "undetermined" | null
	>(null);

	const items = notifications ?? [];
	const unreadCount = items.filter((n) => !n.isRead).length;
	const sections = useMemo(() => groupByDay(items, t), [items, t]);

	// The app icon's badge says what the inbox says: what is still unread.
	useEffect(() => {
		if (totalUnread === undefined) return;
		void Notifications.setBadgeCountAsync(totalUnread);
	}, [totalUnread]);

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
		// Once refused, only the system settings can turn them back on.
		if (permissionStatus === "denied") {
			void Linking.openSettings();
			return;
		}
		const token = await registerForPushNotificationsAsync();
		const perm = await Notifications.getPermissionsAsync();
		setPermissionStatus(perm.status as "granted" | "denied" | "undetermined");
		if (token) {
			await api
				.post("/api/public/novu/register-token", { token })
				.catch(() => null);
		}
	};

	const markAll =
		unreadCount > 0 && !showArchived ? (
			<Pressable
				onPress={handleMarkAllRead}
				disabled={isMarkingRead}
				accessibilityRole="button"
				accessibilityLabel={t("notifications.markAllRead")}
				accessibilityState={{ busy: isMarkingRead }}
				hitSlop={4}
				style={({ pressed }) => [
					styles.headerAction,
					pressed ? { backgroundColor: c.well } : null,
				]}
			>
				{isMarkingRead ? (
					<ActivityIndicator size="small" color={c.link} />
				) : (
					<Ionicons name="checkmark-done" size={22} color={c.link} />
				)}
			</Pressable>
		) : null;

	const permissionCard =
		permissionStatus === "denied" || permissionStatus === "undetermined" ? (
			<PushPermissionCard
				status={permissionStatus}
				onEnable={() => void handleEnablePush()}
				c={c}
			/>
		) : null;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("notifications.title")} right={markAll} />

			<View
				style={[styles.segment, centeredContent]}
				accessibilityRole="tablist"
			>
				{[
					{
						key: false,
						label: t("notifications.inboxTab", { defaultValue: "Reçues" }),
					},
					{
						key: true,
						label: t("notifications.archivedTab", {
							defaultValue: "Archivées",
						}),
					},
				].map((tab) => {
					const active = showArchived === tab.key;
					return (
						<Pressable
							key={String(tab.key)}
							onPress={() => setShowArchived(tab.key)}
							accessibilityRole="tab"
							accessibilityState={{ selected: active }}
							style={[
								styles.segmentChip,
								active
									? {
											backgroundColor: c.primaryFill,
											borderColor: c.primaryFill,
										}
									: { backgroundColor: c.card, borderColor: c.borderStrong },
							]}
						>
							<Text
								style={[
									styles.segmentText,
									{ color: active ? "#ffffff" : c.foreground },
								]}
							>
								{tab.label}
							</Text>
						</Pressable>
					);
				})}
			</View>

			{isLoading ? (
				<OrderListSkeleton rows={6} />
			) : error && items.length === 0 ? (
				// A failed load is not an empty inbox.
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => void refetch()}
				/>
			) : items.length === 0 ? (
				<View style={styles.flex}>
					{permissionCard ? (
						<View style={[styles.permWrap, centeredContent]}>
							{permissionCard}
						</View>
					) : null}
					<EmptyState
						icon="notifications-outline"
						title={t("notifications.noNotifications")}
						subtitle={t("notifications.noNotificationsSub")}
					/>
				</View>
			) : (
				<SectionList
					sections={sections}
					keyExtractor={(item) => item.id}
					stickySectionHeadersEnabled={false}
					ListHeaderComponent={
						permissionCard ? (
							<View style={styles.permWrap}>{permissionCard}</View>
						) : null
					}
					renderSectionHeader={({ section }) =>
						section.title ? (
							<Text
								accessibilityRole="header"
								style={[
									styles.sectionTitle,
									{ color: c.mutedForeground, backgroundColor: c.background },
								]}
							>
								{section.title}
							</Text>
						) : null
					}
					renderItem={({ item, index, section }) => (
						<View
							style={[
								styles.groupRow,
								{ borderColor: c.border, backgroundColor: c.card },
								index === 0 && styles.groupFirst,
								index === section.data.length - 1 && styles.groupLast,
							]}
						>
							{index > 0 ? (
								<View
									style={[styles.separator, { backgroundColor: c.border }]}
								/>
							) : null}
							<NotificationRow item={item} c={c} onArchived={setArchived} />
						</View>
					)}
					contentContainerStyle={[styles.list, centeredContent]}
					onEndReached={() => hasMore && fetchMore()}
					onEndReachedThreshold={0.5}
					refreshControl={
						<RefreshControl
							refreshing={isRefreshing}
							onRefresh={handleRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
						/>
					}
					showsVerticalScrollIndicator={false}
				/>
			)}
			{archived ? (
				<View
					style={[styles.undoBar, { backgroundColor: c.foreground }]}
					accessibilityLiveRegion="polite"
				>
					<Text
						style={[styles.undoText, { color: c.background }]}
						numberOfLines={1}
					>
						{t("notifications.archivedToast", {
							defaultValue: "Notification archivée",
						})}
					</Text>
					<Pressable
						onPress={undoArchive}
						accessibilityRole="button"
						accessibilityLabel={t("cart.undo")}
						style={styles.undoButton}
					>
						<Text style={[styles.undoAction, { color: c.background }]}>
							{t("cart.undo")}
						</Text>
					</Pressable>
				</View>
			) : null}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	flex: { flex: 1 },

	segment: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 12,
	},
	segmentChip: {
		minHeight: 40,
		paddingHorizontal: 16,
		borderRadius: 999,
		borderWidth: 1,
		justifyContent: "center",
	},
	segmentText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	undoBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		marginBottom: 8,
		paddingLeft: 16,
		paddingRight: 4,
		paddingVertical: 4,
		borderRadius: 12,
	},
	undoText: { flex: 1, fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	undoButton: {
		minHeight: 48,
		minWidth: 48,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	undoAction: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodyBold },
	headerAction: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Push permission ──────────────────────────────────────────
	permWrap: { paddingHorizontal: 16, paddingTop: 16 },
	permCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 14,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	permIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	permText: {
		flex: 1,
		fontSize: 15,
		lineHeight: 21,
		fontFamily: Fonts.bodyMedium,
	},
	permAction: {
		minHeight: 44,
		borderRadius: 12,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	permActionText: {
		color: "#ffffff",
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},

	// ── List ─────────────────────────────────────────────────────
	list: { paddingBottom: 48 },
	sectionTitle: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 13,
		lineHeight: 18,
		paddingHorizontal: 32,
		paddingTop: 24,
		paddingBottom: 8,
	},
	// The rows of a day read as one inset card: hairline sides, rounded ends.
	groupRow: {
		marginHorizontal: 16,
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderRightWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	groupFirst: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopLeftRadius: 14,
		borderTopRightRadius: 14,
	},
	groupLast: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomLeftRadius: 14,
		borderBottomRightRadius: 14,
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		marginLeft: TEXT_INSET,
	},

	// ── Row ──────────────────────────────────────────────────────
	item: {
		flexDirection: "row",
		alignItems: "flex-start",
		paddingHorizontal: 16,
		paddingVertical: 14,
		gap: 12,
	},
	iconBox: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	itemText: { flex: 1, gap: 3 },
	itemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
	itemSubject: {
		flex: 1,
		fontSize: 15,
		lineHeight: 21,
		fontFamily: Fonts.bodyMedium,
	},
	itemUnread: { fontFamily: Fonts.bodyBold },
	itemBody: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	itemTime: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	unreadDot: { width: 8, height: 8, borderRadius: 4 },

	// ── Swipe actions ────────────────────────────────────────────
	swipeRow: { flexDirection: "row" },
	swipeBtn: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		paddingHorizontal: 4,
	},
	swipeBtnLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
	},

	// ── Inline Novu actions (primary / secondary) ────────────────
	inlineActions: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 8,
	},
	actionBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 14,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
	},
	actionBtnText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
});
