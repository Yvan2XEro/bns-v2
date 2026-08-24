"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryDialogField } from "~/components/category-picker";
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
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import type { CameroonCity } from "~/lib/cameroon-cities";
import { CategoryAttributeFields } from "~/lib/category-attribute-fields";
import {
	type CategoryAttributeSpec,
	collectAttributeIssues,
	collectCoreFieldIssues,
	formatAttributeValue,
	isProductCategory,
	LISTING_CURRENCY,
	pruneAttributeValues,
	resolveCategoryAttributes,
	resolveFormPreset,
	titlePlaceholderCopy,
} from "~/lib/category-form";
import { createCategorySuggester } from "~/lib/category-suggest";
import { formatListingPrice } from "~/lib/price";
import { asFallbackTranslator, translateOr } from "~/lib/translate-or";
import type { Category, ListingCondition } from "~/types";

/** Maximum number of images a listing can carry (enforced server-side too). */
const MAX_LISTING_IMAGES = 3;

const DURATIONS = ["30", "60", "90"] as const;

/**
 * `describe` opens the form and asks what is being sold, in the seller's own
 * words. The category was the opening question until now, which meant choosing
 * a taxonomy before having said anything — and once chosen it left the screen,
 * so a wrong pick was neither visible nor correctable.
 */
type StepId = "describe" | "attributes" | "details" | "photos" | "review";

export function CreateListingForm({ categories }: { categories: Category[] }) {
	const t = useTranslations("CreateListing");
	const tListing = asFallbackTranslator(useTranslations("Listing"));
	const tCommon = useTranslations("Common");
	const tCond = useTranslations("Condition");
	const router = useRouter();
	const [step, setStep] = useState(0);

	const CONDITIONS: { value: ListingCondition; label: string }[] = [
		{ value: "new", label: tCond("new") },
		{ value: "like_new", label: tCond("like_new") },
		{ value: "good", label: tCond("good") },
		{ value: "fair", label: tCond("fair") },
		{ value: "poor", label: tCond("poor") },
	];
	const [isLoading, setIsLoading] = useState(false);

	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		null,
	);
	const [attributes, setAttributes] = useState<CategoryAttributeSpec[]>([]);
	const [attributeValues, setAttributeValues] = useState<
		Record<string, string>
	>({});
	/** Set once the user tries to move on, so "required" errors stay unobtrusive. */
	const [showErrors, setShowErrors] = useState(false);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [images, setImages] = useState<File[]>([]);
	const [imagePreviews, setImagePreviews] = useState<string[]>([]);
	const [coordinates, setCoordinates] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [duration, setDuration] = useState("30");
	const [formData, setFormData] = useState({
		title: "",
		description: "",
		price: "",
		location: "",
		condition: "" as ListingCondition | "",
	});

	/**
	 * Set the moment the seller opens the category modal themselves. From then on
	 * the title no longer moves the category.
	 */
	const categoryChosenRef = useRef(false);
	const [categoryWasGuessed, setCategoryWasGuessed] = useState(false);

	const suggestFromTitle = useMemo(
		() => createCategorySuggester(categories),
		[categories],
	);

	const categoryPreset = resolveFormPreset(selectedCategory);
	const isProduct = isProductCategory(selectedCategory);

	const categoryLabels = useMemo(
		() => ({
			placeholder: t("chooseCategory"),
			title: t("chooseCategory"),
			description: isProduct ? t("categoryDesc") : t("categoryDescGeneric"),
			search: t("searchCategories"),
			empty: t("noCategoriesFound"),
			clear: t("clearCategory"),
		}),
		[t, isProduct],
	);
	const priceField = categoryPreset.fields.price;
	const conditionField = categoryPreset.fields.condition;
	const photosField = categoryPreset.fields.photos;
	// A category may rename the price, e.g. "Loyer mensuel" for a rental. The
	// currency stays attached either way.
	const priceLabel = priceField.label
		? `${priceField.label} (${LISTING_CURRENCY})`
		: tListing("priceXaf");

	const attributeIssues = useMemo(
		() => collectAttributeIssues(attributes, attributeValues),
		[attributes, attributeValues],
	);
	const missingCoreFields = collectCoreFieldIssues(categoryPreset, {
		price: formData.price,
		condition: formData.condition,
		photoCount: images.length,
	});

	const titleCopy = titlePlaceholderCopy(categoryPreset.categoryType);

	// The photo step is part of the form only when the category asks for
	// pictures, so a job offer never walks through a step it has no use for.
	// Steps are addressed by id rather than by index because the list changes
	// length with the category.
	const STEPS: { id: StepId; label: string; description: string }[] = [
		{
			id: "describe",
			label: t("describe"),
			description: t("describeDesc"),
		},
		// Only categories that ask something get the step; the rest never see it.
		...(attributes.length > 0
			? [
					{
						id: "attributes" as const,
						label: t("characteristics"),
						description: t("characteristicsDesc"),
					},
				]
			: []),
		{
			id: "details",
			label: t("details"),
			description: isProduct ? t("detailsDesc") : t("detailsDescGeneric"),
		},
		...(photosField.enabled
			? [
					{
						id: "photos" as const,
						label: t("photos"),
						description: t("photosDesc"),
					},
				]
			: []),
		{ id: "review", label: t("review"), description: t("reviewDesc") },
	];
	const currentStep = STEPS[Math.min(step, STEPS.length - 1)];
	const photosRequiredMessage = translateOr(
		tListing,
		"photosRequired",
		"Ajoutez au moins une photo.",
	);

	/**
	 * Applies a category the seller picked themselves. From here on the title no
	 * longer moves it: a guess may replace a guess, never an answer.
	 */
	function handleCategoryChange(categoryId: string) {
		const category = categories.find((c) => c.id === categoryId) || null;
		categoryChosenRef.current = true;
		setCategoryWasGuessed(false);
		applyCategory(category);
	}

	/**
	 * The title the seller last rejected a guess for.
	 *
	 * Clearing the category has to survive the very next render, or the effect
	 * below would put the same suggestion straight back and the cross would look
	 * broken. Rejecting a guess means "not for this title" — editing the title at
	 * all is what asks for another one.
	 */
	const dismissedTitleRef = useRef<string | null>(null);

	function handleCategoryClear() {
		// Back to guessing: clearing is how a seller asks the title to decide
		// again, so it must undo their earlier trip to the modal as well.
		categoryChosenRef.current = false;
		dismissedTitleRef.current = formData.title;
		setCategoryWasGuessed(false);
		applyCategory(null);
	}

	// Emptying the title is starting the ad over. The category was chosen for a
	// subject that no longer exists, so it goes with it — and the next title may
	// suggest freely, even if the last one was answered by hand.
	// biome-ignore lint/correctness/useExhaustiveDependencies: applyCategory is
	// redeclared every render; this depends on the title and the selection only.
	useEffect(() => {
		if (formData.title.trim() !== "") return;
		categoryChosenRef.current = false;
		dismissedTitleRef.current = null;
		if (selectedCategory) applyCategory(null);
	}, [formData.title, selectedCategory, applyCategory]);

	// Guess the category from the title, the way leboncoin does. Only ever
	// replaces another guess: once the seller has opened the modal themselves,
	// `categoryChosenRef` is set and the title stops moving the category.
	//
	// A guess only ever describes the title it was made from. Rewrite the title
	// into something the corpus does not recognise and the guess goes with it,
	// rather than sitting in the field looking like a deliberate answer — which
	// is exactly how a seller ends up publishing a fridge under Cars.
	// biome-ignore lint/correctness/useExhaustiveDependencies: applyCategory is
	// redeclared every render; the guess depends on the title and the list only.
	useEffect(() => {
		if (categoryChosenRef.current || categories.length === 0) return;
		if (dismissedTitleRef.current === formData.title) return;

		const match = suggestFromTitle(formData.title);
		const nextId = match ? match.category.id : null;
		const currentId = selectedCategory?.id ?? null;
		if (nextId === currentId) return;

		setCategoryWasGuessed(match != null);
		applyCategory(match ? match.category : null);
	}, [
		formData.title,
		selectedCategory,
		categories,
		suggestFromTitle,
		applyCategory,
	]);

	function applyCategory(category: Category | null) {
		// Re-picking the category already selected would wipe the attributes
		// answered under it, which is not what clicking it again asks for.
		// `null` always goes through: that is the cross, asking to clear.
		if (category && selectedCategory?.id === category.id) return;
		setSelectedCategory(category);
		setAttributes(resolveCategoryAttributes(category));
		setAttributeValues({});
		setShowErrors(false);
		const nextPreset = resolveFormPreset(category);
		setFormData((prev) => ({
			...prev,
			// Drop values for fields this category does not show, so a hidden
			// field can never be submitted or block submission.
			price: nextPreset.fields.price.enabled ? prev.price : "",
			condition: nextPreset.fields.condition.enabled ? prev.condition : "",
		}));
		// Same rule for pictures: the step disappears with the category, so keeping
		// the files would attach images the seller can no longer see or remove.
		// Nothing is lost that is not still on their disk.
		if (!nextPreset.fields.photos.enabled) {
			setImages([]);
			setImagePreviews([]);
		}
	}

	function handleAddImages(files: File[]) {
		setImages((prev) => [...prev, ...files]);
		for (const file of files) {
			setImagePreviews((prev) => [...prev, URL.createObjectURL(file)]);
		}
	}

	function handleRemoveImage(index: number) {
		setImages((prev) => prev.filter((_, i) => i !== index));
		setImagePreviews((prev) => prev.filter((_, i) => i !== index));
	}

	function canProceed(): boolean {
		switch (currentStep.id) {
			case "describe":
				return !!(formData.title && formData.description && selectedCategory);
			case "attributes":
				return attributeIssues.length === 0;
			case "details":
				return !!(
					formData.title &&
					formData.location &&
					formData.description &&
					selectedCategory &&
					// The photo issue belongs to the photo step, not to this one.
					missingCoreFields.filter((field) => field !== "photos").length === 0
				);
			case "photos":
				// Only the categories that ask for a picture insist on one.
				return !missingCoreFields.includes("photos");
			case "review":
				return true;
			default:
				return false;
		}
	}

	function handleNext() {
		if (!canProceed()) {
			setShowErrors(true);
			return;
		}
		setShowErrors(false);
		setStep((s) => s + 1);
	}

	async function handleSubmit(status: "published" | "draft" = "published") {
		if (!selectedCategory) return;
		// The details step may have been left before an attribute was filled in
		// (e.g. via the stepper), so re-check everything before sending.
		if (
			missingCoreFields.length > 0 ||
			attributeIssues.length > 0 ||
			!formData.title ||
			!formData.location ||
			!formData.description
		) {
			setShowErrors(true);
			// Send the seller to the step that carries the problem: a missing photo
			// cannot be fixed on the details step.
			const blockingStep: StepId =
				missingCoreFields.length === 1 && missingCoreFields[0] === "photos"
					? "photos"
					: !formData.title || !formData.description
						? "describe"
						: attributeIssues.length > 0
							? "attributes"
							: "details";
			const index = STEPS.findIndex((s) => s.id === blockingStep);
			setStep(index === -1 ? 1 : index);
			return;
		}
		setIsLoading(true);

		try {
			const imageIds: string[] = [];
			for (const image of images) {
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
					imageIds.push(data.doc?.id ?? data.id);
				}
			}

			const listingData: Record<string, unknown> = {
				title: formData.title,
				description: formData.description,
				location: formData.location,
				category: selectedCategory.id,
				attributes: pruneAttributeValues(attributes, attributeValues),
				images: imageIds.map((id) => ({ image: id })),
				status: status,
				duration: Number(duration),
				tags: selectedTags,
			};
			if (priceField.enabled && formData.price) {
				listingData.price = Number(formData.price);
			}
			if (conditionField.enabled && formData.condition) {
				listingData.condition = formData.condition;
			}

			if (coordinates) {
				listingData.coordinates = coordinates;
			}

			const res = await fetch("/api/listings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(listingData),
				credentials: "include",
			});

			if (!res.ok) throw new Error(tListing("failedToCreate"));
			const listing = await res.json();
			router.push(`/listing/${listing.doc?.id || listing.id}`);
		} catch {
			alert(tListing("failedToCreate"));
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="space-y-6">
			{/* Stepper */}
			<div className="flex items-center justify-between">
				{STEPS.map((s, i) => (
					<div key={s.label} className="flex items-center">
						<div className="flex flex-col items-center">
							<div
								className={`flex h-9 w-9 items-center justify-center rounded-full border-2 font-medium text-sm transition-colors ${
									i < step
										? "border-primary bg-primary text-primary-foreground"
										: i === step
											? "border-primary text-primary"
											: "border-muted text-muted-foreground"
								}`}
							>
								{i < step ? <Check className="h-4 w-4" /> : i + 1}
							</div>
							<span
								className={`mt-1 hidden text-xs sm:block ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}
							>
								{s.label}
							</span>
						</div>
						{i < STEPS.length - 1 && (
							<div
								className={`mx-2 h-0.5 w-8 sm:w-16 ${i < step ? "bg-primary" : "bg-muted"}`}
							/>
						)}
					</div>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{currentStep.label}</CardTitle>
					<CardDescription>{currentStep.description}</CardDescription>
				</CardHeader>
				<CardContent>
					{/* Describe */}
					{currentStep.id === "describe" && (
						<div className="space-y-5">
							<div className="space-y-2">
								<Label htmlFor="title">{tListing("title")}</Label>
								<Input
									id="title"
									placeholder={translateOr(
										tListing,
										titleCopy.key,
										titleCopy.fallback,
									)}
									value={formData.title}
									onChange={(e) =>
										setFormData((p) => ({ ...p, title: e.target.value }))
									}
									required
									autoFocus
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">
									{tListing("itemDescription")}
								</Label>
								<Textarea
									id="description"
									placeholder={
										isProduct
											? tListing("describeYourItem")
											: tListing("describeYourListing")
									}
									rows={5}
									value={formData.description}
									onChange={(e) =>
										setFormData((p) => ({
											...p,
											description: e.target.value,
										}))
									}
									required
								/>
							</div>

							<div className="space-y-2">
								<Label>
									{t("category")}
									<span className="text-destructive"> *</span>
								</Label>
								<CategoryDialogField
									categories={categories}
									value={selectedCategory}
									onChange={handleCategoryChange}
									onClear={handleCategoryClear}
									// Saying the category was guessed is what makes it safe to
									// fill in: a wrong guess reads as a wrong guess, not as
									// something the seller chose and can stop reading.
									hint={
										selectedCategory && categoryWasGuessed
											? t("categoryGuessedFromTitle")
											: null
									}
									labels={categoryLabels}
								/>
							</div>
						</div>
					)}

					{/* Details — the category is not repeated here: it is chosen on the
					    previous step and a second copy of the same field only added a
					    row to scroll past. */}
					{currentStep.id === "details" && (
						<div className="space-y-5">
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
									<Label htmlFor="location">{tListing("localisation")}</Label>
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
										{tListing("conditionLabel")}
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
											<SelectValue placeholder={tListing("selectCondition")} />
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
												tListing,
												"attributeRequired",
												"Ce champ est obligatoire.",
											)}
										</p>
									)}
								</div>
							)}

							<div className="space-y-2">
								<Label>{translateOr(tListing, "tags", "Tags")}</Label>
								<TagPicker
									selectedIds={selectedTags}
									onChange={setSelectedTags}
								/>
							</div>

							<div className="space-y-2">
								<Label>{tListing("listingDuration")}</Label>
								<Select value={duration} onValueChange={setDuration}>
									<SelectTrigger>
										<SelectValue placeholder={tListing("selectDuration")} />
									</SelectTrigger>
									<SelectContent>
										{DURATIONS.map((value) => (
											<SelectItem key={value} value={value}>
												{`${value} ${tCommon("days")}`}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-muted-foreground text-xs">
									{translateOr(
										tListing,
										"durationHint",
										"Durée de visibilité de votre annonce avant expiration.",
									)}
								</p>
							</div>
						</div>
					)}

					{/* Characteristics */}
					{currentStep.id === "attributes" && (
						<CategoryAttributeFields
							attributes={attributes}
							values={attributeValues}
							onChange={(slug, v) =>
								setAttributeValues((p) => ({ ...p, [slug]: v }))
							}
							showRequiredErrors={showErrors}
						/>
					)}

					{/* Images */}
					{currentStep.id === "photos" && (
						<div className="space-y-2">
							<ImagePicker
								previews={imagePreviews}
								onAdd={handleAddImages}
								onRemove={handleRemoveImage}
								max={MAX_LISTING_IMAGES}
							/>
							{photosField.required && (
								<p
									className={
										showErrors && missingCoreFields.includes("photos")
											? "text-destructive text-xs"
											: "text-muted-foreground text-xs"
									}
								>
									{photosRequiredMessage}
								</p>
							)}
						</div>
					)}

					{/* Review */}
					{currentStep.id === "review" && (
						<div className="space-y-4">
							<div className="space-y-3 rounded-lg border p-4">
								<div className="flex items-center justify-between">
									<h3 className="font-semibold text-lg">{formData.title}</h3>
									{priceField.enabled && (
										<span className="font-bold text-lg text-primary">
											{formatListingPrice(Number(formData.price)) &&
											formData.price
												? `${formatListingPrice(Number(formData.price))} ${LISTING_CURRENCY}`
												: tListing("noPrice")}
										</span>
									)}
								</div>
								<div className="flex flex-wrap gap-2">
									<Badge variant="secondary">{selectedCategory?.name}</Badge>
									{conditionField.enabled && formData.condition && (
										<Badge variant="outline">
											{CONDITIONS.find((c) => c.value === formData.condition)
												?.label || formData.condition}
										</Badge>
									)}
									<Badge variant="outline">{formData.location}</Badge>
									<Badge variant="outline">{`${duration} ${tCommon("days")}`}</Badge>
								</div>
								<p className="whitespace-pre-wrap text-muted-foreground text-sm">
									{formData.description}
								</p>

								{attributes.some(
									(attribute) => attributeValues[attribute.slug],
								) && (
									<>
										<Separator />
										<dl className="grid grid-cols-2 gap-2 text-sm">
											{attributes.map((attribute) => {
												const display = formatAttributeValue(
													attribute,
													attributeValues[attribute.slug],
													{ yes: tListing("yes"), no: tListing("no") },
												);
												if (!display) return null;
												return (
													<div key={attribute.slug}>
														<dt className="text-muted-foreground">
															{attribute.name}
														</dt>
														<dd className="font-medium">{display}</dd>
													</div>
												);
											})}
										</dl>
									</>
								)}

								{imagePreviews.length > 0 && (
									<>
										<Separator />
										<div className="flex gap-2 overflow-x-auto">
											{imagePreviews.map((preview, i) => (
												// biome-ignore lint/performance/noImgElement: blob preview URL, not optimizable by next/image
												<img
													key={preview}
													src={preview}
													alt={`${tListing("photos")} ${i + 1}`}
													className="h-20 w-20 flex-shrink-0 rounded-md object-cover"
												/>
											))}
										</div>
									</>
								)}
							</div>

							{photosField.enabled && imagePreviews.length === 0 && (
								<p className="text-muted-foreground text-sm">
									{t("noImagesAdded")}
								</p>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Navigation */}
			<div className="flex justify-between">
				<Button
					type="button"
					variant="outline"
					onClick={() => setStep((s) => s - 1)}
					disabled={step === 0}
				>
					<ArrowLeft className="mr-2 h-4 w-4" />
					{tCommon("back")}
				</Button>

				{step < STEPS.length - 1 ? (
					<Button
						type="button"
						onClick={handleNext}
						disabled={currentStep.id === "describe" && !selectedCategory}
					>
						{tCommon("next")}
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				) : (
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleSubmit("draft")}
							disabled={isLoading}
						>
							{t("saveAsDraft")}
						</Button>
						<Button
							type="button"
							onClick={() => handleSubmit("published")}
							disabled={isLoading}
						>
							{isLoading ? (
								<>
									<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
									{t("submitting")}
								</>
							) : (
								t("submitForReviewBtn")
							)}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
