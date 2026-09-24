import type { Dispatch, SetStateAction } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { type ProductFormState, variantIssues } from "@/src/lib/productForm";
import { formStyles as f } from "./formStyles";
import { ProductInfoStep } from "./ProductInfoStep";
import { PublishStep } from "./PublishStep";
import { VariantsStep } from "./VariantsStep";

/** The 3-step creation wizard: info, variants, publish — one step shown at a time. */
export function ProductWizardContent({
	form,
	setForm,
	step,
	showErrors,
	canManageCost,
	onEditInfo,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	step: 1 | 2 | 3;
	showErrors: boolean;
	canManageCost: boolean;
	onEditInfo: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<>
			<View>
				<Text style={[f.hint, { color: c.muted }]}>
					{t("product.stepOf", { step })}
				</Text>
				<Text style={[styles.stepTitle, { color: c.text }]}>
					{t(`product.step${step}Title`)}
				</Text>
			</View>
			{step === 1 ? (
				<ProductInfoStep
					form={form}
					setForm={setForm}
					showErrors={showErrors}
				/>
			) : null}
			{step === 2 ? (
				<VariantsStep
					form={form}
					setForm={setForm}
					canManageCost={canManageCost}
				/>
			) : null}
			{step === 3 ? (
				<PublishStep
					form={form}
					setForm={setForm}
					statuses={["active", "draft"]}
					onEditInfo={onEditInfo}
				/>
			) : null}
			{step === 2 && showErrors && variantIssues(form).length > 0 ? (
				<Text style={f.error}>{t("product.fixVariants")}</Text>
			) : null}
		</>
	);
}

const styles = StyleSheet.create({
	stepTitle: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
});
