import { Ionicons } from "@expo/vector-icons";
import { type Ref, useState } from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { FormError } from "@/src/components/checkout/FormError";
import { useTranslation } from "@/src/lib/i18n";
import { useGroupedColors } from "./Grouped";

/**
 * A labelled text field for account forms: 52pt, 16pt type, the focus and
 * refusal drawn on the border. `error` as a string is said under the field;
 * `true` only marks it (the message sits under the form). `secure` adds the
 * reveal toggle. `ref` reaches the TextInput, so a form library can focus
 * the first refused field.
 */
export function FormField({
	label,
	error,
	secure,
	icon,
	multiline,
	hint,
	ref,
	...input
}: {
	ref?: Ref<TextInput>;
	label: string;
	error?: string | boolean | null;
	secure?: boolean;
	icon?: keyof typeof Ionicons.glyphMap;
	hint?: string;
} & Pick<
	TextInputProps,
	| "value"
	| "onChangeText"
	| "placeholder"
	| "keyboardType"
	| "autoCapitalize"
	| "autoComplete"
	| "autoCorrect"
	| "multiline"
	| "maxLength"
	| "returnKeyType"
	| "onSubmitEditing"
	| "textContentType"
	| "onBlur"
>) {
	const c = useGroupedColors();
	const { t } = useTranslation();
	const [focused, setFocused] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const danger = c.isDark ? c.dangerText : c.destructive;
	const message = typeof error === "string" ? error : null;

	return (
		<View style={styles.field}>
			<Text style={[styles.label, { color: c.body }]}>{label}</Text>
			<View
				style={[
					styles.box,
					multiline && styles.boxMultiline,
					{
						backgroundColor: c.card,
						borderColor: error ? danger : focused ? c.primary : c.borderStrong,
						borderWidth: focused || error ? 1.5 : 1,
					},
				]}
			>
				{icon ? (
					<Ionicons
						name={icon}
						size={18}
						color={focused ? c.link : c.mutedForeground}
						style={multiline ? styles.iconTop : null}
					/>
				) : null}
				<TextInput
					{...input}
					ref={ref}
					multiline={multiline}
					secureTextEntry={secure && !revealed}
					// The refusal is part of the name: React Native ignores
					// aria-invalid, and many TalkBack users turn hints off.
					accessibilityLabel={
						error ? `${label}, ${message ?? t("common.required")}` : label
					}
					accessibilityHint={message ? undefined : hint}
					onFocus={() => setFocused(true)}
					onBlur={(event) => {
						setFocused(false);
						input.onBlur?.(event);
					}}
					placeholderTextColor={c.mutedForeground}
					selectionColor={c.primary}
					style={[
						styles.input,
						multiline && styles.inputMultiline,
						{ color: c.foreground },
					]}
				/>
				{secure ? (
					<Pressable
						onPress={() => setRevealed((on) => !on)}
						hitSlop={14}
						accessibilityRole="button"
						accessibilityLabel={t(
							revealed ? "auth.hidePassword" : "auth.showPassword",
						)}
					>
						<Ionicons
							name={revealed ? "eye-off-outline" : "eye-outline"}
							size={18}
							color={c.mutedForeground}
						/>
					</Pressable>
				) : null}
			</View>
			{hint && !message ? (
				<Text style={[styles.hint, { color: c.mutedForeground }]}>{hint}</Text>
			) : null}
			<FormError message={message} />
		</View>
	);
}

const styles = StyleSheet.create({
	field: { gap: 6 },
	label: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	box: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 14,
	},
	boxMultiline: { alignItems: "flex-start", minHeight: 140 },
	iconTop: { marginTop: 15 },
	// Android's TextInput carries its own vertical padding.
	input: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.body,
		paddingVertical: 12,
	},
	inputMultiline: { minHeight: 140, textAlignVertical: "top", paddingTop: 14 },
	hint: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
});
