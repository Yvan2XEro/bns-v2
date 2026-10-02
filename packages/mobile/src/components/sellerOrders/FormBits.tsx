import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** One radio list over a closed set of reasons, each with its own label key. */
export function ReasonPicker<T extends string>({
	options,
	labelKeys,
	value,
	onChange,
}: {
	options: readonly T[];
	labelKeys: Record<T, string>;
	value: T | null;
	onChange: (value: T) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View accessibilityRole="radiogroup" style={styles.reasons}>
			{options.map((option) => {
				const selected = value === option;
				const label = t(labelKeys[option]);
				return (
					<Pressable
						key={option}
						onPress={() => onChange(option)}
						accessibilityRole="radio"
						accessibilityState={{ selected }}
						accessibilityLabel={label}
						style={[
							styles.reason,
							{
								borderColor: selected ? c.primary : c.border,
								backgroundColor: selected ? c.primarySoft : c.card,
							},
						]}
					>
						<Ionicons
							name={selected ? "radio-button-on" : "radio-button-off"}
							size={20}
							color={selected ? c.primary : c.muted}
						/>
						<Text style={[styles.reasonText, { color: c.text }]}>{label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function NoteField({
	label,
	value,
	onChange,
	onBlur,
}: {
	label: string;
	value: string;
	onChange: (text: string) => void;
	onBlur: () => void;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.body }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				onBlur={onBlur}
				multiline
				maxLength={500}
				accessibilityLabel={label}
				style={[
					styles.note,
					{ color: c.text, backgroundColor: c.input, borderColor: c.border },
				]}
			/>
		</View>
	);
}

export function FieldError({ message }: { message: string | undefined }) {
	const c = useShopTheme();
	if (!message) return null;
	return (
		<Text accessibilityRole="alert" style={[styles.error, { color: c.danger }]}>
			{message}
		</Text>
	);
}

export function SheetButton({
	label,
	onPress,
	tone = "primary",
	pending,
	disabled,
}: {
	label: string;
	onPress: () => void;
	tone?: "primary" | "secondary" | "danger";
	pending?: boolean;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	const filled = tone !== "secondary";
	const bg =
		tone === "danger" ? c.danger : tone === "primary" ? c.primary : c.card;
	const fg = filled ? "#fff" : c.primary;
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled || pending}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: Boolean(disabled || pending) }}
			style={[
				styles.button,
				{
					backgroundColor: bg,
					borderColor: filled ? bg : c.border,
					opacity: disabled || pending ? 0.5 : 1,
				},
			]}
		>
			{pending ? (
				<ActivityIndicator color={fg} />
			) : (
				<Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	reasons: { gap: 8 },
	reason: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 48,
		paddingHorizontal: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	reasonText: { flex: 1, fontSize: 14, fontFamily: Fonts.bodyMedium },
	field: { gap: 6 },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	note: {
		minHeight: 80,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlignVertical: "top",
	},
	error: { fontSize: 13, fontFamily: Fonts.bodyMedium },
	button: {
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	buttonText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
});
