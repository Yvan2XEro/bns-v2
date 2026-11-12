import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import {
	type MessageAction,
	MessageActionSheet,
} from "@/src/components/messages/MessageActionSheet";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { InboxConversationView } from "@/src/types/api";
import { useShopTheme } from "../theme";

interface ConversationHeaderProps {
	buyerName: string | null;
	/** From the inbox row when the thread was opened from the list. */
	buyerAvatarUrl?: string | null;
	listingTitle: string | null;
	/** Opens the ad the thread is about. */
	onListingPress?: () => void;
	/** Opens the order the thread was created for. */
	onOrderPress?: () => void;
	/** Reports the buyer to moderation. */
	onReportBuyer?: () => void;
	assignee: InboxConversationView["assignee"];
	status: "open" | "done";
	/** Assignee and status not known yet (opened from a push): chips wait. */
	stateLoading?: boolean;
	onAssigneePress: () => void;
	onToggleStatus: () => void;
	assigneePending?: boolean;
	statusPending?: boolean;
}

/**
 * The shop inbox's own conversation header — buyer and listing instead of
 * the 1:1 chat's online/offline line, plus the assignee chip and the
 * Done/Reopen action. Passed to `ConversationScreen` as `renderHeader`
 * rather than built into it, since that component assumes a personal chat.
 */
export function ConversationHeader({
	buyerName,
	buyerAvatarUrl,
	listingTitle,
	onListingPress,
	onOrderPress,
	onReportBuyer,
	assignee,
	status,
	stateLoading = false,
	onAssigneePress,
	onToggleStatus,
	assigneePending,
	statusPending,
}: ConversationHeaderProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	// ConversationScreen leaves the top edge to a custom header, and the
	// route draws no stack header: this one clears the status bar itself.
	const insets = useSafeAreaInsets();
	// The dark primary drops under 4.5:1 on its soft tint; the lighter
	// tone does not.
	const accent = c.link;
	const name = buyerName ?? t("inbox.unknownBuyer");
	const avatarUri = resolveImageUrl(buyerAvatarUrl ?? null);
	const [menuOpen, setMenuOpen] = useState(false);
	const menu: MessageAction[] = [
		...(onOrderPress
			? [
					{
						key: "order",
						label: t("messages.systemOrderOpen"),
						icon: "receipt-outline" as const,
						onPress: onOrderPress,
					},
				]
			: []),
		...(onListingPress
			? [
					{
						key: "listing",
						label: t("messages.viewListing"),
						icon: "pricetag-outline" as const,
						onPress: onListingPress,
					},
				]
			: []),
		...(onReportBuyer
			? [
					{
						key: "report",
						label: t("inbox.reportBuyer"),
						icon: "flag-outline" as const,
						tone: "danger" as const,
						onPress: onReportBuyer,
					},
				]
			: []),
	];
	const assigneeBusy = Boolean(assigneePending) || stateLoading;
	const statusBusy = Boolean(statusPending) || stateLoading;
	const assigneeLabel = stateLoading
		? t("common.loading")
		: assignee
			? assignee.suspended
				? t("inbox.assignedSuspended", {
						name: assignee.name ?? t("inbox.unknownMember"),
					})
				: (assignee.name ?? t("inbox.unknownMember"))
			: t("inbox.unassigned");

	return (
		<View
			style={[
				styles.wrap,
				{
					backgroundColor: c.card,
					borderBottomColor: c.border,
					paddingTop: insets.top,
				},
			]}
		>
			<View style={styles.topRow}>
				<HeaderBackButton
					color={c.text}
					fallback="/seller/inbox"
					style={styles.backBtn}
				/>
				{avatarUri ? (
					<Image
						source={{ uri: avatarUri }}
						style={[styles.avatar, { backgroundColor: c.neutralSoft }]}
						contentFit="cover"
						accessible={false}
					/>
				) : (
					<View style={[styles.avatar, { backgroundColor: c.primarySoft }]}>
						<Text style={[styles.avatarInitial, { color: accent }]}>
							{name[0]?.toUpperCase() ?? "?"}
						</Text>
					</View>
				)}
				<View style={styles.titleCol}>
					<Text
						style={[styles.buyer, { color: c.text }]}
						numberOfLines={1}
						accessibilityRole="header"
					>
						{name}
					</Text>
					{listingTitle && onListingPress ? (
						<Pressable
							onPress={onListingPress}
							accessibilityRole="link"
							accessibilityLabel={`${t("messages.viewListing")}, ${listingTitle}`}
							hitSlop={{ top: 6, bottom: 6 }}
						>
							<Text
								style={[styles.listing, { color: accent }]}
								numberOfLines={1}
							>
								{listingTitle}
							</Text>
						</Pressable>
					) : listingTitle ? (
						<Text
							style={[styles.listing, { color: c.muted }]}
							numberOfLines={1}
						>
							{listingTitle}
						</Text>
					) : null}
				</View>
				{menu.length > 0 ? (
					<Pressable
						onPress={() => setMenuOpen(true)}
						accessibilityRole="button"
						accessibilityLabel={t("messages.options")}
						style={({ pressed }) => [
							styles.menuBtn,
							{ opacity: pressed ? 0.6 : 1 },
						]}
					>
						<Ionicons
							name={
								Platform.OS === "ios"
									? "ellipsis-horizontal-circle-outline"
									: "ellipsis-vertical"
							}
							size={Platform.OS === "ios" ? 24 : 20}
							color={c.text}
						/>
					</Pressable>
				) : null}
			</View>
			<MessageActionSheet
				visible={menuOpen}
				preview={null}
				actions={menu}
				onClose={() => setMenuOpen(false)}
			/>

			<View style={styles.actionsRow}>
				<Pressable
					onPress={onAssigneePress}
					disabled={assigneeBusy}
					hitSlop={{ top: 4, bottom: 4 }}
					style={({ pressed }) => [
						styles.chip,
						{
							borderColor: assignee?.suspended ? c.danger : c.border,
							backgroundColor: assignee?.suspended
								? c.dangerSoft
								: c.neutralSoft,
							opacity: pressed ? 0.7 : 1,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={`${t("inbox.assigneeSheetTitle")}, ${assigneeLabel}`}
					accessibilityState={{ busy: assigneeBusy, disabled: assigneeBusy }}
				>
					{assigneeBusy ? (
						<ActivityIndicator size="small" color={accent} />
					) : (
						<Ionicons
							name="person-circle-outline"
							size={16}
							color={assignee?.suspended ? c.dangerText : c.neutralText}
						/>
					)}
					<Text
						style={[
							styles.chipText,
							{ color: assignee?.suspended ? c.dangerText : c.neutralText },
						]}
						numberOfLines={1}
					>
						{assigneeLabel}
					</Text>
				</Pressable>

				<Pressable
					onPress={onToggleStatus}
					disabled={statusBusy}
					hitSlop={{ top: 4, bottom: 4 }}
					style={({ pressed }) => [
						styles.chip,
						{
							borderColor: status === "done" ? c.success : accent,
							backgroundColor:
								status === "done" ? c.successSoft : c.primarySoft,
							opacity: pressed ? 0.7 : 1,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={
						status === "done" ? t("inbox.reopen") : t("inbox.markDone")
					}
					accessibilityState={{ busy: statusBusy, disabled: statusBusy }}
				>
					{statusBusy ? (
						<ActivityIndicator size="small" color={accent} />
					) : (
						<Ionicons
							name={
								status === "done"
									? "refresh-outline"
									: "checkmark-circle-outline"
							}
							size={16}
							color={status === "done" ? c.successText : accent}
						/>
					)}
					<Text
						style={[
							styles.chipText,
							{ color: status === "done" ? c.successText : accent },
						]}
					>
						{stateLoading
							? t("common.loading")
							: status === "done"
								? t("inbox.reopen")
								: t("inbox.markDone")}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingLeft: 4,
		paddingRight: 16,
		paddingVertical: 6,
		minHeight: 56,
	},
	backBtn: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	avatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	avatarInitial: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
	},
	titleCol: { flex: 1 },
	menuBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
		marginRight: -12,
	},
	buyer: {
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	listing: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.body },
	actionsRow: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 16,
		paddingTop: 2,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 999,
		paddingHorizontal: 14,
		minHeight: 40,
		flexShrink: 1,
	},
	chipText: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
	},
});
