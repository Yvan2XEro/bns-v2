"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ProductChecklistCard } from "~/components/seller/product-checklist-card";
import { ProductDeliverySection } from "~/components/seller/product-delivery-section";
import { ProductEditorHeader } from "~/components/seller/product-editor-header";
import { ProductInformationSection } from "~/components/seller/product-information-section";
import { ProductListingPreview } from "~/components/seller/product-listing-preview";
import { ProductPhotosSection } from "~/components/seller/product-photos-section";
import { ProductPublicationCard } from "~/components/seller/product-publication-card";
import { ProductVariantsSection } from "~/components/seller/product-variants-section";
import { RecentMovements } from "~/components/seller/recent-movements";
import { useSaveProduct } from "~/hooks/use-save-product";
import { resolveErrorMessage } from "~/lib/apiError";
import { pruneAttributeValues } from "~/lib/category-form";
import {
	emptyState,
	type ProductFormState,
	productFormSchema,
	resolveProductCategory,
	stateAfterSave,
	stateFromDetail,
	toProductInput,
} from "~/lib/product-form";
import { canSeeCost } from "~/lib/shop-roles";
import type {
	Category,
	ProductDetailResponse,
	ProductStatus,
	ShopRole,
} from "~/types";

export interface ProductEditorProps {
	shopId: string;
	categories: Category[];
	/** The caller's role in this shop; it decides whether cost is shown at all. */
	role: ShopRole | null;
	detail?: { productId: string; response: ProductDetailResponse };
}

export function ProductEditor({
	shopId,
	categories,
	role,
	detail,
}: ProductEditorProps) {
	const t = useTranslations("ProductEditor");
	const tRoot = useTranslations();
	const router = useRouter();
	const saveProduct = useSaveProduct(shopId, detail?.productId);

	const [defaultValues] = useState<ProductFormState>(() =>
		detail ? stateFromDetail(detail.response) : emptyState(),
	);
	const {
		clearErrors,
		control,
		formState,
		getValues,
		handleSubmit,
		register,
		reset,
		setError,
		setValue,
	} = useForm<ProductFormState>({
		resolver: zodResolver(productFormSchema),
		defaultValues,
	});

	const categoryId = useWatch({ control, name: "categoryId" });
	const title = useWatch({ control, name: "title" });
	const categoryContext = useMemo(
		() => resolveProductCategory(categories, categoryId),
		[categories, categoryId],
	);

	// The purchase cost is a shop secret, so the role decides — not whether a
	// cost happens to be set. An owner whose variants have no cost yet still
	// gets the column, and a staff member never does, on either page.
	const showCost = canSeeCost(role);

	const onValid = async (values: ProductFormState) => {
		clearErrors("root");
		const input = toProductInput(
			values,
			values.existingImages.map((image) => image.id),
			pruneAttributeValues(categoryContext.attributes, values.attributeValues),
			categoryContext.preset.fields.condition.enabled,
			showCost,
		);
		try {
			const result = await saveProduct.mutateAsync({
				input,
				files: values.newImages.map((draft) => draft.file),
			});
			if (detail) reset(stateAfterSave(values, result, result.uploadedIds));
			else router.replace(`/seller/catalogue/${result.product.id}`);
		} catch (error) {
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	};

	const submit = handleSubmit(onValid, () =>
		setError("root", { message: t("fixIssues") }),
	);

	const submitAs = (status: ProductStatus) => {
		setValue("status", status);
		void submit();
	};

	const heading = detail ? title || t("untitled") : t("newProduct");
	const saved = saveProduct.isSuccess && !formState.isDirty;
	// The zod resolver runs before the mutation starts, so the mutation's own
	// flag leaves a window in which a second click creates a second product.
	const pending = formState.isSubmitting || saveProduct.isPending;

	return (
		<form onSubmit={submit} className="space-y-5" noValidate>
			<ProductEditorHeader
				heading={heading}
				isEdit={Boolean(detail)}
				pending={pending}
				onSubmitAs={submitAs}
			/>

			{formState.errors.root?.message && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{formState.errors.root.message}
				</p>
			)}
			{saved && !formState.errors.root && (
				<p className="rounded-lg bg-[#F0FDF4] px-3 py-2 text-[#166534] text-sm">
					{t("saved")}
				</p>
			)}

			<div className="grid gap-5 lg:grid-cols-3">
				<div className="space-y-5 lg:col-span-2">
					<ProductInformationSection
						control={control}
						register={register}
						setValue={setValue}
						categories={categories}
						categoryContext={categoryContext}
						titleInvalid={Boolean(formState.errors.title)}
						categoryInvalid={Boolean(formState.errors.categoryId)}
					/>
					<ProductPhotosSection control={control} />
					<ProductVariantsSection
						control={control}
						register={register}
						setValue={setValue}
						getValues={getValues}
						showCost={showCost}
						priceInvalid={Boolean(formState.errors.variants)}
					/>
					<ProductDeliverySection register={register} />
				</div>

				<div className="space-y-5">
					{detail ? (
						<Controller
							control={control}
							name="status"
							render={({ field }) => (
								<ProductPublicationCard
									status={field.value}
									onStatusChange={field.onChange}
									listing={detail.response.listing}
								/>
							)}
						/>
					) : (
						<>
							<ProductChecklistCard control={control} />
							<ProductListingPreview control={control} />
						</>
					)}
					{detail && <RecentMovements movements={detail.response.movements} />}
				</div>
			</div>
		</form>
	);
}
