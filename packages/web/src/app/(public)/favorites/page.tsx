import { getTranslations } from "next-intl/server";
import { EmptyState } from "~/components/empty-state";
import { ListingGrid } from "~/components/listing/listing-card";
import { serverFetch } from "~/lib/server-api";
import type { Favorite, Listing } from "~/types";

async function getFavorites(): Promise<{
	listings: Listing[];
	favoriteIds: string[];
}> {
	try {
		const res = await serverFetch("/api/favorites?depth=2&limit=100");
		if (!res.ok) return { listings: [], favoriteIds: [] };

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

		return {
			listings: listings.filter(Boolean) as Listing[],
			favoriteIds,
		};
	} catch {
		return { listings: [], favoriteIds: [] };
	}
}

export default async function FavoritesPage() {
	const t = await getTranslations("Favorites");
	const { listings, favoriteIds } = await getFavorites();

	return (
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="mb-6 font-bold text-2xl text-[#0F172A]">
				{t("favorites")}
			</h1>

			{listings.length > 0 ? (
				<ListingGrid listings={listings} favorites={favoriteIds} />
			) : (
				<div className="rounded-2xl border-2 border-[#DBEAFE] border-dashed">
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
