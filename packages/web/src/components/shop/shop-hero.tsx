import { Flag, MapPin, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReportDialog } from "~/components/listing/report-dialog";
import type { ShopRatingDisplay } from "~/lib/shop-rating";
import { shopTheme } from "~/lib/shop-theme";
import type { PublicShop } from "~/types";
import { LevelBadge } from "./level-badge";
import { ShareShopButton } from "./share-shop-button";
import { ShopContactButtons } from "./shop-contact-buttons";
import { ShopInitials } from "./shop-initials";

export function ShopHero({
	shop,
	rating,
	locale,
	tabs,
}: {
	shop: PublicShop;
	rating: ShopRatingDisplay | null;
	locale: string;
	tabs?: React.ReactNode;
}) {
	const t = useTranslations("Shop");
	const since = new Date(shop.owner.memberSince).getFullYear();
	const place = [shop.location.city, shop.location.region]
		.filter(Boolean)
		.join(", ");

	// Only the logo is pulled up over the banner; the name, badges and meta
	// stay in normal flow beneath it, so no name length or wrap can reach
	// back into the banner.
	return (
		<section className="border-[#E2E8F0] border-b bg-white">
			<div className="h-36 w-full bg-[length:18px_18px] bg-[radial-gradient(rgba(255,255,255,0.13)_1px,transparent_1px)] bg-[var(--shop-header-bg,#1E3A8A)] sm:h-48 lg:h-[220px]">
				{shop.banner?.url && (
					// biome-ignore lint/performance/noImgElement: banners come from arbitrary storage hosts
					<img
						src={shop.banner.url}
						alt=""
						className="h-full w-full object-cover"
					/>
				)}
			</div>
			{shop.banner?.url && (
				<div
					aria-hidden="true"
					className="h-1 bg-[var(--shop-accent,#1E40AF)]"
				/>
			)}
			<div
				className={`container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${tabs ? "" : "pb-6"}`}
			>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
					<ShopInitials
						name={shop.name}
						logoUrl={shop.logo?.url}
						className="-mt-12 sm:-mt-14 h-24 w-24 rounded-3xl border-[5px] border-white bg-[var(--shop-header-bg,#0F172A)] text-3xl text-[var(--shop-header-fg,#F59E0B)] shadow-[0_6px_18px_rgba(15,23,42,0.2)] sm:h-28 sm:w-28 sm:text-4xl"
					/>
					<div className="flex min-w-0 flex-1 flex-col gap-4 sm:pt-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
								<h1
									data-shop-title=""
									className="break-words font-extrabold text-2xl text-[#0F172A] tracking-tight sm:text-[32px] sm:leading-tight"
								>
									{shop.name}
								</h1>
								<LevelBadge badge={shop.badge} />
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[#64748B] text-sm">
								{rating && (
									<span className="flex items-center gap-1">
										<Star className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />
										<strong className="text-[#0F172A]">
											{rating.rating.toLocaleString(locale, {
												maximumFractionDigits: 1,
											})}
										</strong>{" "}
										(
										{rating.source === "shop"
											? t("verifiedReviews", { count: rating.count })
											: t("reviews", { count: rating.count })}
										)
									</span>
								)}
								<span>
									{t("products", { count: shop.publishedListingCount })}
								</span>
								{place && (
									<span className="flex items-center gap-1">
										<MapPin className="h-4 w-4 text-[#F59E0B]" />
										{place}
									</span>
								)}
								<span>{t("onPlatformSince", { year: since })}</span>
							</div>
						</div>
						<div className="flex shrink-0 flex-wrap items-center gap-2 lg:pt-1">
							<ShopContactButtons
								shopId={shop.id}
								contact={shop.contact}
								theme={shopTheme(shop.brandColor)}
							/>
							<ShareShopButton handle={shop.handle} name={shop.name} />
							<ReportDialog targetType="shop" targetId={shop.id}>
								<button
									type="button"
									aria-label={t("report")}
									title={t("report")}
									className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:border-red-200 hover:text-red-500"
								>
									<Flag className="h-4 w-4" />
								</button>
							</ReportDialog>
						</div>
					</div>
				</div>
				{tabs}
			</div>
		</section>
	);
}
