import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { usePublicVariants } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import {
	initialSelection,
	isOptionValueUnavailable,
	isVariantInStock,
	matchVariant,
	resolveSelection,
} from "@/src/lib/variantPicker";
import { formatXaf, variantLabel } from "@/src/lib/variants";
import type { ProductDoc, PublicVariantDoc } from "@/src/types/api";
import { useShopTheme } from "./theme";

/**
 * Buyer-facing. Reads `usePublicVariants`, the public/live-only endpoint —
 * never `useProductVariants`, the shop member's widened raw collection used
 * by the seller-facing product editor — so an owner previewing their own
 * listing sees exactly what a stranger sees. `children` receives the chosen
 * variant (web's `VariantSelector` does the same), which is how the buy box
 * adds what the buyer picked.
 */
export function VariantPicker({
	product,
	children,
}: {
	product: ProductDoc;
	children?: (variant: PublicVariantDoc | null) => ReactNode;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const options = product.options ?? [];
	const { data } = usePublicVariants(product.id);
	const variants = data?.docs ?? [];

	// The buyer's manual pick, kept separate from the derived default so a
	// refetch that makes it stale — or that no longer matches any variant —
	// falls back to the default instead of freezing on a dead combination.
	const [manualSelection, setManualSelection] = useState<Record<
		string,
		string
	> | null>(null);
	const manualMatch = manualSelection
		? matchVariant(variants, manualSelection)
		: null;
	const manualValid = manualMatch !== null && isVariantInStock(manualMatch);
	const selection =
		manualValid && manualSelection
			? manualSelection
			: initialSelection(variants, options);

	if (variants.length === 0) return null;

	const current = matchVariant(variants, selection);
	// A product without options has one variant and nothing to pick.
	if (options.length === 0) return children?.(current) ?? null;
	const stateLabel = !current
		? t("shop.variantCombinationUnavailable")
		: !current.trackInventory
			? t("shop.variantInStock")
			: isVariantInStock(current)
				? t("shop.variantAvailable")
				: t("shop.variantSoldOut");

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			{options.map((option) => (
				<View key={option.name} style={{ gap: 8 }}>
					<Text style={[styles.label, { color: c.body }]}>
						{option.name} :{" "}
						<Text style={{ color: c.text }}>
							{selection[option.name] ?? "—"}
						</Text>
					</Text>
					<View style={styles.chips}>
						{option.values.map((value) => {
							const active = selection[option.name] === value;
							// Real, not selection-dependent: a value is disabled only when
							// NO in-stock variant carries it anywhere, so a buyer on Blue/M
							// can still reach an in-stock Red/L even though Red/M is sold out.
							const unavailable = isOptionValueUnavailable(
								variants,
								option.name,
								value,
							);
							return (
								<Pressable
									key={value}
									disabled={unavailable}
									accessibilityRole="button"
									accessibilityState={{
										disabled: unavailable,
										selected: active,
									}}
									accessibilityLabel={
										unavailable
											? `${value} — ${t("shop.variantSoldOut")}`
											: value
									}
									onPress={() =>
										setManualSelection(
											resolveSelection(variants, selection, option.name, value),
										)
									}
									style={[
										styles.chip,
										{
											borderColor: active ? c.primary : c.border,
											backgroundColor: active ? c.primarySoft : c.card,
											opacity: unavailable ? 0.5 : 1,
										},
									]}
								>
									<Text
										style={[
											styles.chipText,
											{
												color: active
													? c.primary
													: unavailable
														? c.muted
														: c.text,
												textDecorationLine: unavailable
													? "line-through"
													: "none",
											},
										]}
									>
										{value}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
			))}
			<View style={[styles.summary, { backgroundColor: c.neutralSoft }]}>
				<Text
					style={[
						styles.label,
						{
							color:
								current && isVariantInStock(current) ? c.text : c.dangerText,
							flex: 1,
						},
					]}
				>
					{current
						? `${variantLabel(current.optionValues ?? {}, options)} · ${stateLabel}`
						: stateLabel}
				</Text>
				{current ? (
					<Text style={[styles.price, { color: c.text }]}>
						{formatXaf(current.price, i18n.language)}
					</Text>
				) : null}
			</View>
			{children?.(current)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 14,
		marginBottom: 12,
	},
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 44,
		minWidth: 44,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	chipText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	summary: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	price: { fontSize: 16, fontFamily: Fonts.displayBold },
});
