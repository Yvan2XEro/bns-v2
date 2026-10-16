import type { Dispatch, SetStateAction } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { type FieldIssue, issueAt } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductFormState } from "@/src/lib/productForm";
import { FieldIssueText, ISSUE_BORDER } from "./FieldIssueText";
import { formStyles as f } from "./formStyles";

/** Cash-on-delivery, pickup, preparation time, return policy and warranty. */
export function PublishDeliveryCard({
	form,
	setForm,
	readOnly,
	issues = [],
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	readOnly?: boolean;
	issues?: FieldIssue[];
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];
	const flagged = (path: string) =>
		issueAt(issues, path) ? { borderColor: ISSUE_BORDER } : null;

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
				style={[...inputStyle, flagged("delivery.handlingHours")]}
				accessibilityLabel={t("product.handling")}
			/>
			<FieldIssueText issue={issueAt(issues, "delivery.handlingHours")} />
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
				style={[...inputStyle, f.multiline, flagged("returnPolicy")]}
				accessibilityLabel={t("product.returnPolicy")}
			/>
			<FieldIssueText issue={issueAt(issues, "returnPolicy")} />
			<Text style={[f.label, { color: c.body }]}>
				{t("product.warrantyMonths")}
			</Text>
			<TextInput
				value={form.warrantyMonths}
				editable={!readOnly}
				onChangeText={(v) =>
					setForm((s) => ({ ...s, warrantyMonths: v.replace(/\D/g, "") }))
				}
				keyboardType="number-pad"
				maxLength={3}
				placeholder="3"
				placeholderTextColor={c.muted}
				style={[...inputStyle, flagged("warrantyMonths")]}
				accessibilityLabel={t("product.warrantyMonths")}
				accessibilityHint={t("product.warrantyMonthsHint")}
			/>
			<Text style={[f.hint, { color: c.muted }]}>
				{t("product.warrantyMonthsHint")}
			</Text>
			<FieldIssueText issue={issueAt(issues, "warrantyMonths")} />
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
