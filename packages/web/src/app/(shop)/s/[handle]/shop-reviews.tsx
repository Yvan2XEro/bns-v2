import { BadgeCheck, Star } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ReviewPhotos } from "~/components/review/review-photos";
import { serverFetch } from "~/lib/server-api";
import type { ShopRatingDisplay } from "~/lib/shop-rating";
import {
	type PublicShopReviewPage,
	shopReviewsRequest,
} from "../../../../../../api/src/contracts/publicShopReviews";

export async function getShopReviews(
	shopId: string,
	page: number,
): Promise<PublicShopReviewPage | null> {
	try {
		const res = await serverFetch(shopReviewsRequest(shopId, page).path);
		if (!res.ok) return null;
		return (await res.json()) as PublicShopReviewPage;
	} catch {
		return null;
	}
}

function Stars({ rating }: { rating: number }) {
	return (
		<span className="flex items-center gap-0.5" aria-hidden>
			{[1, 2, 3, 4, 5].map((n) => (
				<Star
					key={n}
					className={
						n <= Math.round(rating)
							? "h-4 w-4 fill-[#F59E0B] text-[#F59E0B]"
							: "h-4 w-4 text-ink-ghost"
					}
				/>
			))}
		</span>
	);
}

export async function ShopReviews({
	data,
	rating,
	locale,
	pageHref,
}: {
	data: PublicShopReviewPage | null;
	/** Only the shop's own verified-purchase rating is summarised here, never the owner's. */
	rating: ShopRatingDisplay | null;
	locale: string;
	pageHref: (page: number) => string;
}) {
	const t = await getTranslations("ShopPage");
	const summary = rating?.source === "shop" ? rating : null;

	return (
		<section className="mx-auto max-w-3xl space-y-4">
			<div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-5">
				<h2 className="font-bold text-ink text-lg">{t("reviewsTitle")}</h2>
				{summary && (
					<div className="flex items-center gap-2 text-ink-muted text-sm">
						<strong className="text-2xl text-ink">
							{summary.rating.toLocaleString(locale, {
								maximumFractionDigits: 1,
							})}
						</strong>
						<Stars rating={summary.rating} />
						<span>{t("verifiedCount", { count: summary.count })}</span>
					</div>
				)}
				<p className="w-full text-ink-muted text-sm">{t("reviewsHint")}</p>
			</div>
			{!data ? (
				<p className="rounded-xl border border-line bg-surface p-6 text-center text-ink-muted text-sm">
					{t("reviewsUnavailable")}
				</p>
			) : data.reviews.length === 0 ? (
				<p className="rounded-xl border border-line border-dashed bg-surface p-10 text-center text-ink-muted text-sm">
					{t("noReviews")}
				</p>
			) : (
				<ul className="space-y-3">
					{data.reviews.map((review) => (
						<li
							key={review.id}
							className="rounded-xl border border-line bg-surface p-4"
						>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span className="sr-only">
									{t("ratingOutOf", { rating: review.rating })}
								</span>
								<Stars rating={review.rating} />
								<span className="font-semibold text-ink text-sm">
									{review.reviewerFirstName ?? t("anonymousBuyer")}
								</span>
								<span className="inline-flex items-center gap-1 text-ok-ink-soft text-xs">
									<BadgeCheck className="h-3.5 w-3.5" />
									{t("verifiedPurchase")}
								</span>
								<time
									dateTime={review.createdAt}
									className="ml-auto text-ink-faint text-xs"
								>
									{new Date(review.createdAt).toLocaleDateString(locale, {
										day: "numeric",
										month: "long",
										year: "numeric",
									})}
								</time>
							</div>
							{review.comment && (
								<p className="mt-2 whitespace-pre-wrap break-words text-ink-soft text-sm leading-relaxed">
									{review.comment}
								</p>
							)}
							{review.photos.length > 0 && (
								<ReviewPhotos photos={review.photos} />
							)}
						</li>
					))}
				</ul>
			)}
			{data && data.totalPages > 1 && (
				<div className="flex items-center justify-center gap-3 text-sm">
					{data.page > 1 && (
						<Link
							href={pageHref(data.page - 1)}
							className="rounded-lg border border-line bg-surface px-3 py-1.5"
						>
							{t("previous")}
						</Link>
					)}
					<span className="text-ink-muted">
						{data.page} / {data.totalPages}
					</span>
					{data.page < data.totalPages && (
						<Link
							href={pageHref(data.page + 1)}
							className="rounded-lg border border-line bg-surface px-3 py-1.5"
						>
							{t("next")}
						</Link>
					)}
				</div>
			)}
		</section>
	);
}
