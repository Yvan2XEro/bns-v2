"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ListingGrid } from "~/components/listing/listing-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { Category, CategoryAttribute, Listing } from "~/types";

interface SearchClientProps {
	categories: Category[];
	initialListings: Listing[];
	initialTotal: number;
	initialParams: Record<string, string>;
}

export function SearchClient({
	categories,
	initialListings,
	initialTotal,
	initialParams,
}: SearchClientProps) {
	const router = useRouter();

	const [listings, setListings] = useState(initialListings);
	const [total, setTotal] = useState(initialTotal);
	const [selectedCategory, setSelectedCategory] = useState<Category | null>(
		null,
	);
	const [attributes, setAttributes] = useState<CategoryAttribute[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showFilters, setShowFilters] = useState(false);

	const [filters, setFilters] = useState({
		q: initialParams.q || "",
		category: initialParams.category || "",
		minPrice: initialParams.minPrice || "",
		maxPrice: initialParams.maxPrice || "",
		location: initialParams.location || "",
		sort: initialParams.sort || "-createdAt",
	});

	const [attributeFilters, setAttributeFilters] = useState<
		Record<string, string>
	>({});

	// Track if we need to re-fetch (skip initial render since we have server data)
	const [shouldFetch, setShouldFetch] = useState(false);

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

			for (const [key, value] of Object.entries(attributeFilters)) {
				if (value) params.set(`attr_${key}`, value);
			}

			const res = await fetch(`/api/public/search?${params.toString()}`);
			const data = await res.json();
			setListings(data.hits || []);
			setTotal(data.total || 0);
		} catch (error) {
			console.error("Failed to fetch listings:", error);
		} finally {
			setIsLoading(false);
		}
	}, [filters, attributeFilters]);

	// Resolve selected category when filters change
	useEffect(() => {
		if (filters.category) {
			const cat = categories.find(
				(c) =>
					String(c.id) === filters.category || c.slug === filters.category,
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

	// Debounced fetch when filters change (skip first render)
	useEffect(() => {
		if (!shouldFetch) return;

		const debounce = setTimeout(() => {
			fetchListings();
		}, 300);

		return () => clearTimeout(debounce);
	}, [fetchListings, shouldFetch]);

	function updateFilter(key: string, value: string) {
		setShouldFetch(true);
		setFilters((prev) => ({ ...prev, [key]: value }));
		const newParams = new URLSearchParams();
		const updated = { ...filters, [key]: value };
		for (const [k, v] of Object.entries(updated)) {
			if (v) newParams.set(k, v);
		}
		router.push(`/search?${newParams.toString()}`);
	}

	function updateAttributeFilter(key: string, value: string) {
		setShouldFetch(true);
		setAttributeFilters((prev) => ({ ...prev, [key]: value }));
	}

	function clearFilters() {
		setShouldFetch(true);
		setFilters({
			q: "",
			category: "",
			minPrice: "",
			maxPrice: "",
			location: "",
			sort: "-createdAt",
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
			Object.values(attributeFilters).some(Boolean)
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-8">
				<h1 className="mb-4 text-3xl font-bold">Search Listings</h1>
				<div className="flex flex-col gap-4 md:flex-row">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search by title or description..."
							className="pl-10"
							value={filters.q}
							onChange={(e) => updateFilter("q", e.target.value)}
						/>
					</div>
					<Button
						variant="outline"
						onClick={() => setShowFilters(!showFilters)}
						className="md:w-auto"
					>
						<SlidersHorizontal className="mr-2 h-4 w-4" />
						Filters
						{hasActiveFilters() && (
							<Badge variant="secondary" className="ml-2">
								Active
							</Badge>
						)}
					</Button>
				</div>
			</div>

			{showFilters && (
				<div className="mb-8 rounded-lg border bg-card p-6">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-lg font-semibold">Filters</h2>
						{hasActiveFilters() && (
							<Button variant="ghost" size="sm" onClick={clearFilters}>
								Clear all
							</Button>
						)}
					</div>

					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						<div className="space-y-2">
							<Label>Category</Label>
							<Select
								value={filters.category || "all"}
								onValueChange={(value) =>
									updateFilter("category", value === "all" ? "" : value)
								}
							>
								<SelectTrigger>
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

						<div className="space-y-2">
							<Label>Min Price</Label>
							<Input
								type="number"
								placeholder="0"
								value={filters.minPrice}
								onChange={(e) => updateFilter("minPrice", e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label>Max Price</Label>
							<Input
								type="number"
								placeholder="Any"
								value={filters.maxPrice}
								onChange={(e) => updateFilter("maxPrice", e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label>Location</Label>
							<Input
								placeholder="City or region"
								value={filters.location}
								onChange={(e) => updateFilter("location", e.target.value)}
							/>
						</div>
					</div>

					{attributes.length > 0 && (
						<div className="mt-6">
							<h3 className="mb-4 text-sm font-medium">
								{selectedCategory?.name} Attributes
							</h3>
							<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
								{attributes.map((attr) => (
									<div key={attr.slug} className="space-y-2">
										<Label>{attr.name}</Label>
										{attr.type === "select" && attr.options ? (
											<Select
												value={attributeFilters[attr.slug] || "any"}
												onValueChange={(value) =>
													updateAttributeFilter(
														attr.slug,
														value === "any" ? "" : value,
													)
												}
											>
												<SelectTrigger>
													<SelectValue placeholder={`Select ${attr.name}`} />
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
										) : attr.type === "number" ? (
											<Input
												type="number"
												placeholder={`${attr.name}...`}
												value={attributeFilters[attr.slug] || ""}
												onChange={(e) =>
													updateAttributeFilter(attr.slug, e.target.value)
												}
											/>
										) : attr.type === "boolean" ? (
											<Select
												value={attributeFilters[attr.slug] || "any"}
												onValueChange={(value) =>
													updateAttributeFilter(
														attr.slug,
														value === "any" ? "" : value,
													)
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Any" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="any">Any</SelectItem>
													<SelectItem value="true">Yes</SelectItem>
													<SelectItem value="false">No</SelectItem>
												</SelectContent>
											</Select>
										) : (
											<Input
												type="text"
												placeholder={attr.name}
												value={attributeFilters[attr.slug] || ""}
												onChange={(e) =>
													updateAttributeFilter(attr.slug, e.target.value)
												}
											/>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					<div className="mt-6 flex items-center gap-4">
						<Label>Sort by:</Label>
						<Select
							value={filters.sort}
							onValueChange={(value) => updateFilter("sort", value)}
						>
							<SelectTrigger className="w-[200px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="-createdAt">Newest first</SelectItem>
								<SelectItem value="createdAt">Oldest first</SelectItem>
								<SelectItem value="-price">Price: High to Low</SelectItem>
								<SelectItem value="price">Price: Low to High</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			)}

			<div className="mb-4 flex items-center justify-between">
				<p className="text-muted-foreground">
					{isLoading ? "Loading..." : `${total} results found`}
				</p>
			</div>

			{isLoading ? (
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{[...Array(8)].map((_, i) => (
						<div
							key={i}
							className="animate-pulse rounded-lg bg-muted"
							style={{ aspectRatio: "4/5" }}
						/>
					))}
				</div>
			) : listings.length > 0 ? (
				<ListingGrid listings={listings} />
			) : (
				<div className="py-16 text-center">
					<p className="text-lg text-muted-foreground">No listings found</p>
					<p className="text-sm text-muted-foreground">
						Try adjusting your search or filters
					</p>
					{hasActiveFilters() && (
						<Button variant="outline" className="mt-4" onClick={clearFilters}>
							Clear filters
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
