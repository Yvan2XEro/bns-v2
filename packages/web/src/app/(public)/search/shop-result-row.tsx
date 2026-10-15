import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import type { ShopSearchHit } from "~/types";
import { excerptAround, highlightSegments } from "./highlight";

export function ShopResultRow({
	shop,
	query,
}: {
	shop: ShopSearchHit;
	query: string;
}) {
	const t = useTranslations("Search");
	const locale = useLocale();
	const excerpt = shop.description
		? excerptAround(shop.description, query)
		: null;

	return (
		<Link
			href={`/s/${shop.handle}`}
			className="flex items-center gap-3 border-[#F1F5F9] border-b bg-white px-4 py-3 transition-colors last:border-b-0 hover:bg-[#F8FAFC] sm:gap-4"
		>
			<ShopInitials
				name={shop.name}
				logoUrl={shop.logoUrl}
				className="h-[52px] w-[52px] rounded-[14px] bg-[#0F172A] text-[#F59E0B] text-[17px]"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate font-bold font-heading text-[#0F172A] text-base">
					{shop.name}
				</span>
				<div className="flex flex-wrap items-center gap-2">
					<LevelBadge badge={shop.badge} size="sm" />
					{shop.ownerReviews > 0 ? (
						<span className="flex items-center gap-1 font-semibold text-[#334155] text-xs">
							<Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
							{shop.ownerRating.toLocaleString(locale, {
								maximumFractionDigits: 1,
								minimumFractionDigits: 1,
							})}
							<span className="font-normal text-[#64748B]">
								({shop.ownerReviews})
							</span>
						</span>
					) : (
						<span className="font-semibold text-[#64748B] text-xs">
							{t("shopNew")}
						</span>
					)}
				</div>
				<span className="flex items-center gap-1 text-[#64748B] text-xs">
					<MapPin className="h-3 w-3 shrink-0 text-[#F59E0B]" />
					{[shop.city, t("shopProducts", { count: shop.publishedListingCount })]
						.filter(Boolean)
						.join(" · ")}
				</span>
				{excerpt && (
					<span className="truncate text-[#334155] text-xs">
						{highlightSegments(excerpt, query).map((segment, index) =>
							segment.match ? (
								<mark
									key={index}
									className="rounded-[3px] bg-[#FEF3C7] px-0.5 font-semibold text-[#0F172A]"
								>
									{segment.text}
								</mark>
							) : (
								segment.text
							),
						)}
					</span>
				)}
			</div>
			<span className="flex h-11 shrink-0 items-center rounded-xl border-[#E2E8F0] border-[1.5px] px-3.5 font-semibold text-[#1E40AF] text-sm">
				{t("shopView")}
			</span>
		</Link>
	);
}
