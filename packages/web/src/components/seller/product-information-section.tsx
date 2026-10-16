"use client";

import { useTranslations } from "next-intl";
import type {
	Control,
	UseFormRegister,
	UseFormSetValue,
} from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { CategoryDialogField } from "~/components/category-picker";
import { EditorSection } from "~/components/seller/editor-section";
import {
	type IssueAt,
	ProductIssueText,
	useProductIssueMessage,
} from "~/components/seller/product-issue-text";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { CategoryAttributeFields } from "~/lib/category-attribute-fields";
import {
	DESCRIPTION_MAX,
	type ProductCategoryContext,
	type ProductFormState,
	TITLE_MAX,
} from "~/lib/product-form";
import type { Category } from "~/types";

interface ProductInformationSectionProps {
	control: Control<ProductFormState>;
	register: UseFormRegister<ProductFormState>;
	setValue: UseFormSetValue<ProductFormState>;
	categories: Category[];
	categoryContext: ProductCategoryContext;
	issueAt: IssueAt;
}

export function ProductInformationSection({
	control,
	register,
	setValue,
	categories,
	categoryContext,
	issueAt,
}: ProductInformationSectionProps) {
	const t = useTranslations("ProductEditor");
	const title = useWatch({ control, name: "title" });
	const description = useWatch({ control, name: "description" });
	const { attributes, category } = categoryContext;
	const issueMessage = useProductIssueMessage();
	const titleIssue = issueAt("title");
	const attributeIssues: Record<string, string> = {};
	for (const attribute of attributes) {
		const issue = issueAt(`attributeValues.${attribute.slug}`);
		if (issue) attributeIssues[attribute.slug] = issueMessage(issue);
	}

	// A category switch takes its own fields with it: values from the previous
	// category would be sent as attributes this one never declared.
	const resetCategoryFields = () => {
		setValue("attributeValues", {}, { shouldDirty: true });
	};

	return (
		<EditorSection title={t("information")}>
			<div className="space-y-4">
				<div className="space-y-1.5">
					<Label htmlFor="product-title">{t("title")}</Label>
					<Input
						id="product-title"
						maxLength={TITLE_MAX}
						aria-invalid={Boolean(titleIssue)}
						{...register("title")}
					/>
					{titleIssue ? (
						<ProductIssueText issue={titleIssue} />
					) : (
						<p className="text-ink-faint text-xs">
							{`${title?.length ?? 0} / ${TITLE_MAX}`}
						</p>
					)}
				</div>

				<div className="space-y-1.5">
					<Label>{t("category")}</Label>
					<Controller
						control={control}
						name="categoryId"
						render={({ field }) => (
							<CategoryDialogField
								categories={categories}
								value={category}
								onChange={(id) => {
									field.onChange(id);
									resetCategoryFields();
								}}
								onClear={() => {
									field.onChange(null);
									resetCategoryFields();
								}}
								labels={{
									placeholder: t("chooseCategory"),
									title: t("chooseCategory"),
									description: t("categoryHint"),
									search: t("searchCategories"),
									empty: t("noCategory"),
									clear: t("clearCategory"),
								}}
							/>
						)}
					/>
					<ProductIssueText issue={issueAt("categoryId")} />
				</div>

				<Controller
					control={control}
					name="attributeValues"
					render={({ field }) => (
						<CategoryAttributeFields
							attributes={attributes}
							values={field.value}
							issues={attributeIssues}
							onChange={(slug, value) =>
								field.onChange({ ...field.value, [slug]: value })
							}
						/>
					)}
				/>

				<div className="space-y-1.5">
					<Label htmlFor="product-description">{t("description")}</Label>
					<Textarea
						id="product-description"
						rows={5}
						maxLength={DESCRIPTION_MAX}
						aria-invalid={Boolean(issueAt("description"))}
						{...register("description")}
					/>
					<ProductIssueText issue={issueAt("description")} />
					<p className="text-ink-faint text-xs">
						{description?.length ?? 0} /{" "}
						{DESCRIPTION_MAX.toLocaleString("fr-FR")}
					</p>
				</div>
			</div>
		</EditorSection>
	);
}
