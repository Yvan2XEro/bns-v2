import { Ionicons } from "@expo/vector-icons";
import { type Ref, useState } from "react";
import {
	Pressable,
	type StyleProp,
	StyleSheet,
	TextInput,
	View,
	type ViewStyle,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface SearchFieldProps {
	value: string;
	onChangeText: (text: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	onFocus?: () => void;
	onBlur?: () => void;
	/** Clears the field; defaults to `onChangeText("")`. */
	onClear?: () => void;
	/** Highlighted state; defaults to "the input has focus". */
	active?: boolean;
	style?: StyleProp<ViewStyle>;
	ref?: Ref<TextInput>;
}

/**
 * The app's search field — the home screen's look, shared so every screen
 * that searches reads the same: a plain white field, primary border while in
 * use.
 */
export function SearchField({
	value,
	onChangeText,
	placeholder,
	autoFocus,
	onFocus,
	onBlur,
	onClear,
	active,
	style,
	ref,
}: SearchFieldProps) {
	const isDark = useColorScheme() === "dark";
	const [focused, setFocused] = useState(false);
	const highlighted = active ?? focused;
	const primary = isDark ? "#6878ea" : "#23338f";
	const muted = isDark ? "#a3a7c8" : "#5b6088";

	return (
		<View
			style={[
				styles.field,
				{
					backgroundColor: isDark ? "#1a1f4a" : "#ffffff",
					borderColor: highlighted ? primary : isDark ? "#2a3170" : "#d6d9e8",
				},
				style,
			]}
		>
			<Ionicons name="search" size={19} color={highlighted ? primary : muted} />
			<TextInput
				ref={ref}
				value={value}
				onChangeText={onChangeText}
				onFocus={() => {
					setFocused(true);
					onFocus?.();
				}}
				onBlur={() => {
					setFocused(false);
					onBlur?.();
				}}
				placeholder={placeholder}
				placeholderTextColor={muted}
				style={[styles.input, { color: isDark ? "#e1e3ee" : "#12163a" }]}
				autoFocus={autoFocus}
				returnKeyType="search"
			/>
			{value.length > 0 && (
				<Pressable
					onPress={onClear ?? (() => onChangeText(""))}
					hitSlop={10}
					accessibilityRole="button"
				>
					<Ionicons name="close-circle" size={18} color={muted} />
				</Pressable>
			)}
		</View>
	);
}

/** A `SearchField` with the standard screen gutter. */
export function SearchBar(props: Omit<SearchFieldProps, "ref">) {
	return (
		<View style={styles.wrapper}>
			<SearchField {...props} />
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: { paddingHorizontal: 16, paddingVertical: 8 },
	field: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 14,
	},
	// Android's TextInput carries its own vertical padding; without this the
	// field grows past its 48pt.
	input: { flex: 1, fontSize: 16, padding: 0, fontFamily: Fonts.body },
});
