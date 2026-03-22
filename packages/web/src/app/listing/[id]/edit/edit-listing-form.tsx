"use client";

import { LoaderCircle, Save, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategoryDropdown } from "~/components/category-picker";
import { AttributeFields } from "~/components/listing/attribute-fields";
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
import { cn } from "~/lib/utils";
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

	type UserStatus = "draft" | "pending";

	function getDefaultStatus(status: string): UserStatus {
		if (status === "draft") return "draft";
		return "pending";
	}

	const [nextStatus, setNextStatus] = useState<UserStatus>(() =>
		getDefaultStatus(listing.status),
	);

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

	const initialTagIds: string[] = Array.isArray((listing as any).tags)
		? (listing as any).tags.map((t: any) =>
				typeof t === "object" && t !== null ? String(t.id) : String(t),
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

			const updateData: Record<string, unknown> = {
				title: formData.title,
				description: formData.description,
				price: Number(formData.price),
				location: formData.location,
				category: selectedCategory.id,
				condition: formData.condition || undefined,
				attributes: attributeValues,
				images: allImageIds.map((id) => ({ image: id })),
				status: nextStatus,
				tags: selectedTagIds,
			};

			if (coordinates) {
				updateData.coordinates = coordinates;
			}

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
					<CategoryDropdown
						categories={categories}
						value={selectedCategory ? String(selectedCategory.id) : undefined}
						onChange={handleCategoryChange}
						placeholder="Select a category"
					/>
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
							<Label htmlFor="location">Localisation</Label>
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
						<Label>Tags</Label>
						<TagPicker
							selectedIds={selectedTagIds}
							onChange={setSelectedTagIds}
						/>
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
					<CardTitle>Publication</CardTitle>
					<CardDescription>
						Gérez la visibilité de votre annonce
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Current status */}
					<div className="flex items-center gap-2 text-sm">
						<span className="text-muted-foreground">Statut actuel :</span>
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
							{listing.status === "draft" && "Brouillon"}
							{listing.status === "pending" && "En attente de révision"}
							{listing.status === "published" && "Publié"}
							{listing.status === "rejected" && "Rejeté"}
							{listing.status === "sold" && "Vendu"}
							{listing.status === "expired" && "Expiré"}
							{listing.status === "deleted" && "Supprimé"}
						</Badge>
					</div>

					{/* Published notice */}
					{listing.status === "published" && (
						<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
							⚠️ Modifier cette annonce la soumettra à nouveau pour révision.
						</div>
					)}

					{/* Rejection reason */}
					{listing.status === "rejected" && (
						<div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 text-sm">
							<p className="font-medium">Votre annonce a été rejetée.</p>
							{(listing as any).rejectionReason && (
								<p>Raison : {(listing as any).rejectionReason}</p>
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
								<span className="font-semibold text-sm">Brouillon</span>
							</div>
							<p className="pl-6 text-muted-foreground text-xs">
								Non visible par les acheteurs
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
									Soumettre pour révision
								</span>
							</div>
							<p className="pl-6 text-muted-foreground text-xs">
								Sera examiné par notre équipe sous 24h
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
					Cancel
				</Button>
				<Button onClick={handleSave} disabled={isSaving || !canSave}>
					{isSaving ? (
						<>
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
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
