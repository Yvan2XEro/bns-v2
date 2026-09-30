import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { badgeForLevel } from "~/lib/verification";
import type { ShopSearchHit } from "~/types";
import { LevelBadge } from "./level-badge";
import { ShopInitials } from "./shop-initials";

export function ShopCard({ shop }: { shop: ShopSearchHit }) {
	const t = useTranslations("Shop");

	return (
		<Link
			href={`/s/${shop.handle}`}
			className="flex gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#93C5FD]"
		>
			<ShopInitials
				name={shop.name}
				logoUrl={shop.logoUrl}
				className="h-14 w-14 text-base"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate font-bold text-[#0F172A]">{shop.name}</p>
					<LevelBadge badge={badgeForLevel(shop.level)} size="sm" />
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[#64748B] text-xs">
					{shop.ownerReviews > 0 ? (
						<span className="flex items-center gap-1">
							<Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
							{shop.ownerRating.toFixed(1)} ({shop.ownerReviews})
						</span>
					) : (
						<span className="font-semibold text-[#1E40AF]">{t("newShop")}</span>
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
					<p className="mt-1 line-clamp-2 text-[#334155] text-sm">
						{shop.description}
					</p>
				)}
			</div>
			<span className="self-center rounded-lg border border-[#E2E8F0] px-3 py-1.5 font-semibold text-[#1E40AF] text-sm">
				{t("view")}
			</span>
		</Link>
	);
}
