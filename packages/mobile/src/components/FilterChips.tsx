import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

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

export function FilterChips({
	chips,
	onRemove,
	onFiltersPress,
	filterCount,
}: FilterChipsProps) {
	const isDark = useColorScheme() === "dark";

	const hasFilters = filterCount > 0;

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.scroll}
		>
			<Pressable
				onPress={onFiltersPress}
				style={[
					styles.filterBtn,
					{
						backgroundColor: hasFilters
							? isDark
								? "#2a3170"
								: "#e3e7f8"
							: isDark
								? "#1a1f4a"
								: "#eceef5",
						borderColor: hasFilters
							? isDark
								? "#6878ea"
								: "#23338f"
							: isDark
								? "#2a3170"
								: "#e1e3ee",
					},
				]}
			>
				<Ionicons
					name="options"
					size={14}
					color={
						hasFilters
							? isDark
								? "#a9b4f0"
								: "#23338f"
							: isDark
								? "#a3a7c8"
								: "#5b6088"
					}
				/>
				<Text
					style={[
						styles.filterText,
						{
							color: hasFilters
								? isDark
									? "#a9b4f0"
									: "#23338f"
								: isDark
									? "#a3a7c8"
									: "#5b6088",
						},
					]}
				>
					Filtres{hasFilters ? ` (${filterCount})` : ""}
				</Text>
			</Pressable>
			{chips.map((chip) => (
				<View
					key={chip.key}
					style={[
						styles.chip,
						{
							backgroundColor: isDark ? "#2a3170" : "#e3e7f8",
							borderColor: isDark ? "#6878ea" : "#23338f",
						},
					]}
				>
					<Text
						style={[styles.chipText, { color: isDark ? "#a9b4f0" : "#23338f" }]}
					>
						{chip.label}
					</Text>
					<Pressable onPress={() => onRemove(chip.key)} hitSlop={4}>
						<Ionicons
							name="close"
							size={12}
							color={isDark ? "#a9b4f0" : "#23338f"}
						/>
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
	filterBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	filterText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	chipText: { fontSize: 13, fontFamily: Fonts.bodyMedium },
});
