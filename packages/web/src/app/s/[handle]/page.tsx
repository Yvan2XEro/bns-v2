import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { cache } from "react";
import { ListingGrid } from "~/components/listing/listing-card";
import { shopUrl } from "~/components/shop/share-shop-button";
import { ShopAbout } from "~/components/shop/shop-about";
import { ShopHero } from "~/components/shop/shop-hero";
import { serverFetch, serverGet } from "~/lib/server-api";
import { shopRating } from "~/lib/shop-rating";
import type { Listing, PublicShop } from "~/types";

const PAGE_SIZE = 24;

type Lookup = { shop: PublicShop } | { redirectTo: string } | null;

const lookupShop = cache(async (handle: string): Promise<Lookup> => {
	try {
		const res = await serverFetch(
			`/api/public/shops/${encodeURIComponent(handle.toLowerCase())}`,
		);
		if (!res.ok) return null;
		return (await res.json()) as Lookup;
	} catch {
		return null;
	}
});

async function getShopListings(
	shopId: string,
	q: string,
	page: number,
): Promise<{ hits: Listing[]; total: number }> {
	const params = new URLSearchParams({
		shop: shopId,
		limit: String(PAGE_SIZE),
		offset: String((page - 1) * PAGE_SIZE),
	});
	if (q) params.set("q", q);
	try {
		const res = await serverFetch(`/api/public/search?${params.toString()}`);
		if (!res.ok) return { hits: [], total: 0 };
		const data = await res.json();
		return { hits: data.hits ?? [], total: data.total ?? 0 };
	} catch {
		return { hits: [], total: 0 };
	}
}

interface PageProps {
	params: Promise<{ handle: string }>;
	searchParams: Promise<{ q?: string; page?: string }>;
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
	const { q = "", page: pageParam } = await searchParams;
	const result = await lookupShop(handle);

	if (!result) notFound();
	if ("redirectTo" in result) permanentRedirect(`/s/${result.redirectTo}`);

	const { shop } = result;
	const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
	const [locale, t, listings] = await Promise.all([
		getLocale(),
		getTranslations("Shop"),
		getShopListings(shop.id, q.trim(), page),
	]);
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

	const pageHref = (target: number) => {
		const next = new URLSearchParams();
		if (q) next.set("q", q);
		if (target > 1) next.set("page", String(target));
		const text = next.toString();
		return `/s/${shop.handle}${text ? `?${text}` : ""}`;
	};

	return (
		<div className="bg-[#F8FAFC]">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: structured data
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<ShopHero shop={shop} rating={rating} locale={locale} />
			<div className="container mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-4 lg:px-8">
				<div className="lg:col-span-1">
					<ShopAbout shop={shop} locale={locale} />
				</div>
				<div className="lg:col-span-3">
					<form
						action={`/s/${shop.handle}`}
						className="mb-4 flex items-center gap-3"
					>
						<div className="relative flex-1">
							<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
							<input
								type="search"
								name="q"
								defaultValue={q}
								placeholder={t("searchInShop")}
								className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm focus:border-[#93C5FD] focus:outline-none"
							/>
						</div>
						<span className="shrink-0 text-[#64748B] text-sm">
							{t("products", { count: listings.total })}
						</span>
					</form>
					{listings.hits.length === 0 ? (
						<div className="rounded-xl border border-[#E2E8F0] border-dashed bg-white p-10 text-center text-[#64748B] text-sm">
							{q ? t("noResultsInShop", { q }) : t("emptyShop")}
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
									className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5"
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
									className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5"
								>
									{t("next")}
								</Link>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
