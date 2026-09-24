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

/** The four manual movement types, each with its short hint from `stock.typeHint_*`. */
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
		<View style={styles.grid}>
			{MANUAL_MOVEMENT_TYPES.map((type) => {
				const active = type === value;
				return (
					<Pressable
						key={type}
						onPress={() => onChange(type)}
						style={[
							styles.item,
							{
								borderColor: active ? c.primary : c.border,
								backgroundColor: active ? c.primarySoft : c.card,
							},
						]}
						accessibilityRole="button"
						accessibilityLabel={t(`stock.type_${type}`)}
						accessibilityState={{ selected: active }}
					>
						<Ionicons
							name={ICONS[type]}
							size={18}
							color={active ? c.primary : c.muted}
						/>
						<Text style={[styles.title, { color: c.text }]}>
							{t(`stock.type_${type}`)}
						</Text>
						<Text style={[styles.hint, { color: c.muted }]}>
							{t(`stock.typeHint_${type}`)}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	item: {
		width: "48%",
		minHeight: 44,
		gap: 4,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	title: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	hint: { fontSize: 12, fontFamily: Fonts.body },
});
