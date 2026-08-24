"use client";

import { LoaderCircle, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CategoryDropdown } from "~/components/category-picker";
import { ImagePicker } from "~/components/listing/image-picker";
import { TagPicker } from "~/components/listing/tag-picker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { CitySelect } from "~/components/ui/city-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import type { CameroonCity } from "~/lib/cameroon-cities";
import { CategoryAttributeFields } from "~/lib/category-attribute-fields";
import {
	type CategoryAttributeSpec,
	collectAttributeIssues,
	collectCoreFieldIssues,
	isProductCategory,
	LISTING_CURRENCY,
	pruneAttributeValues,
	relaxPhotoRequirement,
	resolveCategoryAttributes,
	resolveFormPreset,
	titlePlaceholderCopy,
} from "~/lib/category-form";
import { asFallbackTranslator, translateOr } from "~/lib/translate-or";
import { cn } from "~/lib/utils";
import type { Category, Listing, ListingCondition, Media } from "~/types";

/** Maximum number of images a listing can carry (enforced server-side too). */
const MAX_LISTING_IMAGES = 3;

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
	const t = asFallbackTranslator(useTranslations("Listing"));
	const tCommon = useTranslations("Common");
	const tCond = useTranslations("Condition");
	const router = useRouter();
	const [isSaving, setIsSaving] = useState(false);

	const CONDITIONS: { value: ListingCondition; label: string }[] = [
		{ value: "new", label: tCond("new") },
		{ value: "like_new", label: tCond("like_new") },
		{ value: "good", label: tCond("good") },
		{ value: "fair", label: tCond("fair") },
		{ value: "poor", label: tCond("poor") },
	];

	type UserStatus = "draft" | "pending";

	function getDefaultStatus(status: string): UserStatus {
		if (status === "draft") return "draft";
		return "pending";
	}

	const [nextStatus, setNextStatus] = useState<UserStatus>(() =>
		getDefaultStatus(listing.status),
	);

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

	const initialTagIds: string[] = Array.isArray((listing as any).tags)
		? (listing as any).tags.map((tag: any) =>
				typeof tag === "object" && tag !== null ? String(tag.id) : String(tag),
			)
		: [];
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds);

	const [keptImages, setKeptImages] = useState<ExistingImage[]>(existingImages);
	const [newImages, setNewImages] = useState<File[]>([]);
	const [newPreviews, setNewPreviews] = useState<string[]>([]);

	const initialCoordinates =
		listing.coordinates?.lat && listing.coordinates?.lng
			? { lat: listing.coordinates.lat, lng: listing.coordinates.lng }
			: null;
	const [coordinates, setCoordinates] = useState<{
		lat: number;
		lng: number;
	} | null>(initialCoordinates);

	const [formData, setFormData] = useState({
		title: listing.title,
		description: listing.description,
		price: listing.price != null ? String(listing.price) : "",
		location: listing.location,
		condition: (listing.condition || "") as ListingCondition | "",
	});

	// An ad that was published before its category asked for a picture must stay
	// editable, so the requirement only bites when there is a picture to lose.
	const categoryPreset = relaxPhotoRequirement(
		resolveFormPreset(selectedCategory),
		existingImages.length > 0,
	);
	const isProduct = isProductCategory(selectedCategory);
	const priceField = categoryPreset.fields.price;
	const conditionField = categoryPreset.fields.condition;
	const photosField = categoryPreset.fields.photos;
	const photoCount = keptImages.length + newImages.length;
	// A category may rename the price, e.g. "Loyer mensuel" for a rental.
	const priceLabel = priceField.label
		? `${priceField.label} (${LISTING_CURRENCY})`
		: t("priceXaf");

	const attributeIssues = useMemo(
		() => collectAttributeIssues(attributes, attributeValues),
		[attributes, attributeValues],
	);
	const missingCoreFields = collectCoreFieldIssues(categoryPreset, {
		price: formData.price,
		condition: formData.condition,
		photoCount,
	});

	const titleCopy = titlePlaceholderCopy(categoryPreset.categoryType);

	function handleCategoryChange(categoryId: string) {
		const category = categories.find((c) => c.id === categoryId) || null;
		setSelectedCategory(category);
		setAttributes(resolveCategoryAttributes(category));
		setAttributeValues({});
		setShowErrors(false);
		const nextPreset = resolveFormPreset(category);
		setFormData((prev) => ({
			...prev,
			// Drop values for fields this category does not show.
			price: nextPreset.fields.price.enabled ? prev.price : "",
			condition: nextPreset.fields.condition.enabled ? prev.condition : "",
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
		attributeIssues.length === 0
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
				const fd = new FormData();
				fd.append("file", image);
				fd.append(
					"_payload",
					JSON.stringify({
						alt: image.name.replace(/\.[^.]+$/, "") || "listing image",
					}),
				);
				const uploadRes = await fetch("/api/media", {
					method: "POST",
					body: fd,
					credentials: "include",
				});
				if (uploadRes.ok) {
					const data = await uploadRes.json();
					newImageIds.push(data.doc?.id ?? data.id);
				}
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
			}
			if (conditionField.enabled && formData.condition) {
				updateData.condition = formData.condition;
			}

			if (coordinates) {
				updateData.coordinates = coordinates;
			}

			const res = await fetch(`/api/listings/${listing.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updateData),
				credentials: "include",
			});

			if (!res.ok) throw new Error(t("failedToUpdate"));
			router.push(`/listing/${listing.id}`);
			router.refresh();
		} catch {
			alert(t("failedToUpdate"));
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<div className="space-y-6">
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
								<Input
									id="price"
									type="number"
									placeholder="0"
									min="0"
									value={formData.price}
									onChange={(e) =>
										setFormData((p) => ({ ...p, price: e.target.value }))
									}
									required={priceField.required}
								/>
							</div>
						)}
						<div className="space-y-2">
							<Label htmlFor="location">{t("localisation")}</Label>
							<CitySelect
								value={formData.location}
								onChange={(city: CameroonCity | null) => {
									setFormData((p) => ({
										...p,
										location: city?.name ?? "",
									}));
									setCoordinates(
										city ? { lat: city.lat, lng: city.lng } : null,
									);
								}}
							/>
						</div>
					</div>

					{conditionField.enabled && (
						<div className="space-y-2">
							<Label>
								{t("conditionLabel")}
								{conditionField.required && (
									<span className="text-destructive"> *</span>
								)}
							</Label>
							<Select
								value={formData.condition}
								onValueChange={(v) =>
									setFormData((p) => ({
										...p,
										condition: v as ListingCondition,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("selectCondition")} />
								</SelectTrigger>
								<SelectContent>
									{CONDITIONS.map((c) => (
										<SelectItem key={c.value} value={c.value}>
											{c.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{showErrors && missingCoreFields.includes("condition") && (
								<p className="text-destructive text-xs">
									{translateOr(
										t,
										"attributeRequired",
										"Ce champ est obligatoire.",
									)}
								</p>
							)}
						</div>
					)}

					<div className="space-y-2">
						<Label>{translateOr(t, "tags", "Tags")}</Label>
						<TagPicker
							selectedIds={selectedTagIds}
							onChange={setSelectedTagIds}
						/>
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
								max={Math.max(0, MAX_LISTING_IMAGES - keptImages.length)}
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
							{listing.status === "sold" && t("statusSold")}
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
							{(listing as any).rejectionReason && (
								<p>{`${t("reason")} ${(listing as any).rejectionReason}`}</p>
							)}
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

			{/* Save */}
			<div className="flex justify-end gap-3">
				<Button
					variant="outline"
					onClick={() => router.push(`/listing/${listing.id}`)}
				>
					{tCommon("cancel")}
				</Button>
				<Button onClick={handleSave} disabled={isSaving || !canSave}>
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
