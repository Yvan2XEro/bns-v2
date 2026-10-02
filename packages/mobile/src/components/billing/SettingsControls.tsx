import type { ReactNode } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { billingStyles as s } from "./billingStyles";

export function SettingsSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	const c = useShopTheme();
	return (
		<View
			style={[
				s.card,
				{ backgroundColor: c.card, borderColor: c.border, gap: 12 },
			]}
		>
			<Text style={[s.cardTitle, { color: c.text }]}>{title}</Text>
			{children}
		</View>
	);
}

export function SettingsToggle({
	label,
	value,
	disabled,
	onChange,
}: {
	label: string;
	value: boolean;
	disabled: boolean;
	onChange: (value: boolean) => void;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.toggle}>
			<Text style={[s.body, { color: c.text, flex: 1 }]}>{label}</Text>
			<Switch
				value={value}
				onValueChange={onChange}
				disabled={disabled}
				accessibilityLabel={label}
				trackColor={{ true: c.primary }}
			/>
		</View>
	);
}

export function SettingsField({
	label,
	value,
	onChange,
	onBlur,
	editable,
	error,
	hint,
	placeholder,
	maxLength,
	multiline,
	numeric,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	onBlur: () => void;
	editable: boolean;
	error: string | null;
	hint?: string;
	placeholder?: string;
	maxLength?: number;
	multiline?: boolean;
	numeric?: boolean;
}) {
	const c = useShopTheme();
	return (
		<View style={{ gap: 4 }}>
			<Text style={[s.meta, { color: c.body }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				onBlur={onBlur}
				editable={editable}
				placeholder={placeholder}
				placeholderTextColor={c.muted}
				maxLength={maxLength}
				multiline={multiline}
				keyboardType={numeric ? "number-pad" : "default"}
				accessibilityLabel={label}
				accessibilityHint={hint}
				style={[
					styles.input,
					multiline && styles.multiline,
					{
						color: c.text,
						backgroundColor: c.input,
						borderColor: error ? c.danger : c.border,
					},
				]}
			/>
			{hint ? <Text style={[s.meta, { color: c.muted }]}>{hint}</Text> : null}
			{error ? (
				<Text accessibilityRole="alert" style={[s.meta, { color: c.danger }]}>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	toggle: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 44,
	},
	input: {
		minHeight: 44,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 15,
	},
	multiline: { minHeight: 110, textAlignVertical: "top" },
});
