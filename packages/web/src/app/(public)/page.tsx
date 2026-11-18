import { ChevronRight, MessageSquare, Shield, Truck } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CategoryIcon } from "~/components/category-icon";
import { FreshListings } from "~/components/home/fresh-listings";
import {
	freshListingPaths,
	mixFreshListings,
} from "~/components/home/fresh-listings-mix";
import { PREVIEW_TILES, VerifiedShops } from "~/components/home/verified-shops";
import { HomeSearchBar } from "~/components/home-search-bar";
import { BROWSE_CITY_COOKIE, readBrowseCity } from "~/lib/browse-city-cookie";
import { serverFetch } from "~/lib/server-api";
import { getShopsEnabled } from "~/lib/server-shop";
import type { Category, Favorite, Listing, ShopSearchHit } from "~/types";

async function getCategories(): Promise<Category[]> {
	try {
		const res = await serverFetch("/api/public/categories?depth=1");
		if (!res.ok) return [];
		const data = await res.json();
		// The section shows the top of the tree: a parent's search now includes
		// its subcategories, and the search filter reaches every level.
		return ((data.categories || []) as Category[]).filter(
			(category) => !category.parent,
		);
	} catch {
		return [];
	}
}

async function getListings(path: string): Promise<Listing[]> {
	try {
		const res = await serverFetch(path);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
	}
}

/** The remembered browsing city when its cookie is set, else every city. */
async function getFreshListings(city: string | null): Promise<Listing[]> {
	const paths = freshListingPaths(city);
	const [boosted, recent] = await Promise.all([
		getListings(paths.boosted),
		getListings(paths.recent),
	]);
	return mixFreshListings(boosted, recent);
}

async function getVerifiedShops(): Promise<ShopSearchHit[]> {
	try {
		if (!(await getShopsEnabled())) return [];
		const res = await serverFetch(
			`/api/public/search/shops?minShopLevel=2&sort=ranking&limit=4&previews=${PREVIEW_TILES}`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
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

export default async function HomePage() {
	const t = await getTranslations("Home");
	const browseCity = readBrowseCity(
		(await cookies()).get(BROWSE_CITY_COOKIE)?.value,
	);
	const [categories, freshListings, favoriteIds, verifiedShops] =
		await Promise.all([
			getCategories(),
			getFreshListings(browseCity),
			getUserFavoriteIds(),
			getVerifiedShops(),
		]);

	return (
		<div className="flex flex-col">
			{/* ── Hero (Leboncoin / OLX style: clean, search-focused) ── */}
			<section className="relative bg-brand-fill dark:bg-brand-tint">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />

				<div className="container relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
					<div className="mx-auto max-w-2xl text-center">
						<h1 className="mb-3 font-extrabold text-3xl text-white tracking-tight sm:text-5xl">
							{t("heroHeading")}
						</h1>
						<p className="mb-8 text-base text-blue-100 sm:text-lg">
							{t("heroSubtitle")}
						</p>

						{/* Search bar */}
						<HomeSearchBar />

						{/* Quick category pills (OLX style) */}
						<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
							<span className="text-blue-200 text-xs">{t("popular")}</span>
							{t("popularTerms")
								.split("|")
								.map((term) => (
									<Link
										key={term}
										href={`/search?q=${encodeURIComponent(term)}`}
										className="rounded-full border border-white/20 px-3 py-1 text-white/80 text-xs transition-all duration-200 hover:scale-105 hover:border-white/40 hover:bg-white/10 hover:text-white active:scale-95"
									>
										{term}
									</Link>
								))}
						</div>
					</div>
				</div>
			</section>

			{/* ── Trust bar (Vinted / Mercari style: social proof strip) ── */}
			<section className="border-brand-tint border-b bg-surface">
				<div className="container mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-6 px-4 py-4 sm:gap-10 sm:px-6 lg:px-8">
					{[
						{
							icon: Shield,
							title: t("trustShops"),
							detail: t("trustShopsDetail"),
						},
						{ icon: Truck, title: t("trustCod"), detail: t("trustCodDetail") },
						{
							icon: MessageSquare,
							title: t("trustChat"),
							detail: t("trustChatDetail"),
						},
					].map((s) => (
						<div key={s.title} className="flex items-center gap-2 text-sm">
							<s.icon className="h-4 w-4 text-brand" />
							<span className="font-semibold text-ink">{s.title}</span>
							<span className="text-ink-muted">{s.detail}</span>
						</div>
					))}
				</div>
			</section>

			{/* ── Categories (Leboncoin style: clean grid with count) ── */}
			{categories.length > 0 ? (
				<section className="bg-surface py-10">
					<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-6 flex items-center justify-between">
							<h2 className="font-bold text-ink text-xl">
								{t("browseByCategory")}
							</h2>
							<Link
								href="/search"
								className="flex items-center gap-1 font-medium text-brand text-sm hover:underline"
							>
								{t("allCategories")}
								<ChevronRight className="h-4 w-4" />
							</Link>
						</div>
						<div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
							{categories.map((category) => (
								<Link
									key={category.id || category.slug}
									href={`/search?category=${category.id || category.slug}`}
									className="group hover:-translate-y-1 flex flex-col items-center gap-2 rounded-xl p-4 transition-all duration-200 hover:bg-brand-soft active:scale-95"
								>
									<div className="transition-all duration-200 group-hover:scale-110 group-hover:shadow-blue-500/10 group-hover:shadow-md">
										<CategoryIcon category={category} size={48} />
									</div>
									<span className="text-center font-medium text-ink text-xs sm:text-sm">
										{category.name}
									</span>
								</Link>
							))}
						</div>
					</div>
				</section>
			) : null}

			<VerifiedShops shops={verifiedShops} />

			<FreshListings
				initialCity={browseCity}
				initialListings={freshListings}
				favoriteIds={favoriteIds}
			/>
		</div>
	);
}
