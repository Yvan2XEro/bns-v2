import {
	ArrowRight,
	BadgeCheck,
	Briefcase,
	Camera,
	Car,
	ChevronRight,
	Clock,
	Home,
	MapPin,
	MessageSquare,
	Search,
	Shield,
	Shirt,
	Smartphone,
	Sofa,
	Star,
	Tag,
	TrendingUp,
	Users,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { RotatingText } from "~/components/home/rotating-text";
import { ListingGrid } from "~/components/listing/listing-card";
import { Button } from "~/components/ui/button";
import { serverFetch } from "~/lib/server-api";
import type { Category, Listing } from "~/types";

async function getCategories(): Promise<Category[]> {
	try {
		const res = await serverFetch("/api/categories");
		if (!res.ok) return [];
		const data = await res.json();
		return data.categories || [];
	} catch {
		return [];
	}
}

async function getRecentListings(): Promise<Listing[]> {
	try {
		const res = await serverFetch("/api/search?limit=12&sort=-createdAt");
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
	}
}

async function getFeaturedListings(): Promise<Listing[]> {
	try {
		const res = await serverFetch("/api/search?limit=8");
		if (!res.ok) return [];
		const data = await res.json();
		return (data.hits || []).filter(
			(l: Listing) => l.boostedUntil && new Date(l.boostedUntil) > new Date(),
		);
	} catch {
		return [];
	}
}

export default async function HomePage() {
	const [categories, recentListings, featuredListings] = await Promise.all([
		getCategories(),
		getRecentListings(),
		getFeaturedListings(),
	]);

	const defaultCategories = [
		{ name: "Real Estate", slug: "real-estate", icon: Home },
		{ name: "Vehicles", slug: "vehicles", icon: Car },
		{ name: "Electronics", slug: "electronics", icon: Smartphone },
		{ name: "Furniture", slug: "furniture", icon: Sofa },
		{ name: "Fashion", slug: "fashion", icon: Shirt },
		{ name: "Jobs", slug: "jobs", icon: Briefcase },
	];

	const displayCategories =
		categories.length > 0
			? categories.slice(0, 6)
			: defaultCategories.map((c) => ({
					...c,
					id: 0,
					active: true,
					createdAt: "",
					updatedAt: "",
				}));

	return (
		<div className="flex flex-col">
			{/* ── Hero (Leboncoin / OLX style: clean, search-focused) ── */}
			<section className="relative bg-[#1E40AF]">
				<div className="absolute inset-0 pattern-dots-light" />
				<div className="absolute inset-0 pattern-diagonal" />

				<div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
					<div className="mx-auto max-w-2xl text-center">
						<h1 className="mb-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
							<RotatingText />
						</h1>
						<p className="mb-8 text-base text-blue-100 sm:text-lg">
							Thousands of listings near you. Find deals, sell fast.
						</p>

						{/* Search bar (Leboncoin style: prominent, multi-field) */}
						<form
							action="/search"
							method="GET"
							className="mx-auto max-w-xl"
						>
							<div className="flex overflow-hidden rounded-2xl bg-white shadow-xl shadow-black/10 transition-all duration-300 focus-within:shadow-2xl focus-within:shadow-black/15 focus-within:scale-[1.01]">
								<div className="relative flex-1">
									<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94A3B8]" />
									<input
										type="search"
										name="q"
										placeholder="Search items, cars, phones..."
										className="h-14 w-full border-0 bg-transparent pl-12 pr-4 text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
									/>
								</div>
								<div className="hidden items-center border-l border-[#E2E8F0] sm:flex">
									<div className="relative">
										<MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
										<input
											type="text"
											name="location"
											placeholder="City"
											className="h-14 w-40 border-0 bg-transparent pl-9 pr-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
										/>
									</div>
								</div>
								<button
									type="submit"
									className="flex items-center gap-2 bg-[#F59E0B] px-6 font-semibold text-[#0F172A] transition-all duration-200 hover:bg-[#D97706] active:scale-95 sm:px-8"
								>
									<Search className="h-5 w-5" />
									<span className="hidden sm:inline">Search</span>
								</button>
							</div>
						</form>

						{/* Quick category pills (OLX style) */}
						<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
							<span className="text-xs text-blue-200">Popular:</span>
							{["iPhone", "Car", "Apartment", "Laptop", "PS5"].map((term) => (
								<Link
									key={term}
									href={`/search?q=${term}`}
									className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 hover:border-white/40 active:scale-95"
								>
									{term}
								</Link>
							))}
						</div>
					</div>
				</div>
			</section>

			{/* ── Trust bar (Vinted / Mercari style: social proof strip) ── */}
			<section className="border-b border-[#DBEAFE] bg-white">
				<div className="container mx-auto max-w-7xl flex flex-wrap items-center justify-center gap-6 px-4 sm:px-6 lg:px-8 py-4 sm:gap-10">
					{[
						{ icon: Users, value: "10K+", label: "active users" },
						{ icon: Tag, value: "50K+", label: "listings" },
						{ icon: MapPin, value: "100+", label: "cities" },
						{ icon: Shield, value: "Verified", label: "sellers" },
					].map((s) => (
						<div key={s.label} className="flex items-center gap-2 text-sm transition-transform duration-200 hover:scale-105">
							<s.icon className="h-4 w-4 text-[#1E40AF]" />
							<span className="font-semibold text-[#0F172A]">{s.value}</span>
							<span className="text-[#64748B]">{s.label}</span>
						</div>
					))}
				</div>
			</section>

			{/* ── Categories (Leboncoin style: clean grid with count) ── */}
			<section className="bg-white py-10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-6 flex items-center justify-between">
						<h2 className="text-xl font-bold text-[#0F172A]">
							Browse by category
						</h2>
						<Link
							href="/search"
							className="flex items-center gap-1 text-sm font-medium text-[#1E40AF] hover:underline"
						>
							All categories
							<ChevronRight className="h-4 w-4" />
						</Link>
					</div>
					<div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
						{displayCategories.map((category) => {
							const Icon =
								defaultCategories.find((c) => c.slug === category.slug)?.icon ||
								Home;
							return (
								<Link
									key={category.id || category.slug}
									href={`/search?category=${category.id || category.slug}`}
									className="group flex flex-col items-center gap-2 rounded-xl p-4 transition-all duration-200 hover:bg-[#F0F4FF] hover:-translate-y-1 active:scale-95"
								>
									<div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EFF6FF] transition-all duration-200 group-hover:bg-[#DBEAFE] group-hover:scale-110 group-hover:shadow-md group-hover:shadow-blue-500/10">
										<Icon className="h-5 w-5 text-[#1E40AF]" />
									</div>
									<span className="text-center text-xs font-medium text-[#0F172A] sm:text-sm">
										{category.name}
									</span>
								</Link>
							);
						})}
					</div>
				</div>
			</section>

			{/* ── Featured / Boosted (Marketplace style: horizontal highlight) ── */}
			{featuredListings.length > 0 && (
				<section className="relative border-t border-[#DBEAFE] bg-[#FFFBEB] py-10">
					<div className="absolute inset-0 pattern-hexagon" />
					<div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-6 flex items-center gap-2">
							<Zap className="h-5 w-5 text-[#F59E0B]" />
							<h2 className="text-xl font-bold text-[#0F172A]">
								Featured
							</h2>
							<span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-medium text-[#92400E]">
								Sponsored
							</span>
						</div>
						<ListingGrid listings={featuredListings} />
					</div>
				</section>
			)}

			{/* ── Recent Listings (main content, like any marketplace) ── */}
			<section className="py-10">
				<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-6 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<h2 className="text-xl font-bold text-[#0F172A]">
								Fresh listings
							</h2>
							<div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
								<Clock className="h-3 w-3" />
								New
							</div>
						</div>
						<Link
							href="/search"
							className="flex items-center gap-1 text-sm font-medium text-[#1E40AF] hover:underline"
						>
							See all
							<ChevronRight className="h-4 w-4" />
						</Link>
					</div>
					{recentListings.length > 0 ? (
						<ListingGrid listings={recentListings} />
					) : (
						<div className="rounded-2xl border-2 border-dashed border-[#DBEAFE] py-16 text-center">
							<Tag className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]" />
							<p className="font-medium text-[#0F172A]">
								No listings yet
							</p>
							<p className="mt-1 text-sm text-[#64748B]">
								Be the first to post!
							</p>
							<Link href="/create">
								<Button className="mt-4" variant="accent">
									Post a listing
								</Button>
							</Link>
						</div>
					)}
				</div>
			</section>

			{/* ── How it works ── */}
			<section className="relative border-t border-[#DBEAFE] bg-gradient-to-b from-white to-[#F8FAFF] py-16 sm:py-20">
				<div className="absolute inset-0 pattern-cross" />
				<div className="container relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
					{/* Header */}
					<div className="mb-12 text-center">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1E40AF]">
							<Zap className="h-3 w-3" />
							How it works
						</span>
						<h2 className="mt-3 text-2xl font-extrabold text-[#0F172A] sm:text-3xl">
							Sell in 3 easy steps
						</h2>
						<p className="mx-auto mt-2 max-w-md text-sm text-[#64748B]">
							From photo to payment in minutes. No complicated process.
						</p>
					</div>

					{/* Steps */}
					<div className="relative mx-auto grid max-w-4xl gap-6 md:grid-cols-3 md:gap-0">
						{/* Connector line (desktop) */}
						<div className="absolute left-[calc(16.67%+28px)] right-[calc(16.67%+28px)] top-[52px] hidden h-0.5 bg-gradient-to-r from-[#1E40AF] via-[#3B82F6] to-[#F59E0B] md:block" />

						{[
							{
								icon: Camera,
								step: "1",
								title: "Snap & list",
								desc: "Take a photo, add a description and set your price.",
								color: "from-[#1E40AF] to-[#3B82F6]",
								shadow: "shadow-blue-500/25",
								accent: "#1E40AF",
							},
							{
								icon: MessageSquare,
								step: "2",
								title: "Chat & negotiate",
								desc: "Buyers message you directly. Agree on a deal.",
								color: "from-[#2563EB] to-[#60A5FA]",
								shadow: "shadow-blue-400/25",
								accent: "#2563EB",
							},
							{
								icon: BadgeCheck,
								step: "3",
								title: "Sell & earn",
								desc: "Meet up, hand over, and get paid. Simple.",
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
								<div className="relative rounded-2xl border border-[#E2E8F0] bg-white p-6 pt-14 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 md:mx-3">
									{/* Floating icon */}
									<div className={`absolute -top-7 left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-lg ${s.shadow} transition-all duration-300 group-hover:scale-110 group-hover:rotate-3`}>
										<s.icon className="h-6 w-6" />
									</div>

									{/* Step number */}
									<div
										className="mx-auto mb-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
										style={{ backgroundColor: s.accent }}
									>
										{s.step}
									</div>

									<h3 className="mb-2 text-lg font-bold text-[#0F172A]">
										{s.title}
									</h3>
									<p className="text-sm leading-relaxed text-[#64748B]">
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
								className="rounded-2xl bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] px-8 font-bold shadow-lg shadow-blue-500/20"
							>
								Start selling now
								<ArrowRight className="ml-2 h-5 w-5" />
							</Button>
						</Link>
					</div>
				</div>
			</section>

			{/* ── Testimonial strip (Mercari style: simple review bar) ── */}
			<section className="relative bg-[#F8FAFF] py-10">
				<div className="absolute inset-0 pattern-dots" />
				<div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="flex flex-col items-center gap-6 md:flex-row md:justify-center md:gap-12">
						{[
							{
								text: "Sold my old phone in 2 hours!",
								name: "Marie K.",
								stars: 5,
							},
							{
								text: "Found an amazing deal on a car nearby.",
								name: "Jean P.",
								stars: 5,
							},
							{
								text: "Super easy to use. Highly recommend.",
								name: "Aisha D.",
								stars: 5,
							},
						].map((review) => (
							<div
								key={review.name}
								className="flex items-start gap-3 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90"
							>
								<div className="flex gap-0.5">
									{Array.from({ length: review.stars }).map((_, i) => (
										<Star
											key={i}
											className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]"
										/>
									))}
								</div>
								<div>
									<p className="text-[#0F172A]">
										&ldquo;{review.text}&rdquo;
									</p>
									<p className="mt-0.5 text-xs text-[#64748B]">
										&mdash; {review.name}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── CTA (Vinted style: clean, single action) ── */}
			<section className="relative bg-[#1E40AF] py-14">
				<div className="absolute inset-0 pattern-grid opacity-40" />
				<div className="container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
					<h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
						Got something to sell?
					</h2>
					<p className="mx-auto mb-6 max-w-md text-blue-100">
						It&apos;s free. It takes 30 seconds. Thousands of buyers are waiting.
					</p>
					<Link href="/create">
						<Button
							size="lg"
							className="rounded-2xl bg-[#F59E0B] px-10 text-base font-bold text-[#0F172A] shadow-lg shadow-amber-500/25 hover:bg-[#D97706]"
						>
							Start selling
							<ArrowRight className="ml-2 h-5 w-5" />
						</Button>
					</Link>
				</div>
			</section>
		</div>
	);
}
