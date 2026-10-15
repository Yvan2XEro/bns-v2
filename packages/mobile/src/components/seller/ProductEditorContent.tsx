import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import type { FieldIssue } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductFormState } from "@/src/lib/productForm";
import type { MovementRow } from "@/src/types/api";
import { formStyles as f } from "./formStyles";
import { ProductInfoStep } from "./ProductInfoStep";
import { ProductMovementsCard } from "./ProductMovementsCard";
import { PublishStep } from "./PublishStep";
import { VariantsStep } from "./VariantsStep";

/** The existing-product editor: publish settings, variants, info and history. */
export function ProductEditorContent({
	form,
	setForm,
	issues,
	readOnly,
	canManageCost,
	listing,
	movements,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	issues: FieldIssue[];
	readOnly: boolean;
	canManageCost: boolean;
	listing: { id: string; views: number; favorites: number } | null;
	movements: MovementRow[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<>
			<PublishStep
				form={form}
				setForm={setForm}
				statuses={["active", "archived", "draft"]}
				readOnly={readOnly}
				issues={issues}
			/>
			{listing ? (
				<Pressable
					onPress={() => router.push(`/listing/${listing.id}` as never)}
					style={[
						f.card,
						styles.listingRow,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
					accessibilityRole="button"
					accessibilityLabel={t("product.viewListing")}
				>
					<Ionicons name="globe-outline" size={18} color={c.primary} />
					<Text style={[f.label, { color: c.text, flex: 1 }]}>
						{t("product.listingStats", {
							views: listing.views,
							favorites: listing.favorites,
						})}
					</Text>
					<Text style={[f.label, { color: c.primary }]}>
						{t("product.viewListing")}
					</Text>
				</Pressable>
			) : null}
			<VariantsStep
				form={form}
				setForm={setForm}
				editing
				readOnly={readOnly}
				canManageCost={canManageCost}
				issues={issues}
			/>
			<ProductInfoStep form={form} setForm={setForm} issues={issues} />
			<ProductMovementsCard movements={movements} />
		</>
	);
}

const styles = StyleSheet.create({
	listingRow: { flexDirection: "row", alignItems: "center" },
});
