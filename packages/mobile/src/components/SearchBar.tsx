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
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";

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
	/** Return key on the keyboard. */
	onSubmitEditing?: () => void;
	/** Screen-reader name; defaults to the placeholder. */
	accessibilityLabel?: string;
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
	onSubmitEditing,
	accessibilityLabel,
	style,
	ref,
}: SearchFieldProps) {
	const { t } = useTranslation();
	const c = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	const [focused, setFocused] = useState(false);
	const highlighted = active ?? focused;
	const muted = c.mutedForeground;

	return (
		<View
			style={[
				styles.field,
				{
					backgroundColor: c.card,
					borderColor: highlighted ? c.primary : c.borderStrong,
				},
				style,
			]}
		>
			<Ionicons name="search" size={19} color={highlighted ? c.link : muted} />
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
				selectionColor={c.link}
				style={[styles.input, { color: c.foreground }]}
				autoFocus={autoFocus}
				onSubmitEditing={onSubmitEditing}
				accessibilityLabel={accessibilityLabel ?? placeholder}
				returnKeyType="search"
			/>
			{value.length > 0 && (
				<Pressable
					onPress={onClear ?? (() => onChangeText(""))}
					accessibilityRole="button"
					accessibilityLabel={t("search.clearSearch")}
					style={styles.clear}
				>
					<Ionicons name="close-circle" size={20} color={muted} />
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
	// A 44pt target for a 20pt glyph, tucked inside the field's right edge.
	clear: {
		marginRight: -12,
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	// Android's TextInput carries its own vertical padding; without this the
	// field grows past its 48pt.
	input: { flex: 1, fontSize: 16, padding: 0, fontFamily: Fonts.body },
});
