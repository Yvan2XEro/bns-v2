import { Heart } from "lucide-react";
import Link from "next/link";
import { ListingGrid } from "~/components/listing/listing-card";
import { Button } from "~/components/ui/button";
import { serverFetch } from "~/lib/server-api";
import type { Favorite, Listing } from "~/types";

async function getFavorites(): Promise<{
	listings: Listing[];
	favoriteIds: number[];
}> {
	try {
		const res = await serverFetch("/api/favorites?depth=1&limit=100");
		if (!res.ok) return { listings: [], favoriteIds: [] };

		const json = await res.json();
		const data: Favorite[] = json.docs || json;

		const favoriteIds = data.map((f) =>
			typeof f.listing === "number" ? f.listing : f.listing.id,
		);

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
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="mb-6 text-2xl font-bold text-[#0F172A]">Favorites</h1>

			{listings.length > 0 ? (
				<ListingGrid listings={listings} favorites={favoriteIds} />
			) : (
				<div className="rounded-2xl border-2 border-dashed border-[#DBEAFE] py-16 text-center">
					<Heart className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]" />
					<p className="font-medium text-[#0F172A]">
						No favorites yet
					</p>
					<p className="mt-1 text-sm text-[#64748B]">
						Click the heart icon on listings to save them here
					</p>
					<Link href="/search">
						<Button className="mt-4 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]">
							Browse listings
						</Button>
					</Link>
				</div>
			)}
		</div>
	);
}
