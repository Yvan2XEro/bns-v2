import {
	ArrowRight,
	Briefcase,
	Car,
	Home,
	Search,
	Shirt,
	Smartphone,
	Sofa,
} from "lucide-react";
import Link from "next/link";
import { ListingGrid } from "~/components/listing/listing-card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { serverFetch } from "~/lib/server-api";
import type { Category, Listing } from "~/types";

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
		const res = await serverFetch("/api/public/search?limit=4");
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
			<section className="bg-gradient-to-b from-primary/10 to-background py-16">
				<div className="container mx-auto px-4">
					<div className="mx-auto max-w-2xl text-center">
						<h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
							Buy & Sell Near You
						</h1>
						<p className="mb-8 text-lg text-muted-foreground">
							Discover great deals on items in your area. Join thousands of
							people buying and selling locally.
						</p>
						<form
							action="/search"
							method="GET"
							className="mx-auto flex max-w-lg gap-2"
						>
							<div className="relative flex-1">
								<Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
								<Input
									type="search"
									name="q"
									placeholder="What are you looking for?"
									className="h-12 pl-10"
								/>
							</div>
							<Button type="submit" size="lg" className="h-12">
								Search
							</Button>
						</form>
					</div>
				</div>
			</section>

			<section className="py-12">
				<div className="container mx-auto px-4">
					<div className="mb-8 flex items-center justify-between">
						<h2 className="text-2xl font-bold">Categories</h2>
						<Link href="/search">
							<Button variant="ghost" size="sm">
								View all
								<ArrowRight className="ml-2 h-4 w-4" />
							</Button>
						</Link>
					</div>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
						{displayCategories.map((category) => {
							const Icon =
								defaultCategories.find((c) => c.slug === category.slug)?.icon ||
								Home;
							return (
								<Link
									key={category.id || category.slug}
									href={`/search?category=${category.id || category.slug}`}
									className="flex flex-col items-center justify-center rounded-lg border p-6 transition-colors hover:bg-accent"
								>
									<Icon className="mb-3 h-8 w-8 text-primary" />
									<span className="text-center text-sm font-medium">
										{category.name}
									</span>
								</Link>
							);
						})}
					</div>
				</div>
			</section>

			{featuredListings.length > 0 && (
				<section className="bg-muted/50 py-12">
					<div className="container mx-auto px-4">
						<div className="mb-8 flex items-center justify-between">
							<h2 className="text-2xl font-bold">Featured Listings</h2>
							<Link href="/search?boosted=true">
								<Button variant="ghost" size="sm">
									View all
									<ArrowRight className="ml-2 h-4 w-4" />
								</Button>
							</Link>
						</div>
						<ListingGrid listings={featuredListings} />
					</div>
				</section>
			)}

			<section className="py-12">
				<div className="container mx-auto px-4">
					<div className="mb-8 flex items-center justify-between">
						<h2 className="text-2xl font-bold">Recent Listings</h2>
						<Link href="/search">
							<Button variant="ghost" size="sm">
								View all
								<ArrowRight className="ml-2 h-4 w-4" />
							</Button>
						</Link>
					</div>
					{recentListings.length > 0 ? (
						<ListingGrid listings={recentListings} />
					) : (
						<div className="py-12 text-center">
							<p className="text-muted-foreground">
								No listings yet. Be the first to post!
							</p>
							<Link href="/create">
								<Button className="mt-4">Create Listing</Button>
							</Link>
						</div>
					)}
				</div>
			</section>

			<section className="bg-primary py-16 text-primary-foreground">
				<div className="container mx-auto px-4 text-center">
					<h2 className="mb-4 text-3xl font-bold">Start Selling Today</h2>
					<p className="mx-auto mb-8 max-w-xl text-lg">
						Post your first listing in minutes. Reach thousands of buyers in
						your area.
					</p>
					<Link href="/create">
						<Button size="lg" variant="secondary" className="text-primary">
							Create Listing
						</Button>
					</Link>
				</div>
			</section>
		</div>
	);
}
