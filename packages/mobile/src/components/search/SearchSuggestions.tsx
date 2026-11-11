import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useDiscoveryPalette } from "./palette";

function usePalette() {
	const c = useDiscoveryPalette();
	return {
		card: c.card,
		text: c.foreground,
		muted: c.mutedForeground,
		link: c.link,
		border: c.border,
		chip: c.primaryTint,
		pressed: c.well,
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
					style={[styles.recentTitle, { color: c.text }]}
					accessibilityRole="header"
				>
					{t("search.recentTitle")}
				</Text>
				<Pressable
					onPress={onClear}
					accessibilityRole="button"
					accessibilityLabel={t("search.clearHistory")}
					style={styles.clearBtn}
				>
					<Text style={[styles.clear, { color: c.link }]}>
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
							pressed && { backgroundColor: c.pressed },
						]}
					>
						<Ionicons name="time-outline" size={17} color={c.muted} />
						<Text
							numberOfLines={1}
							style={[styles.recentText, { color: c.text }]}
						>
							{query}
						</Text>
						<Pressable
							onPress={() => onRemove(query)}
							accessibilityRole="button"
							accessibilityLabel={t("search.removeRecent", { query })}
							style={styles.removeBtn}
						>
							<Ionicons name="close" size={18} color={c.muted} />
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
						<Ionicons name="grid-outline" size={15} color={c.link} />
						<Text
							numberOfLines={1}
							style={[styles.chipText, { color: c.link }]}
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
	recentWrap: { paddingHorizontal: 16, paddingTop: 8 },
	recentHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	recentTitle: {
		fontSize: 17,
		lineHeight: 22,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	clearBtn: { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
	clear: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	recentCard: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	recentRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingLeft: 14,
		minHeight: 52,
	},
	recentText: { flex: 1, fontSize: 16, fontFamily: Fonts.body },
	removeBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		minHeight: 40,
		borderRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		maxWidth: 260,
	},
	chipText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
