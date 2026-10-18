import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ShopProfile } from "@/src/lib/listingKind";
import { SHOP_SORT_LABEL_KEYS, type ShopSort } from "@/src/lib/shopStorefront";
import type { ShopCategoryCount } from "../../../../api/src/contracts/shopCategoryGroups";
import { useShopBrand } from "./brand";
import { type ShopTab, ShopTabs } from "./ShopTabs";
import { useShopTheme } from "./theme";

/**
 * What stays pinned under the compact bar: the tabs, and on « Annonces » the
 * shop's categories, the count and the sort.
 */
export function ShopListControls({
	tab,
	onTabChange,
	reviewCount,
	chips,
	chipsTotal,
	category,
	onCategoryChange,
	total,
	query,
	sort,
	onOpenSort,
	onSearchEverywhere,
	profile = "store",
}: {
	tab: ShopTab;
	onTabChange: (tab: ShopTab) => void;
	reviewCount: number;
	/** `null` hides the row: unreadable counts, or a single category. */
	chips: ShopCategoryCount[] | null;
	chipsTotal: number;
	category: string | null;
	onCategoryChange: (id: string | null) => void;
	/** `null` while the first page loads. */
	total: number | null;
	/** The in-shop search, once debounced; empty outside a search. */
	query: string;
	sort: ShopSort;
	onOpenSort: () => void;
	onSearchEverywhere: () => void;
	/** An agency counts properties, a recruiter job offers. */
	profile?: ShopProfile;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	const sortLabel = t(SHOP_SORT_LABEL_KEYS[sort]);

	return (
		<View
			style={[
				styles.root,
				{ backgroundColor: c.bg, borderBottomColor: c.border },
			]}
		>
			<View style={styles.inset}>
				<ShopTabs
					active={tab}
					onChange={onTabChange}
					reviewCount={reviewCount}
				/>
			</View>
			{tab === "listings" ? (
				<>
					{chips ? (
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.chips}
							accessibilityLabel={t("shop.categoryRowLabel")}
						>
							<Chip
								label={t("shop.categoryAll")}
								count={chipsTotal}
								selected={category === null}
								onPress={() => onCategoryChange(null)}
							/>
							{chips.map((chip) => (
								<Chip
									key={chip.id}
									label={chip.name}
									count={chip.count}
									selected={category === chip.id}
									onPress={() => onCategoryChange(chip.id)}
								/>
							))}
						</ScrollView>
					) : null}
					<View style={[styles.countRow, styles.inset]}>
						<Text style={[styles.count, { color: c.muted }]} numberOfLines={1}>
							{total === null
								? " "
								: query
									? t("shop.searchResultsCount", { count: total, q: query })
									: profile === "store"
										? t("shop.listingsCount", { count: total })
										: t(`shopProfile.count.${profile}`, { count: total })}
						</Text>
						<Pressable
							onPress={onOpenSort}
							hitSlop={10}
							style={styles.sort}
							accessibilityRole="button"
							accessibilityLabel={t("shop.sortButtonLabel", {
								sort: sortLabel,
							})}
						>
							<Text style={[styles.sortText, { color: c.text }]}>
								{sort === "newest" ? t("shop.sortLabel") : sortLabel}
							</Text>
							<Ionicons name="chevron-down" size={14} color={c.text} />
						</Pressable>
					</View>
					{query ? (
						<Pressable
							onPress={onSearchEverywhere}
							style={[styles.everywhere, styles.inset]}
							accessibilityRole="link"
						>
							<Ionicons name="search" size={14} color={brand.accentText} />
							<Text
								style={[styles.everywhereText, { color: brand.accentText }]}
								numberOfLines={1}
							>
								{t("shop.searchEverywhere", { q: query })}
							</Text>
							<Ionicons
								name="chevron-forward"
								size={14}
								color={brand.accentText}
							/>
						</Pressable>
					) : null}
				</>
			) : null}
		</View>
	);
}

function Chip({
	label,
	count,
	selected,
	onPress,
}: {
	label: string;
	count: number;
	selected: boolean;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			accessibilityLabel={t("shop.categoryChipLabel", { name: label, count })}
			style={[
				styles.chip,
				selected
					? { backgroundColor: brand.accentSoft, borderColor: brand.accentText }
					: { backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<Text
				style={[
					styles.chipText,
					{ color: selected ? brand.accentText : c.text },
					selected && styles.chipSelected,
				]}
			>
				{label}
			</Text>
			<Text
				style={[
					styles.chipCount,
					{ color: selected ? brand.accentText : c.muted },
				]}
			>
				{count}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	root: { borderBottomWidth: StyleSheet.hairlineWidth },
	inset: { paddingHorizontal: 16 },
	chips: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 12,
		height: 34,
	},
	chipText: { fontSize: 13, fontFamily: Fonts.body },
	chipSelected: { fontFamily: Fonts.bodySemibold },
	chipCount: { fontSize: 12, fontFamily: Fonts.body },
	countRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		height: 40,
	},
	count: { flex: 1, fontSize: 13, fontFamily: Fonts.body },
	sort: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
	sortText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	everywhere: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingBottom: 10,
	},
	everywhereText: {
		flexShrink: 1,
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
});
