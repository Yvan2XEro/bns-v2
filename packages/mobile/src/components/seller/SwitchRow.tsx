import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";

/**
 * A setting that is on or off: title, one line of hint, and a switch. The
 * whole row toggles, not just the 51-point switch, and screen readers meet
 * it once, as a switch with its hint.
 */
export function SwitchRow({
	title,
	hint,
	value,
	onChange,
	disabled,
}: {
	title: string;
	hint?: string;
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={() => onChange(!value)}
			disabled={disabled}
			style={({ pressed }) => [styles.row, pressed && styles.pressed]}
			accessibilityRole="switch"
			accessibilityLabel={title}
			accessibilityHint={hint}
			accessibilityState={{ checked: value, disabled: !!disabled }}
		>
			<View style={styles.text}>
				<Text style={[styles.title, { color: c.text }]}>{title}</Text>
				{hint ? (
					<Text style={[styles.hint, { color: c.muted }]}>{hint}</Text>
				) : null}
			</View>
			<View
				importantForAccessibility="no-hide-descendants"
				accessibilityElementsHidden
			>
				<Switch
					value={value}
					disabled={disabled}
					onValueChange={onChange}
					trackColor={{ true: c.primary, false: c.border }}
					ios_backgroundColor={c.border}
				/>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 56,
		paddingVertical: 6,
	},
	pressed: { opacity: 0.7 },
	text: { flex: 1, gap: 2 },
	title: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	hint: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
