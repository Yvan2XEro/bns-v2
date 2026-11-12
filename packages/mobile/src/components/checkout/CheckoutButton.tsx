import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	type ViewStyle,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { fillOf } from "./fill";

/** The checkout's two button weights: the step's action, and a quiet one. */
export function CheckoutButton({
	label,
	onPress,
	disabled = false,
	loading = false,
	variant = "primary",
	icon,
	style,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	loading?: boolean;
	variant?: "primary" | "outline";
	icon?: ComponentProps<typeof Ionicons>["name"];
	style?: ViewStyle;
}) {
	const c = useShopTheme();
	const fill = fillOf(c);
	const primary = variant === "primary";
	const inactive = disabled || loading;

	return (
		<Pressable
			onPress={onPress}
			disabled={inactive}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: inactive, busy: loading }}
			style={({ pressed }) => [
				styles.button,
				primary
					? { backgroundColor: fill.bg }
					: { borderColor: c.border, borderWidth: 1, backgroundColor: c.card },
				{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
				pressed && !inactive ? styles.pressed : null,
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={primary ? fill.fg : c.primary} />
			) : (
				<>
					{icon ? (
						<Ionicons
							name={icon}
							size={18}
							color={primary ? fill.fg : c.text}
						/>
					) : null}
					<Text style={[styles.text, { color: primary ? fill.fg : c.text }]}>
						{label}
					</Text>
				</>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 16,
		paddingVertical: 10,
		flexDirection: "row",
		gap: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { transform: [{ scale: 0.98 }] },
	text: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
		flexShrink: 1,
		textAlign: "center",
	},
});
