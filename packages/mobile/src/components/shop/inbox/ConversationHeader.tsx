import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { InboxConversationView } from "@/src/types/api";
import { useShopTheme } from "../theme";

interface ConversationHeaderProps {
	buyerName: string | null;
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
				{ backgroundColor: c.card, borderBottomColor: c.border },
			]}
		>
			<View style={styles.topRow}>
				<Pressable
					onPress={() =>
						router.canGoBack() ? router.back() : router.replace("/seller/inbox")
					}
					style={styles.backBtn}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
				>
					<Ionicons name="arrow-back" size={22} color={c.text} />
				</Pressable>
				<View style={{ flex: 1 }}>
					<Text style={[styles.buyer, { color: c.text }]} numberOfLines={1}>
						{buyerName ?? t("inbox.unknownBuyer")}
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
					style={[
						styles.chip,
						{
							borderColor: assignee?.suspended ? c.danger : c.border,
							backgroundColor: assignee?.suspended
								? c.dangerSoft
								: c.neutralSoft,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={t("inbox.assigneeSheetTitle")}
				>
					{assigneePending ? (
						<ActivityIndicator size="small" color={c.primary} />
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
					style={[
						styles.chip,
						{
							borderColor: status === "done" ? c.success : c.primary,
							backgroundColor:
								status === "done" ? c.successSoft : c.primarySoft,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={
						status === "done" ? t("inbox.reopen") : t("inbox.markDone")
					}
				>
					{statusPending ? (
						<ActivityIndicator size="small" color={c.primary} />
					) : (
						<Ionicons
							name={
								status === "done"
									? "refresh-outline"
									: "checkmark-circle-outline"
							}
							size={16}
							color={status === "done" ? c.successText : c.primary}
						/>
					)}
					<Text
						style={[
							styles.chipText,
							{ color: status === "done" ? c.successText : c.primary },
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
	wrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 10 },
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 8,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	buyer: { fontSize: 15, fontFamily: Fonts.displayBold },
	listing: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	actionsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 12,
		minHeight: 36,
		flexShrink: 1,
	},
	chipText: { fontSize: 12, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
});
