import {
	AlertTriangle,
	ArrowLeft,
	Clock,
	Eye,
	Flag,
	MapPin,
	MessageCircle,
	Shield,
	Star,
	Timer,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BoostDialog } from "~/components/listing/boost-dialog";
import { FavoriteButton } from "~/components/listing/favorite-button";
import { ImageGallery } from "~/components/listing/image-gallery";
import { ListingGrid } from "~/components/listing/listing-card";
import { ReportDialog } from "~/components/listing/report-dialog";
import { ShareButton } from "~/components/listing/share-button";
import { ViewTracker } from "~/components/listing/view-tracker";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Listing, User } from "~/types";

interface PageProps {
	params: Promise<{ id: string }>;
}

async function getListing(id: string): Promise<Listing | null> {
	try {
		const res = await serverFetch(`/api/listings/${id}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

async function isListingFavorited(listingId: string): Promise<boolean> {
	try {
		const res = await serverFetch(
			`/api/favorites?where[listing][equals]=${listingId}&limit=1`,
		);
		if (!res.ok) return false;
		const data = await res.json();
		return (data.docs?.length ?? 0) > 0;
	} catch {
		return false;
	}
}

async function getSimilarListings(listingId: string): Promise<Listing[]> {
	try {
		const res = await serverFetch(
			`/api/public/similar?id=${listingId}&limit=6`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits ?? [];
	} catch {
		return [];
	}
}

function timeAgo(date: string): string {
	const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(date).toLocaleDateString();
}

export default async function ListingPage({ params }: PageProps) {
	const { id } = await params;
	const [listing, isFavorited, similarListings, authUser] = await Promise.all([
		getListing(id),
		isListingFavorited(id),
		getSimilarListings(id),
		getAuthUser(),
	]);

	if (!listing) {
		notFound();
	}

	const isBoosted =
		listing.boostedUntil && new Date(listing.boostedUntil) > new Date();
	const seller = listing.seller as User | undefined;
	const isOwner = !!(
		authUser &&
		seller &&
		String(authUser.id) === String(seller.id)
	);
	const category = listing.category as { id: string; name: string } | undefined;

	const expiresAt = listing.expiresAt ? new Date(listing.expiresAt) : null;
	const isExpired = expiresAt ? expiresAt <= new Date() : false;
	const daysUntilExpiry = expiresAt
		? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
		: null;
	const isActive =
		listing.status === "published" || listing.status === "pending";

	const imageUrls: string[] =
		listing.images
			?.map((img) => (img.image as { url?: string })?.url)
			.filter((url): url is string => Boolean(url)) || [];

	const conditionMap: Record<string, string> = {
		new: "New",
		like_new: "Like new",
		good: "Good",
		fair: "Fair",
		poor: "Poor",
	};

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<ViewTracker listingId={listing.id} currentViews={listing.views ?? 0} />
			{/* Breadcrumb */}
			<div className="border-[#E2E8F0] border-b bg-white">
				<div className="container mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 text-[#64748B] text-sm sm:px-6 lg:px-8">
					<Link
						href="/search"
						className="flex items-center gap-1 hover:text-[#1E40AF]"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to results
					</Link>
					{category && (
						<>
							<span>/</span>
							<Link
								href={`/search?category=${category.id}`}
								className="hover:text-[#1E40AF]"
							>
								{category.name}
							</Link>
						</>
					)}
				</div>
			</div>

			<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="grid gap-6 lg:grid-cols-5">
					{/* Left: images + details (3 cols) */}
					<div className="lg:col-span-3">
						{/* Image gallery */}
						<div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
							<ImageGallery
								images={imageUrls}
								title={listing.title}
								isBoosted={!!isBoosted}
							/>
						</div>

						{/* Details card */}
						<div className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-5">
							{/* Title + price */}
							<div className="flex items-start justify-between gap-4">
								<div>
									<h1 className="font-bold text-2xl text-[#0F172A]">
										{listing.title}
									</h1>
									<p className="mt-1 font-bold text-2xl text-[#1E40AF]">
										{listing.price.toLocaleString()}{" "}
										<span className="font-medium text-[#64748B] text-sm">
											XAF
										</span>
									</p>
								</div>
								<div className="flex gap-2">
									<FavoriteButton
										listingId={listing.id}
										initialFavorite={isFavorited}
										className="h-9 w-9 rounded-lg border border-[#E2E8F0]"
									/>
									<ShareButton title={listing.title} />
								</div>
							</div>

							{/* Meta */}
							<div className="mt-4 flex flex-wrap gap-3 text-[#64748B] text-sm">
								<span className="flex items-center gap-1">
									<MapPin className="h-4 w-4 text-[#F59E0B]" />
									{listing.location}
								</span>
								<span className="flex items-center gap-1">
									<Clock className="h-4 w-4" />
									{timeAgo(listing.createdAt)}
								</span>
								{listing.views !== undefined && (
									<span className="flex items-center gap-1">
										<Eye className="h-4 w-4" />
										{listing.views} views
									</span>
								)}
								{expiresAt &&
									isActive &&
									!isExpired &&
									daysUntilExpiry !== null && (
										<span
											className={`flex items-center gap-1 ${daysUntilExpiry <= 5 ? "text-amber-600" : "text-[#64748B]"}`}
										>
											<Timer className="h-4 w-4" />
											{daysUntilExpiry <= 1
												? "Expires today"
												: `Expires in ${daysUntilExpiry} days`}
										</span>
									)}
								{listing.status === "expired" && (
									<span className="flex items-center gap-1 text-red-500">
										<AlertTriangle className="h-4 w-4" />
										Expired
									</span>
								)}
							</div>

							{/* Tags */}
							<div className="mt-4 flex flex-wrap gap-2">
								{category && <Badge variant="secondary">{category.name}</Badge>}
								{listing.condition && conditionMap[listing.condition] && (
									<Badge variant="outline">
										{conditionMap[listing.condition]}
									</Badge>
								)}
								{isBoosted && (
									<Badge variant="boost">
										<Zap className="mr-1 h-3 w-3" />
										Boosted
									</Badge>
								)}
							</div>

							{/* Description */}
							<div className="mt-6 border-[#E2E8F0] border-t pt-5">
								<h2 className="mb-2 font-bold text-[#64748B] text-sm uppercase tracking-wider">
									Description
								</h2>
								<p className="whitespace-pre-wrap text-[#334155] text-sm leading-relaxed">
									{listing.description}
								</p>
							</div>

							{/* Attributes */}
							{listing.attributes &&
								typeof listing.attributes === "object" &&
								Object.keys(listing.attributes).length > 0 && (
									<div className="mt-6 border-[#E2E8F0] border-t pt-5">
										<h2 className="mb-3 font-bold text-[#64748B] text-sm uppercase tracking-wider">
											Details
										</h2>
										<div className="grid grid-cols-2 gap-x-6 gap-y-3">
											{Object.entries(listing.attributes).map(
												([key, value]) => (
													<div
														key={key}
														className="flex justify-between text-sm"
													>
														<span className="text-[#64748B]">
															{key.charAt(0).toUpperCase() + key.slice(1)}
														</span>
														<span className="font-medium text-[#0F172A]">
															{String(value)}
														</span>
													</div>
												),
											)}
										</div>
									</div>
								)}
						</div>
					</div>

					{/* Right: seller card (2 cols) */}
					<div className="lg:col-span-2">
						<div className="sticky top-20 space-y-4">
							{/* Seller card */}
							<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
								{seller ? (
									<Link
										href={`/profile/${seller.id}`}
										className="flex items-center gap-3"
									>
										<Avatar className="h-12 w-12 ring-2 ring-[#E2E8F0]">
											<AvatarImage
												src={
													(seller.avatar as { url?: string })?.url || undefined
												}
											/>
											<AvatarFallback className="bg-[#1E40AF] font-semibold text-sm text-white">
												{seller.name?.charAt(0) || "?"}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="font-semibold text-[#0F172A]">
												{seller.name}
											</p>
											{seller.rating !== undefined &&
												seller.rating !== null && (
													<div className="flex items-center gap-1 text-[#64748B] text-sm">
														<Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
														{seller.rating.toFixed(1)}
														<span className="text-[#94A3B8]">
															({seller.totalReviews})
														</span>
													</div>
												)}
										</div>
									</Link>
								) : (
									<p className="text-[#64748B] text-sm">Unknown seller</p>
								)}

								<div className="mt-5 flex flex-col gap-2">
									{isOwner && listing.status === "published" && !isBoosted && (
										<BoostDialog listingId={listing.id}>
											<Button className="w-full rounded-lg bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] font-bold text-[#0F172A] shadow-amber-500/20 shadow-md hover:shadow-lg">
												<Zap className="mr-2 h-4 w-4" />
												Boost this listing
											</Button>
										</BoostDialog>
									)}
									{isOwner && isBoosted && (
										<div className="flex items-center justify-center gap-1.5 rounded-lg border border-[#F59E0B]/30 bg-amber-50 px-3 py-2 font-semibold text-[#92400E] text-sm">
											<Zap className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />
											Currently boosted
										</div>
									)}
									{!isOwner && (
										<Link
											href={`/messages?listing=${listing.id}`}
											className="w-full"
										>
											<Button className="w-full rounded-lg bg-[#1E40AF] hover:bg-[#1E3A8A]">
												<MessageCircle className="mr-2 h-4 w-4" />
												Message seller
											</Button>
										</Link>
									)}
									<FavoriteButton
										listingId={listing.id}
										initialFavorite={isFavorited}
										showLabel
										className="w-full"
									/>
								</div>
							</div>

							{/* Safety tips */}
							<div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
								<div className="flex items-center gap-2 font-semibold text-[#0F172A] text-sm">
									<Shield className="h-4 w-4 text-[#1E40AF]" />
									Safety tips
								</div>
								<ul className="mt-2 space-y-1 text-[#64748B] text-xs">
									<li>Meet in a public place</li>
									<li>Check the item before paying</li>
									<li>Never send money in advance</li>
								</ul>
							</div>

							{/* Report */}
							<div className="text-center">
								<ReportDialog
									targetType="listing"
									targetId={String(listing.id)}
								>
									<button
										type="button"
										className="inline-flex items-center gap-1 text-[#94A3B8] text-xs hover:text-red-500"
									>
										<Flag className="h-3 w-3" />
										Report this listing
									</button>
								</ReportDialog>
							</div>
						</div>
					</div>
				</div>

				{/* Similar Listings */}
				{similarListings.length > 0 && (
					<div className="mt-8">
						<h2 className="mb-4 font-bold text-[#0F172A] text-xl">
							Similar listings
						</h2>
						<ListingGrid listings={similarListings} />
					</div>
				)}
			</div>
		</div>
	);
}
