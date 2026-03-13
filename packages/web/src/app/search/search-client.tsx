"use client";

import {
	Bookmark,
	Check,
	MapPin,
	Search,
	SlidersHorizontal,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ListingGrid } from "~/components/listing/listing-card";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { saveSearch } from "~/lib/actions";
import type { Category, CategoryAttribute, Listing } from "~/types";

interface SearchClientProps {
	categories: Category[];
	initialListings: Listing[];
	initialTotal: number;
	initialParams: Record<string, string>;
	favoriteIds?: string[];
}

export function SearchClient({
	categories,
	initialListings,
	initialTotal,
	initialParams,
	favoriteIds = [],
}: SearchClientProps) {
	const router = useRouter();

	const [listings, setListings] = useState(initialListings);
	const [total, setTotal] = useState(initialTotal);
	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		null,
	);
	const [attributes, setAttributes] = useState<CategoryAttribute[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showMobileFilters, setShowMobileFilters] = useState(false);

	const [nearMe, setNearMe] = useState(false);
	const [geoCoords, setGeoCoords] = useState<{
		lat: number;
		lng: number;
	} | null>(null);
	const [geoRadius, setGeoRadius] = useState(initialParams.radius || "50");
	const [geoLoading, setGeoLoading] = useState(false);

	const [filters, setFilters] = useState({
		q: initialParams.q || "",
		category: initialParams.category || "",
		minPrice: initialParams.minPrice || "",
		maxPrice: initialParams.maxPrice || "",
		location: initialParams.location || "",
		sort: initialParams.sort || "newest",
		condition: initialParams.condition || "",
	});

	const [attributeFilters, setAttributeFilters] = useState<
		Record<string, string>
	>({});

	const [shouldFetch, setShouldFetch] = useState(false);
	const [page, setPage] = useState(1);
	const LIMIT = 20;

	const [saveDialogOpen, setSaveDialogOpen] = useState(false);
	const [saveName, setSaveName] = useState("");
	const [saveStatus, setSaveStatus] = useState<
		"idle" | "saving" | "saved" | "error"
	>("idle");
	const [saveError, setSaveError] = useState("");

	function buildSearchUrl() {
		const params = new URLSearchParams();
		if (filters.q) params.set("q", filters.q);
		if (filters.category) params.set("category", filters.category);
		if (filters.minPrice) params.set("minPrice", filters.minPrice);
		if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
		if (filters.location) params.set("location", filters.location);
		if (filters.sort && filters.sort !== "newest")
			params.set("sort", filters.sort);
		if (filters.condition) params.set("condition", filters.condition);
		for (const [key, value] of Object.entries(attributeFilters)) {
			if (value) params.set(`attr_${key}`, value);
		}
		const qs = params.toString();
		return qs ? `/search?${qs}` : "/search";
	}

	async function handleSaveSearch() {
		setSaveStatus("saving");
		setSaveError("");
		const result = await saveSearch({
			name: saveName || filters.q || "My saved search",
			query: filters.q,
			filters: {
				category: filters.category,
				minPrice: filters.minPrice,
				maxPrice: filters.maxPrice,
				location: filters.location,
				sort: filters.sort,
				attributes: attributeFilters,
			},
			url: buildSearchUrl(),
		});
		if (result.success) {
			setSaveStatus("saved");
			setTimeout(() => {
				setSaveDialogOpen(false);
				setSaveStatus("idle");
				setSaveName("");
			}, 1500);
		} else {
			setSaveStatus("error");
			setSaveError(result.error);
		}
	}

	const fetchListings = useCallback(async () => {
		setIsLoading(true);
		try {
			const params = new URLSearchParams();
			if (filters.q) params.set("q", filters.q);
			if (filters.category) params.set("category", filters.category);
			if (filters.minPrice) params.set("minPrice", filters.minPrice);
			if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
			if (filters.location) params.set("location", filters.location);
			if (filters.sort) params.set("sort", filters.sort);
			if (filters.condition) params.set("condition", filters.condition);

			for (const [key, value] of Object.entries(attributeFilters)) {
				if (value) params.set(`attr_${key}`, value);
			}

			if (nearMe && geoCoords) {
				params.set("lat", String(geoCoords.lat));
				params.set("lng", String(geoCoords.lng));
				params.set("radius", geoRadius);
			}

			params.set("limit", String(LIMIT));
			params.set("offset", String((page - 1) * LIMIT));

			const res = await fetch(`/api/public/search?${params.toString()}`);
			const data = await res.json();
			if (page > 1) {
				setListings((prev) => [...prev, ...(data.hits || [])]);
			} else {
				setListings(data.hits || []);
			}
			setTotal(data.total || 0);
		} catch (error) {
			console.error("Failed to fetch listings:", error);
		} finally {
			setIsLoading(false);
		}
	}, [filters, attributeFilters, page, nearMe, geoCoords, geoRadius]);

	useEffect(() => {
		if (filters.category) {
			const cat = categories.find(
				(c) => String(c.id) === filters.category || c.slug === filters.category,
			);
			if (cat) {
				setSelectedCategory(cat);
				setAttributes(cat.attributes || []);
			}
		} else {
			setSelectedCategory(null);
			setAttributes([]);
		}
	}, [filters.category, categories]);

	useEffect(() => {
		if (!shouldFetch) return;
		const debounce = setTimeout(() => fetchListings(), 300);
		return () => clearTimeout(debounce);
	}, [fetchListings, shouldFetch]);

	function updateFilter(key: string, value: string) {
		setShouldFetch(true);
		setPage(1);
		setFilters((prev) => ({ ...prev, [key]: value }));
		const newParams = new URLSearchParams();
		const updated = { ...filters, [key]: value };
		for (const [k, v] of Object.entries(updated)) {
			if (v) newParams.set(k, v);
		}
		for (const [key, value] of Object.entries(attributeFilters)) {
			if (value) newParams.set(`attr_${key}`, value);
		}
		router.push(`/search?${newParams.toString()}`);
	}

	function updateAttributeFilter(key: string, value: string) {
		setShouldFetch(true);
		setPage(1);
		const newAttrs = { ...attributeFilters, [key]: value };
		setAttributeFilters(newAttrs);

		const newParams = new URLSearchParams();
		for (const [k, v] of Object.entries(filters)) {
			if (v) newParams.set(k, v);
		}
		for (const [k, v] of Object.entries(newAttrs)) {
			if (v) newParams.set(`attr_${k}`, v);
		}
		router.push(`/search?${newParams.toString()}`);
	}

	function handleNearMeToggle() {
		if (nearMe) {
			setNearMe(false);
			setGeoCoords(null);
			setShouldFetch(true);
			setPage(1);
			return;
		}
		if (!navigator.geolocation) {
			alert("Geolocation is not supported by your browser.");
			return;
		}
		setGeoLoading(true);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setGeoCoords({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				});
				setNearMe(true);
				setGeoLoading(false);
				setShouldFetch(true);
				setPage(1);
			},
			(error) => {
				console.error("Geolocation error:", error);
				alert("Could not get your location. Please check your permissions.");
				setGeoLoading(false);
			},
		);
	}

	function handleRadiusChange(value: string) {
		setGeoRadius(value);
		if (nearMe && geoCoords) {
			setShouldFetch(true);
			setPage(1);
		}
	}

	function clearFilters() {
		setShouldFetch(true);
		setPage(1);
		setNearMe(false);
		setGeoCoords(null);
		setFilters({
			q: "",
			category: "",
			minPrice: "",
			maxPrice: "",
			location: "",
			sort: "newest",
			condition: "",
		});
		setAttributeFilters({});
		router.push("/search");
	}

	function hasActiveFilters() {
		return (
			filters.q ||
			filters.category ||
			filters.minPrice ||
			filters.maxPrice ||
			filters.location ||
			filters.condition ||
			nearMe ||
			Object.values(attributeFilters).some(Boolean)
		);
	}

	const activeFilterCount = [
		filters.category,
		filters.minPrice,
		filters.maxPrice,
		filters.location,
		filters.condition,
		nearMe ? "nearMe" : "",
		...Object.values(attributeFilters),
	].filter(Boolean).length;

	const CONDITION_OPTIONS = [
		{ value: "new", label: "New" },
		{ value: "like_new", label: "Like New" },
		{ value: "good", label: "Good" },
		{ value: "fair", label: "Fair" },
		{ value: "poor", label: "Poor" },
	] as const;

	const selectedConditions = filters.condition
		? filters.condition.split(",").filter(Boolean)
		: [];

	function toggleCondition(value: string) {
		const current = new Set(selectedConditions);
		if (current.has(value)) {
			current.delete(value);
		} else {
			current.add(value);
		}
		updateFilter("condition", Array.from(current).join(","));
	}

	// Sidebar filter panel (reused for desktop sidebar + mobile drawer)
	const filterPanel = (
		<div className="space-y-5">
			{/* Category */}
			<div className="space-y-2">
				<Label className="font-semibold text-[#64748B] text-xs uppercase tracking-wider">
					Category
				</Label>
				<Select
					value={filters.category || "all"}
					onValueChange={(v) => updateFilter("category", v === "all" ? "" : v)}
				>
					<SelectTrigger className="h-9 rounded-lg text-sm">
						<SelectValue placeholder="All categories" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All categories</SelectItem>
						{categories.map((cat) => (
							<SelectItem key={cat.id} value={String(cat.id)}>
								{cat.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Price range */}
			<div className="space-y-2">
				<Label className="font-semibold text-[#64748B] text-xs uppercase tracking-wider">
					Price (XAF)
				</Label>
				<div className="flex gap-2">
					<Input
						type="number"
						placeholder="Min"
						className="h-9 rounded-lg text-sm"
						value={filters.minPrice}
						onChange={(e) => updateFilter("minPrice", e.target.value)}
					/>
					<span className="flex items-center text-[#94A3B8]">—</span>
					<Input
						type="number"
						placeholder="Max"
						className="h-9 rounded-lg text-sm"
						value={filters.maxPrice}
						onChange={(e) => updateFilter("maxPrice", e.target.value)}
					/>
				</div>
			</div>

			{/* Location */}
			<div className="space-y-2">
				<Label className="font-semibold text-[#64748B] text-xs uppercase tracking-wider">
					Location
				</Label>
				<Input
					placeholder="City or region"
					className="h-9 rounded-lg text-sm"
					value={filters.location}
					onChange={(e) => updateFilter("location", e.target.value)}
				/>
			</div>

			{/* Near me */}
			<div className="space-y-2">
				<Label className="font-semibold text-[#64748B] text-xs uppercase tracking-wider">
					Near me
				</Label>
				<button
					type="button"
					onClick={handleNearMeToggle}
					disabled={geoLoading}
					className={`flex h-9 w-full items-center justify-center gap-2 rounded-lg border font-medium text-sm transition-colors ${
						nearMe
							? "border-[#1E40AF] bg-[#1E40AF]/10 text-[#1E40AF]"
							: "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]"
					}`}
				>
					<MapPin className="h-4 w-4" />
					{geoLoading
						? "Locating..."
						: nearMe
							? "Near me (on)"
							: "Use my location"}
				</button>
				{nearMe && (
					<Select value={geoRadius} onValueChange={handleRadiusChange}>
						<SelectTrigger className="h-9 rounded-lg text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="5">5 km</SelectItem>
							<SelectItem value="10">10 km</SelectItem>
							<SelectItem value="25">25 km</SelectItem>
							<SelectItem value="50">50 km</SelectItem>
							<SelectItem value="100">100 km</SelectItem>
						</SelectContent>
					</Select>
				)}
			</div>

			{/* Condition */}
			<div className="space-y-2">
				<Label className="font-semibold text-[#64748B] text-xs uppercase tracking-wider">
					Condition
				</Label>
				<div className="space-y-1.5">
					{CONDITION_OPTIONS.map((opt) => (
						<label
							key={opt.value}
							className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-[#F8FAFC]"
						>
							<input
								type="checkbox"
								checked={selectedConditions.includes(opt.value)}
								onChange={() => toggleCondition(opt.value)}
								className="h-4 w-4 rounded border-[#D1D5DB] text-[#1E40AF] focus:ring-[#3B82F6]/20"
							/>
							<span className="text-[#334155]">{opt.label}</span>
						</label>
					))}
				</div>
			</div>

			{/* Dynamic attributes */}
			{attributes.length > 0 && (
				<div className="space-y-3 border-[#E2E8F0] border-t pt-4">
					<p className="font-semibold text-[#64748B] text-xs uppercase tracking-wider">
						{selectedCategory?.name}
					</p>
					{attributes.map((attr) => (
						<div key={attr.slug} className="space-y-1.5">
							<Label className="text-[#334155] text-sm">{attr.name}</Label>
							{attr.type === "select" && attr.options ? (
								<Select
									value={attributeFilters[attr.slug] || "any"}
									onValueChange={(v) =>
										updateAttributeFilter(attr.slug, v === "any" ? "" : v)
									}
								>
									<SelectTrigger className="h-9 rounded-lg text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">Any</SelectItem>
										{attr.options.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.value}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : attr.type === "boolean" ? (
								<Select
									value={attributeFilters[attr.slug] || "any"}
									onValueChange={(v) =>
										updateAttributeFilter(attr.slug, v === "any" ? "" : v)
									}
								>
									<SelectTrigger className="h-9 rounded-lg text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">Any</SelectItem>
										<SelectItem value="true">Yes</SelectItem>
										<SelectItem value="false">No</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<Input
									type={attr.type === "number" ? "number" : "text"}
									placeholder={attr.name}
									className="h-9 rounded-lg text-sm"
									value={attributeFilters[attr.slug] || ""}
									onChange={(e) =>
										updateAttributeFilter(attr.slug, e.target.value)
									}
								/>
							)}
						</div>
					))}
				</div>
			)}

			{/* Clear */}
			{hasActiveFilters() && (
				<button
					type="button"
					onClick={clearFilters}
					className="w-full text-center font-medium text-red-600 text-sm hover:underline"
				>
					Clear all filters
				</button>
			)}
		</div>
	);

	return (
		<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
			{/* Top bar: search + sort + mobile filter toggle */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
					<input
						type="search"
						placeholder="Search..."
						className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-[#0F172A] text-sm placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
						value={filters.q}
						onChange={(e) => updateFilter("q", e.target.value)}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Select
						value={filters.sort}
						onValueChange={(v) => updateFilter("sort", v)}
					>
						<SelectTrigger className="h-10 w-[160px] rounded-lg text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="newest">Newest</SelectItem>
							<SelectItem value="oldest">Oldest</SelectItem>
							<SelectItem value="price_asc">Price: Low to High</SelectItem>
							<SelectItem value="price_desc">Price: High to Low</SelectItem>
						</SelectContent>
					</Select>
					<button
						type="button"
						className="flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-[#475569] text-sm hover:bg-[#F8FAFC] lg:hidden"
						onClick={() => setShowMobileFilters(true)}
					>
						<SlidersHorizontal className="h-4 w-4" />
						Filters
						{activeFilterCount > 0 && (
							<span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1E40AF] font-bold text-[10px] text-white">
								{activeFilterCount}
							</span>
						)}
					</button>
				</div>
			</div>

			{/* Layout: sidebar + results */}
			<div className="flex gap-6">
				{/* Desktop sidebar (Leboncoin style) */}
				<aside className="hidden w-56 shrink-0 lg:block">
					<div className="sticky top-20 rounded-xl border border-[#E2E8F0] bg-white p-4">
						<h3 className="mb-4 font-bold text-[#0F172A] text-sm">Filters</h3>
						{filterPanel}
					</div>
				</aside>

				{/* Results */}
				<div className="min-w-0 flex-1">
					<div className="mb-4 flex items-center justify-between">
						<p className="text-[#64748B] text-sm">
							{isLoading ? (
								"Loading..."
							) : (
								<>
									<span className="font-semibold text-[#0F172A]">{total}</span>{" "}
									results
								</>
							)}
						</p>

						<Dialog
							open={saveDialogOpen}
							onOpenChange={(open) => {
								setSaveDialogOpen(open);
								if (open) {
									setSaveName(filters.q || "My saved search");
									setSaveStatus("idle");
									setSaveError("");
								}
							}}
						>
							<DialogTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 font-medium text-[#475569] text-sm transition-colors hover:bg-[#F8FAFC] hover:text-[#1E40AF]"
								>
									<Bookmark className="h-4 w-4" />
									Save search
								</button>
							</DialogTrigger>
							<DialogContent className="sm:max-w-md">
								<DialogHeader>
									<DialogTitle>Save this search</DialogTitle>
									<DialogDescription>
										Give your search a name so you can easily find it later.
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-3 py-2">
									<div className="space-y-1.5">
										<Label htmlFor="search-name" className="text-sm">
											Name
										</Label>
										<Input
											id="search-name"
											value={saveName}
											onChange={(e) => setSaveName(e.target.value)}
											placeholder="e.g. Cheap cars in Douala"
											className="h-9 rounded-lg"
										/>
									</div>
									{saveError && (
										<p className="text-red-600 text-sm">{saveError}</p>
									)}
								</div>
								<DialogFooter>
									<Button
										onClick={handleSaveSearch}
										disabled={saveStatus === "saving" || saveStatus === "saved"}
										className="rounded-lg bg-[#1E40AF] hover:bg-[#1E3A8A]"
									>
										{saveStatus === "saving" ? (
											"Saving..."
										) : saveStatus === "saved" ? (
											<>
												<Check className="mr-1.5 h-4 w-4" />
												Saved!
											</>
										) : (
											"Save search"
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>

					{isLoading ? (
						<div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
							{[...Array(8)].map((_, i) => (
								<div
									key={i}
									className="animate-pulse rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]"
									style={{ aspectRatio: "3/4" }}
								/>
							))}
						</div>
					) : listings.length > 0 ? (
						<>
							<ListingGrid
								listings={listings}
								favorites={favoriteIds}
								className="md:grid-cols-3 xl:grid-cols-4"
							/>
							{!isLoading && listings.length < total && (
								<div className="mt-6 text-center">
									<button
										type="button"
										onClick={() => {
											setShouldFetch(true);
											setPage((p) => p + 1);
										}}
										className="rounded-xl border border-[#E2E8F0] bg-white px-8 py-2.5 font-medium text-[#1E40AF] text-sm transition-colors hover:bg-[#F8FAFC]"
									>
										Load more ({listings.length} of {total})
									</button>
								</div>
							)}
						</>
					) : (
						<div className="py-20 text-center">
							<Search className="mx-auto mb-3 h-10 w-10 text-[#CBD5E1]" />
							<p className="font-medium text-[#0F172A]">No results</p>
							<p className="mt-1 text-[#64748B] text-sm">
								Try different keywords or filters
							</p>
							{hasActiveFilters() && (
								<button
									type="button"
									onClick={clearFilters}
									className="mt-3 font-medium text-[#1E40AF] text-sm hover:underline"
								>
									Clear filters
								</button>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Mobile filter drawer */}
			{showMobileFilters && (
				<div className="fixed inset-0 z-50 lg:hidden">
					<button
						type="button"
						className="absolute inset-0 bg-black/40"
						onClick={() => setShowMobileFilters(false)}
						aria-label="Close filters"
					/>
					<div className="absolute right-0 bottom-0 left-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-bold text-[#0F172A] text-lg">Filters</h3>
							<button
								type="button"
								onClick={() => setShowMobileFilters(false)}
								className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#F1F5F9]"
							>
								<X className="h-5 w-5 text-[#475569]" />
							</button>
						</div>
						{filterPanel}
						<Button
							className="mt-5 w-full rounded-lg"
							onClick={() => setShowMobileFilters(false)}
						>
							Show {total} results
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
