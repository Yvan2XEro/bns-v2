import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useSheetPresentation } from "@/src/components/layout/sheetPresentation";
import { assignableMembers } from "@/src/lib/activeShop";
import { useTranslation } from "@/src/lib/i18n";
import type { ShopRole, TeamView } from "@/src/types/api";
import { useShopTheme } from "../theme";

interface AssigneeSheetProps {
	visible: boolean;
	onClose: () => void;
	team: TeamView | undefined;
	callerRole: ShopRole | null;
	callerId: string;
	currentAssigneeId: string | null;
	pending?: boolean;
	onSelect: (userId: string | null) => void;
}

/**
 * A staff caller only ever sees themselves in `assignableMembers`, so this
 * renders as "Assign to me" / "Unassign" for them and a full member list for
 * anyone holding `inbox.assignOthers` — never the member list for staff,
 * because the data it is handed never contains one.
 */
export function AssigneeSheet({
	visible,
	onClose,
	team,
	callerRole,
	callerId,
	currentAssigneeId,
	pending,
	onSelect,
}: AssigneeSheetProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const members = assignableMembers(team, callerRole, callerId);
	const sheet = useSheetPresentation();
	const insets = useSafeAreaInsets();
	// The dark primary drops under 4.5:1 on the night card; its lighter
	// tone does not.
	const accent = c.link;

	return (
		<Modal
			visible={visible}
			transparent
			animationType={sheet.animationType}
			onRequestClose={onClose}
		>
			<Pressable
				style={[
					styles.backdrop,
					{
						backgroundColor: c.isDark
							? "rgba(0,0,0,0.6)"
							: "rgba(18, 22, 58,0.4)",
					},
				]}
				onPress={onClose}
			/>
			<View
				style={[StyleSheet.absoluteFill, sheet.wrap]}
				pointerEvents="box-none"
			>
				<View
					style={[
						styles.sheet,
						{
							backgroundColor: c.card,
							borderColor: c.border,
							// A bottom sheet clears the home indicator; a centred dialog
							// keeps its own padding.
							paddingBottom: sheet.panel ? 16 : Math.max(16, insets.bottom + 8),
						},
						sheet.panel,
					]}
				>
					<View style={styles.grabber}>
						<View style={[styles.grabberBar, { backgroundColor: c.border }]} />
					</View>
					<Text
						style={[styles.title, { color: c.text }]}
						accessibilityRole="header"
					>
						{t("inbox.assigneeSheetTitle")}
					</Text>

					<ScrollView style={styles.list}>
						{members.map((member) => {
							const selected = member.userId === currentAssigneeId;
							const label =
								member.userId === callerId
									? t("inbox.assignToMe")
									: (member.name ?? t("inbox.unknownMember"));
							return (
								<Pressable
									key={member.id}
									// Already theirs: nothing to send, the sheet just closes.
									onPress={() =>
										selected ? onClose() : onSelect(member.userId)
									}
									disabled={pending}
									style={[
										styles.row,
										{
											borderColor: c.border,
											backgroundColor: selected ? c.primarySoft : "transparent",
										},
									]}
									accessibilityRole="button"
									accessibilityLabel={label}
									accessibilityState={{ selected, disabled: pending }}
								>
									<Text
										style={[
											styles.rowLabel,
											{
												color: c.text,
												fontFamily: selected ? Fonts.bodySemibold : Fonts.body,
											},
										]}
										numberOfLines={1}
									>
										{label}
									</Text>
									{selected ? (
										<Ionicons
											name="checkmark-circle"
											size={22}
											color={accent}
										/>
									) : null}
								</Pressable>
							);
						})}

						{currentAssigneeId ? (
							<Pressable
								onPress={() => onSelect(null)}
								disabled={pending}
								style={[styles.row, { borderColor: c.border }]}
								accessibilityRole="button"
								accessibilityLabel={t("inbox.unassign")}
								accessibilityState={{ disabled: pending }}
							>
								<Ionicons
									name="person-remove-outline"
									size={18}
									color={c.dangerText}
								/>
								<Text
									style={[
										styles.rowLabel,
										{ color: c.dangerText, fontFamily: Fonts.bodySemibold },
									]}
								>
									{t("inbox.unassign")}
								</Text>
							</Pressable>
						) : null}
					</ScrollView>

					{pending ? (
						<ActivityIndicator style={styles.spinner} color={accent} />
					) : null}

					<Pressable
						onPress={onClose}
						// The same bordered Cancel as the message sheet: one way to
						// close a sheet in this thread.
						style={({ pressed }) => [
							styles.closeBtn,
							{ borderColor: c.border, opacity: pressed ? 0.7 : 1 },
						]}
						accessibilityRole="button"
						accessibilityLabel={t("common.cancel")}
					>
						<Text style={[styles.closeText, { color: c.text }]}>
							{t("common.cancel")}
						</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	sheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
	},
	grabber: { alignItems: "center", paddingTop: 8 },
	grabberBar: { width: 40, height: 4, borderRadius: 2 },
	title: {
		fontSize: 20,
		lineHeight: 28,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
		paddingHorizontal: 20,
		paddingTop: 14,
		paddingBottom: 12,
	},
	list: { maxHeight: 360, paddingHorizontal: 20 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
		minHeight: 52,
		paddingHorizontal: 14,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		marginBottom: 8,
	},
	rowLabel: { flex: 1, fontFamily: Fonts.body, fontSize: 16, lineHeight: 21 },
	spinner: { marginTop: 8 },
	closeBtn: {
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 8,
		marginHorizontal: 20,
	},
	closeText: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.bodyBold },
});
