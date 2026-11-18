import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ChecklistItem } from "@/src/lib/verification";
import { ModerationCard } from "./ModerationKit";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

export type ChecklistState = Partial<Record<ChecklistItem, boolean>>;

/**
 * The checks a reviewer confirms before approving (`checklistItemsFor`): the
 * level-3 business checks, or the level-2 identity checks done by hand. The row is
 * the switch (`accessibilityRole="switch"`): the whole line toggles, and the
 * platform's own Switch shows the state, so each item is reachable and
 * labelled with its current state.
 */
export function ChecklistSwitches({
	items,
	value,
	onChange,
}: {
	items: readonly ChecklistItem[];
	value: ChecklistState;
	onChange: (next: ChecklistState) => void;
}) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const { t } = useTranslation();
	const done = items.filter((item) => value[item] === true).length;

	return (
		<ModerationCard
			title={t("moderation.verifChecklistTitle")}
			right={
				<Text
					style={[
						styles.count,
						{
							color: done === items.length ? k.successText : c.muted,
						},
					]}
				>
					{done}/{items.length}
				</Text>
			}
		>
			{items.map((item) => {
				const checked = value[item] === true;
				const label = t(`moderation.verifChecklist_${item}`);
				const toggle = () => onChange({ ...value, [item]: !checked });
				return (
					<Pressable
						key={item}
						accessibilityRole="switch"
						accessibilityState={{ checked }}
						accessibilityLabel={label}
						onPress={toggle}
						style={[styles.itemRow, { borderTopColor: c.border }]}
					>
						<Text style={[styles.itemLabel, { color: c.text }]}>{label}</Text>
						<View
							importantForAccessibility="no-hide-descendants"
							accessibilityElementsHidden
						>
							<Switch
								value={checked}
								onValueChange={toggle}
								trackColor={{
									false: k.strongBorder,
									true: k.successFill,
								}}
								thumbColor={k.onFill}
								ios_backgroundColor={k.strongBorder}
							/>
						</View>
					</Pressable>
				);
			})}
		</ModerationCard>
	);
}

const styles = StyleSheet.create({
	count: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.displayBold },
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		minHeight: 52,
		paddingVertical: 6,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	itemLabel: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.body, flex: 1 },
});
