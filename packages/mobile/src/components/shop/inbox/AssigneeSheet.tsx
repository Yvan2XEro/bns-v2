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
import { Fonts } from "@/constants/theme";
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

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<Pressable
				style={[
					styles.backdrop,
					{
						backgroundColor: c.isDark
							? "rgba(0,0,0,0.6)"
							: "rgba(15,23,42,0.4)",
					},
				]}
				onPress={onClose}
			/>
			<View
				style={[
					styles.sheet,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<View style={styles.grabber}>
					<View style={[styles.grabberBar, { backgroundColor: c.border }]} />
				</View>
				<Text style={[styles.title, { color: c.text }]}>
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
								onPress={() => onSelect(member.userId)}
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
								<Text style={[styles.rowLabel, { color: c.text }]}>
									{label}
								</Text>
								{selected ? (
									<Ionicons
										name="checkmark-circle"
										size={18}
										color={c.primary}
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
							<Text style={[styles.rowLabel, { color: c.danger }]}>
								{t("inbox.unassign")}
							</Text>
						</Pressable>
					) : null}
				</ScrollView>

				{pending ? (
					<ActivityIndicator style={styles.spinner} color={c.primary} />
				) : null}

				<Pressable
					onPress={onClose}
					style={styles.closeBtn}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
				>
					<Text style={{ color: c.muted, fontFamily: Fonts.bodySemibold }}>
						{t("common.close")}
					</Text>
				</Pressable>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
	sheet: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		paddingBottom: 24,
	},
	grabber: { alignItems: "center", paddingTop: 8 },
	grabberBar: { width: 40, height: 4, borderRadius: 2 },
	title: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		paddingHorizontal: 20,
		paddingTop: 12,
		paddingBottom: 8,
	},
	list: { maxHeight: 360, paddingHorizontal: 20 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 48,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 8,
	},
	rowLabel: { fontSize: 14, fontFamily: Fonts.body },
	spinner: { marginTop: 8 },
	closeBtn: {
		alignSelf: "center",
		marginTop: 10,
		minHeight: 44,
		justifyContent: "center",
		paddingHorizontal: 20,
	},
});
