import { MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import { shopRating } from "~/lib/shop-directory";
import type { ShopSearchHit } from "~/types";
import { excerptAround, highlightSegments } from "./highlight";

/** The paid-slot label: always visible, never mistaken for a trust badge. */
export function SponsoredLabel() {
	const t = useTranslations("Search");
	return (
		<span className="inline-flex h-5 items-center rounded-md border border-line-strong bg-canvas px-1.5 font-semibold text-[11px] text-ink-mid uppercase tracking-wide">
			{t("sponsored")}
		</span>
	);
}

export function ShopResultRow({
	shop,
	query = "",
	sponsored = false,
}: {
	shop: ShopSearchHit;
	query?: string;
	sponsored?: boolean;
}) {
	const t = useTranslations("Search");
	const locale = useLocale();
	const rating = shopRating(shop);
	const excerpt = shop.description
		? excerptAround(shop.description, query)
		: null;

	return (
		<Link
			href={`/s/${shop.handle}`}
			className="flex items-center gap-3 border-subtle border-b bg-surface px-4 py-3 transition-colors last:border-b-0 hover:bg-canvas sm:gap-4"
		>
			<ShopInitials
				name={shop.name}
				logoUrl={shop.logoUrl}
				className="h-[52px] w-[52px] rounded-[14px] bg-night text-[#F59E0B] text-[17px]"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate font-bold font-heading text-base text-ink">
					{shop.name}
				</span>
				<div className="flex flex-wrap items-center gap-2">
					{sponsored && <SponsoredLabel />}
					<LevelBadge badge={shop.badge} size="sm" />
					{rating ? (
						<span className="flex items-center gap-1 font-semibold text-ink-soft text-xs">
							<Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
							{rating.value.toLocaleString(locale, {
								maximumFractionDigits: 1,
								minimumFractionDigits: 1,
							})}
							<span className="font-normal text-ink-muted">
								({rating.count})
							</span>
						</span>
					) : (
						<span className="font-semibold text-ink-muted text-xs">
							{t("shopNew")}
						</span>
					)}
				</div>
				<span className="flex items-center gap-1 text-ink-muted text-xs">
					<MapPin className="h-3 w-3 shrink-0 text-[#F59E0B]" />
					{[shop.city, t("shopProducts", { count: shop.publishedListingCount })]
						.filter(Boolean)
						.join(" · ")}
				</span>
				{excerpt && (
					<span className="truncate text-ink-soft text-xs">
						{highlightSegments(excerpt, query).map((segment, index) =>
							segment.match ? (
								<mark
									key={index}
									className="rounded-[3px] bg-warn-soft px-0.5 font-semibold text-ink"
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
			<span className="flex h-11 shrink-0 items-center rounded-xl border-[1.5px] border-line px-3.5 font-semibold text-brand text-sm">
				{t("shopView")}
			</span>
		</Link>
	);
}
