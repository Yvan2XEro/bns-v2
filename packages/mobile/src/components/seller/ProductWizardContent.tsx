import type { Dispatch, SetStateAction } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { FieldIssue } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import {
	type ProductFormState,
	productStepIssues,
	WIZARD_STEPS,
} from "@/src/lib/productForm";
import { formStyles as f } from "./formStyles";
import { ProductInfoStep } from "./ProductInfoStep";
import { PublishStep } from "./PublishStep";
import { VariantsStep } from "./VariantsStep";

/** The 3-step creation wizard: info, variants, publish — one step shown at a time. */
export function ProductWizardContent({
	form,
	setForm,
	step,
	issues,
	canManageCost,
	onEditInfo,
}: {
	form: ProductFormState;
	setForm: Dispatch<SetStateAction<ProductFormState>>;
	step: 1 | 2 | 3;
	/** The issues to show; empty until the seller tries to move on or the server refuses. */
	issues: FieldIssue[];
	canManageCost: boolean;
	onEditInfo: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const stepIssues = productStepIssues(issues, WIZARD_STEPS[step]);

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
				<ProductInfoStep form={form} setForm={setForm} issues={stepIssues} />
			) : null}
			{step === 2 ? (
				<VariantsStep
					form={form}
					setForm={setForm}
					canManageCost={canManageCost}
					issues={stepIssues}
				/>
			) : null}
			{step === 3 ? (
				<PublishStep
					form={form}
					setForm={setForm}
					statuses={["active", "draft"]}
					onEditInfo={onEditInfo}
					issues={stepIssues}
				/>
			) : null}
			{stepIssues.length > 0 ? (
				<Text style={f.error} accessibilityRole="alert">
					{t("formIssues.fixStep")}
				</Text>
			) : null}
		</>
	);
}

const styles = StyleSheet.create({
	stepTitle: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
});
