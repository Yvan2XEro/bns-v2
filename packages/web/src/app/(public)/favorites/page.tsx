import { Heart } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ListingGrid } from "~/components/listing/listing-card";
import { Button } from "~/components/ui/button";
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
				<div className="rounded-2xl border-2 border-[#DBEAFE] border-dashed py-16 text-center">
					<Heart className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]" />
					<p className="font-medium text-[#0F172A]">{t("noFavoritesYet")}</p>
					<p className="mt-1 text-[#64748B] text-sm">{t("clickHeartToSave")}</p>
					<Link href="/search">
						<Button className="mt-4 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]">
							{t("browseListings")}
						</Button>
					</Link>
				</div>
			)}
		</div>
	);
}
