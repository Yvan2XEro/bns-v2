import { getTranslations } from "next-intl/server";
import { EmptyState } from "~/components/empty-state";
import { ListingGrid } from "~/components/listing/listing-card";
import { serverFetch } from "~/lib/server-api";
import type { Favorite, Listing } from "~/types";

async function getFavorites(): Promise<{
	listings: Listing[];
	favoriteIds: string[];
	unavailable: number;
}> {
	try {
		const res = await serverFetch("/api/favorites?depth=2&limit=100");
		if (!res.ok) return { listings: [], favoriteIds: [], unavailable: 0 };

		const json = await res.json();
		const data: Favorite[] = json.docs || json;

		const favoriteIds = data.map((f) =>
			typeof f.listing === "string" ? f.listing : f.listing.id,
		);

		const listings = await Promise.all(
			data.map(async (f) => {
				if (typeof f.listing !== "string") return f.listing;
				try {
					const res = await serverFetch(`/api/listings/${f.listing}`);
					if (!res.ok) return null;
					return res.json();
				} catch {
					return null;
				}
			}),
		);

		const available = listings.filter(Boolean) as Listing[];
		return {
			listings: available,
			favoriteIds,
			// Sold, expired or withdrawn: said, rather than silently gone.
			unavailable: data.length - available.length,
		};
	} catch {
		return { listings: [], favoriteIds: [], unavailable: 0 };
	}
}

export default async function FavoritesPage() {
	const t = await getTranslations("Favorites");
	const { listings, favoriteIds, unavailable } = await getFavorites();

	return (
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="mb-6 font-bold text-2xl text-ink">{t("favorites")}</h1>
			{unavailable > 0 && (
				<p className="mb-4 rounded-lg bg-subtle px-3 py-2 text-ink-muted text-sm">
					{t("unavailableCount", { count: unavailable })}
				</p>
			)}

			{listings.length > 0 ? (
				<ListingGrid listings={listings} favorites={favoriteIds} />
			) : (
				<div className="rounded-2xl border-2 border-brand-tint border-dashed">
					<EmptyState
						illustration="favorites"
						title={t("noFavoritesYet")}
						subtitle={t("clickHeartToSave")}
						ctaLabel={t("browseListings")}
						ctaHref="/search"
					/>
				</div>
			)}
		</div>
	);
}
