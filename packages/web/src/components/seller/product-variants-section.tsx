"use client";

import { useTranslations } from "next-intl";
import type {
	Control,
	UseFormGetValues,
	UseFormRegister,
	UseFormSetValue,
} from "react-hook-form";
import { useFieldArray, useFormState, useWatch } from "react-hook-form";
import { EditorSection } from "~/components/seller/editor-section";
import { OptionEditor } from "~/components/seller/option-editor";
import {
	type IssueAt,
	ProductIssueText,
} from "~/components/seller/product-issue-text";
import { VariantTable } from "~/components/seller/variant-table";
import {
	type OptionRow,
	type ProductFormState,
	reconcileVariants,
} from "~/lib/product-form";

interface ProductVariantsSectionProps {
	control: Control<ProductFormState>;
	register: UseFormRegister<ProductFormState>;
	setValue: UseFormSetValue<ProductFormState>;
	getValues: UseFormGetValues<ProductFormState>;
	showCost: boolean;
	issueAt: IssueAt;
}

export function ProductVariantsSection({
	control,
	register,
	setValue,
	getValues,
	showCost,
	issueAt,
}: ProductVariantsSectionProps) {
	const t = useTranslations("ProductEditor");
	const options = useWatch({ control, name: "options" }) ?? [];
	const { isSubmitted } = useFormState({ control });
	// The rows are the registered inputs of the table, so the array itself is
	// owned by react-hook-form rather than rebuilt around it.
	const { replace: replaceVariants } = useFieldArray({
		control,
		name: "variants",
	});

	const applyOptions = (next: OptionRow[]) => {
		setValue("options", next, {
			shouldDirty: true,
			shouldValidate: isSubmitted,
		});
		replaceVariants(reconcileVariants(next, getValues("variants")));
	};

	return (
		<EditorSection
			title={t("variantsTitle")}
			aside={
				<label className="flex items-center gap-2 text-[#334155] text-sm">
					<input
						type="checkbox"
						className="h-4 w-4 accent-[var(--shop-accent,#1E40AF)]"
						checked={options.length > 0}
						onChange={(event) =>
							applyOptions(
								event.target.checked ? [{ name: "", values: [] }] : [],
							)
						}
					/>
					{t("hasVariants")}
				</label>
			}
		>
			<div className="space-y-4">
				{options.length > 0 && (
					<OptionEditor
						options={options}
						onChange={applyOptions}
						issueAt={issueAt}
					/>
				)}
				<ProductIssueText issue={issueAt("options")} />
				<VariantTable
					control={control}
					register={register}
					setValue={setValue}
					showCost={showCost}
					issueAt={issueAt}
				/>
				<ProductIssueText issue={issueAt("variants")} />
			</div>
		</EditorSection>
	);
}
