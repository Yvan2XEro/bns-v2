import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";

/**
 * An inline refusal under a form or an action: an icon so it is not colour
 * alone, the theme's legible danger text, and announced when it appears.
 */
export function FormError({ message }: { message: string | null | undefined }) {
	const c = useShopTheme();
	if (!message) return null;
	return (
		<View
			style={styles.row}
			accessibilityRole="alert"
			accessibilityLiveRegion="polite"
		>
			<Ionicons
				name="alert-circle"
				size={16}
				color={c.dangerText}
				style={styles.icon}
			/>
			<Text style={[styles.text, { color: c.dangerText }]}>{message}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
	icon: { marginTop: 2 },
	text: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: Fonts.bodyMedium },
});
