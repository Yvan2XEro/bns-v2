import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	type ViewStyle,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";

/** The checkout's two button weights: the step's action, and a quiet one. */
export function CheckoutButton({
	label,
	onPress,
	disabled = false,
	loading = false,
	variant = "primary",
	style,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
	variant?: "primary" | "outline";
	style?: ViewStyle;
}) {
	const c = useShopTheme();
	const primary = variant === "primary";
	const inactive = disabled || loading;

	return (
		<Pressable
			onPress={onPress}
			disabled={inactive}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: inactive, busy: loading }}
			style={[
				styles.button,
				primary
					? { backgroundColor: c.primary }
					: { borderColor: c.border, borderWidth: 1, backgroundColor: c.card },
				{ opacity: disabled ? 0.5 : 1 },
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={primary ? "#fff" : c.primary} />
			) : (
				<Text style={[styles.text, { color: primary ? "#fff" : c.text }]}>
					{label}
				</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		minHeight: 52,
		borderRadius: 14,
		paddingHorizontal: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	text: { fontSize: 16, fontFamily: Fonts.displayBold },
});
