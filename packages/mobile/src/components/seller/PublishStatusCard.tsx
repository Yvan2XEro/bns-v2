import { Ionicons } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { SegmentedControl } from "@/src/components/ui/SegmentedControl";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductFormState } from "@/src/lib/productForm";
import type { ProductStatus } from "@/src/types/api";
import { formStyles as f } from "./formStyles";

/** active/draft (creation), plus archived ("Masqué") in the editor. */
export function PublishStatusCard({
	form,
	setForm,
	statuses,
	readOnly,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	statuses: ProductStatus[];
	readOnly?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("product.statusTitle")}
			</Text>
			<SegmentedControl
				role="radio"
				disabled={readOnly}
				segments={statuses.map((status) => ({
					key: status,
					label: t(`product.status_${status}`),
				}))}
				value={form.status}
				onChange={(status) => setForm((s) => ({ ...s, status }))}
			/>
			<Text style={[f.hint, { color: c.muted }]}>
				{t(`product.status_${form.status}_hint`)}
			</Text>
			<View style={[styles.info, { backgroundColor: c.neutralSoft }]}>
				<Ionicons name="information-circle-outline" size={16} color={c.body} />
				<Text style={[f.hint, { color: c.body, flex: 1 }]}>
					{t("product.listingAuto")}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	info: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10 },
});
