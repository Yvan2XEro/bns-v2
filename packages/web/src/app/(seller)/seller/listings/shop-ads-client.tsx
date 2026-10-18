"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useOrderMoney } from "~/hooks/use-order-money";
import { shopAdsRootKey, useShopAds } from "~/hooks/use-shop-ads";
import { markListingAsSold, renewListing } from "~/lib/actions";
import { kindPriceText, listingKindRules } from "~/lib/listing-kind";
import { hasListingPrice } from "~/lib/price";
import { SHOP_AD_FILTERS, type ShopAdFilter } from "~/lib/shop-api";
import type { ShopProfile } from "~/lib/shop-profile";
import type { Listing, Media } from "~/types";

function thumbnailOf(listing: Listing): string | null {
	const media = listing.images?.[0]?.image;
	return media && typeof media === "object"
		? ((media as Media).thumbnailURL ?? (media as Media).url ?? null)
		: null;
}

/**
 * The shop's ads that are not products: an agency's flats, a recruiter's
 * job offers, a provider's services — and a store's own job offers. New ones
 * go through the ad form, which publishes in the active shop.
 */
export function ShopAdsClient({
	shopId,
	profile,
	canManage,
}: {
	shopId: string;
	profile: ShopProfile;
	canManage: boolean;
}) {
	const t = useTranslations("SellerAds");
	const tKind = useTranslations("ListingKind");
	const formatOrderMoney = useOrderMoney();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<ShopAdFilter>("live");
	const [page, setPage] = useState(1);
	const [pending, startTransition] = useTransition();
	const [failed, setFailed] = useState<string | null>(null);
	const { data, isPending, isError, refetch } = useShopAds(shopId, {
		filter,
		page,
	});

	function act(run: () => Promise<{ success: boolean; error?: string }>) {
		setFailed(null);
		startTransition(async () => {
			const result = await run();
			if (!result.success) setFailed(result.error ?? t("actionFailed"));
			await queryClient.invalidateQueries({ queryKey: shopAdsRootKey(shopId) });
		});
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl text-ink">{t("title")}</h1>
					<p className="text-ink-muted text-sm">{t(`subtitle.${profile}`)}</p>
				</div>
				<Link
					href="/create"
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
				>
					<Plus aria-hidden="true" className="h-4 w-4" />
					{t("add")}
				</Link>
			</div>

			<div
				role="tablist"
				aria-label={t("title")}
				className="flex gap-2 overflow-x-auto"
			>
				{SHOP_AD_FILTERS.map((key) => (
					<button
						key={key}
						type="button"
						role="tab"
						aria-selected={filter === key}
						onClick={() => {
							setFilter(key);
							setPage(1);
						}}
						className={`h-9 shrink-0 rounded-full border px-3.5 font-semibold text-sm ${
							filter === key
								? "border-[var(--shop-accent,var(--c-brand))] bg-[var(--shop-accent-soft,var(--c-brand-soft))] text-[var(--shop-accent-text,var(--c-brand))]"
								: "border-line bg-surface text-ink-muted hover:text-ink"
						}`}
					>
						{t(`filter.${key}`)}
						{data && (
							<span className="ml-1.5 text-xs opacity-70">
								{data.counts[key]}
							</span>
						)}
					</button>
				))}
			</div>

			{failed && (
				<p className="rounded-lg bg-bad-soft px-3 py-2 text-bad-ink text-sm">
					{failed}
				</p>
			)}

			{isPending ? (
				<div className="flex justify-center py-16">
					<Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
				</div>
			) : isError ? (
				<div className="rounded-xl border border-line bg-surface p-8 text-center">
					<p className="text-ink-muted text-sm">{t("loadError")}</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-3 font-semibold text-sm underline"
					>
						{t("retry")}
					</button>
				</div>
			) : data.docs.length === 0 ? (
				<div className="rounded-xl border border-line border-dashed bg-surface p-10 text-center">
					<p className="font-semibold text-ink">{t(`empty.${profile}`)}</p>
					<p className="mt-1 text-ink-muted text-sm">{t("emptyHint")}</p>
				</div>
			) : (
				<ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
					{data.docs.map((ad) => {
						const thumb = thumbnailOf(ad);
						const closedAs = listingKindRules(ad.kind).closedAs;
						return (
							<li key={ad.id} className="flex items-center gap-3 p-3 sm:p-4">
								<Link
									href={`/listing/${ad.id}`}
									className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-subtle"
								>
									{thumb ? (
										<Image
											src={thumb}
											alt=""
											fill
											sizes="64px"
											className="object-cover"
										/>
									) : (
										<ImageIcon
											aria-hidden="true"
											className="m-auto mt-5 h-6 w-6 text-ink-ghost"
										/>
									)}
								</Link>
								<div className="min-w-0 flex-1">
									<Link
										href={`/listing/${ad.id}`}
										className="block truncate font-semibold text-ink hover:underline"
									>
										{ad.title}
									</Link>
									<p className="font-bold text-ink-soft text-sm">
										{kindPriceText(
											hasListingPrice(ad.price)
												? formatOrderMoney(ad.price)
												: null,
											ad,
											tKind,
										)}
									</p>
									<p className="truncate text-ink-faint text-xs">
										{ad.status === "sold"
											? tKind(`closedAs.${closedAs}`)
											: t(`status.${ad.status}`)}
										{ad.location ? ` · ${ad.location}` : ""}
									</p>
								</div>
								{canManage && (
									<div className="flex shrink-0 flex-wrap justify-end gap-2">
										<Link
											href={`/listing/${ad.id}/edit`}
											className="inline-flex h-8 items-center rounded-lg border border-line px-3 font-semibold text-ink text-xs hover:bg-canvas"
										>
											{t("edit")}
										</Link>
										{ad.status === "published" && (
											<button
												type="button"
												disabled={pending}
												onClick={() => act(() => markListingAsSold(ad.id))}
												className="inline-flex h-8 items-center rounded-lg border border-line px-3 font-semibold text-ink text-xs hover:bg-canvas disabled:opacity-50"
											>
												{tKind(`markClosed.${closedAs}`)}
											</button>
										)}
										{ad.status === "expired" && (
											<button
												type="button"
												disabled={pending}
												onClick={() => act(() => renewListing(ad.id))}
												className="inline-flex h-8 items-center rounded-lg border border-line px-3 font-semibold text-ink text-xs hover:bg-canvas disabled:opacity-50"
											>
												{t("renew")}
											</button>
										)}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

			{data && (page > 1 || data.hasNextPage) && (
				<div className="flex justify-between">
					<button
						type="button"
						disabled={page === 1}
						onClick={() => setPage((current) => current - 1)}
						className="font-semibold text-sm disabled:opacity-40"
					>
						{t("previous")}
					</button>
					<button
						type="button"
						disabled={!data.hasNextPage}
						onClick={() => setPage((current) => current + 1)}
						className="font-semibold text-sm disabled:opacity-40"
					>
						{t("next")}
					</button>
				</div>
			)}
		</div>
	);
}
