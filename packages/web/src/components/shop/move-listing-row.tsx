"use client";

import { formatXaf } from "~/lib/money";
import type { Listing, Media } from "~/types";

/** One selectable row of the move-listings dialog: thumbnail, title and price. */
export function MoveListingRow({
	listing,
	checked,
	onToggle,
}: {
	listing: Listing;
	checked: boolean;
	onToggle: () => void;
}) {
	const image = listing.images?.[0]?.image as Media | string | undefined;
	const url =
		typeof image === "object" ? (image.thumbnailURL ?? image.url) : null;

	return (
		<li>
			<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E2E8F0] p-2">
				<input
					type="checkbox"
					className="h-4 w-4 accent-[#1E40AF]"
					checked={checked}
					onChange={onToggle}
				/>
				<div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-[#F1F5F9]">
					{url && (
						// biome-ignore lint/performance/noImgElement: thumbnails from arbitrary storage hosts
						<img src={url} alt="" className="h-full w-full object-cover" />
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate font-medium text-[#0F172A] text-sm">
						{listing.title}
					</p>
					<p className="text-[#64748B] text-xs">{formatXaf(listing.price)}</p>
				</div>
			</label>
		</li>
	);
}
