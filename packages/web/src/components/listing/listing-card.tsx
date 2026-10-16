"use client";

import { Clock, MapPin, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { useOrderMoney } from "~/hooks/use-order-money";
import { listingConditionValue } from "~/lib/listing-condition";
import {
	listingPriceMax,
	listingShopBadge,
	listingShopName,
} from "~/lib/listing-shop";
import { hasListingPrice } from "~/lib/price";
import { timeAgo } from "~/lib/time-ago";
import { cn } from "~/lib/utils";
import type { Listing, Media, User } from "~/types";
import { FavoriteButton } from "./favorite-button";

interface ListingCardProps {
	listing: Listing;
	isFavorite?: boolean;
}

export function ListingCard({ listing, isFavorite }: ListingCardProps) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Listing");
	const locale = useLocale();
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
	const _seller = listing.seller as User | null;
	const formattedPrice = hasListingPrice(listing.price)
		? formatOrderMoney(listing.price)
		: null;
	const shopName = listingShopName(listing);
	const shopBadge = listingShopBadge(listing);
	const priceMax = listingPriceMax(listing);
	const isFromPrice =
		typeof listing.price === "number" &&
		typeof priceMax === "number" &&
		priceMax > listing.price;
	const condition = listingConditionValue(listing.attributes);
	const conditionLabel =
		condition === "new"
			? t("badgeNew")
			: condition === "like_new"
				? t("badgeLikeNew")
				: null;

	return (
		<Link href={`/listing/${listing.id}`} className="group block">
			<div
				className={cn(
					"hover:-translate-y-1 overflow-hidden rounded-xl bg-surface transition-all duration-300 hover:shadow-black/8 hover:shadow-lg",
					isBoosted
						? "ring-1 ring-[#F59E0B]/40"
						: "border border-line hover:border-[var(--shop-accent-border,var(--c-brand-line))]",
				)}
			>
				{/* Image */}
				<div className="relative aspect-[4/3] overflow-hidden bg-subtle">
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
							<span className="text-ink-faint text-xs">{t("noPhoto")}</span>
						</div>
					)}

					{/* Top-left badges */}
					<div className="absolute top-2 left-2 flex flex-col gap-1">
						{isBoosted && (
							<span className="flex items-center gap-[3px] rounded bg-[#F59E0B] px-1.5 py-0.5 font-bold text-[10px] text-ink uppercase">
								{t("listingFeatured")}
							</span>
						)}
						{conditionLabel && (
							<span className="rounded bg-surface/90 px-1.5 py-0.5 font-semibold text-[10px] text-ink shadow-sm backdrop-blur-sm">
								{conditionLabel}
							</span>
						)}
					</div>

					{/* Favorite */}
					<div className="absolute top-2 right-2">
						<FavoriteButton
							listingId={listing.id}
							initialFavorite={isFavorite}
						/>
					</div>

					{/* Image count */}
					{imageCount > 1 && (
						<div className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-medium text-[10px] text-white">
							{imageCount} photos
						</div>
					)}
				</div>

				{/* Content */}
				<div className="p-3">
					{/* Price (prominent, like Leboncoin/Vinted) */}
					<p className="font-bold text-ink text-lg">
						{isFromPrice && (
							<span className="font-medium text-ink-muted text-xs">
								{t("fromPrice")}{" "}
							</span>
						)}
						{formattedPrice ?? t("noPrice")}
					</p>

					{/* Title */}
					<h3 className="mt-0.5 line-clamp-2 text-ink-soft text-sm">
						{listing.title}
					</h3>

					{/* Meta row */}
					<div className="mt-2 flex items-center justify-between text-ink-faint text-xs">
						<span className="flex items-center gap-1 truncate">
							<MapPin className="h-3 w-3 shrink-0" />
							<span className="truncate">{listing.location}</span>
						</span>
						<span className="flex shrink-0 items-center gap-1">
							<Clock className="h-3 w-3" />
							{timeAgo(listing.createdAt, locale)}
						</span>
					</div>
					{shopName && (
						<p className="mt-1.5 flex items-center gap-1.5 truncate font-medium text-[var(--shop-accent-text,var(--c-brand))] text-xs">
							<Store className="h-3 w-3 shrink-0" />
							<span className="truncate">{shopName}</span>
							{shopBadge && (
								<LevelBadge badge={shopBadge} size="sm" className="shrink-0" />
							)}
						</p>
					)}
				</div>
			</div>
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
