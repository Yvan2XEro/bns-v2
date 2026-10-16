import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";

function usePalette() {
	const isDark = useColorScheme() === "dark";
	return {
		card: isDark ? "#1e293b" : "#ffffff",
		text: isDark ? "#e2e8f0" : "#0f172a",
		muted: isDark ? "#94a3b8" : "#64748b",
		primary: isDark ? "#3b82f6" : "#1e40af",
		border: isDark ? "#1e3a5f" : "#e2e8f0",
		chip: isDark ? "#172554" : "#eff6ff",
	};
}

/**
 * Shown while the search box is focused and empty: the buyer's last searches,
 * one tap to run again, each removable, all clearable.
 */
export function RecentSearches({
	recent,
	onPick,
	onRemove,
	onClear,
}: {
	recent: readonly string[];
	onPick: (query: string) => void;
	onRemove: (query: string) => void;
	onClear: () => void;
}) {
	const { t } = useTranslation();
	const c = usePalette();
	return (
		<View style={styles.recentWrap}>
			<View style={styles.recentHead}>
				<Text
					style={[
						styles.recentTitle,
						{ color: c.muted, fontFamily: Fonts.bodySemibold },
					]}
				>
					{t("search.recentTitle")}
				</Text>
				<Pressable onPress={onClear} hitSlop={10} accessibilityRole="button">
					<Text
						style={[
							styles.clear,
							{ color: c.primary, fontFamily: Fonts.bodySemibold },
						]}
					>
						{t("search.clearRecent")}
					</Text>
				</Pressable>
			</View>
			<View
				style={[
					styles.recentCard,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				{recent.map((query, index) => (
					<Pressable
						key={query}
						onPress={() => onPick(query)}
						accessibilityRole="button"
						style={({ pressed }) => [
							styles.recentRow,
							index > 0 && {
								borderTopWidth: StyleSheet.hairlineWidth,
								borderTopColor: c.border,
							},
							pressed && { opacity: 0.6 },
						]}
					>
						<Ionicons name="time-outline" size={17} color={c.muted} />
						<Text
							numberOfLines={1}
							style={[
								styles.recentText,
								{ color: c.text, fontFamily: Fonts.body },
							]}
						>
							{query}
						</Text>
						<Pressable
							onPress={() => onRemove(query)}
							hitSlop={10}
							accessibilityRole="button"
							accessibilityLabel={t("search.removeRecent", { query })}
						>
							<Ionicons name="close" size={16} color={c.muted} />
						</Pressable>
					</Pressable>
				))}
			</View>
		</View>
	);
}

/**
 * The categories matching what is being typed, as a row of chips above the
 * results: "frigo" offers to browse Réfrigérateurs as a whole.
 */
export function CategorySuggestions({
	categories,
	onPick,
}: {
	categories: readonly { id: string; name: string }[];
	onPick: (id: string) => void;
}) {
	const { t } = useTranslation();
	const c = usePalette();
	if (categories.length === 0) return null;
	return (
		// A horizontal ScrollView grows to fill a column on its own, which pushed
		// the results half a screen down: the plain View holds it to its chips.
		<View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={styles.chips}
			>
				{categories.map((category) => (
					<Pressable
						key={category.id}
						onPress={() => onPick(category.id)}
						accessibilityRole="button"
						style={({ pressed }) => [
							styles.chip,
							{ backgroundColor: c.chip, borderColor: c.border },
							pressed && { opacity: 0.7 },
						]}
					>
						<Ionicons name="grid-outline" size={13} color={c.primary} />
						<Text
							numberOfLines={1}
							style={[
								styles.chipText,
								{ color: c.primary, fontFamily: Fonts.bodySemibold },
							]}
						>
							{t("search.inCategory", { name: category.name })}
						</Text>
					</Pressable>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	recentWrap: { paddingHorizontal: 16, paddingTop: 16 },
	recentHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	recentTitle: {
		fontSize: 12,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	clear: { fontSize: 13 },
	recentCard: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	recentRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 14,
		minHeight: 48,
	},
	recentText: { flex: 1, fontSize: 15 },
	chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		height: 32,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		maxWidth: 260,
	},
	chipText: { fontSize: 13 },
});
