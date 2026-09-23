import { Flag, MapPin, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { ReportDialog } from "~/components/listing/report-dialog";
import type { PublicShop } from "~/types";
import { LevelBadge } from "./level-badge";
import { ShareShopButton } from "./share-shop-button";
import { ShopContactButtons } from "./shop-contact-buttons";
import { ShopInitials } from "./shop-initials";

export function ShopHero({
	shop,
	locale,
}: {
	shop: PublicShop;
	locale: string;
}) {
	const t = useTranslations("Shop");
	const since = new Date(shop.owner.memberSince).getFullYear();
	const place = [shop.location.city, shop.location.region]
		.filter(Boolean)
		.join(", ");

	return (
		<section className="border-[#E2E8F0] border-b bg-white">
			<div className="h-36 w-full bg-gradient-to-r from-[#1E40AF] to-[#3B82F6] sm:h-52">
				{shop.banner?.url && (
					// biome-ignore lint/performance/noImgElement: banners come from arbitrary storage hosts
					<img
						src={shop.banner.url}
						alt=""
						className="h-full w-full object-cover"
					/>
				)}
			</div>
			<div className="container mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
				<div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div className="flex items-end gap-4">
						<ShopInitials
							name={shop.name}
							logoUrl={shop.logo?.url}
							className="h-20 w-20 text-2xl ring-4 ring-white sm:h-24 sm:w-24"
						/>
						<div className="pb-1">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="font-bold text-2xl text-[#0F172A] sm:text-3xl">
									{shop.name}
								</h1>
								<LevelBadge level={shop.level} />
							</div>
							<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[#64748B] text-sm">
								{shop.owner.totalReviews > 0 && (
									<span className="flex items-center gap-1">
										<Star className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />
										{shop.owner.rating.toLocaleString(locale, {
											maximumFractionDigits: 1,
										})}{" "}
										({t("reviews", { count: shop.owner.totalReviews })})
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
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<ShopContactButtons contact={shop.contact} />
						<ShareShopButton handle={shop.handle} name={shop.name} />
						<ReportDialog targetType="shop" targetId={shop.id}>
							<button
								type="button"
								className="inline-flex h-10 items-center gap-1 px-2 text-[#94A3B8] text-xs hover:text-red-500"
							>
								<Flag className="h-3.5 w-3.5" />
								{t("report")}
							</button>
						</ReportDialog>
					</div>
				</div>
			</div>
		</section>
	);
}
