import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	HANDOVER_CODE_LENGTH,
	KEYPAD_ROWS,
	type KeypadKey,
} from "@/src/lib/handoverKeypad";
import { useTranslation } from "@/src/lib/i18n";

/** Four boxes and a phone-style pad; the digits never leave this screen's form. */
export function HandoverKeypad({
	code,
	error,
	disabled,
	onKey,
}: {
	code: string;
	error: boolean;
	disabled: boolean;
	onKey: (key: KeypadKey) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const slots = Array.from({ length: HANDOVER_CODE_LENGTH }, (_, i) => i);

	return (
		<View style={styles.wrap}>
			<View
				style={styles.slots}
				accessible
				accessibilityLabel={t("sellerOrders.handoverCodeEntered", {
					count: code.length,
				})}
			>
				{slots.map((i) => (
					<View
						key={i}
						style={[
							styles.slot,
							{
								borderColor: error
									? c.danger
									: i === code.length
										? c.primary
										: c.border,
								backgroundColor: c.input,
							},
						]}
					>
						<Text style={[styles.digit, { color: c.text }]}>
							{code[i] ?? ""}
						</Text>
					</View>
				))}
			</View>
			{KEYPAD_ROWS.map((row) => (
				<View key={row.join("-")} style={styles.row}>
					{row.map((key, index) =>
						key === null ? (
							<View key={`empty-${index}`} style={styles.key} />
						) : (
							<Pressable
								key={key}
								onPress={() => onKey(key)}
								disabled={disabled}
								accessibilityRole="button"
								accessibilityLabel={
									key === "delete" ? t("sellerOrders.keypadDelete") : key
								}
								style={({ pressed }) => [
									styles.key,
									{
										backgroundColor: pressed ? c.primarySoft : c.card,
										borderColor: c.border,
										borderWidth: 1,
									},
								]}
							>
								{key === "delete" ? (
									<Ionicons name="backspace-outline" size={26} color={c.text} />
								) : (
									<Text style={[styles.keyText, { color: c.text }]}>{key}</Text>
								)}
							</Pressable>
						),
					)}
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: 12, alignItems: "center" },
	slots: { flexDirection: "row", gap: 12, marginBottom: 8 },
	slot: {
		width: 56,
		height: 64,
		borderRadius: 12,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	digit: { fontSize: 28, fontFamily: Fonts.displayBold },
	row: { flexDirection: "row", gap: 16 },
	key: {
		width: 76,
		height: 60,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	keyText: { fontSize: 26, fontFamily: Fonts.displaySemibold },
});
