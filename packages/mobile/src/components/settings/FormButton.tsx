import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	type ViewStyle,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useGroupedColors } from "./Grouped";

/**
 * The button under an account form: filled for the form's action, a card
 * button in brand words for a second step beside it. 52pt, DM Sans Bold 16.
 */
export function FormButton({
	label,
	onPress,
	loading,
	disabled,
	variant = "primary",
	style,
}: {
	label: string;
	onPress: () => void;
	loading?: boolean;
	disabled?: boolean;
	variant?: "primary" | "secondary";
	style?: ViewStyle;
}) {
	const c = useGroupedColors();
	const off = Boolean(loading || disabled);
	const primary = variant === "primary";
	return (
		<Pressable
			onPress={onPress}
			disabled={off}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: off, busy: Boolean(loading) }}
			style={({ pressed }) => [
				styles.btn,
				primary
					? { backgroundColor: c.primaryFill }
					: {
							backgroundColor: c.card,
							borderColor: c.borderStrong,
							borderWidth: 1,
						},
				{ opacity: off ? 0.6 : pressed ? 0.88 : 1 },
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={primary ? "#ffffff" : c.link} />
			) : (
				<Text style={[styles.text, { color: primary ? "#ffffff" : c.link }]}>
					{label}
				</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	btn: {
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	text: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
