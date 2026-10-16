import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ShopSearchHit } from "~/types";
import { LevelBadge } from "./level-badge";
import { ShopInitials } from "./shop-initials";

export function ShopCard({ shop }: { shop: ShopSearchHit }) {
	const t = useTranslations("Shop");

	return (
		<Link
			href={`/s/${shop.handle}`}
			className="flex gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand-line"
		>
			<ShopInitials
				name={shop.name}
				logoUrl={shop.logoUrl}
				className="h-14 w-14 text-base"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-bold text-ink">{shop.name}</p>
					<LevelBadge badge={shop.badge} size="sm" />
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted text-xs">
					{shop.ownerReviews > 0 ? (
						<span className="flex items-center gap-1">
							<Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
							{shop.ownerRating.toFixed(1)} ({shop.ownerReviews})
						</span>
					) : (
						<span className="font-semibold text-brand">{t("newShop")}</span>
					)}
					{shop.city && (
						<span className="flex items-center gap-1">
							<MapPin className="h-3.5 w-3.5" />
							{shop.city}
						</span>
					)}
					<span>{t("products", { count: shop.publishedListingCount })}</span>
				</div>
				{shop.description && (
					<p className="mt-1 line-clamp-2 text-ink-soft text-sm">
						{shop.description}
					</p>
				)}
			</div>
			<span className="self-center rounded-lg border border-line px-3 py-1.5 font-semibold text-brand text-sm">
				{t("view")}
			</span>
		</Link>
	);
}
