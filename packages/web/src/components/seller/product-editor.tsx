"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Controller,
	type FieldPath,
	type Resolver,
	useForm,
	useWatch,
} from "react-hook-form";
import { ProductChecklistCard } from "~/components/seller/product-checklist-card";
import { ProductDeliverySection } from "~/components/seller/product-delivery-section";
import { ProductEditorHeader } from "~/components/seller/product-editor-header";
import { ProductInformationSection } from "~/components/seller/product-information-section";
import { ProductListingPreview } from "~/components/seller/product-listing-preview";
import { ProductPhotosSection } from "~/components/seller/product-photos-section";
import { ProductPublicationCard } from "~/components/seller/product-publication-card";
import { ProductVariantsSection } from "~/components/seller/product-variants-section";
import { RecentMovements } from "~/components/seller/recent-movements";
import { WorkspaceBreadcrumb } from "~/components/seller/workspace-breadcrumb";
import { usePhotoLimit } from "~/hooks/use-app-config";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useSaveProduct } from "~/hooks/use-save-product";
import { resolveErrorMessage } from "~/lib/apiError";
import { pruneAttributeValues } from "~/lib/category-form";
import {
	clearProductDraft,
	loadProductDraft,
	saveProductDraft,
} from "~/lib/product-draft";
import {
	emptyState,
	encodeIssue,
	type FieldIssue,
	issueInErrors,
	type ProductFormState,
	type ProductIssueContext,
	productFormSchemaFor,
	resolveProductCategory,
	serverProductIssues,
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
	/** The shop's default, which a new product's return policy starts from. */
	defaultReturnPolicy?: string | null;
}

export function ProductEditor({
	shopId,
	categories,
	role,
	detail,
	defaultReturnPolicy,
}: ProductEditorProps) {
	const t = useTranslations("ProductEditor");
	const tRoot = useTranslations();
	const router = useRouter();
	const saveProduct = useSaveProduct(shopId, detail?.productId);
	const photoLimit = usePhotoLimit();

	const [defaultValues] = useState<ProductFormState>(() =>
		detail
			? stateFromDetail(detail.response)
			: emptyState({ returnPolicy: defaultReturnPolicy }),
	);
	// The rules depend on the chosen category, read at validation time.
	const issueContext = useRef<ProductIssueContext>({
		attributes: [],
		preset: resolveProductCategory(categories, null).preset,
		includeCost: false,
	});
	const resolver: Resolver<ProductFormState> = (values, context, options) =>
		zodResolver(productFormSchemaFor(issueContext.current))(
			values,
			context,
			options,
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
		watch,
	} = useForm<ProductFormState>({
		resolver,
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
	issueContext.current = {
		attributes: categoryContext.attributes,
		preset: categoryContext.preset,
		includeCost: showCost,
		photoLimit,
		previousImageCount: detail
			? (formState.defaultValues?.existingImages?.length ?? 0)
			: null,
	};

	const errors = formState.errors;
	const issueAt = (path: string): FieldIssue | null =>
		issueInErrors(errors, path);
	const revealFirstIssue = () =>
		window.requestAnimationFrame(() =>
			document
				.querySelector("[data-field-issue]")
				?.scrollIntoView({ block: "center", behavior: "smooth" }),
		);

	const onValid = async (values: ProductFormState) => {
		clearErrors("root");
		const input = toProductInput(
			values,
			values.existingImages.map((image) => image.id),
			pruneAttributeValues(categoryContext.attributes, values.attributeValues),
			showCost,
		);
		try {
			const result = await saveProduct.mutateAsync({
				input,
				files: values.newImages.map((draft) => draft.file),
			});
			if (detail) reset(stateAfterSave(values, result, result.uploadedIds));
			else {
				discardDraft();
				router.replace(`/seller/catalogue/${result.product.id}`);
			}
		} catch (error) {
			const issues = serverProductIssues(error, values);
			const onFields = issues.filter((issue) => !issue.path.startsWith("root"));
			onFields.forEach((issue, index) => {
				setError(
					issue.path as FieldPath<ProductFormState>,
					{ type: issue.rule, message: encodeIssue(issue) },
					{ shouldFocus: index === 0 },
				);
			});
			if (onFields.length === 0 || onFields.length < issues.length) {
				setError("root", { message: resolveErrorMessage(error, tRoot) });
			}
			if (onFields.length > 0) revealFirstIssue();
		}
	};

	const submit = handleSubmit(onValid, () => {
		setError("root", { message: t("fixIssues") });
		revealFirstIssue();
	});

	const submitAs = (status: ProductStatus) => {
		setValue("status", status);
		void submit();
	};

	// A new product is kept on this device as it is typed (photos excepted),
	// restored after mount so the server render and the first client render
	// agree.
	const te = useCatalogueStockT("editor");
	const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
	const [restored, setRestored] = useState(false);
	const restoreChecked = useRef(false);
	useEffect(() => {
		if (detail || restoreChecked.current) return;
		restoreChecked.current = true;
		const draft = loadProductDraft(shopId);
		if (!draft) return;
		reset({ ...emptyState(), ...draft.state, newImages: [] });
		setAutosavedAt(draft.savedAt);
		setRestored(true);
	}, [detail, reset, shopId]);
	// Set once the draft is done with (created, or cancelled), so a save
	// still waiting on its timer cannot write it back.
	const draftDiscarded = useRef(false);
	useEffect(() => {
		if (detail) return;
		let timer: number | undefined;
		const subscription = watch(() => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				if (draftDiscarded.current) return;
				const draft = saveProductDraft(shopId, getValues());
				if (draft) setAutosavedAt(draft.savedAt);
			}, 1500);
		});
		return () => {
			subscription.unsubscribe();
			window.clearTimeout(timer);
		};
	}, [detail, watch, getValues, shopId]);
	const discardDraft = () => {
		draftDiscarded.current = true;
		clearProductDraft(shopId);
	};
	const cancel = () => {
		discardDraft();
		router.push("/seller/catalogue");
	};

	const heading = detail ? title || t("untitled") : t("newProduct");
	const listing = detail?.response.listing ?? null;
	const saved = saveProduct.isSuccess && !formState.isDirty;
	// The zod resolver runs before the mutation starts, so the mutation's own
	// flag leaves a window in which a second click creates a second product.
	const pending = formState.isSubmitting || saveProduct.isPending;

	return (
		<form onSubmit={submit} className="space-y-5" noValidate>
			{detail && (
				<WorkspaceBreadcrumb
					section="catalogue"
					href="/seller/catalogue"
					reference={heading}
				/>
			)}
			<ProductEditorHeader
				heading={heading}
				isEdit={Boolean(detail)}
				savedStatus={detail?.response.product.status ?? null}
				pending={pending}
				onSubmitAs={submitAs}
				updatedAt={detail?.response.product.updatedAt ?? null}
				previewHref={
					listing?.status === "published" ? `/listing/${listing.id}` : null
				}
				autosavedAt={autosavedAt}
				onCancel={detail ? undefined : cancel}
			/>
			{restored && (
				<p className="rounded-lg bg-[var(--shop-accent-soft,#EFF6FF)] px-3 py-2 text-[var(--shop-accent-text,#1E3A8A)] text-sm">
					{te("restored")}
				</p>
			)}

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

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
				<div className="min-w-0 space-y-5">
					<ProductInformationSection
						control={control}
						register={register}
						setValue={setValue}
						categories={categories}
						categoryContext={categoryContext}
						issueAt={issueAt}
					/>
					<ProductPhotosSection control={control} issueAt={issueAt} />
					<ProductVariantsSection
						control={control}
						register={register}
						setValue={setValue}
						getValues={getValues}
						showCost={showCost}
						issueAt={issueAt}
					/>
					<ProductDeliverySection register={register} issueAt={issueAt} />
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
