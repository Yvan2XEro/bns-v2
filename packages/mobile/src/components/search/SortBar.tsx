import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "@/src/lib/i18n";
import { Chip } from "./Chip";
import { useDiscoveryPalette } from "./palette";

export type SortKey = "newest" | "price_asc" | "price_desc";

// The price chips show arrows; a screen reader gets the words instead.
const SORTS: { key: SortKey; label: string; a11y?: string }[] = [
	{ key: "newest", label: "search.sortNewest" },
	{
		key: "price_asc",
		label: "search.sortPriceAsc",
		a11y: "search.sortPriceAscA11y",
	},
	{
		key: "price_desc",
		label: "search.sortPriceDesc",
		a11y: "search.sortPriceDescA11y",
	},
];

/**
 * The sort choices over a result grid, one tap each. The row scrolls on a
 * narrow phone in a long language instead of squeezing the chips; `trailing`
 * (the filters chip) stays pinned at the end, always in reach.
 */
export function SortBar({
	sort,
	onChange,
	trailing,
}: {
	sort: string;
	onChange: (sort: SortKey) => void;
	trailing?: ReactNode;
}) {
	const { t } = useTranslation();
	const c = useDiscoveryPalette();
	return (
		<View style={[styles.bar, { borderBottomColor: c.border }]}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.chips}
				style={styles.scroll}
				keyboardShouldPersistTaps="handled"
			>
				{SORTS.map((option) => (
					<Chip
						key={option.key}
						label={t(option.label)}
						accessibilityLabel={option.a11y ? t(option.a11y) : undefined}
						selected={sort === option.key}
						onPress={() => onChange(option.key)}
					/>
				))}
			</ScrollView>
			{trailing ? <View style={styles.trailing}>{trailing}</View> : null}
		</View>
	);
}

/** The filters chip pinned at the end of a sort bar. */
export function FiltersChip({
	count,
	onPress,
}: {
	count: number;
	onPress: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Chip
			icon="options-outline"
			label={t("search.filters")}
			count={count}
			selected={count > 0}
			onPress={onPress}
			accessibilityLabel={
				count > 0 ? t("search.filtersCount", { count }) : t("search.filters")
			}
		/>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	scroll: { flex: 1 },
	chips: {
		gap: 8,
		paddingLeft: 16,
		paddingRight: 8,
		paddingVertical: 10,
	},
	trailing: { paddingRight: 16, paddingLeft: 4 },
});
