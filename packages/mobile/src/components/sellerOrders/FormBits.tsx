import { Ionicons } from "@expo/vector-icons";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { dangerInk, fillOf } from "@/src/components/shop/ink";
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
		<Text
			accessibilityRole="alert"
			style={[styles.error, { color: dangerInk(c) }]}
		>
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
	outline,
	expanded,
}: {
	label: string;
	onPress: () => void;
	tone?: "primary" | "secondary" | "danger";
	pending?: boolean;
	disabled?: boolean;
	/** A destructive action shown beside the main one: red text, no fill. */
	outline?: boolean;
	/** For a button that opens a panel in place: read out as open or closed. */
	expanded?: boolean;
}) {
	const c = useShopTheme();
	const filled = tone !== "secondary" && !(outline && tone === "danger");
	const bg = !filled ? c.card : tone === "danger" ? c.danger : fillOf(c);
	const fg = filled ? ON_FILL : tone === "danger" ? dangerInk(c) : c.link;
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled || pending}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{
				disabled: Boolean(disabled || pending),
				busy: Boolean(pending),
				...(expanded === undefined ? null : { expanded }),
			}}
			style={[
				styles.button,
				{
					backgroundColor: bg,
					borderColor: filled ? bg : tone === "danger" ? c.danger : c.border,
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

/** The label on a filled button: every fill above holds 4.5:1 against it. */
const ON_FILL = Colors.light.primaryForeground;

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
		minHeight: 52,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	buttonText: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
