"use client";

import { ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import { useShopSearch } from "~/hooks/use-shop-search";
import {
	directoryHref,
	SHOPS_ROW_SIZE,
	shopRating,
	shopsRow,
	showsShopsRow,
} from "~/lib/shop-directory";
import type { ShopSearchHit } from "~/types";
import { SponsoredLabel } from "./shop-result-row";

function RowCard({
	shop,
	sponsored,
}: {
	shop: ShopSearchHit;
	sponsored: boolean;
}) {
	const t = useTranslations("Search");
	const locale = useLocale();
	const rating = shopRating(shop);
	return (
		<Link
			href={`/s/${shop.handle}`}
			className="flex w-[260px] shrink-0 items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-brand-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 sm:w-auto"
		>
			<ShopInitials
				name={shop.name}
				logoUrl={shop.logoUrl}
				className="h-11 w-11 rounded-xl bg-night text-[#F59E0B] text-sm"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate font-bold font-heading text-ink text-sm">
					{shop.name}
				</span>
				<div className="flex flex-wrap items-center gap-1.5">
					{sponsored && <SponsoredLabel />}
					<LevelBadge badge={shop.badge} size="sm" />
					{rating && (
						<span className="flex items-center gap-0.5 font-semibold text-ink-soft text-xs">
							<Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
							{rating.value.toLocaleString(locale, {
								maximumFractionDigits: 1,
								minimumFractionDigits: 1,
							})}
						</span>
					)}
				</div>
				<span className="truncate text-ink-muted text-xs">
					{[shop.city, t("shopProducts", { count: shop.publishedListingCount })]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</div>
		</Link>
	);
}

/** "Shops that sell: phones in Douala", above the listing results. */
export function ShopsSellingRow({
	q,
	category,
	categoryName,
	city,
}: {
	q: string;
	/** The category id, as the shops search takes it. */
	category: string;
	categoryName: string | null;
	city: string;
}) {
	const t = useTranslations("Search");
	const enabled = showsShopsRow({ q, category });
	const { data } = useShopSearch(
		{
			q: q.trim(),
			city,
			category: category || undefined,
			// One spare, in case the sponsored shop also ranks organically.
			limit: SHOPS_ROW_SIZE + 1,
		},
		{ enabled },
	);
	if (!enabled) return null;
	const row = shopsRow(data);
	if (row.sponsored.length + row.organic.length === 0) return null;

	const what = q.trim() || categoryName || "";
	return (
		<section aria-labelledby="shops-selling-heading" className="mb-5">
			<div className="mb-2 flex items-center justify-between gap-3">
				<h2
					id="shops-selling-heading"
					className="truncate font-bold font-heading text-ink text-sm"
				>
					{city
						? t("shopsSellingIn", { what, city })
						: t("shopsSelling", { what })}
				</h2>
				<Link
					href={directoryHref({ q: q.trim(), category, city })}
					className="flex shrink-0 items-center gap-0.5 font-semibold text-brand text-xs hover:underline"
				>
					{t("shopsSellingAll")}
					<ChevronRight className="h-3.5 w-3.5" />
				</Link>
			</div>
			<div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
				{row.sponsored.map((shop) => (
					<RowCard key={shop.id} shop={shop} sponsored />
				))}
				{row.organic.map((shop) => (
					<RowCard key={shop.id} shop={shop} sponsored={false} />
				))}
			</div>
		</section>
	);
}
