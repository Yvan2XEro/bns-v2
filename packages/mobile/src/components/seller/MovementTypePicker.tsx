import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { MANUAL_MOVEMENT_TYPES } from "@/src/lib/stockAdjust";
import type { ManualMovementType } from "@/src/types/api";

const ICONS: Record<ManualMovementType, keyof typeof Ionicons.glyphMap> = {
	receipt: "download-outline",
	adjustment: "calculator-outline",
	loss: "trash-outline",
	return: "return-down-back-outline",
};

/**
 * The four manual movement types, each with its short hint from
 * `stock.typeHint_*`. A radio group laid out two by two: the chosen one
 * carries a ring, a tinted ground and a filled radio, so the choice never
 * rests on colour alone.
 */
export function MovementTypePicker({
	value,
	onChange,
}: {
	value: ManualMovementType;
	onChange: (type: ManualMovementType) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={styles.grid} accessibilityRole="radiogroup">
			{MANUAL_MOVEMENT_TYPES.map((type) => {
				const active = type === value;
				return (
					<Pressable
						key={type}
						onPress={() => onChange(type)}
						style={({ pressed }) => [
							styles.item,
							{
								borderColor: active ? c.primary : c.border,
								backgroundColor: active ? c.primarySoft : c.card,
							},
							active && styles.itemActive,
							pressed && !active && styles.pressed,
						]}
						accessibilityRole="radio"
						accessibilityLabel={t(`stock.type_${type}`)}
						accessibilityHint={t(`stock.typeHint_${type}`)}
						accessibilityState={{ checked: active, selected: active }}
					>
						<View style={styles.top}>
							<View
								style={[
									styles.iconTile,
									{ backgroundColor: active ? c.card : c.primarySoft },
								]}
							>
								<Ionicons name={ICONS[type]} size={18} color={c.link} />
							</View>
							<Ionicons
								name={active ? "radio-button-on" : "radio-button-off"}
								size={20}
								color={active ? c.link : c.muted}
								importantForAccessibility="no"
							/>
						</View>
						<Text
							style={[styles.title, { color: active ? c.link : c.text }]}
							numberOfLines={2}
						>
							{t(`stock.type_${type}`)}
						</Text>
						<Text style={[styles.hint, { color: c.muted }]} numberOfLines={2}>
							{t(`stock.typeHint_${type}`)}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	// Two to a row whatever the width: the basis leaves room for the gap and
	// `flexGrow` takes up the rest, so both columns stay equal.
	item: {
		flexBasis: "45%",
		flexGrow: 1,
		minHeight: 112,
		gap: 6,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	// The ring thickens by half a point when chosen; the padding gives the
	// half point back so the content does not shift.
	itemActive: { borderWidth: 1.5, padding: 11.5 },
	pressed: { opacity: 0.75 },
	top: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 2,
	},
	iconTile: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	hint: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
