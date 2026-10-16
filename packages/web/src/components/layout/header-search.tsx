"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { LocationField } from "~/components/location/location-field";
import { useSearchSuggestions } from "~/components/search/search-suggestions";
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

	const inShop = scope === "shop" && Boolean(shop);
	const suggestions = useSearchSuggestions({
		query,
		city: browsePlace?.name ?? null,
		// A search inside one shop is that shop's catalogue: no other shop or
		// marketplace category to suggest.
		enabled: !inShop,
		onSearch: (q) =>
			router.push(
				searchHref({
					q,
					city: browsePlace?.name ?? null,
					scope,
					shopHandle: shop?.handle,
				}),
			),
	});

	const onSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		suggestions.submit();
	};

	return (
		<div className="relative min-w-0 flex-1">
			<form
				onSubmit={onSubmit}
				className={cn(
					"flex h-11 min-w-0 items-stretch overflow-hidden rounded-full p-1 transition-[background-color,box-shadow]",
					shop
						? "bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.18)] focus-within:bg-white focus-within:ring-2 focus-within:ring-white/70"
						: "bg-[#F1F5F9] focus-within:bg-white focus-within:shadow-[0_1px_3px_rgba(15,23,42,0.08)] focus-within:ring-2 focus-within:ring-[#1E40AF]/25 hover:bg-[#EAF0F7]",
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
					{...suggestions.inputProps}
					placeholder={
						inShop && shop
							? t("searchInShop", { name: shop.name })
							: t("searchPlaceholder")
					}
					className="min-w-0 flex-1 bg-transparent pr-2 pl-3 text-[#0F172A] text-sm placeholder:text-[#64748B] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
				/>
				{shop && (
					<select
						aria-label={t("searchScope")}
						value={scope}
						onChange={(event) => setScope(event.target.value as SearchScope)}
						className={cn(
							"my-1 shrink-0 cursor-pointer border-[#CBD5E1] border-l bg-transparent px-2 font-medium text-[#334155] text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF]/30 focus-visible:ring-inset",
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
							"my-1 shrink-0 border-[#CBD5E1] border-l [&_button]:rounded-full [&_button]:hover:bg-black/[0.04]",
							compact ? "w-32" : "w-44",
						)}
					>
						<LocationField
							value={browsePlace}
							onChange={setBrowsePlace}
							variant="bar"
							browse
							className="h-full"
						/>
					</div>
				)}
				<button
					type="submit"
					className={cn(
						"flex w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
						shop
							? "bg-[var(--shop-head-accent)] text-[var(--shop-head-on-accent)] focus-visible:ring-[var(--shop-head-accent)]"
							: "bg-[#1E40AF] text-white hover:bg-[#1E3A8A] focus-visible:ring-[#1E40AF]",
					)}
				>
					<Search aria-hidden="true" className="h-4 w-4" />
					<span className="sr-only">{t("searchButton")}</span>
				</button>
			</form>
			{suggestions.panel}
		</div>
	);
}
