import { Pressable, StyleSheet, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { type ProductFormState, parseAmount } from "@/src/lib/productForm";
import { formatXafRange, priceRange } from "@/src/lib/variants";
import { formStyles as f } from "./formStyles";

/** Title/category/condition recap plus price range and stock, with an edit shortcut. */
export function PublishSummaryCard({
	form,
	onEditInfo,
}: {
	form: ProductFormState;
	onEditInfo: () => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const prices = form.variants
		.map((row) => parseAmount(row.price))
		.filter((p): p is number => p !== null);
	const range = priceRange(prices);
	const units = form.variants.reduce(
		(sum, row) =>
			sum +
			(row.id ? (row.stockOnHand ?? 0) : (parseAmount(row.initialStock) ?? 0)),
		0,
	);

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<View style={f.row}>
				<View style={{ flex: 1, gap: 2 }}>
					<Text style={[f.sectionTitle, { color: c.text }]}>{form.title}</Text>
					<Text style={[f.hint, { color: c.muted }]}>
						{[
							form.category?.name,
							form.condition
								? t(
										`conditions.${form.condition === "like_new" ? "likeNew" : form.condition}`,
									)
								: null,
							t("product.variantsCount", { count: form.variants.length }),
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
					<Text style={[f.label, { color: c.text }]}>
						{range ? formatXafRange(range.min, range.max, i18n.language) : "—"}{" "}
						· {t("product.unitsInStock", { count: units })}
					</Text>
				</View>
				<Pressable
					onPress={onEditInfo}
					hitSlop={12}
					style={styles.editButton}
					accessibilityRole="button"
					accessibilityLabel={t("product.edit")}
				>
					<Text style={[f.label, { color: c.primary }]}>
						{t("product.edit")}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	editButton: {
		minHeight: 44,
		minWidth: 44,
		alignItems: "flex-end",
		justifyContent: "center",
	},
});
