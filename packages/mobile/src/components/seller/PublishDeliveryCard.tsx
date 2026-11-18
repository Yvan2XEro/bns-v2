import type { Dispatch, ReactNode, SetStateAction } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useShopTheme } from "@/src/components/shop/theme";
import { type FieldIssue, issueAt } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import type { ProductFormState } from "@/src/lib/productForm";
import { FieldIssueText, ISSUE_BORDER } from "./FieldIssueText";
import { formStyles as f } from "./formStyles";
import { SwitchRow } from "./SwitchRow";

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
		{
			color: readOnly ? c.muted : c.text,
			backgroundColor: readOnly ? c.neutralSoft : c.input,
			borderColor: c.border,
		},
	];
	const flagged = (path: string) =>
		issueAt(issues, path) ? { borderColor: ISSUE_BORDER } : null;

	return (
		<View
			style={[
				f.card,
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<Text
				style={[f.sectionTitle, { color: c.text }]}
				accessibilityRole="header"
			>
				{t("product.saleTitle")}
			</Text>

			{/* How the buyer pays and collects: two switches, one group. */}
			<View>
				<SwitchRow
					title={t("product.cod")}
					hint={t("product.codHint")}
					value={form.codAllowed}
					disabled={readOnly}
					onChange={(codAllowed) => setForm((s) => ({ ...s, codAllowed }))}
				/>
				<View style={[styles.divider, { backgroundColor: c.border }]} />
				<SwitchRow
					title={t("product.pickup")}
					hint={t("product.pickupHint")}
					value={form.pickupAllowed}
					disabled={readOnly}
					onChange={(pickupAllowed) =>
						setForm((s) => ({ ...s, pickupAllowed }))
					}
				/>
			</View>

			<View style={[styles.divider, { backgroundColor: c.border }]} />

			{/* What the seller promises: each field with its label above it and
			    its message under it, at one rhythm. */}
			<Field label={t("product.handling")}>
				<TextInput
					value={form.handlingHours}
					editable={!readOnly}
					onChangeText={(v) =>
						setForm((s) => ({ ...s, handlingHours: v.replace(/\D/g, "") }))
					}
					keyboardType="number-pad"
					// "ex. 24", not a bare "24" that reads as a value already set.
					placeholder={t("product.handlingPlaceholder", {
						defaultValue: "ex. 24",
					})}
					placeholderTextColor={c.muted}
					style={[
						...inputStyle,
						styles.number,
						flagged("delivery.handlingHours"),
					]}
					accessibilityLabel={t("product.handling")}
				/>
				<FieldIssueText issue={issueAt(issues, "delivery.handlingHours")} />
			</Field>

			<Field label={t("product.returnPolicy")}>
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
			</Field>

			<Field label={t("product.warrantyMonths")}>
				<TextInput
					value={form.warrantyMonths}
					editable={!readOnly}
					onChangeText={(v) =>
						setForm((s) => ({ ...s, warrantyMonths: v.replace(/\D/g, "") }))
					}
					keyboardType="number-pad"
					maxLength={3}
					placeholder={t("product.warrantyPlaceholder", {
						defaultValue: "ex. 3",
					})}
					placeholderTextColor={c.muted}
					style={[...inputStyle, styles.number, flagged("warrantyMonths")]}
					accessibilityLabel={t("product.warrantyMonths")}
					accessibilityHint={t("product.warrantyMonthsHint")}
				/>
				<Text style={[f.hint, { color: c.muted }]}>
					{t("product.warrantyMonthsHint")}
				</Text>
				<FieldIssueText issue={issueAt(issues, "warrantyMonths")} />
			</Field>
		</View>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	const c = useShopTheme();
	return (
		<View style={styles.field}>
			<Text style={[f.label, { color: c.body }]}>{label}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	card: { gap: 12 },
	divider: { height: StyleSheet.hairlineWidth },
	field: { gap: 6 },
	number: { fontVariant: ["tabular-nums"] },
});
