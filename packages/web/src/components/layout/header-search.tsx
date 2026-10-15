"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { LocationField } from "~/components/location/location-field";
import { usePlacePreferences } from "~/hooks/use-place-preferences";
import { type SearchScope, searchHref } from "~/lib/nav";
import { cn } from "~/lib/utils";

interface HeaderSearchProps {
	/** In shop mode the search can be narrowed to this shop; it never starts narrowed. */
	shop?: { name: string; handle: string };
	compact?: boolean;
}

/** One search for the whole site, with the remembered browsing city inside it. */
export function HeaderSearch({ shop, compact = false }: HeaderSearchProps) {
	const t = useTranslations("Nav");
	const router = useRouter();
	const inputId = useId();
	const [query, setQuery] = useState("");
	const [scope, setScope] = useState<SearchScope>("everywhere");
	// The same preference the home search reads and writes.
	const { browsePlace, setBrowsePlace } = usePlacePreferences();

	const onSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		router.push(
			searchHref({
				q: query,
				city: browsePlace?.name ?? null,
				scope,
				shopHandle: shop?.handle,
			}),
		);
	};

	const inShop = scope === "shop" && Boolean(shop);

	return (
		<form
			onSubmit={onSubmit}
			className={cn(
				"flex h-10 min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border-[1.5px] bg-white",
				shop ? "border-white/40" : "border-[#1E40AF]",
			)}
		>
			<label htmlFor={inputId} className="sr-only">
				{t("searchLabel")}
			</label>
			<input
				id={inputId}
				type="search"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder={
					inShop && shop
						? t("searchInShop", { name: shop.name })
						: t("searchPlaceholder")
				}
				className="min-w-0 flex-1 bg-transparent px-3 text-[#0F172A] text-sm placeholder:text-[#94A3B8] focus:outline-none"
			/>
			{shop && (
				<select
					aria-label={t("searchScope")}
					value={scope}
					onChange={(event) => setScope(event.target.value as SearchScope)}
					className={cn(
						"shrink-0 cursor-pointer border-[#E2E8F0] border-l bg-transparent px-2 font-medium text-[#334155] text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30 focus-visible:ring-inset",
						compact ? "max-w-[6.5rem]" : "max-w-[9rem]",
					)}
				>
					<option value="everywhere">{t("scopeEverywhere")}</option>
					<option value="shop">{t("scopeShop")}</option>
				</select>
			)}
			{!inShop && (
				<div
					className={cn(
						"shrink-0 border-[#E2E8F0] border-l",
						compact ? "w-28" : "w-40 lg:w-48",
					)}
				>
					<LocationField
						value={browsePlace}
						onChange={setBrowsePlace}
						variant="bar"
						browse
					/>
				</div>
			)}
			<button
				type="submit"
				className={cn(
					"flex shrink-0 items-center gap-1.5 px-3 font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
					shop
						? "bg-[var(--shop-head-accent)] text-[var(--shop-head-on-accent)] focus-visible:ring-[var(--shop-head-on-accent)]"
						: "bg-[#1E40AF] text-white hover:bg-[#1E3A8A] focus-visible:ring-white",
				)}
			>
				<Search aria-hidden="true" className="h-4 w-4" />
				<span className={compact ? "sr-only" : "sr-only xl:not-sr-only"}>
					{t("searchButton")}
				</span>
			</button>
		</form>
	);
}
