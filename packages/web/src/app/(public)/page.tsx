import {
	ArrowRight,
	BadgeCheck,
	Camera,
	ChevronRight,
	Clock,
	MessageSquare,
	Shield,
	Tag,
	Truck,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CategoryIcon } from "~/components/category-icon";
import { RotatingText } from "~/components/home/rotating-text";
import { VerifiedShops } from "~/components/home/verified-shops";
import { HomeSearchBar } from "~/components/home-search-bar";
import { ListingGrid } from "~/components/listing/listing-card";
import { Button } from "~/components/ui/button";
import { serverFetch } from "~/lib/server-api";
import { getShopsEnabled } from "~/lib/server-shop";
import type { Category, Favorite, Listing, ShopSearchHit } from "~/types";

async function getCategories(): Promise<Category[]> {
	try {
		const res = await serverFetch("/api/public/categories?depth=1");
		if (!res.ok) return [];
		const data = await res.json();
		return data.categories || [];
	} catch {
		return [];
	}
}

async function getRecentListings(): Promise<Listing[]> {
	try {
		const res = await serverFetch("/api/public/search?limit=8&sort=-createdAt");
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
	}
}

async function getFeaturedListings(): Promise<Listing[]> {
	try {
		const res = await serverFetch(
			"/api/public/search?limit=6&boosted=true&sort=boosted",
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
	}
}

async function getVerifiedShops(): Promise<ShopSearchHit[]> {
	try {
		if (!(await getShopsEnabled())) return [];
		const res = await serverFetch(
			"/api/public/search/shops?minShopLevel=2&limit=4",
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
	const [
		categories,
		recentListings,
		featuredListings,
		favoriteIds,
		verifiedShops,
	] = await Promise.all([
		getCategories(),
		getRecentListings(),
		getFeaturedListings(),
		getUserFavoriteIds(),
		getVerifiedShops(),
	]);

	return (
		<div className="flex flex-col">
			{/* ── Hero (Leboncoin / OLX style: clean, search-focused) ── */}
			<section className="relative bg-[#1E40AF]">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />

				<div className="container relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
					<div className="mx-auto max-w-2xl text-center">
						<h1 className="mb-3 font-extrabold text-3xl text-white tracking-tight sm:text-5xl">
							<RotatingText />
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
			<section className="border-[#DBEAFE] border-b bg-white">
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
							<s.icon className="h-4 w-4 text-[#1E40AF]" />
							<span className="font-semibold text-[#0F172A]">{s.title}</span>
							<span className="text-[#64748B]">{s.detail}</span>
						</div>
					))}
				</div>
			</section>

			{/* ── Categories (Leboncoin style: clean grid with count) ── */}
			{categories.length > 0 ? (
				<section className="bg-white py-10">
					<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-6 flex items-center justify-between">
							<h2 className="font-bold text-[#0F172A] text-xl">
								{t("browseByCategory")}
							</h2>
							<Link
								href="/search"
								className="flex items-center gap-1 font-medium text-[#1E40AF] text-sm hover:underline"
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
									className="group hover:-translate-y-1 flex flex-col items-center gap-2 rounded-xl p-4 transition-all duration-200 hover:bg-[#F0F4FF] active:scale-95"
								>
									<div className="transition-all duration-200 group-hover:scale-110 group-hover:shadow-blue-500/10 group-hover:shadow-md">
										<CategoryIcon category={category} size={48} />
									</div>
									<span className="text-center font-medium text-[#0F172A] text-xs sm:text-sm">
										{category.name}
									</span>
								</Link>
							))}
						</div>
					</div>
				</section>
			) : null}

			<VerifiedShops shops={verifiedShops} />

			{/* ── Featured / Boosted (Marketplace style: horizontal highlight) ── */}
			{featuredListings.length > 0 && (
				<section className="relative border-[#DBEAFE] border-t bg-[#FFFBEB] py-10">
					<div className="pattern-hexagon absolute inset-0" />
					<div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-6 flex items-center gap-2">
							<Zap className="h-5 w-5 text-[#F59E0B]" />
							<h2 className="font-bold text-[#0F172A] text-xl">
								{t("featured")}
							</h2>
							<span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 font-medium text-[#92400E] text-xs">
								{t("sponsored")}
							</span>
						</div>
						<ListingGrid listings={featuredListings} favorites={favoriteIds} />
					</div>
				</section>
			)}

			{/* ── Recent Listings (main content, like any marketplace) ── */}
			<section className="py-10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-6 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<h2 className="font-bold text-[#0F172A] text-xl">
								{t("freshListings")}
							</h2>
							<div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700 text-xs">
								<Clock className="h-3 w-3" />
								{t("new")}
							</div>
						</div>
						<Link
							href="/search"
							className="flex items-center gap-1 font-medium text-[#1E40AF] text-sm hover:underline"
						>
							{t("seeAll")}
							<ChevronRight className="h-4 w-4" />
						</Link>
					</div>
					{recentListings.length > 0 ? (
						<ListingGrid listings={recentListings} favorites={favoriteIds} />
					) : (
						<div className="rounded-2xl border-2 border-[#DBEAFE] border-dashed py-16 text-center">
							<Tag className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]" />
							<p className="font-medium text-[#0F172A]">{t("noListingsYet")}</p>
							<p className="mt-1 text-[#64748B] text-sm">{t("beFirst")}</p>
							<Link href="/create">
								<Button className="mt-4" variant="accent">
									{t("postListing")}
								</Button>
							</Link>
						</div>
					)}
				</div>
			</section>

			{/* ── How it works ── */}
			<section className="relative border-[#DBEAFE] border-t bg-gradient-to-b from-white to-[#F8FAFF] py-16 sm:py-20">
				<div className="pattern-cross absolute inset-0" />
				<div className="container relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
					{/* Header */}
					<div className="mb-12 text-center">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 font-semibold text-[#1E40AF] text-xs">
							<Zap className="h-3 w-3" />
							{t("howItWorks")}
						</span>
						<h2 className="mt-3 font-extrabold text-2xl text-[#0F172A] sm:text-3xl">
							{t("sellIn3Steps")}
						</h2>
						<p className="mx-auto mt-2 max-w-md text-[#64748B] text-sm">
							{t("sellSubtitle")}
						</p>
					</div>

					{/* Steps */}
					<div className="relative mx-auto grid max-w-4xl gap-6 md:grid-cols-3 md:gap-0">
						{/* Connector line (desktop) */}
						<div className="absolute top-[52px] right-[calc(16.67%+28px)] left-[calc(16.67%+28px)] hidden h-0.5 bg-gradient-to-r from-[#1E40AF] via-[#3B82F6] to-[#F59E0B] md:block" />

						{[
							{
								icon: Camera,
								step: "1",
								title: t("snapList"),
								desc: t("snapDesc"),
								color: "from-[#1E40AF] to-[#3B82F6]",
								shadow: "shadow-blue-500/25",
								accent: "#1E40AF",
							},
							{
								icon: MessageSquare,
								step: "2",
								title: t("chatNegotiate"),
								desc: t("chatDesc"),
								color: "from-[#2563EB] to-[#60A5FA]",
								shadow: "shadow-blue-400/25",
								accent: "#2563EB",
							},
							{
								icon: BadgeCheck,
								step: "3",
								title: t("sellEarn"),
								desc: t("sellDesc"),
								color: "from-[#F59E0B] to-[#FBBF24]",
								shadow: "shadow-amber-500/25",
								accent: "#F59E0B",
							},
						].map((s) => (
							<div
								key={s.step}
								className="group relative flex flex-col items-center text-center"
							>
								{/* Card */}
								<div className="hover:-translate-y-1 relative rounded-2xl border border-[#E2E8F0] bg-white p-6 pt-14 transition-all duration-300 hover:shadow-black/5 hover:shadow-xl md:mx-3">
									{/* Floating icon */}
									<div
										className={`-top-7 -translate-x-1/2 absolute left-1/2 z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-lg ${s.shadow} transition-all duration-300 group-hover:rotate-3 group-hover:scale-110`}
									>
										<s.icon className="h-6 w-6" />
									</div>

									{/* Step number */}
									<div
										className="mx-auto mb-3 flex h-6 w-6 items-center justify-center rounded-full font-bold text-white text-xs"
										style={{ backgroundColor: s.accent }}
									>
										{s.step}
									</div>

									<h3 className="mb-2 font-bold text-[#0F172A] text-lg">
										{s.title}
									</h3>
									<p className="text-[#64748B] text-sm leading-relaxed">
										{s.desc}
									</p>
								</div>
							</div>
						))}
					</div>

					{/* CTA */}
					<div className="mt-10 text-center">
						<Link href="/create">
							<Button
								size="lg"
								className="rounded-2xl bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] px-8 font-bold shadow-blue-500/20 shadow-lg"
							>
								{t("startSelling")}
								<ArrowRight className="ml-2 h-5 w-5" />
							</Button>
						</Link>
					</div>
				</div>
			</section>

			{/* ── CTA (Vinted style: clean, single action) ── */}
			<section className="relative bg-[#1E40AF] py-14">
				<div className="pattern-grid absolute inset-0 opacity-40" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<h2 className="mb-3 font-bold text-2xl text-white sm:text-3xl">
						{t("gotSomethingSell")}
					</h2>
					<p className="mx-auto mb-6 max-w-md text-blue-100">{t("freeFast")}</p>
					<Link href="/create">
						<Button
							size="lg"
							className="rounded-2xl bg-[#F59E0B] px-10 font-bold text-[#0F172A] text-base shadow-amber-500/25 shadow-lg hover:bg-[#D97706]"
						>
							{t("startSellingBtn")}
							<ArrowRight className="ml-2 h-5 w-5" />
						</Button>
					</Link>
				</div>
			</section>
		</div>
	);
}
