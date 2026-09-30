import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { CHECKLIST_ITEMS, type ChecklistItem } from "@/src/lib/verification";
import { useModerationTheme } from "./theme";

export type ChecklistState = Partial<Record<ChecklistItem, boolean>>;

/**
 * The five checks a level-3 reviewer confirms before approving. Real
 * switches (`accessibilityRole="switch"`), not a bare styled `View`, so each
 * item is reachable and labelled with its current state.
 */
export function ChecklistSwitches({
	value,
	onChange,
}: {
	value: ChecklistState;
	onChange: (next: ChecklistState) => void;
}) {
	const c = useModerationTheme();
	const { t } = useTranslation();

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("moderation.verifChecklistTitle")}
			</Text>
			{CHECKLIST_ITEMS.map((item) => {
				const checked = value[item] === true;
				const label = t(`moderation.verifChecklist_${item}`);
				return (
					<Pressable
						key={item}
						accessibilityRole="switch"
						accessibilityState={{ checked }}
						accessibilityLabel={label}
						onPress={() => onChange({ ...value, [item]: !checked })}
						style={[styles.itemRow, { borderColor: c.border }]}
					>
						<Text style={[styles.itemLabel, { color: c.text }]}>{label}</Text>
						<View
							style={[
								styles.track,
								{ backgroundColor: checked ? c.primary : c.border },
							]}
						>
							<View
								style={[
									styles.thumb,
									{ transform: [{ translateX: checked ? 16 : 0 }] },
								]}
							/>
						</View>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 8,
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold, marginBottom: 2 },
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 10,
		minHeight: 44,
		paddingVertical: 6,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	itemLabel: { fontSize: 13, fontFamily: Fonts.body, flex: 1 },
	track: {
		width: 36,
		height: 20,
		borderRadius: 10,
		padding: 2,
		justifyContent: "center",
	},
	thumb: {
		width: 16,
		height: 16,
		borderRadius: 8,
		backgroundColor: "#fff",
	},
});
