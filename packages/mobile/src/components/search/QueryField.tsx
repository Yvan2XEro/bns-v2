import { Ionicons } from "@expo/vector-icons";
import type { Ref } from "react";
import {
	Pressable,
	StyleSheet,
	Text,
	type TextInput,
	View,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { SearchField } from "@/src/components/SearchBar";
import { useTranslation } from "@/src/lib/i18n";
import { useDiscoveryPalette } from "./palette";

/**
 * The search screen's query field: the shared `SearchField`, wired to a
 * submit that records the query, and laid out to share a row with the
 * filters button.
 */
export function QueryField({
	value,
	onChangeText,
	onSubmit,
	onClear,
	onFocus,
	onBlur,
	placeholder,
	ref,
}: {
	value: string;
	onChangeText: (text: string) => void;
	onSubmit: () => void;
	onClear: () => void;
	onFocus?: () => void;
	onBlur?: () => void;
	placeholder: string;
	ref?: Ref<TextInput>;
}) {
	const { t } = useTranslation();
	return (
		<SearchField
			ref={ref}
			value={value}
			onChangeText={onChangeText}
			onSubmitEditing={onSubmit}
			onClear={onClear}
			onFocus={onFocus}
			onBlur={onBlur}
			placeholder={placeholder}
			accessibilityLabel={t("search.title")}
			style={styles.grow}
		/>
	);
}

/**
 * The square filters button beside the query field: reachable from either
 * segment, and carrying the number of filters on so the state shows without
 * opening the sheet.
 */
export function FiltersButton({
	count,
	onPress,
}: {
	count: number;
	onPress: () => void;
}) {
	const { t } = useTranslation();
	const c = useDiscoveryPalette();
	const active = count > 0;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={
				active ? t("search.filtersCount", { count }) : t("search.filters")
			}
			style={({ pressed }) => [
				styles.filters,
				{
					backgroundColor: active ? c.primaryTint : c.card,
					borderColor: active ? c.primary : c.borderStrong,
				},
				pressed && { opacity: 0.75 },
			]}
		>
			<Ionicons
				name="options-outline"
				size={22}
				color={active ? c.link : c.foreground}
			/>
			{active ? (
				<View
					style={[
						styles.badge,
						{ backgroundColor: c.primaryFill, borderColor: c.background },
					]}
				>
					<Text style={styles.badgeText}>{count}</Text>
				</View>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	filters: {
		width: 48,
		height: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	badge: {
		position: "absolute",
		top: -6,
		right: -6,
		minWidth: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 2,
		paddingHorizontal: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	badgeText: {
		color: Colors.light.primaryForeground,
		fontSize: 11,
		lineHeight: 14,
		fontFamily: Fonts.displayBold,
	},
	grow: { flex: 1 },
});
