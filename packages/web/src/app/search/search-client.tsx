"use client";

import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ListingGrid } from "~/components/listing/listing-card";
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
	const [showMobileFilters, setShowMobileFilters] = useState(false);

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

	const [shouldFetch, setShouldFetch] = useState(false);
	const [page, setPage] = useState(1);
	const LIMIT = 20;

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

			params.set("limit", String(LIMIT));
			params.set("offset", String((page - 1) * LIMIT));

			const res = await fetch(`/api/search?${params.toString()}`);
			const data = await res.json();
			if (page > 1) {
				setListings(prev => [...prev, ...(data.hits || [])]);
			} else {
				setListings(data.hits || []);
			}
			setTotal(data.total || 0);
		} catch (error) {
			console.error("Failed to fetch listings:", error);
		} finally {
			setIsLoading(false);
		}
	}, [filters, attributeFilters, page]);

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

	function clearFilters() {
		setShouldFetch(true);
		setPage(1);
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

	const activeFilterCount = [
		filters.category,
		filters.minPrice,
		filters.maxPrice,
		filters.location,
		...Object.values(attributeFilters),
	].filter(Boolean).length;

	// Sidebar filter panel (reused for desktop sidebar + mobile drawer)
	const filterPanel = (
		<div className="space-y-5">
			{/* Category */}
			<div className="space-y-2">
				<Label className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
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
				<Label className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
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
				<Label className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
					Location
				</Label>
				<Input
					placeholder="City or region"
					className="h-9 rounded-lg text-sm"
					value={filters.location}
					onChange={(e) => updateFilter("location", e.target.value)}
				/>
			</div>

			{/* Dynamic attributes */}
			{attributes.length > 0 && (
				<div className="space-y-3 border-t border-[#E2E8F0] pt-4">
					<p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
						{selectedCategory?.name}
					</p>
					{attributes.map((attr) => (
						<div key={attr.slug} className="space-y-1.5">
							<Label className="text-sm text-[#334155]">{attr.name}</Label>
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
					onClick={clearFilters}
					className="w-full text-center text-sm font-medium text-red-600 hover:underline"
				>
					Clear all filters
				</button>
			)}
		</div>
	);

	return (
		<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
			{/* Top bar: search + sort + mobile filter toggle */}
			<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
					<input
						type="search"
						placeholder="Search..."
						className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20"
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
							<SelectItem value="-createdAt">Newest</SelectItem>
							<SelectItem value="createdAt">Oldest</SelectItem>
							<SelectItem value="-price">Price ↓</SelectItem>
							<SelectItem value="price">Price ↑</SelectItem>
						</SelectContent>
					</Select>
					<button
						className="flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#475569] hover:bg-[#F8FAFC] lg:hidden"
						onClick={() => setShowMobileFilters(true)}
					>
						<SlidersHorizontal className="h-4 w-4" />
						Filters
						{activeFilterCount > 0 && (
							<span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1E40AF] text-[10px] font-bold text-white">
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
						<h3 className="mb-4 text-sm font-bold text-[#0F172A]">Filters</h3>
						{filterPanel}
					</div>
				</aside>

				{/* Results */}
				<div className="min-w-0 flex-1">
					<p className="mb-4 text-sm text-[#64748B]">
						{isLoading ? (
							"Loading..."
						) : (
							<>
								<span className="font-semibold text-[#0F172A]">{total}</span>{" "}
								results
							</>
						)}
					</p>

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
							<ListingGrid listings={listings} className="md:grid-cols-3 xl:grid-cols-4" />
							{!isLoading && listings.length < total && (
								<div className="mt-6 text-center">
									<button
										onClick={() => { setShouldFetch(true); setPage(p => p + 1); }}
										className="rounded-xl border border-[#E2E8F0] bg-white px-8 py-2.5 text-sm font-medium text-[#1E40AF] transition-colors hover:bg-[#F8FAFC]"
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
							<p className="mt-1 text-sm text-[#64748B]">
								Try different keywords or filters
							</p>
							{hasActiveFilters() && (
								<button
									onClick={clearFilters}
									className="mt-3 text-sm font-medium text-[#1E40AF] hover:underline"
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
					<div
						className="absolute inset-0 bg-black/40"
						onClick={() => setShowMobileFilters(false)}
					/>
					<div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-lg font-bold text-[#0F172A]">Filters</h3>
							<button
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
