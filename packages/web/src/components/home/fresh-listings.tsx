"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MapPin, Tag } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { ListingGrid } from "~/components/listing/listing-card";
import { LoadError } from "~/components/seller/load-states";
import { Button } from "~/components/ui/button";
import { usePlacePreferences } from "~/hooks/use-place-preferences";
import { api } from "~/lib/api";
import type { Listing, SearchResult } from "~/types";
import {
	FRESH_COUNT,
	freshListingPaths,
	mixFreshListings,
} from "./fresh-listings-mix";

async function fetchFreshListings(city: string | null): Promise<Listing[]> {
	const paths = freshListingPaths(city);
	const [boosted, recent] = await Promise.all([
		// A failed boost read only costs the badged slots.
		api
			.get<SearchResult>(paths.boosted)
			.catch(() => null),
		api.get<SearchResult>(paths.recent),
	]);
	return mixFreshListings(boosted?.hits ?? [], recent.hits);
}

const noop = () => () => undefined;

/**
 * "Nouveautés", scoped to the city this browser browses. The server renders
 * the city its cookie names (every city without one), so a remembered city
 * is there on the first paint; only a preference the cookie does not carry
 * yet swaps in once the page is in the browser.
 */
export function FreshListings({
	initialCity,
	initialListings,
	favoriteIds,
}: {
	/** The city the server rendered for; null for every city. */
	initialCity: string | null;
	initialListings: Listing[];
	favoriteIds: string[];
}) {
	const t = useTranslations("Home");
	const { browsePlace, setBrowsePlace } = usePlacePreferences();
	// The stored preference only exists in the browser: until hydration ends,
	// render what the server rendered so the two agree.
	const hydrated = useSyncExternalStore(
		noop,
		() => true,
		() => false,
	);
	const city = hydrated ? (browsePlace?.name ?? null) : initialCity;
	const scoped = useQuery({
		queryKey: ["home", "fresh", city],
		queryFn: () => fetchFreshListings(city),
		initialData: city === initialCity ? initialListings : undefined,
		staleTime: 60_000,
		retry: false,
	});
	const listings = scoped.data;
	const seeAllHref = city
		? `/search?location=${encodeURIComponent(city)}`
		: "/search";

	return (
		<section className="pt-2 pb-12">
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="mb-6 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<h2 className="font-bold text-[#0F172A] text-xl">
							{t("freshListings")}
						</h2>
						<span className="flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 font-medium text-[#047857] text-xs">
							{city && <MapPin className="h-3 w-3" />}
							{city ?? t("allCitiesPill")}
						</span>
					</div>
					<Link
						href={seeAllHref}
						className="flex items-center gap-1 font-medium text-[#1E40AF] text-sm hover:underline"
					>
						{t("seeAll")}
						<ChevronRight className="h-4 w-4" />
					</Link>
				</div>
				{scoped.isError ? (
					<LoadError
						title={city ? t("freshError", { city }) : t("freshErrorAll")}
						onRetry={() => scoped.refetch()}
					/>
				) : !listings ? (
					<div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{Array.from({ length: FRESH_COUNT }, (_, index) => (
							<span
								key={index}
								className="block aspect-[3/4] animate-pulse rounded-xl bg-[#F1F5F9]"
							/>
						))}
					</div>
				) : listings.length > 0 ? (
					<ListingGrid listings={listings} favorites={favoriteIds} />
				) : (
					<div className="rounded-2xl border-2 border-[#DBEAFE] border-dashed py-16 text-center">
						<Tag className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]" />
						{city ? (
							<>
								<p className="font-medium text-[#0F172A]">
									{t("noListingsInCity", { city })}
								</p>
								<Button
									className="mt-4"
									variant="outline"
									onClick={() => setBrowsePlace(null)}
								>
									{t("showAllCities")}
								</Button>
							</>
						) : (
							<>
								<p className="font-medium text-[#0F172A]">
									{t("noListingsYet")}
								</p>
								<p className="mt-1 text-[#64748B] text-sm">{t("beFirst")}</p>
								<Link href="/create">
									<Button className="mt-4" variant="accent">
										{t("postListing")}
									</Button>
								</Link>
							</>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
