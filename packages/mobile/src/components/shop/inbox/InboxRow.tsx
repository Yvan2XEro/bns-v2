import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useSelectedRowStyle } from "@/src/components/layout/selectedRow";
import { useTranslation } from "@/src/lib/i18n";
import { relativeAge } from "@/src/lib/moderationVerification";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { InboxConversationView } from "@/src/types/api";
import { useShopTheme } from "../theme";

function relativeLabel(
	t: (key: string, options?: Record<string, unknown>) => string,
	at: string,
): string {
	const age = relativeAge(at);
	if (!age) return "";
	if (age.unit === "minutes" && age.count === 0) return t("time.justNow");
	return t(`time.${age.unit}Ago`, { count: age.count });
}

/** The unread badge: the same deep indigo as own bubbles, white stays legible on it in both themes. */
const FILLED = Colors.light.ownBubble;

/** One row of the shared shop inbox. Purely presentational: filtering, paging and navigation live in the screen. */
export function InboxRow({
	item,
	onPress,
	selected,
}: {
	item: InboxConversationView;
	onPress: () => void;
	/** Open in the detail pane beside the list. */
	selected?: boolean;
}) {
	const c = useShopTheme();
	const selectedStyle = useSelectedRowStyle()(selected);
	const { t } = useTranslation();
	const buyerName = item.buyer?.name ?? t("inbox.unknownBuyer");
	const buyerUri = resolveImageUrl(item.buyer?.avatarUrl ?? null);
	const listingUri = resolveImageUrl(item.listing?.thumbnailUrl ?? null);
	const unread = item.unreadCount > 0;
	// The dark primary drops under 4.5:1 on the night card; its lighter
	// tone does not.
	const accent = c.link;
	const time = item.lastMessage ? relativeLabel(t, item.lastMessage.at) : "";
	const preview = item.lastMessage?.preview ?? t("inbox.noMessages");
	const assigneeText = item.assignee
		? item.assignee.suspended
			? t("inbox.assignedSuspended", {
					name: item.assignee.name ?? t("inbox.unknownMember"),
				})
			: t("inbox.assignedTo", {
					name: item.assignee.name ?? t("inbox.unknownMember"),
				})
		: t("inbox.unassigned");
	const state =
		item.inboxStatus === "done"
			? ("done" as const)
			: item.awaitingReply
				? ("awaiting" as const)
				: null;
	const a11yLabel = [
		buyerName,
		unread ? t("inbox.unreadCount", { count: item.unreadCount }) : null,
		item.listing?.title ?? null,
		preview,
		time,
		assigneeText,
		state ? t(`inbox.filter_${state}`) : null,
	]
		.filter(Boolean)
		.join(", ");

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				{ backgroundColor: pressed ? c.neutralSoft : c.card },
				selectedStyle,
			]}
			accessibilityRole="button"
			accessibilityState={{ selected: Boolean(selected) }}
			accessibilityLabel={a11yLabel}
		>
			{buyerUri ? (
				<Image
					source={{ uri: buyerUri }}
					style={[styles.avatar, { backgroundColor: c.neutralSoft }]}
					contentFit="cover"
					accessible={false}
				/>
			) : (
				<View style={[styles.avatar, { backgroundColor: c.primarySoft }]}>
					<Text style={[styles.avatarInitial, { color: accent }]}>
						{buyerName[0]?.toUpperCase() ?? "?"}
					</Text>
				</View>
			)}

			<View style={styles.content}>
				<View style={styles.topLine}>
					<Text
						style={[
							styles.name,
							{
								color: c.text,
								fontFamily: unread ? Fonts.displayBold : Fonts.displaySemibold,
							},
						]}
						numberOfLines={1}
					>
						{buyerName}
					</Text>
					{time ? (
						<Text
							style={[
								styles.time,
								unread
									? { color: accent, fontFamily: Fonts.bodyBold }
									: { color: c.muted },
							]}
						>
							{time}
						</Text>
					) : null}
				</View>
				{item.listing ? (
					<Text style={[styles.listing, { color: c.muted }]} numberOfLines={1}>
						{item.listing.title}
					</Text>
				) : null}
				<View style={styles.previewLine}>
					<Text
						style={[
							styles.preview,
							{
								color: unread ? c.text : c.muted,
								fontFamily: unread ? Fonts.bodySemibold : Fonts.body,
							},
						]}
						numberOfLines={1}
					>
						{preview}
					</Text>
					{unread ? (
						<View style={[styles.badge, { backgroundColor: FILLED }]}>
							<Text style={styles.badgeText}>
								{item.unreadCount > 99 ? "99+" : item.unreadCount}
							</Text>
						</View>
					) : null}
				</View>
				<View style={styles.metaLine}>
					<Ionicons
						name={item.assignee ? "person-outline" : "person-add-outline"}
						size={13}
						color={item.assignee?.suspended ? c.dangerText : c.muted}
					/>
					<Text
						style={[
							styles.assignee,
							{ color: item.assignee?.suspended ? c.dangerText : c.muted },
						]}
						numberOfLines={1}
					>
						{assigneeText}
					</Text>
					{state ? (
						<View
							style={[
								styles.statePill,
								{
									backgroundColor:
										state === "done" ? c.successSoft : c.warningSoft,
								},
							]}
						>
							<Text
								style={[
									styles.stateText,
									{
										color: state === "done" ? c.successText : c.warningText,
									},
								]}
								numberOfLines={1}
							>
								{t(`inbox.filter_${state}`)}
							</Text>
						</View>
					) : null}
				</View>
			</View>

			{/* The hairline starts under the name, as in the buyer inbox. */}
			<View
				style={[styles.separator, { backgroundColor: c.border }]}
				pointerEvents="none"
			/>

			{item.listing ? (
				listingUri ? (
					<Image
						source={{ uri: listingUri }}
						style={[styles.thumb, { backgroundColor: c.neutralSoft }]}
						contentFit="cover"
						recyclingKey={listingUri}
						accessible={false}
					/>
				) : (
					<View
						style={[
							styles.thumb,
							styles.thumbFallback,
							{ backgroundColor: c.neutralSoft },
						]}
					>
						<Ionicons name="pricetag-outline" size={18} color={c.muted} />
					</View>
				)
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 76,
	},
	// Avatar 52 + its 12pt gap + the row's 16pt inset.
	separator: {
		position: "absolute",
		left: 80,
		right: 0,
		bottom: 0,
		height: StyleSheet.hairlineWidth,
	},
	avatar: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	avatarInitial: { fontSize: 20, fontFamily: Fonts.displayBold },
	content: { flex: 1, gap: 2 },
	topLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
	name: { flex: 1, fontSize: 16, lineHeight: 21 },
	time: { fontSize: 12, fontFamily: Fonts.body },
	listing: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	previewLine: { flexDirection: "row", alignItems: "center", gap: 8 },
	preview: { flex: 1, fontSize: 14, lineHeight: 19 },
	badge: {
		minWidth: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 6,
	},
	badgeText: { color: "#ffffff", fontSize: 12, fontFamily: Fonts.displayBold },
	metaLine: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 2,
	},
	assignee: {
		flexShrink: 1,
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
	},
	statePill: {
		marginLeft: 4,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 1,
	},
	stateText: { fontSize: 11, lineHeight: 15, fontFamily: Fonts.bodySemibold },
	thumb: { width: 48, height: 48, borderRadius: 10 },
	thumbFallback: { alignItems: "center", justifyContent: "center" },
});
