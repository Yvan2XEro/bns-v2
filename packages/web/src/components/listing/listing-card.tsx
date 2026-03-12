import { Clock, MapPin, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "~/lib/utils";
import type { Listing, Media, User } from "~/types";
import { FavoriteButton } from "./favorite-button";

function timeAgo(date: string): string {
	const seconds = Math.floor(
		(Date.now() - new Date(date).getTime()) / 1000,
	);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(date).toLocaleDateString();
}

interface ListingCardProps {
	listing: Listing;
	isFavorite?: boolean;
}

export function ListingCard({ listing, isFavorite }: ListingCardProps) {
	const firstImage =
		listing.images && listing.images.length > 0
			? listing.images[0].image
			: null;
	const imageUrl =
		firstImage && typeof firstImage === "object"
			? (firstImage as Media).url || (firstImage as Media).thumbnailURL
			: null;

	const isBoosted =
		listing.boostedUntil && new Date(listing.boostedUntil) > new Date();
	const imageCount = listing.images?.length || 0;
	const seller = listing.seller as User | null;
	const conditionLabel =
		listing.condition === "new"
			? "New"
			: listing.condition === "like_new"
				? "Like new"
				: null;

	return (
		<Link href={`/listing/${listing.id}`} className="group block">
			<div
				className={cn(
					"overflow-hidden rounded-xl bg-white transition-all duration-300 hover:shadow-lg hover:shadow-black/8 hover:-translate-y-1",
					isBoosted
						? "ring-1 ring-[#F59E0B]/40"
						: "border border-[#E2E8F0] hover:border-[#93C5FD]",
				)}
			>
				{/* Image */}
				<div className="relative aspect-[4/3] overflow-hidden bg-[#F1F5F9]">
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt={listing.title}
							fill
							className="object-cover transition-transform duration-300 group-hover:scale-105"
							sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<span className="text-xs text-[#94A3B8]">No photo</span>
						</div>
					)}

					{/* Top-left badges */}
					<div className="absolute left-2 top-2 flex flex-col gap-1">
						{isBoosted && (
							<span className="flex items-center gap-1 rounded bg-[#F59E0B] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow-sm">
								<Zap className="h-3 w-3" />
								Featured
							</span>
						)}
						{conditionLabel && (
							<span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#0F172A] shadow-sm backdrop-blur-sm">
								{conditionLabel}
							</span>
						)}
					</div>

					{/* Favorite */}
					<div className="absolute right-2 top-2">
						<FavoriteButton listingId={listing.id} initialFavorite={isFavorite} />
					</div>

					{/* Image count */}
					{imageCount > 1 && (
						<div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
							{imageCount} photos
						</div>
					)}
				</div>

				{/* Content */}
				<div className="p-3">
					{/* Price (prominent, like Leboncoin/Vinted) */}
					<p className="text-lg font-bold text-[#0F172A]">
						{listing.price.toLocaleString()}{" "}
						<span className="text-xs font-medium text-[#64748B]">XAF</span>
					</p>

					{/* Title */}
					<h3 className="mt-0.5 line-clamp-2 text-sm text-[#334155]">
						{listing.title}
					</h3>

					{/* Meta row */}
					<div className="mt-2 flex items-center justify-between text-xs text-[#94A3B8]">
						<span className="flex items-center gap-1 truncate">
							<MapPin className="h-3 w-3 shrink-0" />
							<span className="truncate">{listing.location}</span>
						</span>
						<span className="flex items-center gap-1 shrink-0">
							<Clock className="h-3 w-3" />
							{timeAgo(listing.createdAt)}
						</span>
					</div>
				</div>
			</div>
		</Link>
	);
}

interface ListingGridProps {
	listings: Listing[];
	favorites?: number[];
	className?: string;
}

export function ListingGrid({
	listings,
	favorites = [],
	className,
}: ListingGridProps) {
	return (
		<div
			className={cn(
				"grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
				className,
			)}
		>
			{listings.map((listing) => (
				<ListingCard
					key={listing.id}
					listing={listing}
					isFavorite={favorites.includes(listing.id)}
				/>
			))}
		</div>
	);
}
