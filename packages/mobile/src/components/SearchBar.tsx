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
 * that searches reads the same: rounded card, tinted icon tile, primary
 * border while in use.
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
	const primary = isDark ? "#3b82f6" : "#1e40af";
	const muted = isDark ? "#94a3b8" : "#64748b";

	return (
		<View
			style={[
				styles.field,
				{
					backgroundColor: isDark ? "#1e293b" : "#ffffff",
					borderColor: highlighted ? primary : isDark ? "#1e3a5f" : "#e2e8f0",
				},
				style,
			]}
		>
			<View
				style={[
					styles.iconTile,
					{
						backgroundColor: highlighted
							? primary
							: isDark
								? "#111827"
								: "#eef2ff",
					},
				]}
			>
				<Ionicons
					name="search"
					size={15}
					color={highlighted ? "#fff" : primary}
				/>
			</View>
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
				style={[styles.input, { color: isDark ? "#e2e8f0" : "#0f172a" }]}
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
		borderRadius: 16,
		borderWidth: 1.5,
		paddingHorizontal: 8,
		paddingVertical: 8,
		shadowColor: "#1e40af",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 6,
		elevation: 2,
	},
	iconTile: {
		width: 32,
		height: 32,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	// Android's TextInput carries its own vertical padding; without this the
	// field grows taller than the icon tile.
	input: { flex: 1, fontSize: 15, padding: 0, fontFamily: Fonts.body },
});
