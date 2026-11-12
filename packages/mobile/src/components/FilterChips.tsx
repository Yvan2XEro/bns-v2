import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useDiscoveryPalette } from "@/src/components/search/palette";
import { FiltersChip } from "@/src/components/search/SortBar";
import { useTranslation } from "@/src/lib/i18n";

interface Chip {
	key: string;
	label: string;
}

interface FilterChipsProps {
	chips: Chip[];
	onRemove: (key: string) => void;
	onFiltersPress: () => void;
	filterCount: number;
}

/**
 * The filters button followed by one removable chip per active filter, in a
 * row that scrolls sideways.
 */
export function FilterChips({
	chips,
	onRemove,
	onFiltersPress,
	filterCount,
}: FilterChipsProps) {
	const c = useDiscoveryPalette();
	const { t } = useTranslation();

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.scroll}
		>
			<FiltersChip count={filterCount} onPress={onFiltersPress} />
			{chips.map((chip) => (
				<View
					key={chip.key}
					style={[
						styles.chip,
						{ backgroundColor: c.primaryTint, borderColor: c.primary },
					]}
				>
					<Text style={[styles.chipText, { color: c.link }]} numberOfLines={1}>
						{chip.label}
					</Text>
					<Pressable
						onPress={() => onRemove(chip.key)}
						accessibilityRole="button"
						accessibilityLabel={`${chip.label}, ${t("common.delete")}`}
						style={styles.remove}
					>
						<Ionicons name="close" size={16} color={c.link} />
					</Pressable>
				</View>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		gap: 8,
		flexDirection: "row",
		alignItems: "center",
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 40,
		borderRadius: 20,
		borderWidth: 1,
		paddingLeft: 14,
		maxWidth: 260,
	},
	chipText: {
		flexShrink: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	remove: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
});
