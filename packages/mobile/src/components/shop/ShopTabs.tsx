import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopBrand } from "./brand";
import { useShopTheme } from "./theme";

export type ShopTab = "listings" | "reviews" | "about";

export function ShopTabs({
	active,
	onChange,
	reviewCount,
}: {
	active: ShopTab;
	onChange: (tab: ShopTab) => void;
	/** The reviews list's own total, never the shop's `totalReviews` counter. */
	reviewCount: number;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	const tabs: { id: ShopTab; label: string }[] = [
		{ id: "listings", label: t("shop.tabListings") },
		{
			id: "reviews",
			label:
				reviewCount > 0
					? t("shop.tabReviewsCount", { count: reviewCount })
					: t("shop.tabReviews"),
		},
		{ id: "about", label: t("shop.tabAbout") },
	];
	return (
		<View
			style={[styles.row, { borderBottomColor: c.border }]}
			accessibilityRole="tablist"
			accessibilityLabel={t("shop.tabsLabel")}
		>
			{tabs.map((tab) => {
				const selected = tab.id === active;
				return (
					<Pressable
						key={tab.id}
						onPress={() => onChange(tab.id)}
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						style={[
							styles.tab,
							{
								borderBottomColor: selected ? brand.accentText : "transparent",
							},
						]}
					>
						<Text
							style={[
								styles.label,
								{ color: selected ? brand.accentText : c.muted },
							]}
							numberOfLines={1}
						>
							{tab.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		borderBottomWidth: StyleSheet.hairlineWidth,
		marginHorizontal: -16,
		paddingHorizontal: 16,
	},
	tab: {
		flex: 1,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: 2,
	},
	label: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
