import { Ionicons } from "@expo/vector-icons";
import type { Dispatch, SetStateAction } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
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
			{statuses.map((status) => {
				const active = form.status === status;
				return (
					<Pressable
						key={status}
						disabled={readOnly}
						onPress={() => setForm((s) => ({ ...s, status }))}
						style={[
							styles.radio,
							{
								borderColor: active ? c.primary : c.border,
								backgroundColor: active ? c.primarySoft : c.card,
							},
						]}
						accessibilityRole="radio"
						accessibilityLabel={t(`product.status_${status}`)}
						accessibilityState={{ selected: active }}
					>
						<Ionicons
							name={active ? "radio-button-on" : "radio-button-off"}
							size={20}
							color={active ? c.primary : c.muted}
						/>
						<View style={{ flex: 1 }}>
							<Text style={[f.label, { color: c.text }]}>
								{t(`product.status_${status}`)}
							</Text>
							<Text style={[f.hint, { color: c.muted }]}>
								{t(`product.status_${status}_hint`)}
							</Text>
						</View>
					</Pressable>
				);
			})}
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
	radio: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 12,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
	},
	info: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10 },
});
