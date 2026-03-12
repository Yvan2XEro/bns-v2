import { Heart, MapPin, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type { Listing, Media } from "~/types";

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

	return (
		<Link href={`/listing/${listing.id}`}>
			<Card className="group overflow-hidden transition-shadow hover:shadow-lg">
				<div className="relative aspect-[4/3] overflow-hidden">
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt={listing.title}
							fill
							className="object-cover transition-transform group-hover:scale-105"
							sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center bg-muted">
							<span className="text-muted-foreground">No image</span>
						</div>
					)}
					{isBoosted && (
						<Badge className="absolute top-2 left-2 bg-yellow-500 hover:bg-yellow-600">
							<Zap className="mr-1 h-3 w-3" />
							Boosted
						</Badge>
					)}
					{isFavorite && (
						<Badge variant="secondary" className="absolute top-2 right-2">
							<Heart className="mr-1 h-3 w-3 fill-current" />
						</Badge>
					)}
				</div>
				<div className="p-4">
					<h3 className="mb-1 line-clamp-1 font-semibold text-lg">
						{listing.title}
					</h3>
					<p className="mb-2 font-bold text-primary text-xl">
						{listing.price.toLocaleString()} XAF
					</p>
					<div className="flex items-center text-muted-foreground text-sm">
						<MapPin className="mr-1 h-4 w-4" />
						<span className="line-clamp-1">{listing.location}</span>
					</div>
					<p className="mt-2 text-muted-foreground text-xs">
						{new Date(listing.createdAt).toLocaleDateString()}
					</p>
				</div>
			</Card>
		</Link>
	);
}

interface ListingGridProps {
	listings: Listing[];
	favorites?: string[];
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
				"grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
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
