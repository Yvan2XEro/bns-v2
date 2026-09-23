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
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-bold text-[#0F172A]">{t("statusTitle")}</h2>
			<div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-[#F1F5F9] p-1">
				{ORDER.map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => onStatusChange(value)}
						aria-pressed={status === value}
						className={cn(
							"rounded-md py-2 font-semibold text-sm",
							status === value
								? "bg-white text-[#0F172A] shadow-sm"
								: "text-[#64748B]",
						)}
					>
						{t(`status.${value}`)}
					</button>
				))}
			</div>
			<p className="mt-2 text-[#64748B] text-xs">{t(`statusHint.${status}`)}</p>

			{listing && (
				<div className="mt-4 rounded-lg bg-[#F8FAFC] p-3 text-sm">
					<p className="text-[#334155]">
						{t("listingStats", {
							views: listing.views,
							favorites: listing.favorites,
						})}
					</p>
					{listing.status === "rejected" && (
						<p className="mt-1 text-[#991b1b]">{t("listingRejected")}</p>
					)}
					{listing.status === "pending" && (
						<p className="mt-1 text-[#92400e]">{t("listingPending")}</p>
					)}
					{listing.status === "published" && (
						<Link
							href={`/listing/${listing.id}`}
							className="mt-1 inline-block text-[#1E40AF] hover:underline"
						>
							{t("viewListing")}
						</Link>
					)}
				</div>
			)}
			<p className="mt-4 text-[#64748B] text-xs">{t("derivedNote")}</p>
		</div>
	);
}
