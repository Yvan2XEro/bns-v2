import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SearchTabs } from "~/components/search/search-tabs";
import { serverFetch } from "~/lib/server-api";
import { getShopsEnabled } from "~/lib/server-shop";
import type { Category, Favorite, Listing, ShopSearchSort } from "~/types";
import { SearchClient } from "./search-client";
import { ShopSearchClient } from "./shop-search-client";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

export async function generateMetadata({
	searchParams,
}: {
	searchParams: Promise<Record<string, string>>;
}): Promise<Metadata> {
	const params = await searchParams;
	const q = params.q;
	const t = await getTranslations("Search");

	if (q) {
		const title = t("metaTitleQuery", { q });
		return {
			title,
			description: t("metaDescriptionQuery", { q }),
			alternates: {
				canonical: `${WEB_URL}/search?q=${encodeURIComponent(q)}`,
			},
			robots: { index: true, follow: true },
		};
	}

	return {
		title: t("metaTitle"),
		description: t("metaDescription"),
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
		if (searchParams.verified === "1") params.set("minShopLevel", "2");

		const res = await serverFetch(`/api/public/search?${params.toString()}`);
		if (!res.ok) return { hits: [], total: 0 };
		const data = await res.json();
		return { hits: data.hits || [], total: data.total || 0 };
	} catch {
		return { hits: [], total: 0 };
	}
}

/** Total hits for a search, read with a one-hit page; null when it fails. */
async function getTotal(path: string): Promise<number | null> {
	try {
		const res = await serverFetch(path);
		if (!res.ok) return null;
		const data = await res.json();
		return typeof data.total === "number" ? data.total : null;
	} catch {
		return null;
	}
}

function shopLevelFrom(params: Record<string, string>): number {
	const level = Number.parseInt(params.level ?? "", 10);
	if (level >= 1 && level <= 3) return level;
	// The older "verified shops only" link.
	return params.verified === "1" ? 2 : 0;
}

function shopSortFrom(value: string | undefined): ShopSearchSort {
	return value === "products" || value === "newest" ? value : "relevance";
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
	const shopsEnabled = await getShopsEnabled();
	const tab = shopsEnabled && params.tab === "shops" ? "shops" : "listings";

	const qOnly = params.q ? `&q=${encodeURIComponent(params.q)}` : "";

	if (tab === "shops") {
		const level = shopLevelFrom(params);
		const shopParams = new URLSearchParams({ limit: "1" });
		if (params.q) shopParams.set("q", params.q);
		if (params.city) shopParams.set("city", params.city);
		if (params.category) shopParams.set("category", params.category);
		if (level) shopParams.set("minShopLevel", String(level));
		const [categories, listingsTotal, shopsTotal] = await Promise.all([
			getCategories(),
			getTotal(`/api/public/search?limit=1${qOnly}`),
			getTotal(`/api/public/search/shops?${shopParams.toString()}`),
		]);
		return (
			<>
				<SearchTabs
					active="shops"
					q={params.q ?? ""}
					counts={{ listings: listingsTotal, shops: shopsTotal }}
				/>
				<ShopSearchClient
					initialQ={params.q ?? ""}
					initialCity={params.city ?? ""}
					initialLevel={level}
					initialCategory={params.category ?? ""}
					initialSort={shopSortFrom(params.sort)}
					categories={categories
						.filter((category) => !category.parent)
						.map((category) => ({ id: category.id, name: category.name }))}
				/>
			</>
		);
	}

	const [categories, initialData, favoriteIds, shopsTotal] = await Promise.all([
		getCategories(),
		getInitialListings(params),
		getUserFavoriteIds(),
		shopsEnabled
			? getTotal(`/api/public/search/shops?limit=1${qOnly}`)
			: Promise.resolve(null),
	]);

	return (
		<>
			{shopsEnabled && (
				<SearchTabs
					active="listings"
					q={params.q ?? ""}
					counts={{ listings: initialData.total, shops: shopsTotal }}
				/>
			)}
			<SearchClient
				categories={categories}
				initialListings={initialData.hits}
				initialTotal={initialData.total}
				initialParams={params}
				favoriteIds={favoriteIds}
			/>
		</>
	);
}
