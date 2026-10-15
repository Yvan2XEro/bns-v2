import { Star } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import { shopLogoUrl } from "~/lib/listing-shop";
import { shopTheme, shopThemeVars } from "~/lib/shop-theme";
import type { VerificationBadge } from "~/lib/verification";
import type { Shop } from "~/types";

export function ShopSellerCard({
	shop,
	badge,
	brandColor = null,
	ownerName,
	stats,
}: {
	shop: Shop;
	/** The server's computed, expiry-aware badge — see `getShopBadge` in
	 * `~/lib/server-shop`. Never derived from `shop.level` here: that raw
	 * field on a depth-populated relation stays at 3 until the nightly job
	 * recomputes it, even once the level-3 approval has expired. */
	badge: VerificationBadge | null;
	/** Only this card takes the shop's colour on a listing page; the buy box keeps the platform's. */
	brandColor?: string | null;
	ownerName: string | null;
	stats?: {
		rating: number;
		totalReviews: number;
		productCount: number;
		createdAt: string;
	} | null;
}) {
	const t = useTranslations("Shop");
	const locale = useLocale();

	return (
		<div
			className="space-y-4"
			data-shop-theme={brandColor ?? undefined}
			style={brandColor ? shopThemeVars(shopTheme(brandColor)) : undefined}
		>
			<Link href={`/s/${shop.handle}`} className="flex items-center gap-3">
				<ShopInitials
					name={shop.name}
					logoUrl={shopLogoUrl(shop)}
					className="h-14 w-14 rounded-[14px] bg-[var(--shop-accent,#1E40AF)] text-[var(--shop-on-accent,#FFFFFF)] text-base"
				/>
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="truncate font-bold text-[#0F172A] text-[17px]">
							{shop.name}
						</p>
						<LevelBadge badge={badge} size="sm" />
					</div>
					{stats && (
						<p className="flex flex-wrap items-center gap-1 text-[#64748B] text-[13px]">
							{stats.totalReviews > 0 && (
								<>
									<Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
									{stats.rating.toLocaleString(locale, {
										maximumFractionDigits: 1,
										minimumFractionDigits: 1,
									})}{" "}
									({t("reviews", { count: stats.totalReviews })}) ·{" "}
								</>
							)}
							{t("products", { count: stats.productCount })} ·{" "}
							{t("sinceYear", {
								year: new Date(stats.createdAt).getFullYear(),
							})}
						</p>
					)}
					{ownerName && (
						<p className="text-[#64748B] text-xs">
							{t("runBy", { name: ownerName })}
						</p>
					)}
				</div>
			</Link>
			<Link
				href={`/s/${shop.handle}`}
				className="flex h-10 w-full items-center justify-center rounded-lg border border-[var(--shop-accent-border,#E2E8F0)] font-semibold text-[var(--shop-accent-text,#0F172A)] text-sm hover:border-[var(--shop-accent,#1E40AF)] hover:bg-[var(--shop-accent-soft,transparent)] hover:text-[var(--shop-accent-text,#1E40AF)]"
			>
				{t("visitShop")}
			</Link>
		</div>
	);
}
