import { ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { ShopInitials } from "~/components/shop/shop-initials";
import type { ShopSearchHit } from "~/types";

export const PREVIEW_TILES = 3;

export function VerifiedShops({ shops }: { shops: ShopSearchHit[] }) {
	const t = useTranslations("Home");
	const locale = useLocale();
	if (shops.length === 0) return null;

	return (
		<section className="py-10">
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="mb-6 flex items-center justify-between">
					<h2 className="font-bold text-[#0F172A] text-xl">
						{t("verifiedShops")}
					</h2>
					<Link
						href="/search?tab=shops&verified=1"
						className="flex items-center gap-1 font-medium text-[#1E40AF] text-sm hover:underline"
					>
						{t("allShops")}
						<ChevronRight className="h-4 w-4" />
					</Link>
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{shops.map((shop) => (
						<Link
							key={shop.id}
							href={`/s/${shop.handle}`}
							className="hover:-translate-y-1 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white transition-all duration-200 hover:border-[#93C5FD] hover:shadow-lg"
						>
							{shop.bannerUrl ? (
								// biome-ignore lint/performance/noImgElement: banners come from arbitrary storage hosts
								<img
									src={shop.bannerUrl}
									alt=""
									className="h-[72px] w-full object-cover"
								/>
							) : (
								<div className="h-[72px] bg-[#1E3A8A] bg-[length:14px_14px] bg-[radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)]" />
							)}
							<div className="-mt-7 flex flex-col gap-2 px-4 pb-4">
								<ShopInitials
									name={shop.name}
									logoUrl={shop.logoUrl}
									className="h-14 w-14 rounded-[14px] border-[3px] border-white bg-[#0F172A] text-[#F59E0B] text-lg"
								/>
								<h3 className="truncate font-bold text-[#0F172A]">
									{shop.name}
								</h3>
								<LevelBadge
									badge={shop.badge}
									size="sm"
									className="self-start"
								/>
								<p className="flex flex-wrap items-center gap-1 text-[#64748B] text-[13px]">
									{[
										shop.city,
										t("shopProducts", { count: shop.publishedListingCount }),
									]
										.filter(Boolean)
										.join(" · ")}
									{shop.ownerReviews > 0 && (
										<>
											{" · "}
											<Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
											{shop.ownerRating.toLocaleString(locale, {
												maximumFractionDigits: 1,
												minimumFractionDigits: 1,
											})}
										</>
									)}
								</p>
								<div className="mt-1 grid grid-cols-3 gap-1.5">
									{Array.from({ length: PREVIEW_TILES }, (_, index) => {
										const preview = shop.previews?.[index];
										return preview?.imageUrl ? (
											// biome-ignore lint/performance/noImgElement: listing photos come from arbitrary storage hosts
											<img
												key={preview.id}
												src={preview.imageUrl}
												alt={preview.title}
												className="h-14 w-full rounded-lg bg-[#F1F5F9] object-cover"
											/>
										) : (
											<span
												key={preview?.id ?? `empty-${index}`}
												className="block h-14 rounded-lg bg-[#F1F5F9]"
											/>
										);
									})}
								</div>
							</div>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
