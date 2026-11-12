import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { AmountTag } from "@/src/components/shop/Tags";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { formatPriceRange } from "@/src/lib/market";
import { type ProductFormState, parseAmount } from "@/src/lib/productForm";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { priceRange } from "@/src/lib/variants";
import { formStyles as f } from "./formStyles";

/** Title/category recap plus price range and stock, with an edit shortcut. */
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

	// The cover leads, so the seller confirms the product as the shop shows it.
	const cover = form.images[0];
	const coverUri = cover ? (resolveImageUrl(cover.uri) ?? cover.uri) : null;

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<View style={f.row}>
				{coverUri ? (
					<Image
						source={{ uri: coverUri }}
						style={styles.cover}
						contentFit="cover"
						accessibilityIgnoresInvertColors
					/>
				) : null}
				<View style={styles.text}>
					<Text
						style={[f.sectionTitle, { color: c.text }]}
						accessibilityRole="header"
					>
						{form.title}
					</Text>
					<Text style={[f.hint, { color: c.muted }]}>
						{[
							form.category?.name,
							t("product.variantsCount", { count: form.variants.length }),
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
					{/* The price wears its tag, as it will in the shop. */}
					<View style={styles.priceRow}>
						{range ? (
							<AmountTag
								size="sm"
								label={formatPriceRange(range.min, range.max, i18n.language)}
							/>
						) : null}
						<Text style={[f.label, { color: c.body }]}>
							{t("product.unitsInStock", { count: units })}
						</Text>
					</View>
				</View>
				<Pressable
					onPress={onEditInfo}
					hitSlop={12}
					style={styles.editButton}
					accessibilityRole="button"
					accessibilityLabel={t("product.edit")}
				>
					<Text style={[styles.editText, { color: c.link }]}>
						{t("product.edit")}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	cover: { width: 64, height: 64, borderRadius: 12, alignSelf: "flex-start" },
	text: { flex: 1, gap: 4 },
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		marginTop: 2,
	},
	editText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	editButton: {
		minHeight: 44,
		minWidth: 44,
		alignItems: "flex-end",
		justifyContent: "center",
	},
});
