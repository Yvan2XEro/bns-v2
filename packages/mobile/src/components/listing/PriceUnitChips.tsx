import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { listingKindRules, type PriceUnit } from "@/src/lib/listingKind";

/**
 * What the price covers — a month's rent, a night, an hourly rate. Shown only
 * when the ad's kind allows more than one unit; goods are always a one-off
 * price, and the form then sends no unit at all.
 */
export function PriceUnitChips({
	kind,
	value,
	onChange,
	colors,
}: {
	kind: string | null | undefined;
	value: string;
	onChange: (unit: PriceUnit) => void;
	colors: {
		textColor: string;
		mutedColor: string;
		primary: string;
		border: string;
	};
}) {
	const { t } = useTranslation();
	const units = listingKindRules(kind).priceUnits;
	if (units.length < 2) return null;
	const selected = units.find((unit) => unit === value) ?? units[0];

	return (
		<View style={styles.wrap}>
			<Text style={[styles.label, { color: colors.mutedColor }]}>
				{t("listingKind.unitLabel")}
			</Text>
			<View style={styles.chips} accessibilityRole="radiogroup">
				{units.map((unit) => {
					const on = unit === selected;
					return (
						<Pressable
							key={unit}
							onPress={() => onChange(unit)}
							accessibilityRole="radio"
							accessibilityState={{ checked: on }}
							style={[
								styles.chip,
								{
									borderColor: on ? colors.primary : colors.border,
									backgroundColor: on ? `${colors.primary}1A` : "transparent",
								},
							]}
						>
							<Text
								style={[
									styles.chipText,
									{ color: on ? colors.primary : colors.textColor },
								]}
							>
								{t(`listingKind.unitOption.${unit}`)}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

/** The unit to send with the ad, or nothing for a kind that has only one. */
export function priceUnitToSend(
	kind: string | null | undefined,
	unit: string,
): PriceUnit | undefined {
	const units = listingKindRules(kind).priceUnits;
	return units.length > 1
		? (units.find((u) => u === unit) ?? units[0])
		: undefined;
}

const styles = StyleSheet.create({
	wrap: { marginTop: 12, gap: 8 },
	label: { fontSize: 13, fontWeight: "600" },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 36,
		paddingHorizontal: 12,
		borderRadius: 18,
		borderWidth: 1.5,
		justifyContent: "center",
	},
	chipText: { fontSize: 14, fontWeight: "600" },
});
