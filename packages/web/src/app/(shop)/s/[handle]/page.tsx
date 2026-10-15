import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ListingGrid } from "~/components/listing/listing-card";
import { DeliveryCities } from "~/components/shop/delivery-cities";
import { PickupPoints } from "~/components/shop/pickup-points";
import { ShopAbout } from "~/components/shop/shop-about";
import { ShopHero } from "~/components/shop/shop-hero";
import { serverFetch } from "~/lib/server-api";
import { lookupShop } from "~/lib/server-shop";
import { type CategoryNode, groupedCounts } from "~/lib/shop-category-groups";
import {
	parsePage,
	parseShopSort,
	parseShopTab,
	type ShopPageState,
	type ShopSort,
	type ShopTab,
	shopPageHref,
} from "~/lib/shop-page-params";
import { shopRating } from "~/lib/shop-rating";
import { shopUrl } from "~/lib/shop-url";
import type { Category, Listing } from "~/types";
import { ShopCategories } from "./shop-categories";
import { ShopReviews } from "./shop-reviews";
import { ShopSortSelect } from "./shop-sort-select";
import { ShopTabs } from "./shop-tabs";

const PAGE_SIZE = 24;

async function getShopListings(
	shopId: string,
	q: string,
	category: string,
	sort: ShopSort,
	page: number,
): Promise<{ hits: Listing[]; total: number }> {
	const params = new URLSearchParams({
		shop: shopId,
		sort,
		limit: String(PAGE_SIZE),
		offset: String((page - 1) * PAGE_SIZE),
	});
	if (q) params.set("q", q);
	if (category) params.set("category", category);
	try {
		const res = await serverFetch(`/api/public/search?${params.toString()}`);
		if (!res.ok) return { hits: [], total: 0 };
		const data = await res.json();
		return { hits: data.hits ?? [], total: data.total ?? 0 };
	} catch {
		return { hits: [], total: 0 };
	}
}

/**
 * Counted over the whole shop, never the current query or category, so the
 * list reads the same whichever entry is selected. `null` when the counts
 * could not be read: the page then falls back to the declared categories.
 */
async function getShopCategoryCounts(
	shopId: string,
): Promise<{ counts: Record<string, number>; total: number } | null> {
	const params = new URLSearchParams({
		shop: shopId,
		facets: "category",
		limit: "1",
	});
	try {
		const res = await serverFetch(`/api/public/search?${params.toString()}`);
		if (!res.ok) return null;
		const data = await res.json();
		if (!data.categoryCounts || typeof data.categoryCounts !== "object") {
			return null;
		}
		return { counts: data.categoryCounts, total: data.total ?? 0 };
	} catch {
		return null;
	}
}

async function getCategoryTree(): Promise<Map<string, CategoryNode>> {
	try {
		const res = await serverFetch("/api/public/categories?depth=0");
		if (!res.ok) return new Map();
		const data = await res.json();
		const categories: Category[] = data.categories ?? [];
		return new Map(
			categories.map((c) => [
				String(c.id),
				{
					name: c.name,
					parent:
						typeof c.parent === "string" ? c.parent : (c.parent?.id ?? null),
				},
			]),
		);
	} catch {
		return new Map();
	}
}

interface PageProps {
	params: Promise<{ handle: string }>;
	searchParams: Promise<{
		q?: string;
		page?: string;
		category?: string;
		sort?: string;
		tab?: string;
	}>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { handle } = await params;
	const result = await lookupShop(handle);
	if (!result || !("shop" in result)) {
		return { robots: { index: false } };
	}
	const { shop } = result;
	const t = await getTranslations("Shop");
	const description =
		shop.description?.slice(0, 155).replace(/\n/g, " ") ||
		t("metaDescription", { name: shop.name });
	const image = shop.banner?.url ?? shop.logo?.url ?? null;
	const canonical = shopUrl(shop.handle);

	return {
		title: shop.name,
		description,
		alternates: { canonical },
		openGraph: {
			title: shop.name,
			description,
			url: canonical,
			type: "website",
			...(image && { images: [{ url: image, alt: shop.name }] }),
		},
		twitter: {
			card: image ? "summary_large_image" : "summary",
			title: shop.name,
			description,
			...(image && { images: [image] }),
		},
	};
}

export default async function ShopPage({ params, searchParams }: PageProps) {
	const { handle } = await params;
	const {
		q = "",
		page: pageParam,
		category: categoryParam = "",
		sort: sortParam,
		tab: tabParam,
	} = await searchParams;
	const result = await lookupShop(handle);

	if (!result) notFound();
	if ("redirectTo" in result) permanentRedirect(`/s/${result.redirectTo}`);

	const { shop } = result;
	const tab = parseShopTab(tabParam);
	const page = parsePage(pageParam);
	const category = categoryParam.trim();
	const sort = parseShopSort(sortParam);
	const onListings = tab === "listings";
	const noListings = { hits: [] as Listing[], total: 0 };
	const [locale, t, listings, categoryCounts, categoryTree] = await Promise.all(
		[
			getLocale(),
			getTranslations("Shop"),
			onListings
				? getShopListings(shop.id, q.trim(), category, sort, page)
				: noListings,
			onListings ? getShopCategoryCounts(shop.id) : null,
			onListings ? getCategoryTree() : new Map<string, CategoryNode>(),
		],
	);
	const named = categoryCounts
		? groupedCounts(categoryCounts.counts, categoryTree)
		: [];
	const categoryList =
		categoryCounts && named.length > 0
			? { categories: named, total: categoryCounts.total }
			: null;
	const selectedCategory = category || null;
	// The public shape carries the shop's own verified-purchase rating now;
	// this page used to make a second select-filtered read for it.
	const rating = shopRating(shop, shop.owner);
	const totalPages = Math.max(1, Math.ceil(listings.total / PAGE_SIZE));

	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "Store",
		name: shop.name,
		url: shopUrl(shop.handle),
		...(shop.description && { description: shop.description }),
		...((shop.logo?.url || shop.banner?.url) && {
			image: shop.logo?.url ?? shop.banner?.url,
		}),
		...(shop.contact.phone && { telephone: shop.contact.phone }),
		address: {
			"@type": "PostalAddress",
			...(shop.location.city && { addressLocality: shop.location.city }),
			...(shop.location.region && { addressRegion: shop.location.region }),
			...(shop.location.countryCode && {
				addressCountry: shop.location.countryCode,
			}),
		},
	};

	const state: ShopPageState = { tab, q, category, sort, page };
	const shopHref = (target: Partial<ShopPageState>) =>
		shopPageHref(shop.handle, { ...state, page: 1, ...target });
	const pageHref = (target: number) => shopHref({ page: target });
	const categoryHref = (id: string | null) => shopHref({ category: id ?? "" });
	const tabHref = (target: ShopTab) =>
		shopPageHref(shop.handle, {
			tab: target,
			q: "",
			category: "",
			sort: "newest",
			page: 1,
		});

	return (
		<div className="bg-[#F8FAFC]">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: structured data
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<ShopHero
				shop={shop}
				rating={rating}
				locale={locale}
				tabs={
					<ShopTabs
						active={tab}
						hrefFor={tabHref}
						reviewCount={shop.totalReviews}
					/>
				}
			/>
			{tab === "reviews" && (
				<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
					<ShopReviews
						shopId={shop.id}
						page={page}
						rating={rating}
						locale={locale}
						pageHref={pageHref}
					/>
				</div>
			)}
			{tab === "about" && (
				<div className="container mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-3 lg:px-8">
					<div className="lg:col-span-2">
						<ShopAbout shop={shop} locale={locale} full />
					</div>
					<div className="space-y-4">
						<DeliveryCities shopId={shop.id} handle={shop.handle} />
						<PickupPoints handle={shop.handle} />
					</div>
				</div>
			)}
			{onListings && (
				<div className="container mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-4 lg:px-8">
					<div className="lg:col-span-1">
						<ShopAbout
							shop={shop}
							locale={locale}
							categoryNav={
								categoryList ? (
									<ShopCategories
										layout="sidebar"
										{...categoryList}
										selected={selectedCategory}
										hrefFor={categoryHref}
									/>
								) : undefined
							}
						/>
						<div className="mt-4">
							<DeliveryCities shopId={shop.id} handle={shop.handle} />
						</div>
					</div>
					<div className="min-w-0 lg:col-span-3">
						{categoryList && (
							<ShopCategories
								layout="chips"
								{...categoryList}
								selected={selectedCategory}
								hrefFor={categoryHref}
							/>
						)}
						<form
							action={`/s/${shop.handle}`}
							className="mb-4 flex flex-wrap items-center gap-3"
						>
							{category && (
								<input type="hidden" name="category" value={category} />
							)}
							<div className="relative min-w-[200px] flex-1 sm:max-w-[340px]">
								<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
								<input
									type="search"
									name="q"
									defaultValue={q}
									placeholder={t("searchInShop")}
									aria-label={t("searchInShop")}
									className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm focus:border-[var(--shop-accent)] focus:outline-none"
								/>
							</div>
							<span className="ml-auto shrink-0 text-[#64748B] text-sm">
								{t("products", { count: listings.total })}
							</span>
							<ShopSortSelect value={sort} />
						</form>
						{listings.hits.length === 0 ? (
							<div className="rounded-xl border border-[#E2E8F0] border-dashed bg-white p-10 text-center text-[#64748B] text-sm">
								{q
									? t("noResultsInShop", { q })
									: category
										? t("noResultsInCategory")
										: t("emptyShop")}
							</div>
						) : (
							<ListingGrid
								listings={listings.hits}
								className="lg:grid-cols-3 xl:grid-cols-4"
							/>
						)}
						{totalPages > 1 && (
							<div className="mt-6 flex items-center justify-center gap-3 text-sm">
								{page > 1 && (
									<Link
										href={pageHref(page - 1)}
										className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 font-medium text-[var(--shop-accent-text)] hover:border-[var(--shop-accent-border)] hover:bg-[var(--shop-accent-soft)]"
									>
										{t("previous")}
									</Link>
								)}
								<span className="text-[#64748B]">
									{page} / {totalPages}
								</span>
								{page < totalPages && (
									<Link
										href={pageHref(page + 1)}
										className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 font-medium text-[var(--shop-accent-text)] hover:border-[var(--shop-accent-border)] hover:bg-[var(--shop-accent-soft)]"
									>
										{t("next")}
									</Link>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
