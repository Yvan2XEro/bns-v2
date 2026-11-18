import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useDiscoveryPalette } from "./palette";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * The discovery screens' one choice chip: sorts, filter values, radius.
 * Selected reads as the indigo tint with brand-coloured words and a ring, so
 * the state never rests on colour alone. 40pt tall, 48pt to the thumb.
 */
export function Chip({
	label,
	selected = false,
	icon,
	trailingIcon,
	count,
	disabled = false,
	role = "button",
	onPress,
	accessibilityLabel,
	accessibilityHint,
}: {
	label: string;
	selected?: boolean;
	icon?: IconName;
	/** An icon after the label, e.g. the close mark on a removable filter. */
	trailingIcon?: IconName;
	/** "radio" when the chip is one choice of a set (sorts). */
	role?: "button" | "radio";
	/** A small count after the label, e.g. the number of active filters. */
	count?: number;
	disabled?: boolean;
	onPress: () => void;
	accessibilityLabel?: string;
	accessibilityHint?: string;
}) {
	const c = useDiscoveryPalette();
	const ink = selected ? c.link : c.body;
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={{ top: 4, bottom: 4 }}
			accessibilityRole={role}
			accessibilityState={
				role === "radio"
					? { checked: selected, disabled }
					: { selected, disabled }
			}
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			style={({ pressed }) => [
				styles.chip,
				{
					backgroundColor: selected ? c.primaryTint : c.card,
					borderColor: selected ? c.primary : c.border,
				},
				disabled && styles.disabled,
				pressed && styles.pressed,
			]}
		>
			{icon ? <Ionicons name={icon} size={16} color={ink} /> : null}
			<Text style={[styles.label, { color: ink }]} numberOfLines={1}>
				{label}
			</Text>
			{count ? (
				<View style={[styles.count, { backgroundColor: c.primaryFill }]}>
					<Text style={styles.countText}>{count}</Text>
				</View>
			) : null}
			{trailingIcon ? (
				<Ionicons name={trailingIcon} size={16} color={ink} />
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 40,
		paddingHorizontal: 14,
		borderRadius: 20,
		borderWidth: 1,
		maxWidth: 280,
	},
	label: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
	},
	count: {
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		paddingHorizontal: 5,
		alignItems: "center",
		justifyContent: "center",
	},
	countText: {
		color: "#ffffff",
		fontSize: 12,
		lineHeight: 15,
		fontFamily: Fonts.displayBold,
	},
	disabled: { opacity: 0.45 },
	pressed: { opacity: 0.7 },
});
