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
import { ProductStockTab } from "~/components/seller/product-stock-tab";
import { ProductTabs } from "~/components/seller/product-tabs";
import { ProductVariantsSection } from "~/components/seller/product-variants-section";
import { RecentMovements } from "~/components/seller/recent-movements";
import { WorkspaceBreadcrumb } from "~/components/seller/workspace-breadcrumb";
import { usePhotoLimit } from "~/hooks/use-app-config";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useSaveProduct } from "~/hooks/use-save-product";
import { resolveErrorMessage } from "~/lib/apiError";
import { isProductCategory, pruneAttributeValues } from "~/lib/category-form";
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
import {
	errorPaths,
	issuesPerTab,
	type ProductTab,
	productTabHref,
	tabForIssues,
} from "~/lib/product-tabs";
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
	/** Editing: the tab the URL names. A new product shows one page. */
	tab?: ProductTab;
}

const FORM_ID = "product-editor-form";

export function ProductEditor({
	shopId,
	categories,
	role,
	detail,
	defaultReturnPolicy,
	tab,
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

	// Only goods go in the catalogue (the API refuses the rest); a product
	// filed elsewhere before that rule keeps its own category on offer.
	const sellableCategories = useMemo(
		() =>
			categories.filter(
				(category) =>
					isProductCategory(category) ||
					category.id === defaultValues.categoryId,
			),
		[categories, defaultValues.categoryId],
	);
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
	const tabbed = Boolean(detail && tab);
	const shows = (section: ProductTab) => !tabbed || tab === section;
	// Scrolls to the first issue on screen; a tab change waits for the tab.
	const revealOnTab = useRef(false);
	const scrollToIssue = () =>
		window.requestAnimationFrame(() =>
			Array.from(document.querySelectorAll<HTMLElement>("[data-field-issue]"))
				.find((element) => element.getClientRects().length > 0)
				?.scrollIntoView({ block: "center", behavior: "smooth" }),
		);
	/** Shows the issues: on this tab if it holds one, else on the first that does. */
	const revealFirstIssue = (paths: string[]) => {
		const target = tab && detail ? tabForIssues(tab, paths) : tab;
		if (detail && tab && target && target !== tab) {
			revealOnTab.current = true;
			router.push(productTabHref(detail.productId, target), { scroll: false });
			return;
		}
		scrollToIssue();
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the tab changes
	useEffect(() => {
		if (!revealOnTab.current) return;
		revealOnTab.current = false;
		scrollToIssue();
	}, [tab]);

	// The stock is the ledger's, not the form's: when a movement lands (from
	// the stock tab or the adjust sheet) the refetched product brings the new
	// figure, shown without counting as an edit to save.
	const liveVariants = detail?.response.variants;
	useEffect(() => {
		if (!liveVariants) return;
		getValues("variants").forEach((row, index) => {
			const live = liveVariants.find((variant) => variant.id === row.id);
			if (live && live.stockOnHand !== row.stockOnHand) {
				setValue(`variants.${index}.stockOnHand`, live.stockOnHand);
			}
		});
	}, [liveVariants, getValues, setValue]);

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
			if (onFields.length > 0)
				revealFirstIssue(onFields.map((issue) => issue.path));
		}
	};

	const submit = handleSubmit(onValid, (invalid) => {
		setError("root", { message: t("fixIssues") });
		revealFirstIssue(errorPaths(invalid));
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
		<div className="space-y-5">
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
				formId={FORM_ID}
			/>
			{restored && (
				<p className="rounded-lg bg-[var(--shop-accent-soft,var(--c-brand-soft))] px-3 py-2 text-[var(--shop-accent-text,var(--c-brand-strong))] text-sm">
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
				<p className="rounded-lg bg-ok-faint px-3 py-2 text-ok-ink text-sm">
					{t("saved")}
				</p>
			)}

			{detail && tab && (
				<ProductTabs
					productId={detail.productId}
					current={tab}
					issues={issuesPerTab(errorPaths(errors))}
				/>
			)}

			{/* Every form tab stays mounted (hidden when another shows), so an
			    edit survives a tab change and an issue can be found on any. */}
			<form id={FORM_ID} onSubmit={submit} noValidate hidden={tab === "stock"}>
				<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
					<div className="min-w-0 space-y-5">
						<div hidden={!shows("details")}>
							<ProductInformationSection
								control={control}
								register={register}
								setValue={setValue}
								categories={sellableCategories}
								categoryContext={categoryContext}
								issueAt={issueAt}
							/>
						</div>
						<div hidden={!shows("details")}>
							<ProductPhotosSection control={control} issueAt={issueAt} />
						</div>
						<div hidden={!shows("variants")}>
							<ProductVariantsSection
								control={control}
								register={register}
								setValue={setValue}
								getValues={getValues}
								showCost={showCost}
								issueAt={issueAt}
							/>
						</div>
						<div hidden={!shows("details")}>
							<ProductDeliverySection register={register} issueAt={issueAt} />
						</div>
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
						{detail && (
							<RecentMovements
								movements={detail.response.movements}
								historyHref={productTabHref(detail.productId, "stock")}
							/>
						)}
					</div>
				</div>
			</form>

			{detail && tab === "stock" && (
				<ProductStockTab
					shopId={shopId}
					productId={detail.productId}
					variants={detail.response.variants}
					showCost={showCost}
				/>
			)}
		</div>
	);
}
