import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { InboxConversationView } from "@/src/types/api";
import { useShopTheme } from "../theme";

interface ConversationHeaderProps {
	buyerName: string | null;
	/** From the inbox row when the thread was opened from the list. */
	buyerAvatarUrl?: string | null;
	listingTitle: string | null;
	assignee: InboxConversationView["assignee"];
	status: "open" | "done";
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
	assignee,
	status,
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
	const assigneeLabel = assignee
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
					{listingTitle ? (
						<Text
							style={[styles.listing, { color: c.muted }]}
							numberOfLines={1}
						>
							{listingTitle}
						</Text>
					) : null}
				</View>
			</View>

			<View style={styles.actionsRow}>
				<Pressable
					onPress={onAssigneePress}
					disabled={assigneePending}
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
					accessibilityState={{ busy: assigneePending }}
				>
					{assigneePending ? (
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
					disabled={statusPending}
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
					accessibilityState={{ busy: statusPending }}
				>
					{statusPending ? (
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
						{status === "done" ? t("inbox.reopen") : t("inbox.markDone")}
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
	avatarInitial: { fontSize: 17, fontFamily: Fonts.displayBold },
	titleCol: { flex: 1 },
	buyer: {
		fontSize: 17,
		lineHeight: 22,
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
	chipText: { fontSize: 13, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
});
