"use client";

import { LoaderCircle, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Notice } from "~/components/callable/notice";
import { CategoryDropdown } from "~/components/category-picker";
import { FieldIssueSummary } from "~/components/listing/field-issue-summary";
import { ImagePicker } from "~/components/listing/image-picker";
import {
	PriceUnitSelect,
	priceUnitToSend,
} from "~/components/listing/price-unit-select";
import { TagPicker } from "~/components/listing/tag-picker";
import { LocationField } from "~/components/location/location-field";
import { PhoneRequirement } from "~/components/shop/phone-requirement";
import { PublishInShopToggle } from "~/components/shop/publish-in-shop-toggle";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NumberInput } from "~/components/ui/number-input";
import { Textarea } from "~/components/ui/textarea";
import { usePhotoLimit } from "~/hooks/use-app-config";
import { useCategoryTags } from "~/hooks/use-category-tags";
import { useMyShop } from "~/hooks/use-my-shop";
import { useCurrencyCode } from "~/hooks/use-order-money";
import { usePhoneStatus } from "~/hooks/use-phone-status";
import { CategoryAttributeFields } from "~/lib/category-attribute-fields";
import {
	type CategoryAttributeSpec,
	collectAttributeIssues,
	collectCoreFieldIssues,
	isProductCategory,
	pruneAttributeValues,
	relaxPhotoRequirement,
	resolveCategoryAttributes,
	resolveFormPreset,
	titlePlaceholderCopy,
} from "~/lib/category-form";
import { keepApplicableTags, relationIds } from "~/lib/category-tags";
import {
	type FieldIssue,
	responseIssues,
	webListingIssues,
} from "~/lib/listing-issues";
import {
	defaultPriceUnit,
	listingKindRules,
	type PriceUnit,
} from "~/lib/listing-kind";
import { listingShopId } from "~/lib/listing-shop";
import { mediaUploadForm } from "~/lib/media-upload";
import { asFallbackTranslator, translateOr } from "~/lib/translate-or";
import { cn } from "~/lib/utils";
import type { Category, Listing, Media } from "~/types";
import { rejectionText } from "../../../../../../../api/src/contracts/listingRejection";
import { placeCoords } from "../../../../../../../api/src/contracts/places";

interface ExistingImage {
	id: string;
	url: string;
}

export function EditListingForm({
	listing,
	categories,
}: {
	listing: Listing;
	categories: Category[];
}) {
	const currencyCode = useCurrencyCode();
	const t = asFallbackTranslator(useTranslations("Listing"));
	const tCommon = useTranslations("Common");
	const tShop = useTranslations("Shop");
	const tKind = useTranslations("ListingKind");
	const phoneStatus = usePhoneStatus();
	const tReason = useTranslations("ListingRejection");
	// The reason in the seller's language, whoever moderated the listing.
	const rejection = rejectionText(listing, tReason);
	const tIssues = useTranslations("FormIssues");
	const photoLimit = usePhotoLimit();
	const router = useRouter();
	const [isSaving, setIsSaving] = useState(false);

	const {
		data: myShop,
		error: myShopError,
		reload: reloadMyShop,
	} = useMyShop();
	const activeShop = myShop?.shop?.status === "active" ? myShop.shop : null;
	// The listing's own shop, not the caller's current one: P1 is one shop per
	// seller so the two coincide in practice, but a listing already filed under
	// a shop must stay there rather than silently follow the account to
	// whichever shop it happens to hold when the form is saved.
	const originalShopId = listingShopId(listing);
	const wasInShop = originalShopId !== null;
	const [publishInShop, setPublishInShop] = useState(wasInShop);

	type UserStatus = "draft" | "pending";

	function getDefaultStatus(status: string): UserStatus {
		if (status === "draft") return "draft";
		return "pending";
	}

	const [nextStatus, setNextStatus] = useState<UserStatus>(() =>
		getDefaultStatus(listing.status),
	);
	const needsPhone =
		nextStatus === "pending" &&
		listing.status !== "pending" &&
		phoneStatus.data?.isPhoneVerified !== true;

	const currentCategoryId =
		listing.category && typeof listing.category === "object"
			? listing.category.id
			: listing.category;
	const currentCategory =
		categories.find((c) => c.id === currentCategoryId) || null;

	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		currentCategory,
	);
	const [attributes, setAttributes] = useState<CategoryAttributeSpec[]>(() =>
		resolveCategoryAttributes(currentCategory),
	);
	const [showErrors, setShowErrors] = useState(false);
	const { tags: categoryTags } = useCategoryTags(selectedCategory?.id);
	const applicableTagIds = useMemo(
		() => categoryTags?.map((tag) => tag.id) ?? null,
		[categoryTags],
	);

	const initialAttrs: Record<string, string> = {};
	if (
		listing.attributes &&
		typeof listing.attributes === "object" &&
		!Array.isArray(listing.attributes)
	) {
		for (const [k, v] of Object.entries(listing.attributes)) {
			initialAttrs[k] = String(v);
		}
	}
	const [attributeValues, setAttributeValues] =
		useState<Record<string, string>>(initialAttrs);

	// Existing images from Payload
	const existingImages: ExistingImage[] =
		listing.images
			?.map((img) => {
				const media = img.image as Media;
				return media?.url ? { id: media.id, url: media.url } : null;
			})
			.filter((img): img is ExistingImage => img !== null) || [];

	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() =>
		relationIds((listing as { tags?: unknown }).tags),
	);
	// A tag the category no longer gets goes with the category change.
	useEffect(() => {
		if (!applicableTagIds) return;
		setSelectedTagIds((prev) => {
			const kept = keepApplicableTags(prev, applicableTagIds);
			return kept.length === prev.length ? prev : kept;
		});
	}, [applicableTagIds]);

	const [keptImages, setKeptImages] = useState<ExistingImage[]>(existingImages);
	const [newImages, setNewImages] = useState<File[]>([]);
	const [newPreviews, setNewPreviews] = useState<string[]>([]);

	const [coordinates, setCoordinates] = useState<{
		lat: number;
		lng: number;
	} | null>(
		listing.coordinates?.lat && listing.coordinates?.lng
			? { lat: listing.coordinates.lat, lng: listing.coordinates.lng }
			: null,
	);

	const [formData, setFormData] = useState({
		title: listing.title,
		description: listing.description,
		price: listing.price != null ? String(listing.price) : "",
		location: listing.location,
	});
	// An ad saved without a unit was a one-off price, and stays one until the
	// seller says otherwise.
	const [priceUnit, setPriceUnit] = useState<PriceUnit>(
		listing.priceUnit ?? "total",
	);

	// An ad that was published before its category asked for a picture must stay
	// editable, so the requirement only bites when there is a picture to lose.
	const categoryPreset = relaxPhotoRequirement(
		resolveFormPreset(selectedCategory),
		existingImages.length > 0,
	);
	const isProduct = isProductCategory(selectedCategory);
	const priceField = categoryPreset.fields.price;
	const photosField = categoryPreset.fields.photos;
	const photoCount = keptImages.length + newImages.length;
	// A category may rename the price, e.g. "Loyer mensuel" for a rental.
	const priceLabel = priceField.label
		? `${priceField.label} (${currencyCode})`
		: t("priceXaf", { currency: currencyCode });

	const attributeIssues = useMemo(
		() => collectAttributeIssues(attributes, attributeValues),
		[attributes, attributeValues],
	);
	const missingCoreFields = collectCoreFieldIssues(categoryPreset, {
		price: formData.price,
		photoCount,
	});

	const titleCopy = titlePlaceholderCopy(categoryPreset.categoryType);

	// The API's own rules on the body `handleSave` would send. The image cap
	// only refuses growth, so a legacy listing already over it stays editable.
	const draftBody = {
		title: formData.title,
		description: formData.description,
		location: formData.location,
		category: selectedCategory?.id ?? null,
		price:
			priceField.enabled && formData.price ? Number(formData.price) : undefined,
		images: [...keptImages, ...newImages],
		attributes: pruneAttributeValues(attributes, attributeValues),
		tags: selectedTagIds,
	};
	const draftIssues = webListingIssues(draftBody, {
		preset: categoryPreset.fields,
		attributes,
		previousImageCount: existingImages.length,
		photoLimit,
		tags: applicableTagIds,
	});
	const draftKey = JSON.stringify({ ...draftBody, images: photoCount });
	const [refused, setRefused] = useState<{
		key: string;
		issues: FieldIssue[];
	} | null>(null);
	const serverIssues = refused?.key === draftKey ? refused.issues : [];
	const attributeNames = Object.fromEntries(
		attributes.map((attribute) => [attribute.slug, attribute.name]),
	);
	const issueSummary = (
		<>
			<FieldIssueSummary
				issues={serverIssues}
				attributeNames={attributeNames}
				refused
			/>
			{showErrors ? (
				<FieldIssueSummary
					issues={draftIssues.filter(
						(issue) => !serverIssues.some((known) => known.path === issue.path),
					)}
					attributeNames={attributeNames}
				/>
			) : null}
		</>
	);

	function handleCategoryChange(categoryId: string) {
		const category = categories.find((c) => c.id === categoryId) || null;
		setSelectedCategory(category);
		setAttributes(resolveCategoryAttributes(category));
		setAttributeValues({});
		setShowErrors(false);
		const nextPreset = resolveFormPreset(category);
		setPriceUnit(defaultPriceUnit(nextPreset.categoryType));
		setFormData((prev) => ({
			...prev,
			// Drop values for fields this category does not show.
			price: nextPreset.fields.price.enabled ? prev.price : "",
		}));
		// Pictures are deliberately kept when the new category hides them: hiding a
		// field must not delete what the seller already uploaded. They are saved
		// back untouched, exactly as the server leaves them alone.
	}

	function handleRemoveExisting(index: number) {
		setKeptImages((prev) => prev.filter((_, i) => i !== index));
	}

	function handleAddNewImages(files: File[]) {
		setNewImages((prev) => [...prev, ...files]);
		for (const file of files) {
			const reader = new FileReader();
			reader.onload = (ev) => {
				setNewPreviews((prev) => [...prev, ev.target?.result as string]);
			};
			reader.readAsDataURL(file);
		}
	}

	function handleRemoveNewImage(index: number) {
		setNewImages((prev) => prev.filter((_, i) => i !== index));
		setNewPreviews((prev) => prev.filter((_, i) => i !== index));
	}

	const canSave = !!(
		formData.title &&
		formData.location &&
		formData.description &&
		selectedCategory &&
		missingCoreFields.length === 0 &&
		attributeIssues.length === 0 &&
		draftIssues.length === 0
	);

	async function handleSave() {
		if (!canSave || !selectedCategory) {
			setShowErrors(true);
			return;
		}
		setIsSaving(true);

		try {
			// Upload new images
			const newImageIds: string[] = [];
			for (const image of newImages) {
				const fd = await mediaUploadForm(
					image,
					image.name.replace(/\.[^.]+$/, "") || "listing image",
				);
				const uploadRes = await fetch("/api/media", {
					method: "POST",
					body: fd,
					credentials: "include",
				});
				// A photo that did not upload must not vanish from the listing unnoticed.
				if (!uploadRes.ok) {
					setRefused({
						key: draftKey,
						issues: [{ path: "images", rule: "uploadFailed" }],
					});
					return;
				}
				const data = await uploadRes.json();
				newImageIds.push(data.doc?.id ?? data.id);
			}

			const allImageIds = [...keptImages.map((img) => img.id), ...newImageIds];

			const updateData: Record<string, unknown> = {
				title: formData.title,
				description: formData.description,
				location: formData.location,
				category: selectedCategory.id,
				attributes: pruneAttributeValues(attributes, attributeValues),
				images: allImageIds.map((id) => ({ image: id })),
				status: nextStatus,
				tags: selectedTagIds,
			};
			if (priceField.enabled && formData.price) {
				updateData.price = Number(formData.price);
				updateData.priceUnit =
					priceUnitToSend(categoryPreset.categoryType, priceUnit) ?? null;
			}

			if (coordinates) {
				updateData.coordinates = coordinates;
			}
			// Only a member can move the listing in or out; otherwise the field is
			// left alone so a suspended shop does not silently lose its listings.
			// Checking the toggle keeps a listing that already has a shop where it
			// is; it only ever attaches an unshopped listing to the caller's own
			// shop, so it can never reassign a listing to a different shop.
			if (activeShop) {
				updateData.shop = publishInShop
					? (originalShopId ?? activeShop.id)
					: null;
			}

			const res = await fetch(`/api/listings/${listing.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updateData),
				credentials: "include",
			});

			if (!res.ok) {
				const issues = await responseIssues(res);
				if (issues.length === 0) throw new Error(t("failedToUpdate"));
				setRefused({ key: draftKey, issues });
				return;
			}
			router.push(`/listing/${listing.id}`);
			router.refresh();
		} catch {
			void Notice.call({
				title: tCommon("error"),
				message: t("failedToUpdate"),
			});
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="space-y-6">
			{/* Sending the ad (back) to review needs a verified phone. */}
			{needsPhone && <PhoneRequirement action="publishListing" />}
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-2xl">{t("editListingTitle")}</h1>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.push(`/listing/${listing.id}`)}
				>
					<X className="mr-2 h-4 w-4" />
					{t("cancel")}
				</Button>
			</div>

			{/* Category */}
			<Card>
				<CardHeader>
					<CardTitle>{t("category")}</CardTitle>
					<CardDescription>
						{isProduct ? t("categoryDesc") : t("categoryDescGeneric")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<CategoryDropdown
						categories={categories}
						value={selectedCategory ? String(selectedCategory.id) : undefined}
						onChange={handleCategoryChange}
						placeholder={t("selectACategory")}
					/>
				</CardContent>
			</Card>

			{/* Characteristics — the questions this category asks, kept with it
			    rather than buried under the sale fields. */}
			{attributes.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>
							{translateOr(t, "characteristics", "Caractéristiques")}
						</CardTitle>
						<CardDescription>
							{translateOr(
								t,
								"characteristicsDesc",
								"Les précisions que les acheteurs utilisent pour filtrer.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<CategoryAttributeFields
							attributes={attributes}
							values={attributeValues}
							onChange={(slug, v) =>
								setAttributeValues((p) => ({ ...p, [slug]: v }))
							}
							showRequiredErrors={showErrors}
						/>
					</CardContent>
				</Card>
			)}

			{/* Details */}
			<Card>
				<CardHeader>
					<CardTitle>{t("details")}</CardTitle>
					<CardDescription>
						{isProduct ? t("detailsDesc") : t("detailsDescGeneric")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="space-y-2">
						<Label htmlFor="title">{t("title")}</Label>
						<Input
							id="title"
							placeholder={translateOr(t, titleCopy.key, titleCopy.fallback)}
							value={formData.title}
							onChange={(e) =>
								setFormData((p) => ({ ...p, title: e.target.value }))
							}
							required
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{priceField.enabled && (
							<div className="space-y-2">
								<Label htmlFor="price">
									{priceLabel}
									{priceField.required && (
										<span className="text-destructive"> *</span>
									)}
								</Label>
								<NumberInput
									id="price"
									placeholder="0"
									value={formData.price}
									onValueChange={(price) =>
										setFormData((p) => ({ ...p, price }))
									}
									required={priceField.required}
								/>
							</div>
						)}
						{priceField.enabled && (
							<PriceUnitSelect
								kind={categoryPreset.categoryType}
								value={priceUnit}
								onChange={setPriceUnit}
							/>
						)}
						<div className="space-y-2">
							<Label htmlFor="location">{t("localisation")}</Label>
							<LocationField
								id="location"
								value={formData.location}
								clearable={false}
								onChange={(place) => {
									setFormData((p) => ({ ...p, location: place?.name ?? "" }));
									setCoordinates(placeCoords(place));
								}}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>{translateOr(t, "tags", "Tags")}</Label>
						<TagPicker
							tags={categoryTags}
							selectedIds={selectedTagIds}
							onChange={setSelectedTagIds}
						/>
						{showErrors &&
							draftIssues.some((issue) => issue.path === "tags") && (
								<p className="text-destructive text-xs">
									{tIssues("rule_category")}
								</p>
							)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">{t("itemDescription")}</Label>
						<Textarea
							id="description"
							placeholder={
								isProduct ? t("describeYourItem") : t("describeYourListing")
							}
							rows={5}
							value={formData.description}
							onChange={(e) =>
								setFormData((p) => ({ ...p, description: e.target.value }))
							}
							required
						/>
					</div>
				</CardContent>
			</Card>

			{/* Photos — only for categories that ask for pictures. */}
			{photosField.enabled && (
				<Card>
					<CardHeader>
						<CardTitle>
							{t("photos")}
							{photosField.required && (
								<span className="text-destructive"> *</span>
							)}
						</CardTitle>
						<CardDescription>
							{t("imagesTotal", { count: photoCount })}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Existing images */}
						{keptImages.length > 0 && (
							<div>
								<Label className="mb-2 block">{t("currentImages")}</Label>
								<div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
									{keptImages.map((img, index) => (
										<div key={img.id} className="relative aspect-square">
											<Image
												src={img.url}
												alt={`${t("photos")} ${index + 1}`}
												fill
												className="rounded-md object-cover"
											/>
											<Button
												type="button"
												variant="destructive"
												size="icon"
												className="-top-2 -right-2 absolute h-6 w-6"
												onClick={() => handleRemoveExisting(index)}
											>
												<Trash2 className="h-3 w-3" />
											</Button>
										</div>
									))}
								</div>
							</div>
						)}

						{/* New images */}
						<div>
							<Label className="mb-2 block">{t("addNewImages")}</Label>
							<ImagePicker
								previews={newPreviews}
								onAdd={handleAddNewImages}
								onRemove={handleRemoveNewImage}
								limit={photoLimit}
								existingCount={keptImages.length}
							/>
						</div>

						{photosField.required && missingCoreFields.includes("photos") && (
							<p className="text-destructive text-xs">
								{translateOr(
									t,
									"photosRequired",
									"Ajoutez au moins une photo.",
								)}
							</p>
						)}
					</CardContent>
				</Card>
			)}

			{/* Status */}
			<Card>
				<CardHeader>
					<CardTitle>{t("publication")}</CardTitle>
					<CardDescription>
						{translateOr(
							t,
							"publicationDesc",
							"Gérez la visibilité de votre annonce",
						)}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Current status */}
					<div className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">{t("currentStatus")}</span>
						<Badge
							variant={
								listing.status === "published"
									? "default"
									: listing.status === "rejected"
										? "destructive"
										: "secondary"
							}
							className={cn(
								listing.status === "pending" &&
									"border-amber-300 bg-amber-50 text-amber-700",
								listing.status === "draft" &&
									"border-slate-300 bg-slate-50 text-slate-600",
								listing.status === "sold" &&
									"border-purple-300 bg-purple-50 text-purple-700",
								listing.status === "expired" &&
									"border-orange-300 bg-orange-50 text-orange-700",
							)}
						>
							{listing.status === "draft" && t("statusDraft")}
							{listing.status === "pending" && t("statusPending")}
							{listing.status === "published" && t("statusPublished")}
							{listing.status === "rejected" && t("statusRejected")}
							{listing.status === "sold" &&
								tKind(`closedAs.${listingKindRules(listing.kind).closedAs}`)}
							{listing.status === "expired" && t("statusExpired")}
							{listing.status === "deleted" && t("statusDeleted")}
						</Badge>
					</div>

					{/* Published notice */}
					{listing.status === "published" && (
						<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
							{t("editWarning")}
						</div>
					)}

					{/* Rejection reason */}
					{listing.status === "rejected" && (
						<div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
							<p className="font-medium">{t("rejectionNotice")}</p>
							{rejection && <p>{`${t("reason")} ${rejection}`}</p>}
						</div>
					)}

					{/* Status options */}
					<div className="grid grid-cols-2 gap-3 pt-1">
						<button
							type="button"
							onClick={() => setNextStatus("draft")}
							className={cn(
								"flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors",
								nextStatus === "draft"
									? "border-primary bg-primary/5"
									: "border-border bg-background hover:border-muted-foreground/40",
							)}
						>
							<div className="flex items-center gap-2">
								<div
									className={cn(
										"flex h-4 w-4 items-center justify-center rounded-full border-2",
										nextStatus === "draft"
											? "border-primary"
											: "border-muted-foreground/40",
									)}
								>
									{nextStatus === "draft" && (
										<div className="h-2 w-2 rounded-full bg-primary" />
									)}
								</div>
								<span className="font-semibold text-sm">
									{t("statusDraft")}
								</span>
							</div>
							<p className="pl-6 text-muted-foreground text-xs">
								{t("draftDesc")}
							</p>
						</button>

						<button
							type="button"
							onClick={() => setNextStatus("pending")}
							className={cn(
								"flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors",
								nextStatus === "pending"
									? "border-primary bg-primary/5"
									: "border-border bg-background hover:border-muted-foreground/40",
							)}
						>
							<div className="flex items-center gap-2">
								<div
									className={cn(
										"flex h-4 w-4 items-center justify-center rounded-full border-2",
										nextStatus === "pending"
											? "border-primary"
											: "border-muted-foreground/40",
									)}
								>
									{nextStatus === "pending" && (
										<div className="h-2 w-2 rounded-full bg-primary" />
									)}
								</div>
								<span className="font-semibold text-sm">
									{t("submitForReview")}
								</span>
							</div>
							<p className="pl-6 text-muted-foreground text-xs">
								{t("reviewTimeframe")}
							</p>
						</button>
					</div>
				</CardContent>
			</Card>

			{/* Shop */}
			{activeShop && (
				<div className="space-y-2">
					<PublishInShopToggle
						shopName={activeShop.name}
						checked={publishInShop}
						onChange={setPublishInShop}
					/>
					{wasInShop && !publishInShop && (
						<p className="text-amber-700 text-xs">{tShop("detachWarning")}</p>
					)}
				</div>
			)}
			{!activeShop && myShopError && (
				<div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
					<span>{tShop("shopStatusUnknown")}</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={reloadMyShop}
					>
						{tShop("retryShopStatus")}
					</Button>
				</div>
			)}

			{issueSummary}
			{/* Save */}
			<div className="flex justify-end gap-3">
				<Button
					variant="outline"
					onClick={() => router.push(`/listing/${listing.id}`)}
				>
					{tCommon("cancel")}
				</Button>
				<Button onClick={handleSave} disabled={isSaving || needsPhone}>
					{isSaving ? (
						<>
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							{t("savingChanges")}
						</>
					) : (
						<>
							<Save className="mr-2 h-4 w-4" />
							{t("saveChanges")}
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
