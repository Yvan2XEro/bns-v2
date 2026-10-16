import {
	CalendarDays,
	Clock,
	MapPin,
	Package,
	Sparkles,
	Star,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ShopRatingDisplay } from "~/lib/shop-rating";
import type { PublicShop } from "~/types";
import {
	type ShopTrustItem,
	shopTrustItems,
} from "../../../../api/src/contracts/shopTrust";

/**
 * The strip under the shop's name. What shows is the shared contract's call
 * (no zero, no empty stat); each item explains itself on hover or focus,
 * which a tap gives on a phone.
 */
export function ShopTrustStrip({
	shop,
	rating,
	locale,
}: {
	shop: PublicShop;
	rating: ShopRatingDisplay | null;
	locale: string;
}) {
	const t = useTranslations("ShopTrust");
	const tShop = useTranslations("Shop");
	const place = [shop.location.city, shop.location.region]
		.filter(Boolean)
		.join(", ");
	const items = shopTrustItems({
		trust: shop.trust,
		city: place,
		rating: rating ? { value: rating.rating, count: rating.count } : null,
	});
	if (items.length === 0) return null;

	const render = (item: ShopTrustItem) => {
		switch (item.kind) {
			case "rating":
				return {
					icon: <Star className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />,
					label: (
						<>
							<strong className="text-ink">
								{item.rating.toLocaleString(locale, {
									maximumFractionDigits: 1,
								})}
							</strong>{" "}
							(
							{rating?.source === "shop"
								? tShop("verifiedReviews", { count: item.count })
								: tShop("reviews", { count: item.count })}
							)
						</>
					),
					hint:
						rating?.source === "shop" ? t("ratingHint") : t("ownerRatingHint"),
				};
			case "responseTime":
				return {
					icon: (
						<Clock className="h-4 w-4 text-[var(--shop-accent,var(--c-brand))]" />
					),
					label: t(`responseTime.${item.bucket}`),
					hint: t("responseTimeHint"),
				};
			case "city":
				return {
					icon: <MapPin className="h-4 w-4 text-[#F59E0B]" />,
					label: item.city,
					hint: t("cityHint"),
				};
			case "memberSince":
				return {
					icon: <CalendarDays className="h-4 w-4 text-ink-muted" />,
					label: t("memberSince", { year: item.year }),
					hint: t("memberSinceHint", { year: item.year }),
				};
			case "newShop":
				return {
					icon: (
						<Sparkles className="h-4 w-4 text-[var(--shop-accent,var(--c-brand))]" />
					),
					label: t("newShop"),
					hint: t("newShopHint"),
				};
			case "activeListings":
				return {
					icon: <Package className="h-4 w-4 text-ink-muted" />,
					label: t("activeListings", { count: item.count }),
					hint: t("activeListingsHint"),
				};
		}
	};

	return (
		<ul
			aria-label={t("label")}
			className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-muted text-sm"
		>
			{items.map((item) => {
				const { icon, label, hint } = render(item);
				const id = `shop-trust-${item.kind}`;
				return (
					<li key={item.kind} className="group relative">
						<button
							type="button"
							aria-describedby={id}
							className="flex cursor-help items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-[var(--shop-accent,var(--c-brand))] focus-visible:outline-offset-2"
						>
							{icon}
							<span>{label}</span>
						</button>
						<span
							id={id}
							role="tooltip"
							className="pointer-events-none absolute top-full left-0 z-30 mt-1.5 hidden w-max max-w-[16rem] rounded-lg bg-night px-3 py-2 text-white text-xs leading-snug shadow-lg group-focus-within:block group-hover:block"
						>
							{hint}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
