"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AttributeFields } from "~/components/listing/attribute-fields";
import { ImagePicker } from "~/components/listing/image-picker";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import type { Category, CategoryAttribute, ListingCondition } from "~/types";

const STEPS = [
	{ label: "Category", description: "What are you selling?" },
	{ label: "Details", description: "Describe your item" },
	{ label: "Photos", description: "Add images" },
	{ label: "Review", description: "Confirm and publish" },
];

const CONDITIONS: { value: ListingCondition; label: string }[] = [
	{ value: "new", label: "New" },
	{ value: "like_new", label: "Like New" },
	{ value: "good", label: "Good" },
	{ value: "fair", label: "Fair" },
	{ value: "poor", label: "Poor" },
];

export function CreateListingForm({
	categories,
}: {
	categories: Category[];
}) {
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [isLoading, setIsLoading] = useState(false);

	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		null,
	);
	const [attributes, setAttributes] = useState<CategoryAttribute[]>([]);
	const [attributeValues, setAttributeValues] = useState<
		Record<string, string>
	>({});
	const [images, setImages] = useState<File[]>([]);
	const [imagePreviews, setImagePreviews] = useState<string[]>([]);
	const [formData, setFormData] = useState({
		title: "",
		description: "",
		price: "",
		location: "",
		condition: "" as ListingCondition | "",
	});

	function handleCategoryChange(categoryId: string) {
		const category = categories.find((c) => c.id === Number(categoryId));
		setSelectedCategory(category || null);
		setAttributes(category?.attributes || []);
		setAttributeValues({});
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
		switch (step) {
			case 0:
				return !!selectedCategory;
			case 1:
				return !!(
					formData.title &&
					formData.price &&
					formData.location &&
					formData.description
				);
			case 2:
				return true; // images are optional
			case 3:
				return true;
			default:
				return false;
		}
	}

	async function handleSubmit(status: "published" | "draft" = "published") {
		if (!selectedCategory) return;
		setIsLoading(true);

		try {
			const imageIds: number[] = [];
			for (const image of images) {
				const fd = new FormData();
				fd.append("file", image);
				fd.append("_payload", JSON.stringify({ alt: image.name.replace(/\.[^.]+$/, "") || "listing image" }));
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

			const listingData = {
				title: formData.title,
				description: formData.description,
				price: Number(formData.price),
				location: formData.location,
				category: selectedCategory.id,
				condition: formData.condition || undefined,
				attributes: attributeValues,
				images: imageIds.map((id) => ({ image: id })),
				status: status,
			};

			const res = await fetch("/api/listings", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(listingData),
				credentials: "include",
			});

			if (!res.ok) throw new Error("Failed to create listing");
			const listing = await res.json();
			router.push(`/listing/${listing.doc?.id || listing.id}`);
		} catch {
			alert("Failed to create listing. Please try again.");
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
								className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
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
					<CardTitle>{STEPS[step].label}</CardTitle>
					<CardDescription>{STEPS[step].description}</CardDescription>
				</CardHeader>
				<CardContent>
					{/* Step 0: Category */}
					{step === 0 && (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
							{categories.map((cat) => (
								<button
									key={cat.id}
									type="button"
									onClick={() => handleCategoryChange(String(cat.id))}
									className={`rounded-lg border-2 p-4 text-left transition-colors hover:bg-accent ${
										selectedCategory?.id === cat.id
											? "border-primary bg-primary/5"
											: "border-transparent bg-muted/50"
									}`}
								>
									<p className="font-medium">{cat.name}</p>
									{cat.description && (
										<p className="mt-1 text-xs text-muted-foreground line-clamp-2">
											{cat.description}
										</p>
									)}
								</button>
							))}
						</div>
					)}

					{/* Step 1: Details */}
					{step === 1 && (
						<div className="space-y-5">
							<div className="space-y-2">
								<Label htmlFor="title">Title</Label>
								<Input
									id="title"
									placeholder="What are you selling?"
									value={formData.title}
									onChange={(e) =>
										setFormData((p) => ({ ...p, title: e.target.value }))
									}
									required
								/>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="price">Price (XAF)</Label>
									<Input
										id="price"
										type="number"
										placeholder="0"
										min="0"
										value={formData.price}
										onChange={(e) =>
											setFormData((p) => ({ ...p, price: e.target.value }))
										}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="location">Location</Label>
									<Input
										id="location"
										placeholder="City or region"
										value={formData.location}
										onChange={(e) =>
											setFormData((p) => ({ ...p, location: e.target.value }))
										}
										required
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label>Condition</Label>
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
										<SelectValue placeholder="Select condition" />
									</SelectTrigger>
									<SelectContent>
										{CONDITIONS.map((c) => (
											<SelectItem key={c.value} value={c.value}>
												{c.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">Description</Label>
								<Textarea
									id="description"
									placeholder="Describe your item in detail..."
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

							{attributes.length > 0 && (
								<>
									<Separator />
									<AttributeFields
										attributes={attributes}
										values={attributeValues}
										onChange={(slug, v) =>
											setAttributeValues((p) => ({ ...p, [slug]: v }))
										}
										categoryName={selectedCategory?.name}
									/>
								</>
							)}
						</div>
					)}

					{/* Step 2: Images */}
					{step === 2 && (
						<ImagePicker
							previews={imagePreviews}
							onAdd={handleAddImages}
							onRemove={handleRemoveImage}
						/>
					)}

					{/* Step 3: Review */}
					{step === 3 && (
						<div className="space-y-4">
							<div className="rounded-lg border p-4 space-y-3">
								<div className="flex items-center justify-between">
									<h3 className="text-lg font-semibold">{formData.title}</h3>
									<span className="text-lg font-bold text-primary">
										{Number(formData.price).toLocaleString()} XAF
									</span>
								</div>
								<div className="flex flex-wrap gap-2">
									<Badge variant="secondary">
										{selectedCategory?.name}
									</Badge>
									{formData.condition && (
										<Badge variant="outline">
											{CONDITIONS.find((c) => c.value === formData.condition)
												?.label || formData.condition}
										</Badge>
									)}
									<Badge variant="outline">{formData.location}</Badge>
								</div>
								<p className="text-sm text-muted-foreground whitespace-pre-wrap">
									{formData.description}
								</p>

								{Object.keys(attributeValues).length > 0 && (
									<>
										<Separator />
										<dl className="grid grid-cols-2 gap-2 text-sm">
											{Object.entries(attributeValues).map(([key, value]) => {
												const attr = attributes.find((a) => a.slug === key);
												return (
													<div key={key}>
														<dt className="text-muted-foreground">
															{attr?.name || key}
														</dt>
														<dd className="font-medium">{value}</dd>
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
												<img
													key={i}
													src={preview}
													alt={`Preview ${i + 1}`}
													className="h-20 w-20 rounded-md object-cover flex-shrink-0"
												/>
											))}
										</div>
									</>
								)}
							</div>

							{imagePreviews.length === 0 && (
								<p className="text-sm text-muted-foreground">
									No images added. You can go back to add some.
								</p>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Navigation */}
			<div className="flex justify-between">
				<Button
					variant="outline"
					onClick={() => setStep((s) => s - 1)}
					disabled={step === 0}
				>
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back
				</Button>

				{step < STEPS.length - 1 ? (
					<Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
						Next
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				) : (
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => handleSubmit("draft")}
							disabled={isLoading || !canProceed()}
						>
							Save as draft
						</Button>
						<Button
							onClick={() => handleSubmit("published")}
							disabled={isLoading || !canProceed()}
						>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Publishing...
								</>
							) : (
								"Publish Listing"
							)}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
