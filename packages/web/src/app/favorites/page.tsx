import { ListingGrid } from "~/components/listing/listing-card";
import { serverFetch } from "~/lib/server-api";
import type { Favorite, Listing } from "~/types";

async function getFavorites(): Promise<{
	listings: Listing[];
	favoriteIds: number[];
}> {
	try {
		const res = await serverFetch("/api/favorites");
		if (!res.ok) return { listings: [], favoriteIds: [] };

		const data: Favorite[] = await res.json();

		const favoriteIds = data.map((f) =>
			typeof f.listing === "number" ? f.listing : f.listing.id,
		);

		// Resolve listing details for favorites that only have IDs
		const listings = await Promise.all(
			data.map(async (f) => {
				if (typeof f.listing !== "number") return f.listing;
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
	const { listings, favoriteIds } = await getFavorites();

	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="mb-8 text-3xl font-bold">Favorites</h1>

			{listings.length > 0 ? (
				<ListingGrid listings={listings} favorites={favoriteIds} />
			) : (
				<div className="py-16 text-center">
					<p className="text-lg text-muted-foreground">
						You haven&apos;t saved any listings yet
					</p>
					<p className="text-sm text-muted-foreground">
						Click the heart icon on listings to save them here
					</p>
				</div>
			)}
		</div>
	);
}
