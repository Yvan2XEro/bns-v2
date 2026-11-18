"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";
import type { ProductDetailResponse, ProductStatus } from "~/types";

const ORDER: ProductStatus[] = ["active", "archived", "draft"];

export function ProductPublicationCard({
	status,
	onStatusChange,
	listing,
}: {
	status: ProductStatus;
	onStatusChange: (status: ProductStatus) => void;
	listing: ProductDetailResponse["listing"];
}) {
	const t = useTranslations("ProductEditor");

	return (
		<div className="rounded-xl border border-line bg-surface p-5">
			<h2 className="font-bold text-ink">{t("statusTitle")}</h2>
			<div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1">
				{ORDER.map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => onStatusChange(value)}
						aria-pressed={status === value}
						className={cn(
							"rounded-md py-2 font-semibold text-sm",
							status === value
								? "bg-surface text-ink shadow-sm"
								: "text-ink-muted",
						)}
					>
						{t(`status.${value}`)}
					</button>
				))}
			</div>
			<p className="mt-2 text-ink-muted text-xs">{t(`statusHint.${status}`)}</p>

			{listing && (
				<div className="mt-4 rounded-lg bg-canvas p-3 text-sm">
					<p className="text-ink-soft">
						{t("listingStats", {
							views: listing.views,
							favorites: listing.favorites,
						})}
					</p>
					{listing.status === "rejected" && (
						<p className="mt-1 text-bad-ink">{t("listingRejected")}</p>
					)}
					{listing.status === "pending" && (
						<p className="mt-1 text-warn-ink">{t("listingPending")}</p>
					)}
					{listing.status === "published" && (
						<Link
							href={`/listing/${listing.id}`}
							className="mt-1 inline-block text-[var(--shop-accent-text,var(--c-brand))] hover:underline"
						>
							{t("viewListing")}
						</Link>
					)}
				</div>
			)}
			<p className="mt-4 text-ink-muted text-xs">{t("derivedNote")}</p>
		</div>
	);
}
