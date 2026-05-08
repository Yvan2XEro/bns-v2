import type { Metadata } from "next";
import { serverFetch } from "~/lib/server-api";
import type { Category, Favorite, Listing } from "~/types";
import { SearchClient } from "./search-client";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

export async function generateMetadata({
	searchParams,
}: {
	searchParams: Promise<Record<string, string>>;
}): Promise<Metadata> {
	const params = await searchParams;
	const q = params.q;

	if (q) {
		const title = `"${q}" — Résultats de recherche`;
		return {
			title,
			description: `Trouvez des annonces correspondant à "${q}" sur Buy'N'Sellem.`,
			alternates: {
				canonical: `${WEB_URL}/search?q=${encodeURIComponent(q)}`,
			},
			robots: { index: true, follow: true },
		};
	}

	return {
		title: "Rechercher des annonces",
		description:
			"Parcourez des milliers d'annonces locales sur Buy'N'Sellem. Trouvez la bonne affaire près de chez vous.",
		alternates: { canonical: `${WEB_URL}/search` },
		robots: { index: true, follow: true },
	};
}

async function getCategories(): Promise<Category[]> {
	try {
		const res = await serverFetch("/api/public/categories");
		if (!res.ok) return [];
		const data = await res.json();
		return data.categories || [];
	} catch {
		return [];
	}
}

async function getInitialListings(
	searchParams: Record<string, string>,
): Promise<{ hits: Listing[]; total: number }> {
	try {
		const params = new URLSearchParams();
		if (searchParams.q) params.set("q", searchParams.q);
		if (searchParams.category) params.set("category", searchParams.category);
		if (searchParams.minPrice) params.set("minPrice", searchParams.minPrice);
		if (searchParams.maxPrice) params.set("maxPrice", searchParams.maxPrice);
		if (searchParams.location) params.set("location", searchParams.location);
		if (searchParams.sort) params.set("sort", searchParams.sort);

		const res = await serverFetch(`/api/public/search?${params.toString()}`);
		if (!res.ok) return { hits: [], total: 0 };
		const data = await res.json();
		return { hits: data.hits || [], total: data.total || 0 };
	} catch {
		return { hits: [], total: 0 };
	}
}

async function getUserFavoriteIds(): Promise<string[]> {
	try {
		const res = await serverFetch("/api/favorites?limit=200");
		if (!res.ok) return [];
		const data = await res.json();
		const docs: Favorite[] = data.docs || [];
		return docs.map((f) =>
			typeof f.listing === "string" ? f.listing : f.listing.id,
		);
	} catch {
		return [];
	}
}

export default async function SearchPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string>>;
}) {
	const params = await searchParams;
	const [categories, initialData, favoriteIds] = await Promise.all([
		getCategories(),
		getInitialListings(params),
		getUserFavoriteIds(),
	]);

	return (
		<SearchClient
			categories={categories}
			initialListings={initialData.hits}
			initialTotal={initialData.total}
			initialParams={params}
			favoriteIds={favoriteIds}
		/>
	);
}
