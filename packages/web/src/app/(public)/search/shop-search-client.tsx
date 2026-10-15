"use client";

import { ChevronDown, MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { LocationDialog } from "~/components/location/location-dialog";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useShopSearch } from "~/hooks/use-shop-search";
import { cn } from "~/lib/utils";
import type { ShopSearchSort } from "~/types";
import { ShopResultRow } from "./shop-result-row";

export interface ShopSearchCategory {
	id: string;
	name: string;
}

const LEVELS = [1, 2, 3] as const;
const SORTS: ShopSearchSort[] = ["relevance", "products", "newest"];
const SORT_LABEL = {
	relevance: "shopSortRelevance",
	products: "shopSortProducts",
	newest: "shopSortNewest",
} as const;

const chipClass = (active: boolean) =>
	cn(
		"inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30",
		active
			? "border-[#BFDBFE] bg-[#DBEAFE] font-semibold text-[#1E40AF]"
			: "border-[#E2E8F0] bg-white font-medium text-[#334155] hover:border-[#94A3B8]",
	);

function ChipMenu({
	label,
	active,
	value,
	onChange,
	children,
}: {
	label: string;
	active: boolean;
	value: string;
	onChange: (value: string) => void;
	children: ReactNode;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={chipClass(active)}>
				{label}
				<ChevronDown className="h-3.5 w-3.5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuRadioGroup value={value} onValueChange={onChange}>
					{children}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function ShopSearchClient({
	initialQ,
	initialCity,
	initialLevel,
	initialCategory,
	initialSort,
	categories,
}: {
	initialQ: string;
	initialCity: string;
	/** 0 for every level; otherwise the `minShopLevel` floor. */
	initialLevel: number;
	initialCategory: string;
	initialSort: ShopSearchSort;
	categories: ShopSearchCategory[];
}) {
	const t = useTranslations("Search");
	const router = useRouter();
	const [q, setQ] = useState(initialQ);
	const [city, setCity] = useState(initialCity);
	const [level, setLevel] = useState(initialLevel);
	const [category, setCategory] = useState(initialCategory);
	const [sort, setSort] = useState<ShopSearchSort>(initialSort);
	const [cityOpen, setCityOpen] = useState(false);
	const debouncedQ = useDebouncedValue(q, 300).trim();

	// Keeps the URL shareable; the debounced query (not every keystroke) is the source of truth for it.
	// Skips the replace when it would be a no-op (e.g. on mount), so this never adds a history call the URL doesn't need.
	useEffect(() => {
		const params = new URLSearchParams({ tab: "shops" });
		if (debouncedQ) params.set("q", debouncedQ);
		if (city) params.set("city", city);
		if (level) params.set("level", String(level));
		if (category) params.set("category", category);
		if (sort !== "relevance") params.set("sort", sort);
		const search = `?${params.toString()}`;
		if (window.location.search === search) return;
		router.replace(`/search${search}`, { scroll: false });
	}, [debouncedQ, city, level, category, sort, router]);

	const { data, isPending, isError, refetch } = useShopSearch({
		q: debouncedQ,
		city,
		category,
		sort: sort === "relevance" ? undefined : sort,
		minShopLevel: level || undefined,
		limit: 30,
	});

	const categoryName = categories.find((c) => c.id === category)?.name;
	const verified = level >= 2 ? "yes" : "no";

	return (
		<div className="container mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
				<input
					type="search"
					value={q}
					onChange={(event) => setQ(event.target.value)}
					placeholder={t("shopSearchPlaceholder")}
					className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm focus:border-[#93C5FD] focus:outline-none"
				/>
			</div>

			<div className="flex flex-wrap gap-2">
				{city ? (
					<span className={cn(chipClass(true), "pr-1.5")}>
						<button
							type="button"
							onClick={() => setCityOpen(true)}
							className="flex items-center gap-1.5"
						>
							<MapPin className="h-3.5 w-3.5" />
							{city}
						</button>
						<button
							type="button"
							onClick={() => setCity("")}
							aria-label={t("shopFilterClearCity", { city })}
							className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#BFDBFE]"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</span>
				) : (
					<button
						type="button"
						onClick={() => setCityOpen(true)}
						className={chipClass(false)}
					>
						<MapPin className="h-3.5 w-3.5" />
						{t("shopFilterCity")}
						<ChevronDown className="h-3.5 w-3.5" />
					</button>
				)}
				<LocationDialog
					open={cityOpen}
					onOpenChange={setCityOpen}
					onSelect={(place) => {
						setCity(place.name);
						setCityOpen(false);
					}}
					selected={city ? { name: city, region: "" } : null}
					onSelectAll={() => {
						setCity("");
						setCityOpen(false);
					}}
					allSelected={!city}
				/>

				<ChipMenu
					label={
						level ? t(`shopLevel${level as 1 | 2 | 3}`) : t("shopFilterLevel")
					}
					active={level > 0}
					value={String(level)}
					onChange={(value) => setLevel(Number(value))}
				>
					<DropdownMenuRadioItem value="0">
						{t("shopLevelAny")}
					</DropdownMenuRadioItem>
					{LEVELS.map((value) => (
						<DropdownMenuRadioItem key={value} value={String(value)}>
							{t(`shopLevel${value}`)}
						</DropdownMenuRadioItem>
					))}
				</ChipMenu>

				{categories.length > 0 && (
					<ChipMenu
						label={categoryName ?? t("category")}
						active={!!categoryName}
						value={category || "all"}
						onChange={(value) => setCategory(value === "all" ? "" : value)}
					>
						<DropdownMenuRadioItem value="all">
							{t("allCategories")}
						</DropdownMenuRadioItem>
						{categories.map((option) => (
							<DropdownMenuRadioItem key={option.id} value={option.id}>
								{option.name}
							</DropdownMenuRadioItem>
						))}
					</ChipMenu>
				)}
			</div>

			{isPending && <LoadingRows rows={4} />}
			{isError && (
				<LoadError title={t("shopSearchError")} onRetry={() => refetch()} />
			)}
			{!isPending && !isError && data && (
				<>
					<div className="flex items-center justify-between gap-3">
						<p className="text-[#64748B] text-[13px]">
							{city
								? t("shopCountIn", { count: data.total, city })
								: t("shopCount", { count: data.total })}
						</p>
						<DropdownMenu>
							<DropdownMenuTrigger className="flex items-center gap-1 font-semibold text-[#0F172A] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30">
								{t(SORT_LABEL[sort])}
								<ChevronDown className="h-3.5 w-3.5" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuRadioGroup
									value={sort}
									onValueChange={(value) => setSort(value as ShopSearchSort)}
								>
									{SORTS.map((value) => (
										<DropdownMenuRadioItem key={value} value={value}>
											{t(SORT_LABEL[value])}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					{data.hits.length === 0 ? (
						<div className="rounded-xl border border-[#E2E8F0] border-dashed bg-white p-10 text-center">
							<p className="font-semibold text-[#0F172A]">
								{t("noShopsTitle")}
							</p>
							<p className="mt-1 text-[#64748B] text-sm">
								{!debouncedQ
									? t("noShopsBody")
									: city
										? t("noShopsMatchIn", { q: debouncedQ, city, verified })
										: t("noShopsMatch", { q: debouncedQ, verified })}
							</p>
							{(q || city || level || category) && (
								<button
									type="button"
									onClick={() => {
										setQ("");
										setCity("");
										setLevel(0);
										setCategory("");
									}}
									className="mt-4 h-10 rounded-lg border border-[#E2E8F0] px-4 font-semibold text-sm"
								>
									{t("clearFilters")}
								</button>
							)}
						</div>
					) : (
						<div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
							{data.hits.map((shop) => (
								<ShopResultRow key={shop.id} shop={shop} query={debouncedQ} />
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
