"use client";

import { Loader2, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
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
import type {
	Category,
	CategoryAttribute,
	Listing,
	ListingCondition,
	Media,
} from "~/types";

const CONDITIONS: { value: ListingCondition; label: string }[] = [
	{ value: "new", label: "New" },
	{ value: "like_new", label: "Like New" },
	{ value: "good", label: "Good" },
	{ value: "fair", label: "Fair" },
	{ value: "poor", label: "Poor" },
];

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
	const router = useRouter();
	const [isSaving, setIsSaving] = useState(false);

	const currentCategoryId =
		typeof listing.category === "object"
			? listing.category.id
			: listing.category;
	const currentCategory =
		categories.find((c) => c.id === currentCategoryId) || null;

	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		currentCategory,
	);
	const [attributes, setAttributes] = useState<CategoryAttribute[]>(
		currentCategory?.attributes || [],
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

	const [keptImages, setKeptImages] = useState<ExistingImage[]>(existingImages);
	const [newImages, setNewImages] = useState<File[]>([]);
	const [newPreviews, setNewPreviews] = useState<string[]>([]);

	const [formData, setFormData] = useState({
		title: listing.title,
		description: listing.description,
		price: String(listing.price),
		location: listing.location,
		condition: (listing.condition || "") as ListingCondition | "",
	});

	function handleCategoryChange(categoryId: string) {
		const category = categories.find((c) => c.id === categoryId);
		setSelectedCategory(category || null);
		setAttributes(category?.attributes || []);
		setAttributeValues({});
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

	async function handleSave() {
		if (!selectedCategory || !formData.title || !formData.price) return;
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

			const updateData = {
				title: formData.title,
				description: formData.description,
				price: Number(formData.price),
				location: formData.location,
				category: selectedCategory.id,
				condition: formData.condition || undefined,
				attributes: attributeValues,
				images: allImageIds.map((id) => ({ image: id })),
			};

			const res = await fetch(`/api/listings/${listing.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updateData),
				credentials: "include",
			});

			if (!res.ok) throw new Error("Failed to update listing");
			router.push(`/listing/${listing.id}`);
			router.refresh();
		} catch {
			alert("Failed to update listing. Please try again.");
		} finally {
			setIsSaving(false);
		}
	}

	const canSave = !!(
		formData.title &&
		formData.price &&
		formData.location &&
		formData.description &&
		selectedCategory
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-2xl">Edit Listing</h1>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.push(`/listing/${listing.id}`)}
				>
					<X className="mr-2 h-4 w-4" />
					Cancel
				</Button>
			</div>

			{/* Category */}
			<Card>
				<CardHeader>
					<CardTitle>Category</CardTitle>
					<CardDescription>What type of item is this?</CardDescription>
				</CardHeader>
				<CardContent>
					<Select
						value={selectedCategory ? String(selectedCategory.id) : ""}
						onValueChange={handleCategoryChange}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a category" />
						</SelectTrigger>
						<SelectContent>
							{categories.map((cat) => (
								<SelectItem key={cat.id} value={String(cat.id)}>
									{cat.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			{/* Details */}
			<Card>
				<CardHeader>
					<CardTitle>Details</CardTitle>
					<CardDescription>Basic information about your item</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
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
								setFormData((p) => ({ ...p, description: e.target.value }))
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
				</CardContent>
			</Card>

			{/* Photos */}
			<Card>
				<CardHeader>
					<CardTitle>Photos</CardTitle>
					<CardDescription>
						{keptImages.length + newImages.length} image(s) total
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Existing images */}
					{keptImages.length > 0 && (
						<div>
							<Label className="mb-2 block">Current images</Label>
							<div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
								{keptImages.map((img, index) => (
									<div key={img.id} className="relative aspect-square">
										<Image
											src={img.url}
											alt={`Image ${index + 1}`}
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
						<Label className="mb-2 block">Add new images</Label>
						<ImagePicker
							previews={newPreviews}
							onAdd={handleAddNewImages}
							onRemove={handleRemoveNewImage}
							max={10 - keptImages.length}
						/>
					</div>
				</CardContent>
			</Card>

			{/* Status */}
			<Card>
				<CardHeader>
					<CardTitle>Status</CardTitle>
				</CardHeader>
				<CardContent>
					<Badge
						variant={listing.status === "published" ? "default" : "secondary"}
					>
						{listing.status}
					</Badge>
				</CardContent>
			</Card>

			{/* Save */}
			<div className="flex justify-end gap-3">
				<Button
					variant="outline"
					onClick={() => router.push(`/listing/${listing.id}`)}
				>
					Cancel
				</Button>
				<Button onClick={handleSave} disabled={isSaving || !canSave}>
					{isSaving ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Saving...
						</>
					) : (
						<>
							<Save className="mr-2 h-4 w-4" />
							Save Changes
						</>
					)}
				</Button>
			</div>
		</div>
	);
}
