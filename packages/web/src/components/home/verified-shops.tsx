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
					<h2 className="font-bold text-ink text-xl">{t("verifiedShops")}</h2>
					<Link
						href="/shops?level=2"
						className="flex items-center gap-1 font-medium text-brand text-sm hover:underline"
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
							className="hover:-translate-y-1 overflow-hidden rounded-xl border border-line bg-surface transition-all duration-200 hover:border-brand-line hover:shadow-lg"
						>
							{shop.bannerUrl ? (
								// biome-ignore lint/performance/noImgElement: banners come from arbitrary storage hosts
								<img
									src={shop.bannerUrl}
									alt=""
									className="h-[72px] w-full object-cover"
								/>
							) : (
								<div className="h-[72px] bg-[length:14px_14px] bg-[radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] bg-brand-strong" />
							)}
							<div className="-mt-7 flex flex-col gap-2 px-4 pb-4">
								<ShopInitials
									name={shop.name}
									logoUrl={shop.logoUrl}
									className="h-14 w-14 rounded-[14px] border-[3px] border-white bg-night text-[#F59E0B] text-lg"
								/>
								<h3 className="truncate font-bold text-ink">{shop.name}</h3>
								<LevelBadge
									badge={shop.badge}
									size="sm"
									className="self-start"
								/>
								<p className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
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
												className="h-14 w-full rounded-lg bg-subtle object-cover"
											/>
										) : (
											<span
												key={preview?.id ?? `empty-${index}`}
												className="block h-14 rounded-lg bg-subtle"
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
