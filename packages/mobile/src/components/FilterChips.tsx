import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
								? "#1e3a5f"
								: "#dbeafe"
							: isDark
								? "#1e293b"
								: "#f1f5f9",
						borderColor: hasFilters
							? isDark
								? "#3b82f6"
								: "#1e40af"
							: isDark
								? "#1e3a5f"
								: "#e2e8f0",
					},
				]}
			>
				<Ionicons
					name="options"
					size={14}
					color={
						hasFilters
							? isDark
								? "#93c5fd"
								: "#1e40af"
							: isDark
								? "#94a3b8"
								: "#64748b"
					}
				/>
				<Text
					style={[
						styles.filterText,
						{
							color: hasFilters
								? isDark
									? "#93c5fd"
									: "#1e40af"
								: isDark
									? "#94a3b8"
									: "#64748b",
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
							backgroundColor: isDark ? "#1e3a5f" : "#dbeafe",
							borderColor: isDark ? "#3b82f6" : "#1e40af",
						},
					]}
				>
					<Text
						style={[styles.chipText, { color: isDark ? "#93c5fd" : "#1e40af" }]}
					>
						{chip.label}
					</Text>
					<Pressable onPress={() => onRemove(chip.key)} hitSlop={4}>
						<Ionicons
							name="close"
							size={12}
							color={isDark ? "#93c5fd" : "#1e40af"}
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
	filterText: { fontSize: 13, fontWeight: "600" },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	chipText: { fontSize: 13, fontWeight: "500" },
});
