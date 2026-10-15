"use client";

import { ChevronDown, MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LocationDialog } from "~/components/location/location-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	DIRECTORY_SORTS,
	type DirectoryFilters,
	directoryHref,
} from "~/lib/shop-directory";
import { cn } from "~/lib/utils";
import { ChipMenu, chipClass } from "../search/shop-search-client";

const LEVELS = [1, 2, 3] as const;
const SORT_LABEL = {
	relevance: "shopSortRelevance",
	rating: "shopSortRating",
	products: "shopSortProducts",
} as const;

export function DirectoryFiltersBar({
	filters,
	categories,
}: {
	filters: DirectoryFilters;
	categories: { id: string; name: string }[];
}) {
	const t = useTranslations("Search");
	const tDir = useTranslations("ShopDirectory");
	const router = useRouter();
	const [cityOpen, setCityOpen] = useState(false);
	const go = (patch: Partial<DirectoryFilters>) =>
		router.push(directoryHref({ ...filters, ...patch, page: 1 }));
	const categoryName = categories.find((c) => c.id === filters.category)?.name;

	return (
		<div className="flex flex-wrap items-center gap-2">
			{filters.q && (
				<span className={cn(chipClass(true), "pr-1.5")}>
					<Search className="h-3.5 w-3.5" />
					{filters.q}
					<button
						type="button"
						onClick={() => go({ q: "" })}
						aria-label={tDir("clearQuery", { q: filters.q })}
						className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#BFDBFE]"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</span>
			)}

			{filters.city ? (
				<span className={cn(chipClass(true), "pr-1.5")}>
					<button
						type="button"
						onClick={() => setCityOpen(true)}
						className="flex items-center gap-1.5"
					>
						<MapPin className="h-3.5 w-3.5" />
						{filters.city}
					</button>
					<button
						type="button"
						onClick={() => go({ city: "" })}
						aria-label={t("shopFilterClearCity", { city: filters.city })}
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
					setCityOpen(false);
					go({ city: place.name });
				}}
				selected={filters.city ? { name: filters.city, region: "" } : null}
				onSelectAll={() => {
					setCityOpen(false);
					go({ city: "" });
				}}
				allSelected={!filters.city}
			/>

			<ChipMenu
				label={
					filters.level
						? t(`shopLevel${filters.level as 1 | 2 | 3}`)
						: t("shopFilterLevel")
				}
				active={filters.level > 0}
				value={String(filters.level)}
				onChange={(value) => go({ level: Number(value) })}
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
					value={filters.category || "all"}
					onChange={(value) => go({ category: value === "all" ? "" : value })}
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

			<div className="ml-auto">
				<DropdownMenu>
					<DropdownMenuTrigger
						aria-label={tDir("sortLabel")}
						className="flex h-10 items-center gap-1 font-semibold text-[#0F172A] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30"
					>
						{t(SORT_LABEL[filters.sort])}
						<ChevronDown className="h-3.5 w-3.5" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuRadioGroup
							value={filters.sort}
							onValueChange={(value) =>
								go({
									sort:
										DIRECTORY_SORTS.find((option) => option === value) ??
										"relevance",
								})
							}
						>
							{DIRECTORY_SORTS.map((value) => (
								<DropdownMenuRadioItem key={value} value={value}>
									{t(SORT_LABEL[value])}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
