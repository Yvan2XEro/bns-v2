import type { Dispatch, SetStateAction } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductFormState } from "@/src/lib/productForm";
import { formStyles as f } from "./formStyles";

/** Cash-on-delivery, pickup, preparation time and return policy. */
export function PublishDeliveryCard({
	form,
	setForm,
	readOnly,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	readOnly?: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("product.saleTitle")}
			</Text>
			<ToggleRow
				title={t("product.cod")}
				hint={t("product.codHint")}
				value={form.codAllowed}
				disabled={readOnly}
				onChange={(codAllowed) => setForm((s) => ({ ...s, codAllowed }))}
			/>
			<ToggleRow
				title={t("product.pickup")}
				hint={t("product.pickupHint")}
				value={form.pickupAllowed}
				disabled={readOnly}
				onChange={(pickupAllowed) => setForm((s) => ({ ...s, pickupAllowed }))}
			/>
			<Text style={[f.label, { color: c.body }]}>{t("product.handling")}</Text>
			<TextInput
				value={form.handlingHours}
				editable={!readOnly}
				onChangeText={(v) =>
					setForm((s) => ({ ...s, handlingHours: v.replace(/\D/g, "") }))
				}
				keyboardType="number-pad"
				placeholder="24"
				placeholderTextColor={c.muted}
				style={inputStyle}
				accessibilityLabel={t("product.handling")}
			/>
			<Text style={[f.label, { color: c.body }]}>
				{t("product.returnPolicy")}
			</Text>
			<TextInput
				value={form.returnPolicy}
				editable={!readOnly}
				onChangeText={(returnPolicy) =>
					setForm((s) => ({ ...s, returnPolicy }))
				}
				multiline
				placeholder={t("product.returnPolicyPlaceholder")}
				placeholderTextColor={c.muted}
				style={[...inputStyle, f.multiline]}
				accessibilityLabel={t("product.returnPolicy")}
			/>
		</View>
	);
}

function ToggleRow({
	title,
	hint,
	value,
	onChange,
	disabled,
}: {
	title: string;
	hint: string;
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	return (
		<View style={f.row}>
			<View style={{ flex: 1 }}>
				<Text style={[f.label, { color: c.text }]}>{title}</Text>
				<Text style={[f.hint, { color: c.muted }]}>{hint}</Text>
			</View>
			<Switch
				value={value}
				disabled={disabled}
				onValueChange={onChange}
				trackColor={{ true: c.primary, false: c.border }}
				accessibilityLabel={title}
			/>
		</View>
	);
}
